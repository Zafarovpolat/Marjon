from __future__ import annotations

from tests.conftest import create_staff_headers, register_company


async def _warehouse_headers(client, owner_headers):
    return await create_staff_headers(
        client,
        owner_headers,
        email="warehouse@acme.example.com",
        role_slug="warehouse",
    )


async def test_created_purchase_is_immediately_accepted(client):
    """Черновиков нет: «Сохранить» = сразу «Принято», остатки двигаются
    в момент создания (атомарно, без отдельного проведения)."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh = await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})
    ing = await client.post("/inventory/ingredients", headers=headers, json={"name": "Flour", "unit": "кг"})
    ing = ing.json()

    doc = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "supplier": "FlourCo", "warehouse_id": wh.json()["id"],
            "items": [{"name": "Flour", "ingredient_id": ing["id"], "quantity": 50, "unit": "кг", "cost_price": 4000}],
        },
    )
    assert doc.status_code == 201
    assert doc.json()["status"] == "accepted"
    assert doc.json()["accepted_at"] is not None

    after = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in after.json() if s["ingredient_id"] == ing["id"])
    assert float(row["quantity"]) == 50.0


async def test_accepting_purchase_twice_is_idempotent(client):
    """Legacy-PATCH accept поверх уже проведённого создания — no-op."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh = await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})
    ing = await client.post("/inventory/ingredients", headers=headers, json={"name": "Sugar", "unit": "кг"})
    ing = ing.json()

    doc = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh.json()["id"],
            "items": [{"name": "Sugar", "ingredient_id": ing["id"], "quantity": 10, "unit": "кг", "cost_price": 8000}],
        },
    )
    doc_id = doc.json()["id"]

    await client.patch(f"/warehouse/purchases/{doc_id}", headers=stock_headers, json={"status": "accepted"})
    await client.patch(f"/warehouse/purchases/{doc_id}", headers=stock_headers, json={"status": "accepted"})

    stock = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in stock.json() if s["ingredient_id"] == ing["id"])
    assert float(row["quantity"]) == 10.0  # not 20 or 30 — accepts were no-ops


async def test_created_purchase_moves_stock_without_patch(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh = await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})
    ing = await client.post("/inventory/ingredients", headers=headers, json={"name": "Salt", "unit": "кг"})
    ing = ing.json()

    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh.json()["id"],
            "items": [{"name": "Salt", "ingredient_id": ing["id"], "quantity": 5, "unit": "кг", "cost_price": 3000}],
        },
    )
    assert resp.status_code == 201

    stock = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in stock.json() if s["ingredient_id"] == ing["id"])
    assert float(row["quantity"]) == 5.0


async def test_purchase_total_is_server_computed(client):
    """The frontend sends a redundant `total` field; the server computes
    its own authoritative total_amount from items and ignores it."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh = await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})
    ing = await client.post("/inventory/ingredients", headers=headers, json={"name": "Item", "unit": "кг"})
    ing = ing.json()

    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh.json()["id"], "total": 999999,
            "items": [{"name": "Item", "ingredient_id": ing["id"], "quantity": 2, "unit": "кг", "cost_price": 1000}],
        },
    )
    assert resp.status_code == 201
    assert float(resp.json()["total_amount"]) == 2000.0


async def _purchase_setup(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh = await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})
    ing = await client.post("/inventory/ingredients", headers=headers, json={"name": "Flour", "unit": "кг"})
    return stock_headers, wh.json()["id"], ing.json()["id"]


async def test_purchase_requires_template_link(client):
    """Приход без ingredient_id (не из шаблона «Продуктов») отклоняется 422."""
    stock_headers, wh_id, _ = await _purchase_setup(client)
    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh_id,
            "items": [{"name": "Free item", "quantity": 2, "unit": "кг", "cost_price": 1000}],
        },
    )
    assert resp.status_code == 422, resp.text


async def test_purchase_requires_quantity_and_price(client):
    """Шаблон нельзя оприходовать без количества/цены: 422 в обоих случаях."""
    stock_headers, wh_id, ing_id = await _purchase_setup(client)
    no_qty = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh_id,
            "items": [{"name": "Flour", "ingredient_id": ing_id, "quantity": 0, "unit": "кг", "cost_price": 1000}],
        },
    )
    assert no_qty.status_code == 422, no_qty.text
    no_price = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh_id,
            "items": [{"name": "Flour", "ingredient_id": ing_id, "quantity": 5, "unit": "кг", "cost_price": 0}],
        },
    )
    assert no_price.status_code == 422, no_price.text


async def test_purchase_requires_items(client):
    """Пустой приход (без позиций) отклоняется 422."""
    stock_headers, wh_id, _ = await _purchase_setup(client)
    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={"warehouse_id": wh_id, "items": []},
    )
    assert resp.status_code == 422, resp.text


async def test_purchase_takes_name_and_unit_from_template(client):
    """Названия/ед.изм берутся из шаблона: клиентский снапшот перезаписывается."""
    stock_headers, wh_id, ing_id = await _purchase_setup(client)
    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh_id,
            "items": [{"name": "Stale name", "ingredient_id": ing_id, "quantity": 5, "unit": "шт", "cost_price": 1000}],
        },
    )
    assert resp.status_code == 201, resp.text
    doc_id = resp.json()["id"]
    detail = await client.get(f"/warehouse/purchases/{doc_id}", headers=stock_headers)
    assert detail.status_code == 200
    line = detail.json()["items"][0]
    assert line["name"] == "Flour"
    assert line["unit"] == "кг"


async def _sale_product(client, headers, name="Cola"):
    resp = await client.post(
        "/inventory/products", headers=headers,
        json={"name": name, "price": 12000, "product_type": "sale"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_purchase_with_sale_product_provisions_template(client):
    """Товар без шаблона: backend создаёт Ingredient и линкует обе стороны."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh = await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})
    cola = await _sale_product(client, headers)

    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh.json()["id"],
            "items": [{"name": "Cola", "product_id": cola["id"], "quantity": 10, "unit": "шт", "cost_price": 8000}],
        },
    )
    assert resp.status_code == 201, resp.text
    detail = await client.get(f"/warehouse/purchases/{resp.json()['id']}", headers=stock_headers)
    line = detail.json()["items"][0]
    assert line["product_id"] == cola["id"]
    assert line["ingredient_id"] is not None
    assert line["name"] == "Cola"
    assert line["unit"] == "шт"

    ingredients = await client.get("/inventory/ingredients", headers=headers)
    template = next(i for i in ingredients.json() if i["id"] == line["ingredient_id"])
    assert template["name"] == "Cola"


