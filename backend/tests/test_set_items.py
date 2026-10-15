from __future__ import annotations

from tests.conftest import register_company


async def _make_dish(client, headers, name: str, price: str = "10000") -> dict:
    resp = await client.post(
        "/inventory/products", headers=headers,
        json={"name": name, "price": price},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _make_set(client, headers, name: str = "Комбо") -> dict:
    resp = await client.post(
        "/inventory/products", headers=headers,
        json={"name": name, "price": "69000", "is_set": True},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_set_replace_lists_lines_with_names_and_count(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    lavash = await _make_dish(client, headers, "Лаваш", price="40000")
    cola = await _make_dish(client, headers, "Кола", price="10000")
    combo = await _make_set(client, headers)

    put = await client.put(
        f"/inventory/products/{combo['id']}/set-items", headers=headers,
        json=[
            {"product_id": lavash["id"], "quantity": 1, "price": 40000},
            {"product_id": cola["id"], "quantity": 2, "price": 10000},
        ],
    )
    assert put.status_code == 200, put.text
    lines = {line["product_id"]: line for line in put.json()}
    assert len(lines) == 2
    assert lines[lavash["id"]]["product_name"] == "Лаваш"
    assert float(lines[lavash["id"]]["quantity"]) == 1.0
    assert float(lines[cola["id"]]["price"]) == 10000.0

    got = await client.get(f"/inventory/products/{combo['id']}/set-items", headers=headers)
    assert got.status_code == 200
    assert len(got.json()) == 2

    listed = await client.get("/inventory/products", headers=headers, params={"include_all": True})
    found = next(p for p in listed.json() if p["id"] == combo["id"])
    assert found["set_items_count"] == 2
    plain = next(p for p in listed.json() if p["id"] == lavash["id"])
    assert plain["set_items_count"] == 0


async def test_set_replace_is_full_replace_and_clearable(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    lavash = await _make_dish(client, headers, "Лаваш")
    cola = await _make_dish(client, headers, "Кола")
    combo = await _make_set(client, headers)

    await client.put(
        f"/inventory/products/{combo['id']}/set-items", headers=headers,
        json=[{"product_id": lavash["id"], "quantity": 1, "price": 1000}],
    )
    replaced = await client.put(
        f"/inventory/products/{combo['id']}/set-items", headers=headers,
        json=[{"product_id": cola["id"], "quantity": 3, "price": 2000}],
    )
    assert [line["product_id"] for line in replaced.json()] == [cola["id"]]

    cleared = await client.put(
        f"/inventory/products/{combo['id']}/set-items", headers=headers, json=[],
    )
    assert cleared.status_code == 200
    assert cleared.json() == []


async def test_set_items_reject_unknown_and_foreign_dishes(client):
    a_headers, _ = await register_company(client, slug="alpha", email="owner@alpha.example.com")
    b_headers, _ = await register_company(client, slug="beta", email="owner@beta.example.com")
    dish = await _make_dish(client, a_headers, "Лаваш")
    combo = await _make_set(client, a_headers)

    missing = await client.put(
        f"/inventory/products/{combo['id']}/set-items", headers=a_headers,
        json=[{"product_id": "00000000-0000-0000-0000-000000000000", "quantity": 1, "price": 0}],
    )
    assert missing.status_code == 404

    foreign = await client.put(
        f"/inventory/products/{combo['id']}/set-items", headers=a_headers,
        json=[{"product_id": dish["id"], "quantity": 1, "price": 0}],
    )
    assert foreign.status_code == 200  # own dish is fine

    cross = await client.get(f"/inventory/products/{combo['id']}/set-items", headers=b_headers)
    assert cross.status_code == 404

    cross_put = await client.put(
        f"/inventory/products/{combo['id']}/set-items", headers=b_headers,
        json=[{"product_id": dish["id"], "quantity": 1, "price": 0}],
    )
    assert cross_put.status_code == 404


async def test_allow_in_sets_defaults_false_and_toggles(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    dish = await _make_dish(client, headers, "Лаваш")

    created = await client.get(f"/inventory/products/{dish['id']}", headers=headers)
    assert created.json()["allow_in_sets"] is False

    toggled = await client.patch(
        f"/inventory/products/{dish['id']}", headers=headers, json={"allow_in_sets": True}
    )
    assert toggled.status_code == 200
    assert toggled.json()["allow_in_sets"] is True

    listed = await client.get("/inventory/products", headers=headers, params={"include_all": True})
    found = next(p for p in listed.json() if p["id"] == dish["id"])
    assert found["allow_in_sets"] is True


async def test_set_cannot_contain_itself_and_rejects_zero_quantity(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    combo = await _make_set(client, headers)

    loop = await client.put(
        f"/inventory/products/{combo['id']}/set-items", headers=headers,
        json=[{"product_id": combo["id"], "quantity": 1, "price": 0}],
    )
    assert loop.status_code == 409

    zero = await client.put(
        f"/inventory/products/{combo['id']}/set-items", headers=headers,
        json=[{"product_id": combo["id"], "quantity": 0, "price": 0}],
    )
    assert zero.status_code == 422
