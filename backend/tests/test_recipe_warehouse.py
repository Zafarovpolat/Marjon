"""V36 — per-line recipe warehouse.

Business rule: a recipe line may pin the warehouse its ingredient is
deducted from on every completed order (NULL = company main warehouse,
historical behavior). Warehouse CRUD: PATCH rename (+ is_main
exclusivity), DELETE free warehouses, 409 when referenced by stock,
movements or recipes.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.modules.inventory.models import StockItem, StockMovement, Warehouse
from app.modules.inventory.service import StockService
from tests.test_cancelled_dishes_phase1 import _setup_company
from tests.test_recipe_stock_deduction import (
    _ingredient,
    _movements,
    _order_with_items,
    _stock_of,
    _warehouse,
)


async def _attach_recipe_wh(client, headers, product_id, ingredient_id, quantity, warehouse_id=None):
    line = {"ingredient_id": ingredient_id, "quantity": quantity}
    if warehouse_id is not None:
        line["warehouse_id"] = str(warehouse_id)
    resp = await client.patch(
        f"/inventory/products/{product_id}", headers=headers, json={"ingredients": [line]}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _deduct(ctx, order_id):
    async with ctx["sessions"]() as db:
        moved = await StockService(db).deduct_for_order(ctx["company_id"], order_id)
        await db.commit()
    return moved


@pytest.mark.asyncio
async def test_deduction_uses_line_warehouse(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="recwh-a", email="recwh-a@example.com")
    ing = await _ingredient(client, ctx["headers"])
    main_id = await _warehouse(ctx["sessions"], ctx["company_id"], name="Main", is_main=True)
    second_id = await _warehouse(ctx["sessions"], ctx["company_id"], name="Second", is_main=False)
    await _attach_recipe_wh(
        client, ctx["headers"], str(ctx["product_id"]), ing["id"], 11, warehouse_id=second_id
    )
    oid = await _order_with_items(
        ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], product_id=ctx["product_id"], portions=1,
    )
    assert await _deduct(ctx, oid) == 1
    # 11 кг ушло со второго склада; главный не тронут.
    assert await _stock_of(ctx["sessions"], ctx["company_id"], second_id, UUID(ing["id"])) == Decimal("-11")
    assert await _stock_of(ctx["sessions"], ctx["company_id"], main_id, UUID(ing["id"])) is None
    rows = await _movements(ctx["sessions"], ctx["company_id"], oid)
    assert len(rows) == 1
    assert rows[0].warehouse_id == second_id


@pytest.mark.asyncio
async def test_null_line_warehouse_falls_back_to_main(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="recwh-b", email="recwh-b@example.com")
    ing = await _ingredient(client, ctx["headers"])
    main_id = await _warehouse(ctx["sessions"], ctx["company_id"], name="Main", is_main=True)
    second_id = await _warehouse(ctx["sessions"], ctx["company_id"], name="Second", is_main=False)
    await _attach_recipe_wh(client, ctx["headers"], str(ctx["product_id"]), ing["id"], 2)
    oid = await _order_with_items(
        ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], product_id=ctx["product_id"], portions=1,
    )
    assert await _deduct(ctx, oid) == 1
    assert await _stock_of(ctx["sessions"], ctx["company_id"], main_id, UUID(ing["id"])) == Decimal("-2")
    assert await _stock_of(ctx["sessions"], ctx["company_id"], second_id, UUID(ing["id"])) is None


@pytest.mark.asyncio
async def test_recipe_rejects_unknown_warehouse(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="recwh-c", email="recwh-c@example.com")
    ing = await _ingredient(client, ctx["headers"])
    await _warehouse(ctx["sessions"], ctx["company_id"])
    resp = await client.patch(
        f"/inventory/products/{ctx['product_id']}", headers=ctx["headers"],
        json={"ingredients": [{"ingredient_id": ing["id"], "quantity": 1, "warehouse_id": str(uuid4())}]},
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_recipe_rejects_foreign_warehouse(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="recwh-d", email="recwh-d@example.com")
    other = await _setup_company(client, db_engine, slug="recwh-e", email="recwh-e@example.com")
    ing = await _ingredient(client, ctx["headers"])
    foreign_wh = await _warehouse(other["sessions"], other["company_id"], name="Foreign")
    resp = await client.patch(
        f"/inventory/products/{ctx['product_id']}", headers=ctx["headers"],
        json={"ingredients": [{"ingredient_id": ing["id"], "quantity": 1, "warehouse_id": str(foreign_wh)}]},
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_product_response_carries_line_warehouse(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="recwh-f", email="recwh-f@example.com")
    ing = await _ingredient(client, ctx["headers"])
    wh_id = await _warehouse(ctx["sessions"], ctx["company_id"], name="Second", is_main=False)
    body = await _attach_recipe_wh(
        client, ctx["headers"], str(ctx["product_id"]), ing["id"], 3, warehouse_id=wh_id
    )
    assert body["ingredients"][0]["warehouse_id"] == str(wh_id)
    plain = await _attach_recipe_wh(client, ctx["headers"], str(ctx["product_id"]), ing["id"], 3)
    assert plain["ingredients"][0]["warehouse_id"] is None


@pytest.mark.asyncio
async def test_warehouse_patch_rename_and_main_exclusivity(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="recwh-g", email="recwh-g@example.com")
    main_id = await _warehouse(ctx["sessions"], ctx["company_id"], name="Main", is_main=True)
    second_id = await _warehouse(ctx["sessions"], ctx["company_id"], name="Second", is_main=False)
    resp = await client.patch(
        f"/warehouse/list/{second_id}", headers=ctx["headers"], json={"name": "Renamed"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Renamed"
    resp = await client.patch(
        f"/warehouse/list/{second_id}", headers=ctx["headers"], json={"is_main": True}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_main"] is True
    async with ctx["sessions"]() as db:
        main = await db.get(Warehouse, main_id)
        assert main.is_main is False


@pytest.mark.asyncio
async def test_warehouse_delete_free_and_guarded(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="recwh-h", email="recwh-h@example.com")
    free_id = await _warehouse(ctx["sessions"], ctx["company_id"], name="Free", is_main=False)
    resp = await client.delete(f"/warehouse/list/{free_id}", headers=ctx["headers"])
    assert resp.status_code == 204, resp.text

    ing = await _ingredient(client, ctx["headers"])
    busy_id = await _warehouse(ctx["sessions"], ctx["company_id"], name="Busy", is_main=False)
    await _attach_recipe_wh(client, ctx["headers"], str(ctx["product_id"]), ing["id"], 1)
    # Привяжем строку к складу, чтобы сработал именно recipes-гард.
    await _attach_recipe_wh(
        client, ctx["headers"], str(ctx["product_id"]), ing["id"], 1, warehouse_id=busy_id
    )
    resp = await client.delete(f"/warehouse/list/{busy_id}", headers=ctx["headers"])
    assert resp.status_code == 409, resp.text

    resp = await client.delete(f"/warehouse/list/{uuid4()}", headers=ctx["headers"])
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_warehouse_delete_blocked_by_stock(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="recwh-i", email="recwh-i@example.com")
    ing = await _ingredient(client, ctx["headers"])
    wh_id = await _warehouse(ctx["sessions"], ctx["company_id"], name="Stocked", is_main=False)
    async with ctx["sessions"]() as db:
        db.add(StockItem(
            company_id=ctx["company_id"], warehouse_id=wh_id,
            ingredient_id=UUID(ing["id"]), quantity=Decimal("50"), unit="кг",
        ))
        await db.commit()
    resp = await client.delete(f"/warehouse/list/{wh_id}", headers=ctx["headers"])
    assert resp.status_code == 409, resp.text


@pytest.mark.asyncio
async def test_warehouse_mutations_are_company_scoped(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="recwh-j", email="recwh-j@example.com")
    other = await _setup_company(client, db_engine, slug="recwh-k", email="recwh-k@example.com")
    wh_id = await _warehouse(ctx["sessions"], ctx["company_id"], name="Mine", is_main=False)
    resp = await client.patch(
        f"/warehouse/list/{wh_id}", headers=other["headers"], json={"name": "Hijacked"}
    )
    assert resp.status_code == 404, resp.text
    resp = await client.delete(f"/warehouse/list/{wh_id}", headers=other["headers"])
    assert resp.status_code == 404, resp.text
