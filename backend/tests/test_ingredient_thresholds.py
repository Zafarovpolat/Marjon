"""V47: среднее количество + порог дефицита в карточке продукта.

Порог из карточки включает строку в low_stock (колокольчик),
когда у складской строки свой порог не задан.
"""
from __future__ import annotations

from tests.conftest import create_staff_headers, register_company


async def _setup(client):
    headers, _ = await register_company(client, slug="avg47", email="avg47@example.com")
    stock_headers = await create_staff_headers(
        client, headers, email="warehouse@avg47.example.com", role_slug="warehouse"
    )
    wh = (await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})).json()
    return headers, stock_headers, wh["id"]


async def test_create_ingredient_with_norms(client):
    headers, _, _ = await _setup(client)
    resp = await client.post(
        "/inventory/ingredients", headers=headers,
        json={"name": "Мука", "unit": "кг", "avg_quantity": 100, "deficit_threshold": 20},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert float(body["avg_quantity"]) == 100.0
    assert float(body["deficit_threshold"]) == 20.0


async def test_create_ingredient_without_norms_ok(client):
    headers, _, _ = await _setup(client)
    resp = await client.post(
        "/inventory/ingredients", headers=headers, json={"name": "Соль", "unit": "кг"}
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["avg_quantity"] is None
    assert resp.json()["deficit_threshold"] is None


async def test_negative_norms_rejected(client):
    headers, _, _ = await _setup(client)
    resp = await client.post(
        "/inventory/ingredients", headers=headers,
        json={"name": "Сахар", "unit": "кг", "avg_quantity": -5, "deficit_threshold": 10},
    )
    assert resp.status_code == 422, resp.text
    resp = await client.post(
        "/inventory/ingredients", headers=headers,
        json={"name": "Сахар", "unit": "кг", "avg_quantity": 5, "deficit_threshold": -1},
    )
    assert resp.status_code == 422, resp.text


async def test_update_ingredient_norms(client):
    headers, _, _ = await _setup(client)
    created = await client.post(
        "/inventory/ingredients", headers=headers, json={"name": "Масло", "unit": "л"}
    )
    ing_id = created.json()["id"]
    resp = await client.patch(
        f"/inventory/ingredients/{ing_id}", headers=headers,
        json={"avg_quantity": 50, "deficit_threshold": 10},
    )
    assert resp.status_code == 200, resp.text
    assert float(resp.json()["avg_quantity"]) == 50.0
    assert float(resp.json()["deficit_threshold"]) == 10.0


async def test_low_stock_uses_card_threshold(client):
    """Остаток 8 при пороге карточки 20 и min_quantity 0 — в low_stock."""
    headers, stock_headers, wh_id = await _setup(client)
    ing = (await client.post(
        "/inventory/ingredients", headers=headers,
        json={"name": "Мука", "unit": "кг", "avg_quantity": 100, "deficit_threshold": 20},
    )).json()
    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh_id,
            "items": [{"name": "Мука", "ingredient_id": ing["id"], "quantity": 8, "unit": "кг", "cost_price": 1000}],
        },
    )
    assert resp.status_code == 201, resp.text
    low = await client.get("/inventory/stock", headers=stock_headers, params={"low_stock": True})
    assert low.status_code == 200, low.text
    assert any(s["ingredient_id"] == ing["id"] for s in low.json())


async def test_low_stock_ignores_high_stock(client):
    """Остаток 50 при пороге 20 — не в low_stock."""
    headers, stock_headers, wh_id = await _setup(client)
    ing = (await client.post(
        "/inventory/ingredients", headers=headers,
        json={"name": "Сахар", "unit": "кг", "avg_quantity": 100, "deficit_threshold": 20},
    )).json()
    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh_id,
            "items": [{"name": "Сахар", "ingredient_id": ing["id"], "quantity": 50, "unit": "кг", "cost_price": 1000}],
        },
    )
    assert resp.status_code == 201, resp.text
    low = await client.get("/inventory/stock", headers=stock_headers, params={"low_stock": True})
    assert low.status_code == 200, low.text
    assert all(s["ingredient_id"] != ing["id"] for s in low.json())