async def test_purchase_with_sale_product_reuses_template_and_moves_stock(client):
    """Повторный приход Товара — тот же шаблон, проведение двигает остаток."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh = await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})
    cola = await _sale_product(client, headers)

    first_ids = []
    for _ in range(2):
        resp = await client.post(
            "/warehouse/purchases", headers=stock_headers,
            json={
                "warehouse_id": wh.json()["id"],
                "items": [{"name": "Cola", "product_id": cola["id"], "quantity": 5, "unit": "шт", "cost_price": 8000}],
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "accepted"
        detail = await client.get(f"/warehouse/purchases/{resp.json()['id']}", headers=stock_headers)
        first_ids.append(detail.json()["items"][0]["ingredient_id"])
    assert first_ids[0] == first_ids[1]

    ingredients = await client.get("/inventory/ingredients", headers=headers)
    assert sum(1 for i in ingredients.json() if i["name"] == "Cola") == 1

    stock = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in stock.json() if s["ingredient_id"] == first_ids[0])
    assert float(row["quantity"]) == 10.0


async def test_purchase_with_dish_product_rejected(client):
    """Оприходовать можно только Товары: блюдо (рецепт) отклоняется 422."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    stock_headers = await _warehouse_headers(client, headers)
    wh = await client.post("/warehouse/list", headers=stock_headers, json={"name": "Main"})
    dish = await client.post(
        "/inventory/products", headers=headers, json={"name": "Soup", "price": 30000}
    )
    assert dish.status_code == 201

    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh.json()["id"],
            "items": [{"name": "Soup", "product_id": dish.json()["id"], "quantity": 2, "unit": "шт", "cost_price": 5000}],
        },
    )
    assert resp.status_code == 422, resp.text


async def test_purchase_with_unknown_product_rejected(client):
    """Чужой/неизвестный product_id — 404, без утечки между компаниями."""
    from uuid import uuid4

    stock_headers, wh_id, _ = await _purchase_setup(client)
    resp = await client.post(
        "/warehouse/purchases", headers=stock_headers,
        json={
            "warehouse_id": wh_id,
            "items": [{"name": "Ghost", "product_id": str(uuid4()), "quantity": 1, "unit": "шт", "cost_price": 100}],
        },
    )
    assert resp.status_code == 404, resp.text


async def test_accept_recomputes_weighted_cost(client):
    """Себестоимость остатка — взвешенное среднее поставок из движений."""
    stock_headers, wh_id, ing_id = await _purchase_setup(client)
    for qty, price in ((10, 1000), (10, 3000)):
        doc = await client.post(
            "/warehouse/purchases", headers=stock_headers,
            json={
                "warehouse_id": wh_id,
                "items": [{"name": "Flour", "ingredient_id": ing_id, "quantity": qty, "unit": "кг", "cost_price": price}],
            },
        )
        assert doc.status_code == 201, doc.text
        assert doc.json()["status"] == "accepted"
    stock = await client.get("/inventory/stock", headers=stock_headers)
    row = next(s for s in stock.json() if s["ingredient_id"] == ing_id)
    assert float(row["quantity"]) == 20.0
    # (10×1000 + 10×3000) / 20 = 2000.
    assert float(row["cost_price"]) == 2000.0
