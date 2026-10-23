"""Расход должен называть блюдо даже после чистки отчётов и правки техкарты.

Владелец сформулировал так: месяц назад в техкарте Плова было мясо, сегодня
мясо из Плова убрали — расход всё равно обязан показать, на какое блюдо он ушёл.
Приоритет источников: примечание движения → позиции живого заказа + техкарта →
проданные блюда заказа (подсказкой). Заказ удалён — восстанавливать нечего.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.companies.models import Branch, Company
from app.modules.inventory.models import (
    Ingredient, Product, ProductIngredient, StockMovement, Warehouse,
)
from app.modules.inventory.outgoing_report import outgoing_report
from app.modules.pos.models import Order, OrderItem
from tests.test_dashboard_paid_top_outgoing import report_engine

DAY = date(2026, 10, 20)
STAMP = datetime(2026, 10, 20, 9, tzinfo=timezone.utc)


async def _seed(db):
    company = Company(name="Test", slug=str(uuid4()), timezone="UTC")
    db.add(company)
    await db.flush()
    branch = Branch(company_id=company.id, name="Зал")
    warehouse = Warehouse(company_id=company.id, name="Склад", is_main=True)
    meat = Ingredient(company_id=company.id, name="Мясо", unit="кг")
    plov = Product(company_id=company.id, name="Плов", price=100, product_type="dish")
    shashlik = Product(company_id=company.id, name="Шашлык", price=100, product_type="dish")
    db.add_all([branch, warehouse, meat, plov, shashlik])
    await db.flush()
    return company, branch, warehouse, meat, plov, shashlik


async def _order(db, company, branch, items):
    """items: [(product, имя в заказе, порций)] — позиции живого заказа."""
    order = Order(company_id=company.id, branch_id=branch.id,
                  order_number=str(uuid4())[:8], status="completed",
                  subtotal=0, discount_amount=0, total_amount=0, created_at=STAMP)
    db.add(order)
    await db.flush()
    for product, name, qty in items:
        db.add(OrderItem(order_id=order.id, product_id=product.id, name=name,
                         price=100, quantity=qty, total=100 * qty, status="served"))
    await db.flush()
    return order


def _dishes(line):
    """Разбивка как [(блюдо, количество)] — Numeric отдаёт «0.4000», сравниваем числа."""
    return [(d["name"], Decimal(d["qty"])) for d in line["dishes"]]


def _sale(db, company, warehouse, ingredient, *, qty, order_id=None, note="dish sale"):
    db.add(StockMovement(company_id=company.id, warehouse_id=warehouse.id,
                         ingredient_id=ingredient.id, movement_type="sale",
                         quantity=qty, unit=ingredient.unit, total_cost=Decimal("1000"),
                         ref_id=order_id, note=note, created_at=STAMP))


@pytest.mark.asyncio
async def test_dish_note_survives_purge_and_recipe_rewrite(report_engine):
    """Примечание — единственный источник, который не зависит ни от заказа, ни от техкарты."""
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, warehouse, meat, _plov, _shashlik = await _seed(db)
        # Заказ уже удалён («Очистить все отчёты»), техкарту переписали — но
        # списание само записало блюдо в примечание.
        _sale(db, company, warehouse, meat, qty=Decimal("0.4"), order_id=None,
              note="dish sale: Плов")
        await db.flush()
        report = await outgoing_report(db, company.id, DAY, DAY)
        line = report["lines"][0]
        assert _dishes(line) == [("Плов", Decimal("0.4"))]
        assert line["dishesReason"] is None
        assert line["dishesCandidates"] == []


@pytest.mark.asyncio
async def test_recipe_rewrite_with_single_dish_still_names_it(report_engine):
    """Мясо убрали из техкарты Плова, заказ жив и в нём только Плов — блюдо известно точно."""
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, warehouse, meat, plov, _shashlik = await _seed(db)
        order = await _order(db, company, branch, [(plov, "Плов", 2)])
        # Техкарта пуста: строки ProductIngredient для мяса больше нет.
        _sale(db, company, warehouse, meat, qty=Decimal("0.4"), order_id=order.id)
        await db.flush()
        line = (await outgoing_report(db, company.id, DAY, DAY))["lines"][0]
        assert _dishes(line) == [("Плов", Decimal("0.4"))]
        assert line["dishesReason"] == "recipe_changed"


@pytest.mark.asyncio
async def test_recipe_rewrite_with_many_dishes_lists_them_as_candidates(report_engine):
    """Точную долю не восстановить, но блюда заказа показываем — без выдуманных цифр."""
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, warehouse, meat, plov, shashlik = await _seed(db)
        order = await _order(db, company, branch, [(plov, "Плов", 2), (shashlik, "Шашлык", 1)])
        _sale(db, company, warehouse, meat, qty=Decimal("0.5"), order_id=order.id)
        await db.flush()
        line = (await outgoing_report(db, company.id, DAY, DAY))["lines"][0]
        assert line["dishes"] == []
        assert line["dishesReason"] == "not_in_recipe"
        assert [c["name"] for c in line["dishesCandidates"]] == ["Плов", "Шашлык"]
        assert [Decimal(c["qty"]) for c in line["dishesCandidates"]] == [Decimal("2"), Decimal("1")]
        assert line["dishesCandidatesTotal"] == 2


@pytest.mark.asyncio
async def test_recipe_intact_restores_split_without_note(report_engine):
    """Старое движение без примечания: техкарта цела — доли считаются как раньше."""
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, warehouse, meat, plov, shashlik = await _seed(db)
        db.add_all([
            ProductIngredient(product_id=plov.id, ingredient_id=meat.id,
                              quantity=Decimal("0.2")),
            ProductIngredient(product_id=shashlik.id, ingredient_id=meat.id,
                              quantity=Decimal("0.1")),
        ])
        order = await _order(db, company, branch, [(plov, "Плов", 2), (shashlik, "Шашлык", 1)])
        _sale(db, company, warehouse, meat, qty=Decimal("0.5"), order_id=order.id)
        await db.flush()
        line = (await outgoing_report(db, company.id, DAY, DAY))["lines"][0]
        assert line["dishesReason"] is None
        assert _dishes(line) == [("Плов", Decimal("0.4")), ("Шашлык", Decimal("0.1"))]
        assert sum(Decimal(d["qty"]) for d in line["dishes"]) == Decimal("0.5")


@pytest.mark.asyncio
async def test_deleted_order_without_note_is_reported_honestly(report_engine):
    """Ни заказа, ни примечания — блюдо неоткуда взять, причина остаётся."""
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, warehouse, meat, _plov, _shashlik = await _seed(db)
        _sale(db, company, warehouse, meat, qty=Decimal("0.6"), order_id=uuid4())
        await db.flush()
        line = (await outgoing_report(db, company.id, DAY, DAY))["lines"][0]
        assert line["dishes"] == []
        assert line["dishesReason"] == "order_deleted"
        assert line["dishesCandidates"] == []


@pytest.mark.asyncio
async def test_cancelled_item_does_not_become_the_dish(report_engine):
    """Отменённую позицию не называем виновником: её списание откатывается."""
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, warehouse, meat, plov, shashlik = await _seed(db)
        order = await _order(db, company, branch, [(shashlik, "Шашлык", 1)])
        db.add(OrderItem(order_id=order.id, product_id=plov.id, name="Плов",
                         price=100, quantity=3, total=300, status="cancelled"))
        await db.flush()
        _sale(db, company, warehouse, meat, qty=Decimal("0.3"), order_id=order.id)
        await db.flush()
        line = (await outgoing_report(db, company.id, DAY, DAY))["lines"][0]
        assert _dishes(line) == [("Шашлык", Decimal("0.3"))]
