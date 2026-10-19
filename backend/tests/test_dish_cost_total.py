"""Себестоимость блюда = ручная база + состав (вариант A).

Бизнес-правило: число, введённое в карточке (products.cost_price), не
затирается — оно складывается с Σ(норма строки рецепта × средняя закупка
ингредиента). Ровно та же сумма замораживается в cost_price_snapshot при
продаже, поэтому проверяем и API-поля, и функцию пути кассы.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.inventory.models import Product
from app.modules.inventory.service import product_cost_total
from tests.conftest import create_staff_headers, register_company


async def _stocked_ingredient(client, headers, *, name="Рис", unit="кг", qty=10, price=5000):
    """Сырьё + одна закупка: средняя закупочная цена = price."""
    stock_headers = await create_staff_headers(
        client, headers, email=f"wh-{name}@acme.example.com", role_slug="warehouse",
    )
    wh = await client.post("/warehouse/list", headers=stock_headers, json={"name": f"Склад {name}"})
    assert wh.status_code in (200, 201), wh.text
    ing = await client.post(
        "/inventory/ingredients", headers=headers, json={"name": name, "unit": unit},
    )
    assert ing.status_code == 201, ing.text
    ing = ing.json()
    move = await client.post(
        "/inventory/stock/movements", headers=stock_headers,
        json={
            "warehouse_id": wh.json()["id"], "ingredient_id": ing["id"],
            "movement_type": "purchase", "quantity": qty, "unit": unit, "cost_price": price,
        },
    )
    assert move.status_code in (200, 201), move.text
    return ing


async def _create_dish(client, headers, *, name="Плов", price=54000, cost=None, ingredients=None):
    payload = {"name": name, "price": price}
    if cost is not None:
        payload["cost_price"] = cost
    if ingredients:
        payload["ingredients"] = ingredients
    resp = await client.post("/inventory/products", headers=headers, json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_dish_cost_is_manual_base_plus_recipe(client):
    """9 000 вручную + 0,5 кг риса по 5 000 = 11 500, база остаётся 9 000."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    rice = await _stocked_ingredient(client, headers, price=5000)

    dish = await _create_dish(
        client, headers, cost=9000,
        ingredients=[{"ingredient_id": rice["id"], "quantity": 0.5}],
    )

    assert float(dish["cost_price"]) == 9000.0       # ручная база не перезаписана
    assert float(dish["recipe_cost"]) == 2500.0      # 0.5 × 5000
    assert float(dish["cost_total"]) == 11500.0


async def test_dish_without_recipe_keeps_manual_cost(client):
    """Блюдо без состава: итог равен ручной базе, состав — 0."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    dish = await _create_dish(client, headers, name="Хот док", cost=8500)

    assert float(dish["cost_price"]) == 8500.0
    assert float(dish["recipe_cost"]) == 0.0
    assert float(dish["cost_total"]) == 8500.0


async def test_recipe_change_does_not_overwrite_manual_base(client):
    """Правка рецепта пересчитывает состав, но не трогает введённое число."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    rice = await _stocked_ingredient(client, headers, price=5000)
    dish = await _create_dish(
        client, headers, cost=9000,
        ingredients=[{"ingredient_id": rice["id"], "quantity": 0.5}],
    )
    assert float(dish["cost_total"]) == 11500.0

    updated = await client.patch(
        f"/inventory/products/{dish['id']}", headers=headers,
        json={"ingredients": [{"ingredient_id": rice["id"], "quantity": 1.0}]},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert float(body["cost_price"]) == 9000.0
    assert float(body["recipe_cost"]) == 5000.0
    assert float(body["cost_total"]) == 14000.0


async def test_unknown_cost_stays_null_not_zero(client):
    """Нет ни базы, ни рецепта — итог NULL, а не выдуманный ноль."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    dish = await _create_dish(client, headers, name="Вода", price=5000)

    assert dish["cost_price"] is None
    assert dish["cost_total"] is None


async def test_ingredient_without_purchases_contributes_zero(client):
    """Сырьё без закупок: вклад 0, но база остаётся видимой."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    empty = await client.post(
        "/inventory/ingredients", headers=headers, json={"name": "Огурец", "unit": "кг"},
    )
    empty = empty.json()
    dish = await _create_dish(
        client, headers, cost=7000,
        ingredients=[{"ingredient_id": empty["id"], "quantity": 0.2}],
    )

    assert float(dish["recipe_cost"]) == 0.0
    assert float(dish["cost_total"]) == 7000.0


async def test_cashier_path_returns_same_total(client, db_engine):
    """product_cost_total (снимок при продаже) = cost_total из API."""
    headers, tokens = await register_company(client, slug="acme", email="owner@acme.example.com")
    rice = await _stocked_ingredient(client, headers, price=5000)
    dish = await _create_dish(
        client, headers, cost=9000,
        ingredients=[{"ingredient_id": rice["id"], "quantity": 0.5}],
    )

    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as db:
        product = (await db.execute(
            select(Product).where(Product.id == UUID(dish["id"]))
        )).scalar_one()
        snapshot = await product_cost_total(db, product.company_id, product)

    assert snapshot == Decimal("11500.00")
    assert float(snapshot) == float(dish["cost_total"])
