from __future__ import annotations

from datetime import date, timedelta

from tests.conftest import create_staff_headers, register_company


async def _stock_setup(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await create_staff_headers(
        client, headers, email="warehouse@acme.example.com", role_slug="warehouse"
    )
    wh = await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})
    ing = await client.post(
        "/inventory/ingredients", headers=headers, json={"name": "Flour", "unit": "кг"}
    )
    return stock_headers, wh.json()["id"], ing.json()["id"]


async def test_as_of_far_past_is_empty(client):
    """До любых движений остаток на дату пуст."""
    stock_headers, wh_id, ing_id = await _stock_setup(client)
    await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "supplier": "FlourCo", "warehouse_id": wh_id,
            "items": [{"name": "Flour", "ingredient_id": ing_id, "quantity": 10, "unit": "кг", "cost_price": 1000}],
        },
    )
    resp = await client.get("/inventory/stock", headers=stock_headers, params={"as_of": "2000-01-01"})
    assert resp.status_code == 200
    assert [s for s in resp.json() if s["ingredient_id"] == ing_id] == []


async def test_as_of_today_matches_current_stock_with_wavg(client):
    """На сегодня replay сходится с текущими остатками (wavg-себестоимость)."""
    stock_headers, wh_id, ing_id = await _stock_setup(client)
    for qty, price in ((10, 1000), (10, 3000)):
        resp = await client.post(
            "/warehouse/purchases", headers=stock_headers,
            json={
                "supplier": "FlourCo", "warehouse_id": wh_id,
                "items": [{"name": "Flour", "ingredient_id": ing_id, "quantity": qty, "unit": "кг", "cost_price": price}],
            },
        )
        assert resp.status_code == 201

    today = date.today().isoformat()
    asof = await client.get("/inventory/stock", headers=stock_headers, params={"as_of": today})
    current = await client.get("/inventory/stock", headers=stock_headers)
    assert asof.status_code == 200
    row = next(s for s in asof.json() if s["ingredient_id"] == ing_id)
    live = next(s for s in current.json() if s["ingredient_id"] == ing_id)
    assert float(row["quantity"]) == 20.0
    assert float(row["quantity"]) == float(live["quantity"])
    assert float(row["cost_price"]) == 2000.0
    assert float(row["cost_price"]) == float(live["cost_price"])


async def test_as_of_accounts_for_outgoing_movements(client):
    """Списания (sale-движения) уменьшают остаток на дату."""
    stock_headers, wh_id, ing_id = await _stock_setup(client)
    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "supplier": "FlourCo", "warehouse_id": wh_id,
            "items": [{"name": "Flour", "ingredient_id": ing_id, "quantity": 10, "unit": "кг", "cost_price": 1000}],
        },
    )
    assert resp.status_code == 201
    move = await client.post(
        "/inventory/stock/movements", headers=stock_headers,
        json={
            "warehouse_id": wh_id, "ingredient_id": ing_id,
            "movement_type": "sale", "quantity": 4, "unit": "кг",
        },
    )
    assert move.status_code == 201

    today = date.today().isoformat()
    asof = await client.get("/inventory/stock", headers=stock_headers, params={"as_of": today})
    row = next(s for s in asof.json() if s["ingredient_id"] == ing_id)
    assert float(row["quantity"]) == 6.0

    yesterday = (date.today() - timedelta(days=365 * 20)).isoformat()
    old = await client.get("/inventory/stock", headers=stock_headers, params={"as_of": yesterday})
    assert [s for s in old.json() if s["ingredient_id"] == ing_id] == []


async def test_as_of_invalid_date_is_422(client):
    stock_headers, _, _ = await _stock_setup(client)
    resp = await client.get("/inventory/stock", headers=stock_headers, params={"as_of": "not-a-date"})
    assert resp.status_code == 422
