"""Норма потерь ингредиента → отчётный авто-отход.

Помидор 0.3 кг на 1 кг: минус 2 кг со склада → в «Отход товаров»
падает 0.6 кг (is_automatic, черновик). Остаток двигает только само
списание (8 кг, не 7.4); провести авто-отход вручную нельзя (422).
Срабатывает и на расходе, и на списании по техкартам (deduct_for_order).
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy import select

from app.modules.inventory.loss import calc_waste_quantity
from app.modules.inventory.models import StockItem
from app.modules.inventory.service import StockService
from tests.conftest import register_company
from tests.test_cancelled_dishes_phase1 import _setup_company
from tests.test_recipe_stock_deduction import (
    _attach_recipe,
    _ingredient,
    _order_with_items,
    _stock_of,
    _warehouse,
)


def test_calc_waste_quantity_amount():
    # Пример из задачи: 0.3 кг на 1 кг, минус 2 кг → отход 0.6 кг.
    assert calc_waste_quantity(2, "amount", 0.3) == Decimal("0.6000")
    assert calc_waste_quantity(1, "amount", 0.2) == Decimal("0.2000")


def test_calc_waste_quantity_percent():
    assert calc_waste_quantity(2, "percent", 10) == Decimal("0.2000")
    assert calc_waste_quantity(2, "percent", 0) == Decimal("0")


def test_calc_waste_quantity_no_norm():
    assert calc_waste_quantity(2, None, None) == Decimal("0")
    assert calc_waste_quantity(2, "amount", None) == Decimal("0")
    assert calc_waste_quantity(2, "bogus", 0.3) == Decimal("0")
    assert calc_waste_quantity(0, "amount", 0.3) == Decimal("0")
    assert calc_waste_quantity(-5, "amount", 0.3) == Decimal("0")


@pytest.mark.asyncio
async def test_ingredient_loss_validation(client):
    headers, _ = await register_company(client, slug="lossval", email="lossval@example.com")

    ok = await client.post(
        "/inventory/ingredients", headers=headers,
        json={"name": "Помидор", "unit": "кг", "loss_type": "amount", "loss_value": 0.3},
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["loss_type"] == "amount"
    assert float(ok.json()["loss_value"]) == 0.3

    # Значение без типа — 422, «немой» норматив в БД не лежит.
    lone = await client.post(
        "/inventory/ingredients", headers=headers,
        json={"name": "Лук", "unit": "кг", "loss_value": 0.3},
    )
    assert lone.status_code == 422

    # Процент больше 100 — 422.
    over = await client.post(
        "/inventory/ingredients", headers=headers,
        json={"name": "Рис", "unit": "кг", "loss_type": "percent", "loss_value": 150},
    )
    assert over.status_code == 422

    # Отрицательное — 422.
    neg = await client.post(
        "/inventory/ingredients", headers=headers,
        json={"name": "Морковь", "unit": "кг", "loss_type": "amount", "loss_value": -1},
    )
    assert neg.status_code == 422


@pytest.mark.asyncio
async def test_expense_accept_creates_report_only_auto_waste(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="lossexp", email="lossexp@example.com")
    headers = ctx["headers"]
    ing = await _ingredient(client, headers, name="Помидор")
    resp = await client.patch(
        f"/inventory/ingredients/{ing['id']}", headers=headers,
        json={"loss_type": "amount", "loss_value": 0.3},
    )
    assert resp.status_code == 200, resp.text

    wh = await client.post("/warehouse/list", headers=headers, json={"name": "Main"})
    wh_id = wh.json()["id"]
    purchase = await client.post(
        "/warehouse/purchases", headers=headers,
        json={"warehouse_id": wh_id, "items": [
            {"name": "Помидор", "ingredient_id": ing["id"], "quantity": 10, "unit": "кг", "cost_price": 5000},
        ]},
    )
    assert purchase.status_code == 201, purchase.text

    doc = await client.post(
        "/warehouse/expenses", headers=headers,
        json={"warehouse_id": wh_id, "items": [
            {"name": "Помидор", "ingredient_id": ing["id"], "quantity": 2, "unit": "кг", "cost_price": 5000},
        ]},
    )
    assert doc.status_code == 201, doc.text
    accept = await client.patch(
        f"/warehouse/expenses/{doc.json()['id']}", headers=headers, json={"status": "accepted"}
    )
    assert accept.status_code == 200, accept.text

    # Остаток двигает только расход: 10 − 2 = 8 (не 7.4).
    stock = await client.get("/inventory/stock", headers=headers)
    row = next(s for s in stock.json() if s["ingredient_id"] == ing["id"])
    assert float(row["quantity"]) == 8.0

    # В отходах — 0.6 кг черновиком с пометкой Авто.
    wastes = await client.get("/warehouse/wastes", headers=headers)
    auto = [w for w in wastes.json() if w["ingredient_id"] == ing["id"]]
    assert len(auto) == 1
    assert float(auto[0]["quantity"]) == 0.6
    assert auto[0]["status"] == "draft"
    assert auto[0]["is_automatic"] is True
    assert "Авто" in (auto[0]["reason"] or "")

    # Повторное проведение — no-op, дубля авто-отхода нет.
    await client.patch(
        f"/warehouse/expenses/{doc.json()['id']}", headers=headers, json={"status": "accepted"}
    )
    wastes = await client.get("/warehouse/wastes", headers=headers)
    assert len([w for w in wastes.json() if w["ingredient_id"] == ing["id"]]) == 1

    # Провести авто-отход вручную нельзя: остаток не должен уйти в 7.4.
    conduct = await client.patch(
        f"/warehouse/wastes/{auto[0]['id']}", headers=headers, json={"status": "accepted"}
    )
    assert conduct.status_code == 422
    stock = await client.get("/inventory/stock", headers=headers)
    row = next(s for s in stock.json() if s["ingredient_id"] == ing["id"])
    assert float(row["quantity"]) == 8.0


@pytest.mark.asyncio
async def test_recipe_deduction_creates_report_only_auto_waste(client, db_engine):
    # Техкарта: 1 кг риса на порцию, норма потерь риса 0.2 → за порцию
    # со склада минус 1 кг, в отходах показывается 0.2 кг.
    ctx = await _setup_company(client, db_engine, slug="lossrec", email="lossrec@example.com")
    ing = await _ingredient(client, ctx["headers"], name="Рис")
    resp = await client.patch(
        f"/inventory/ingredients/{ing['id']}", headers=ctx["headers"],
        json={"loss_type": "amount", "loss_value": 0.2},
    )
    assert resp.status_code == 200, resp.text
    wh_id = await _warehouse(ctx["sessions"], ctx["company_id"])
    await _attach_recipe(client, ctx["headers"], str(ctx["product_id"]), ing["id"], 1)
    oid = await _order_with_items(
        ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], product_id=ctx["product_id"], portions=1,
    )

    async with ctx["sessions"]() as db:
        moved = await StockService(db).deduct_for_order(ctx["company_id"], oid)
        await db.commit()
    assert moved == 1
    assert await _stock_of(ctx["sessions"], ctx["company_id"], wh_id, UUID(ing["id"])) == Decimal("-1")

    wastes = await client.get("/warehouse/wastes", headers=ctx["headers"])
    auto = [w for w in wastes.json() if w["ingredient_id"] == ing["id"]]
    assert len(auto) == 1
    assert float(auto[0]["quantity"]) == 0.2
    assert auto[0]["is_automatic"] is True

    # Повторный вызов — no-op: ни движений, ни дублей отхода.
    async with ctx["sessions"]() as db:
        moved = await StockService(db).deduct_for_order(ctx["company_id"], oid)
        await db.commit()
    assert moved == 0
    wastes = await client.get("/warehouse/wastes", headers=ctx["headers"])
    assert len([w for w in wastes.json() if w["ingredient_id"] == ing["id"]]) == 1


@pytest.mark.asyncio
async def test_percent_loss_applies_on_expense(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="losspct", email="losspct@example.com")
    headers = ctx["headers"]
    ing = await _ingredient(client, headers, name="Мука")
    resp = await client.patch(
        f"/inventory/ingredients/{ing['id']}", headers=headers,
        json={"loss_type": "percent", "loss_value": 10},
    )
    assert resp.status_code == 200, resp.text

    wh = await client.post("/warehouse/list", headers=headers, json={"name": "Main"})
    wh_id = wh.json()["id"]
    await client.post(
        "/warehouse/purchases", headers=headers,
        json={"warehouse_id": wh_id, "items": [
            {"name": "Мука", "ingredient_id": ing["id"], "quantity": 10, "unit": "кг", "cost_price": 4000},
        ]},
    )
    doc = await client.post(
        "/warehouse/expenses", headers=headers,
        json={"warehouse_id": wh_id, "items": [
            {"name": "Мука", "ingredient_id": ing["id"], "quantity": 2, "unit": "кг", "cost_price": 4000},
        ]},
    )
    accept = await client.patch(
        f"/warehouse/expenses/{doc.json()['id']}", headers=headers, json={"status": "accepted"}
    )
    assert accept.status_code == 200, accept.text

    wastes = await client.get("/warehouse/wastes", headers=headers)
    auto = [w for w in wastes.json() if w["ingredient_id"] == ing["id"]]
    assert len(auto) == 1
    assert float(auto[0]["quantity"]) == 0.2
