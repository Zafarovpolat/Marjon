from __future__ import annotations

from tests.conftest import create_staff_headers, register_company


async def _setup(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await create_staff_headers(
        client, headers, email="warehouse@acme.example.com", role_slug="warehouse",
    )
    wh = await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})
    assert wh.status_code == 201
    meat = await client.post(
        "/inventory/ingredients", headers=headers, json={"name": "Meat", "unit": "кг"},
    )
    assert meat.status_code == 201
    # Уч history: 100 кг по 1000 (accepted сразу).
    doc = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh.json()["id"],
            "items": [{"name": "Meat", "ingredient_id": meat.json()["id"], "quantity": 100, "unit": "кг", "cost_price": 1000}],
        },
    )
    assert doc.status_code == 201
    return headers, stock_headers, wh.json(), meat.json()


async def test_shortage_creates_expense_and_moves_stock(client):
    """100 кг → факт 95: недостача 5 падает в расход, остаток 95."""
    _, stock_headers, wh, meat = await _setup(client)
    resp = await client.post(
        "/warehouse/inventory-checks", headers=stock_headers,
        json={
            "warehouse_id": wh["id"], "comment": " recount ",
            "items": [{"ingredient_id": meat["id"], "actual_qty": 95}],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "accepted"
    assert len(body["items"]) == 1
    line = body["items"][0]
    assert float(line["stock_qty"]) == 100.0
    assert float(line["actual_qty"]) == 95.0
    assert float(line["diff_qty"]) == -5.0
    assert body["expense_doc_id"] is not None
    assert body["purchase_doc_id"] is None

    stock = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in stock.json() if s["ingredient_id"] == meat["id"])
    assert float(row["quantity"]) == 95.0

    expenses = await client.get("/warehouse/expenses", headers=stock_headers)
    docs = [d for d in expenses.json() if d["id"] == body["expense_doc_id"]]
    assert len(docs) == 1
    assert docs[0]["receiver"] == "Инвентаризация"
    assert docs[0]["status"] == "accepted"


async def test_surplus_creates_purchase_and_moves_stock(client):
    """100 кг → факт 105: излишек 5 падает в приход, остаток 105."""
    _, stock_headers, wh, meat = await _setup(client)
    resp = await client.post(
        "/warehouse/inventory-checks", headers=stock_headers,
        json={
            "warehouse_id": wh["id"],
            "items": [{"ingredient_id": meat["id"], "actual_qty": 105}],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "accepted"
    assert float(body["items"][0]["diff_qty"]) == 5.0
    assert body["purchase_doc_id"] is not None
    assert body["expense_doc_id"] is None

    stock = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in stock.json() if s["ingredient_id"] == meat["id"])
    assert float(row["quantity"]) == 105.0

    purchases = await client.get("/warehouse/purchases", headers=stock_headers)
    docs = [d for d in purchases.json() if d["id"] == body["purchase_doc_id"]]
    assert len(docs) == 1
    assert docs[0]["supplier"] == "Инвентаризация"


async def test_exact_count_creates_no_docs(client):
    """Факт = остатку: проверка проведена (accepted), документов нет."""
    _, stock_headers, wh, meat = await _setup(client)
    resp = await client.post(
        "/warehouse/inventory-checks", headers=stock_headers,
        json={
            "warehouse_id": wh["id"],
            "items": [{"ingredient_id": meat["id"], "actual_qty": 100}],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "accepted"
    assert float(body["items"][0]["diff_qty"]) == 0.0
    assert body["purchase_doc_id"] is None
    assert body["expense_doc_id"] is None

    stock = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in stock.json() if s["ingredient_id"] == meat["id"])
    assert float(row["quantity"]) == 100.0


async def test_apply_to_stock_false_keeps_stock(client):
    """apply_to_stock=False: расхождение записано, остатки не двигаются."""
    _, stock_headers, wh, meat = await _setup(client)
    resp = await client.post(
        "/warehouse/inventory-checks", headers=stock_headers,
        json={
            "warehouse_id": wh["id"], "apply_to_stock": False,
            "items": [{"ingredient_id": meat["id"], "actual_qty": 90}],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft"
    assert float(body["items"][0]["diff_qty"]) == -10.0
    assert body["expense_doc_id"] is None

    stock = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in stock.json() if s["ingredient_id"] == meat["id"])
    assert float(row["quantity"]) == 100.0
