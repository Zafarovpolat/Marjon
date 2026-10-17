"""V46 FIFO: старые партии списываются первыми.

Сценарий из задачи: приход 50кг x 110 000, расход 20кг, приход 15кг x 120 000.
Пока первая партия не кончилась — расход идёт по 110 000.
"""
from __future__ import annotations

from tests.conftest import create_staff_headers, register_company


async def _setup(client):
    headers, _ = await register_company(client, slug="fifo", email="fifo@example.com")
    stock_headers = await create_staff_headers(
        client, headers, email="warehouse@fifo.example.com", role_slug="warehouse"
    )
    wh = (await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})).json()
    ing = (await client.post(
        "/inventory/ingredients", headers=headers, json={"name": "Мясо", "unit": "кг"}
    )).json()
    return stock_headers, wh["id"], ing["id"]


async def _purchase(client, stock_headers, wh_id, ing_id, qty, price):
    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh_id,
            "items": [{"name": "Мясо", "ingredient_id": ing_id, "quantity": qty, "unit": "кг", "cost_price": price}],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _expense_accepted(client, stock_headers, wh_id, ing_id, qty, price=0):
    doc = await client.post(
        "/warehouse/expenses", headers=stock_headers,
        json={
            "receiver": "Кухня", "warehouse_id": wh_id,
            "items": [{"name": "Мясо", "ingredient_id": ing_id, "quantity": qty, "unit": "кг", "cost_price": price}],
        },
    )
    assert doc.status_code == 201, doc.text
    accepted = await client.patch(
        f"/warehouse/expenses/{doc.json()['id']}", headers=stock_headers, json={"status": "accepted"}
    )
    assert accepted.status_code == 200, accepted.text
    return accepted.json()


async def _stock_row(client, stock_headers, ing_id):
    after = await client.get("/inventory/stock", headers=stock_headers)
    assert after.status_code == 200, after.text
    return next(s for s in after.json() if s["ingredient_id"] == ing_id)


async def test_fifo_old_batch_first(client):
    stock_headers, wh_id, ing_id = await _setup(client)
    await _purchase(client, stock_headers, wh_id, ing_id, 50, 110000)
    # Расход 20 — по первой партии 110 000.
    exp1 = await _expense_accepted(client, stock_headers, wh_id, ing_id, 20)
    assert float(exp1["total_amount"]) == 20 * 110000

    await _purchase(client, stock_headers, wh_id, ing_id, 15, 120000)

    row = await _stock_row(client, stock_headers, ing_id)
    assert float(row["quantity"]) == 45.0
    # Оценка запаса = средняя оставшихся: (30*110000 + 15*120000)/45.
    assert abs(float(row["cost_price"]) - 113333.3333) < 1.0

    # Разбивка по партиям: 30 x 110 000 + 15 x 120 000.
    batches = await client.get(
        "/inventory/stock/batches", headers=stock_headers, params={"warehouse_id": wh_id, "ingredient_id": ing_id}
    )
    assert batches.status_code == 200, batches.text
    rems = sorted(float(b["quantity_remaining"]) for b in batches.json())
    assert rems == [15.0, 30.0]
    prices = sorted(float(b["cost_price"]) for b in batches.json())
    assert prices == [110000.0, 120000.0]

    # Следующий расход 10 — всё ещё по 110 000 (первая партия не кончилась).
    exp2 = await _expense_accepted(client, stock_headers, wh_id, ing_id, 10)
    assert float(exp2["total_amount"]) == 10 * 110000

    # Расход 30 — 20 по 110 000 (хвост первой) + 10 по 120 000.
    exp3 = await _expense_accepted(client, stock_headers, wh_id, ing_id, 30)
    assert float(exp3["total_amount"]) == 20 * 110000 + 10 * 120000

    row = await _stock_row(client, stock_headers, ing_id)
    assert float(row["quantity"]) == 5.0
    assert float(row["cost_price"]) == 120000.0


async def test_fifo_ignores_manual_price(client):
    """Ручную цену черновика при проведении перезаписываем по FIFO."""
    stock_headers, wh_id, ing_id = await _setup(client)
    await _purchase(client, stock_headers, wh_id, ing_id, 50, 110000)
    exp = await _expense_accepted(client, stock_headers, wh_id, ing_id, 5, price=999999)
    assert float(exp["total_amount"]) == 5 * 110000
    detail = await client.get(f"/warehouse/expenses/{exp['id']}", headers=stock_headers)
    assert float(detail.json()["items"][0]["cost_price"]) == 110000.0


async def test_fifo_waste_uses_old_batch(client):
    stock_headers, wh_id, ing_id = await _setup(client)
    await _purchase(client, stock_headers, wh_id, ing_id, 50, 110000)
    await _purchase(client, stock_headers, wh_id, ing_id, 15, 120000)
    doc = await client.post(
        "/warehouse/wastes", headers=stock_headers,
        json={
            "warehouse_id": wh_id, "ingredient_id": ing_id,
            "name": "Мясо", "quantity": 10, "unit": "кг", "cost_price": 1,
        },
    )
    assert doc.status_code == 201, doc.text
    accepted = await client.patch(
        f"/warehouse/wastes/{doc.json()['id']}", headers=stock_headers, json={"status": "accepted"}
    )
    assert accepted.status_code == 200, accepted.text
    assert float(accepted.json()["total_amount"]) == 10 * 110000
