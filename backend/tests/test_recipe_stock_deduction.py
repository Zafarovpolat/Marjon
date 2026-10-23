"""Recipe-driven stock deduction on order completion.

Business rule: selling a dish deducts its recipe ingredients
(quantity per serving × servings sold) from the main warehouse.
Minus is allowed; repeat calls are idempotent via ref_id.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.modules.inventory.models import (
    Ingredient, Product, SetItem, StockItem, StockMovement, Warehouse,
)
from app.modules.inventory.service import StockService
from app.modules.pos.models import Order, OrderItem
from app.shared.exceptions import NotFoundError
from tests.conftest import register_company
from tests.test_cancelled_dishes_phase1 import _setup_company


async def _ingredient(client, headers, name="Мясо", unit="кг"):
    resp = await client.post(
        "/inventory/ingredients", headers=headers, json={"name": name, "unit": unit}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _warehouse(db_sessions, company_id, name="Main", is_main=True):
    async with db_sessions() as db:
        wh = Warehouse(company_id=company_id, name=name, is_main=is_main)
        db.add(wh)
        await db.commit()
        await db.refresh(wh)
        return wh.id


async def _attach_recipe(client, headers, product_id, ingredient_id, quantity):
    resp = await client.patch(
        f"/inventory/products/{product_id}",
        headers=headers,
        json={"ingredients": [{"ingredient_id": ingredient_id, "quantity": quantity}]},
    )
    assert resp.status_code == 200, resp.text


async def _order_with_items(db_sessions, *, company_id, branch_id, waiter_id,
                            product_id, portions, status="completed", name="Лаваш"):
    oid = uuid4()
    async with db_sessions() as db:
        db.add(Order(
            id=oid, company_id=company_id, branch_id=branch_id,
            waiter_id=waiter_id, order_number=f"DED-{uuid4().hex[:6]}",
            order_type="dine_in", status=status,
            subtotal=Decimal("0"), total_amount=Decimal("0"),
        ))
        db.add(OrderItem(
            order_id=oid, product_id=product_id, name=name,
            price=Decimal("40000"), quantity=Decimal(str(portions)),
            total=Decimal("0"), status="pending",
        ))
        await db.commit()
    return oid


async def _stock_of(db_sessions, company_id, warehouse_id, ingredient_id):
    async with db_sessions() as db:
        row = (
            await db.execute(
                select(StockItem).where(
                    StockItem.company_id == company_id,
                    StockItem.warehouse_id == warehouse_id,
                    StockItem.ingredient_id == ingredient_id,
                )
            )
        ).scalar_one_or_none()
        return Decimal(str(row.quantity)) if row else None


async def _movements(db_sessions, company_id, order_id):
    async with db_sessions() as db:
        rows = (
            await db.execute(
                select(StockMovement).where(
                    StockMovement.company_id == company_id,
                    StockMovement.ref_id == order_id,
                )
            )
        ).scalars().all()
        return rows


@pytest.mark.asyncio
async def test_payment_deducts_recipe_per_serving(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="deduct-a", email="deduct-a@example.com")
    ing = await _ingredient(client, ctx["headers"])
    wh_id = await _warehouse(ctx["sessions"], ctx["company_id"])
    await _attach_recipe(client, ctx["headers"], str(ctx["product_id"]), ing["id"], 0.2)
    oid = await _order_with_items(
        ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], product_id=ctx["product_id"], portions=3,
    )

    async with ctx["sessions"]() as db:
        moved = await StockService(db).deduct_for_order(ctx["company_id"], oid)
        await db.commit()
    assert moved == 1
    # 0.2 кг × 3 порции = 0.6 кг в минус (склада не было).
    assert await _stock_of(ctx["sessions"], ctx["company_id"], wh_id, UUID(ing["id"])) == Decimal("-0.6")

    rows = await _movements(ctx["sessions"], ctx["company_id"], oid)
    assert len(rows) == 1
    assert rows[0].movement_type == "sale"
    assert rows[0].quantity == Decimal("0.6")


@pytest.mark.asyncio
async def test_deduction_is_idempotent(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="deduct-b", email="deduct-b@example.com")
    ing = await _ingredient(client, ctx["headers"])
    await _warehouse(ctx["sessions"], ctx["company_id"])
    await _attach_recipe(client, ctx["headers"], str(ctx["product_id"]), ing["id"], 0.2)
    oid = await _order_with_items(
        ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], product_id=ctx["product_id"], portions=1,
    )

    async with ctx["sessions"]() as db:
        assert await StockService(db).deduct_for_order(ctx["company_id"], oid) == 1
        await db.commit()
    async with ctx["sessions"]() as db:
        assert await StockService(db).deduct_for_order(ctx["company_id"], oid) == 0
        await db.commit()
    rows = await _movements(ctx["sessions"], ctx["company_id"], oid)
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_cancelled_items_are_not_deducted(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="deduct-c", email="deduct-c@example.com")
    ing = await _ingredient(client, ctx["headers"])
    await _warehouse(ctx["sessions"], ctx["company_id"])
    await _attach_recipe(client, ctx["headers"], str(ctx["product_id"]), ing["id"], 0.5)
    oid = uuid4()
    async with ctx["sessions"]() as db:
        db.add(Order(
            id=oid, company_id=ctx["company_id"], branch_id=ctx["branch_id"],
            waiter_id=ctx["owner_id"], order_number="DED-C",
            order_type="dine_in", status="completed",
            subtotal=Decimal("0"), total_amount=Decimal("0"),
        ))
        db.add(OrderItem(
            order_id=oid, product_id=ctx["product_id"], name="Лаваш",
            price=Decimal("1"), quantity=Decimal("2"), total=Decimal("0"),
            status="cancelled",
        ))
        await db.commit()
    async with ctx["sessions"]() as db:
        moved = await StockService(db).deduct_for_order(ctx["company_id"], oid)
        await db.commit()
    assert moved == 0
    assert await _movements(ctx["sessions"], ctx["company_id"], oid) == []


@pytest.mark.asyncio
async def test_no_warehouse_means_no_deduction(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="deduct-d", email="deduct-d@example.com")
    ing = await _ingredient(client, ctx["headers"])
    await _attach_recipe(client, ctx["headers"], str(ctx["product_id"]), ing["id"], 0.2)
    oid = await _order_with_items(
        ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], product_id=ctx["product_id"], portions=1,
    )
    async with ctx["sessions"]() as db:
        assert await StockService(db).deduct_for_order(ctx["company_id"], oid) == 0
        await db.commit()


@pytest.mark.asyncio
async def test_deduction_is_company_scoped(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="deduct-e", email="deduct-e@example.com")
    other_headers, _ = await register_company(client, slug="deduct-f", email="deduct-f@example.com")
    ing = await _ingredient(client, ctx["headers"])
    await _warehouse(ctx["sessions"], ctx["company_id"])
    await _attach_recipe(client, ctx["headers"], str(ctx["product_id"]), ing["id"], 0.2)
    oid = await _order_with_items(
        ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], product_id=ctx["product_id"], portions=1,
    )
    me = await client.get("/auth/me", headers=other_headers)
    other_company_id = UUID(me.json()["company_id"])
    async with ctx["sessions"]() as db:
        with pytest.raises(NotFoundError):
            # чужой заказ под чужой компанией не виден — списание невозможно
            await StockService(db).deduct_for_order(other_company_id, oid)


@pytest.mark.asyncio
async def test_movement_sets_deficit_threshold_without_migration(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="deduct-g", email="deduct-g@example.com")
    ing = await _ingredient(client, ctx["headers"])
    wh_id = await _warehouse(ctx["sessions"], ctx["company_id"])
    resp = await client.post(
        "/inventory/stock/movements", headers=ctx["headers"], json={
            "warehouse_id": str(wh_id), "ingredient_id": ing["id"],
            "movement_type": "purchase", "quantity": 10, "unit": "кг",
            "min_quantity": 2,
        },
    )
    assert resp.status_code == 201, resp.text
    assert await _stock_of(ctx["sessions"], ctx["company_id"], wh_id, UUID(ing["id"])) == Decimal("10")
    async with ctx["sessions"]() as db:
        row = (
            await db.execute(
                select(StockItem).where(
                    StockItem.company_id == ctx["company_id"],
                    StockItem.warehouse_id == wh_id,
                    StockItem.ingredient_id == UUID(ing["id"]),
                )
            )
        ).scalar_one()
        assert row.min_quantity == Decimal("2")


async def _set_product(db_sessions, *, company_id, category_id, name="Комбо", components):
    """Сет (is_set) и его состав: components = [(product_id, порций), ...]."""
    set_id = uuid4()
    async with db_sessions() as db:
        db.add(Product(
            id=set_id, company_id=company_id, category_id=category_id,
            name=name, price=Decimal("100"), cost_price=Decimal("40"), is_set=True,
        ))
        await db.flush()
        for component_id, qty in components:
            db.add(SetItem(
                company_id=company_id, set_product_id=set_id,
                product_id=component_id, quantity=Decimal(str(qty)), price=Decimal("0"),
            ))
        await db.commit()
    return set_id


@pytest.mark.asyncio
async def test_set_sale_deducts_component_ingredients(client, db_engine):
    """Сет не имеет своей техкарты: продажа комбо списывает сырьё компонентов."""
    ctx = await _setup_company(client, db_engine, slug="deduct-set", email="deduct-set@example.com")
    ing = await _ingredient(client, ctx["headers"])
    await _warehouse(ctx["sessions"], ctx["company_id"])
    # Лаваш: 0.2 кг помидора за порцию.
    await _attach_recipe(client, ctx["headers"], str(ctx["product_id"]), ing["id"], 0.2)
    # Комбо = 2 лаваша → 0.4 кг за один проданный сет.
    set_id = await _set_product(
        ctx["sessions"], company_id=ctx["company_id"],
        category_id=ctx["category_id"], components=[(ctx["product_id"], 2)],
    )
    oid = await _order_with_items(
        ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], product_id=set_id, portions=1, name="Комбо",
    )

    async with ctx["sessions"]() as db:
        moved = await StockService(db).deduct_for_order(ctx["company_id"], oid)
        await db.commit()
    assert moved == 1
    rows = await _movements(ctx["sessions"], ctx["company_id"], oid)
    assert [row.quantity for row in rows] == [Decimal("0.4")]
    # В примечании — проданное блюдо, по нему отчёт расхода узнаёт сет.
    assert rows[0].note == "dish sale: Комбо"


@pytest.mark.asyncio
async def test_item_added_after_payment_is_deducted(client, db_engine):
    """Дозаказ: дописывается только разница, повтор — no-op."""
    ctx = await _setup_company(client, db_engine, slug="deduct-add", email="deduct-add@example.com")
    ing = await _ingredient(client, ctx["headers"])
    await _warehouse(ctx["sessions"], ctx["company_id"])
    await _attach_recipe(client, ctx["headers"], str(ctx["product_id"]), ing["id"], 0.2)
    oid = await _order_with_items(
        ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], product_id=ctx["product_id"], portions=1,
    )
    async with ctx["sessions"]() as db:
        assert await StockService(db).deduct_for_order(ctx["company_id"], oid) == 1
        await db.commit()

    # После оплаты гость дозаказал ещё порцию.
    async with ctx["sessions"]() as db:
        db.add(OrderItem(
            order_id=oid, product_id=ctx["product_id"], name="Лаваш",
            price=Decimal("40000"), quantity=Decimal("1"),
            total=Decimal("0"), status="pending",
        ))
        await db.commit()
    async with ctx["sessions"]() as db:
        assert await StockService(db).deduct_for_order(ctx["company_id"], oid) == 1
        await db.commit()

    rows = await _movements(ctx["sessions"], ctx["company_id"], oid)
    assert sorted(row.quantity for row in rows) == [Decimal("0.2"), Decimal("0.2")]
    # Третий вызов ничего не добавляет.
    async with ctx["sessions"]() as db:
        assert await StockService(db).deduct_for_order(ctx["company_id"], oid) == 0
        await db.commit()
