from __future__ import annotations

from tests.conftest import create_staff_headers, register_company


async def _warehouse_headers(client, owner_headers):
    return await create_staff_headers(
        client,
        owner_headers,
        email="warehouse@acme.example.com",
        role_slug="warehouse",
    )


async def _seed_stock(client, owner_headers, stock_headers, *, name, qty, cost):
    """Приход + проведение → на складе появляется `qty` товара. Возвращает
    (warehouse_id, ingredient)."""
    wh = (await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})).json()
    ing = (await client.post(
        "/inventory/ingredients", headers=owner_headers, json={"name": name, "unit": "кг"}
    )).json()
    doc = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh["id"],
            "items": [{"name": name, "ingredient_id": ing["id"], "quantity": qty, "unit": "кг", "cost_price": cost}],
        },
    )
    await client.patch(f"/warehouse/purchases/{doc.json()['id']}", headers=stock_headers, json={"status": "accepted"})
    return wh["id"], ing


async def test_accepting_expense_decreases_stock(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh_id, ing = await _seed_stock(client, headers, stock_headers, name="Flour", qty=50, cost=4000)

    doc = await client.post(
        "/warehouse/expenses", headers=stock_headers,
        json={
            "receiver": "Кухня", "warehouse_id": wh_id,
            "items": [{"name": "Flour", "ingredient_id": ing["id"], "quantity": 20, "unit": "кг", "cost_price": 4000}],
        },
    )
    assert doc.status_code == 201
    assert doc.json()["status"] == "draft"
    doc_id = doc.json()["id"]

    accepted = await client.patch(f"/warehouse/expenses/{doc_id}", headers=stock_headers, json={"status": "accepted"})
    assert accepted.status_code == 200
    assert accepted.json()["accepted_at"] is not None

    after = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in after.json() if s["ingredient_id"] == ing["id"])
    assert float(row["quantity"]) == 30.0  # 50 − 20


async def test_expense_rejects_insufficient_stock(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh_id, ing = await _seed_stock(client, headers, stock_headers, name="Sugar", qty=5, cost=8000)

    doc = await client.post(
        "/warehouse/expenses", headers=stock_headers,
        json={
            "warehouse_id": wh_id,
            "items": [{"name": "Sugar", "ingredient_id": ing["id"], "quantity": 10, "unit": "кг", "cost_price": 8000}],
        },
    )
    doc_id = doc.json()["id"]

    denied = await client.patch(f"/warehouse/expenses/{doc_id}", headers=stock_headers, json={"status": "accepted"})
    assert denied.status_code == 422

    # Остаток не тронут, документ не проведён.
    after = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in after.json() if s["ingredient_id"] == ing["id"])
    assert float(row["quantity"]) == 5.0
    doc_state = await client.get(f"/warehouse/expenses/{doc_id}", headers=stock_headers)
    assert doc_state.json()["accepted_at"] is None


async def test_accepting_expense_twice_is_idempotent(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh_id, ing = await _seed_stock(client, headers, stock_headers, name="Rice", qty=30, cost=6000)

    doc = await client.post(
        "/warehouse/expenses", headers=stock_headers,
        json={
            "warehouse_id": wh_id,
            "items": [{"name": "Rice", "ingredient_id": ing["id"], "quantity": 10, "unit": "кг", "cost_price": 6000}],
        },
    )
    doc_id = doc.json()["id"]

    await client.patch(f"/warehouse/expenses/{doc_id}", headers=stock_headers, json={"status": "accepted"})
    await client.patch(f"/warehouse/expenses/{doc_id}", headers=stock_headers, json={"status": "accepted"})

    after = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in after.json() if s["ingredient_id"] == ing["id"])
    assert float(row["quantity"]) == 20.0  # 30 − 10, второй accept — no-op


async def test_draft_expense_does_not_affect_stock(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh_id, ing = await _seed_stock(client, headers, stock_headers, name="Oil", qty=12, cost=15000)

    await client.post(
        "/warehouse/expenses", headers=stock_headers,
        json={
            "warehouse_id": wh_id,
            "items": [{"name": "Oil", "ingredient_id": ing["id"], "quantity": 4, "unit": "л", "cost_price": 15000}],
        },
    )
    after = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in after.json() if s["ingredient_id"] == ing["id"])
    assert float(row["quantity"]) == 12.0  # черновик остаток не двигает


async def test_accepting_waste_decreases_stock(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh_id, ing = await _seed_stock(client, headers, stock_headers, name="Milk", qty=20, cost=9000)

    doc = await client.post(
        "/warehouse/wastes", headers=stock_headers,
        json={
            "category": "Порча", "warehouse_id": wh_id, "ingredient_id": ing["id"],
            "name": "Milk", "quantity": 7, "unit": "л", "cost_price": 9000, "reason": "Просрочка",
        },
    )
    assert doc.status_code == 201
    assert doc.json()["status"] == "draft"
    doc_id = doc.json()["id"]

    accepted = await client.patch(f"/warehouse/wastes/{doc_id}", headers=stock_headers, json={"status": "accepted"})
    assert accepted.status_code == 200
    assert accepted.json()["accepted_at"] is not None

    after = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in after.json() if s["ingredient_id"] == ing["id"])
    assert float(row["quantity"]) == 13.0  # 20 − 7


async def test_waste_rejects_insufficient_stock(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh_id, ing = await _seed_stock(client, headers, stock_headers, name="Butter", qty=3, cost=20000)

    doc = await client.post(
        "/warehouse/wastes", headers=stock_headers,
        json={
            "warehouse_id": wh_id, "ingredient_id": ing["id"],
            "name": "Butter", "quantity": 5, "unit": "кг",
        },
    )
    doc_id = doc.json()["id"]

    denied = await client.patch(f"/warehouse/wastes/{doc_id}", headers=stock_headers, json={"status": "accepted"})
    assert denied.status_code == 422

    after = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in after.json() if s["ingredient_id"] == ing["id"])
    assert float(row["quantity"]) == 3.0
