from __future__ import annotations

from uuid import uuid4

from tests.conftest import register_company


async def _create_category(client, headers, name="Супы", slug=None):
    body = {"name": name, "slug": slug or f"cat-{uuid4().hex[:8]}"}
    resp = await client.post("/inventory/categories", headers=headers, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_dish(client, headers, category_id, name="Плов"):
    resp = await client.post(
        "/inventory/products",
        headers=headers,
        json={"name": name, "price": 40000, "category_id": category_id},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_archive_hides_from_default_list_but_visible_with_flag(client):
    headers, _ = await register_company(client, slug="catarch-a", email="owner@catarch-a.example.com")
    created = await _create_category(client, headers)
    cid = created["id"]

    resp = await client.patch(
        f"/inventory/categories/{cid}", headers=headers, json={"is_active": False}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_active"] is False
    # ID, name and slug survive the archive transition.
    assert resp.json()["id"] == cid
    assert resp.json()["name"] == created["name"]

    listed = await client.get("/inventory/categories", headers=headers)
    assert listed.status_code == 200
    assert cid not in [c["id"] for c in listed.json()]

    listed_all = await client.get(
        "/inventory/categories", headers=headers, params={"include_inactive": True}
    )
    assert listed_all.status_code == 200
    row = next(c for c in listed_all.json() if c["id"] == cid)
    assert row["is_active"] is False


async def test_archive_category_with_linked_dish_keeps_dish(client):
    headers, _ = await register_company(client, slug="catarch-b", email="owner@catarch-b.example.com")
    created = await _create_category(client, headers)
    dish = await _create_dish(client, headers, created["id"])

    resp = await client.patch(
        f"/inventory/categories/{created['id']}", headers=headers, json={"is_active": False}
    )
    assert resp.status_code == 200, resp.text

    # The dish is untouched: same id, same category link, still listed.
    product = await client.get(f"/inventory/products/{dish['id']}", headers=headers)
    assert product.status_code == 200, product.text
    assert product.json()["id"] == dish["id"]
    assert product.json()["category_id"] == created["id"]
    assert product.json()["name"] == dish["name"]
    assert product.json()["price"] == dish["price"]


async def test_restore_returns_category_to_active_list(client):
    headers, _ = await register_company(client, slug="catarch-c", email="owner@catarch-c.example.com")
    created = await _create_category(client, headers, name="Архивная")
    cid = created["id"]

    await client.patch(f"/inventory/categories/{cid}", headers=headers, json={"is_active": False})
    resp = await client.patch(
        f"/inventory/categories/{cid}", headers=headers, json={"is_active": True}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_active"] is True
    assert resp.json()["id"] == cid
    assert resp.json()["name"] == "Архивная"

    listed = await client.get("/inventory/categories", headers=headers)
    assert cid in [c["id"] for c in listed.json()]


async def test_repeated_archive_restore_is_idempotent(client):
    headers, _ = await register_company(client, slug="catarch-d", email="owner@catarch-d.example.com")
    created = await _create_category(client, headers)
    cid = created["id"]

    for _ in range(2):
        resp = await client.patch(
            f"/inventory/categories/{cid}", headers=headers, json={"is_active": False}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_active"] is False
    for _ in range(2):
        resp = await client.patch(
            f"/inventory/categories/{cid}", headers=headers, json={"is_active": True}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_active"] is True


async def test_delete_free_archived_category_succeeds(client):
    headers, _ = await register_company(client, slug="catarch-e", email="owner@catarch-e.example.com")
    created = await _create_category(client, headers)
    cid = created["id"]

    await client.patch(f"/inventory/categories/{cid}", headers=headers, json={"is_active": False})
    resp = await client.delete(f"/inventory/categories/{cid}", headers=headers)
    assert resp.status_code == 204, resp.text

    listed_all = await client.get(
        "/inventory/categories", headers=headers, params={"include_inactive": True}
    )
    assert cid not in [c["id"] for c in listed_all.json()]


async def test_delete_referenced_archived_category_stays_conflict(client):
    headers, _ = await register_company(client, slug="catarch-f", email="owner@catarch-f.example.com")
    created = await _create_category(client, headers)
    await _create_dish(client, headers, created["id"])

    await client.patch(
        f"/inventory/categories/{created['id']}", headers=headers, json={"is_active": False}
    )
    resp = await client.delete(f"/inventory/categories/{created['id']}", headers=headers)
    assert resp.status_code == 409, resp.text

    # The archived category survives the refused delete.
    listed_all = await client.get(
        "/inventory/categories", headers=headers, params={"include_inactive": True}
    )
    assert created["id"] in [c["id"] for c in listed_all.json()]


async def test_archive_tenant_isolation(client):
    headers_a, _ = await register_company(client, slug="catarch-g", email="owner@catarch-g.example.com")
    headers_b, _ = await register_company(client, slug="catarch-h", email="owner@catarch-h.example.com")
    created = await _create_category(client, headers_a)

    for method, kwargs in [
        ("patch", {"json": {"is_active": False}}),
        ("patch", {"json": {"is_active": True}}),
        ("delete", {}),
    ]:
        func = getattr(client, method)
        resp = await func(f"/inventory/categories/{created['id']}", headers=headers_b, **kwargs)
        assert resp.status_code == 404, resp.text

    listed = await client.get("/inventory/categories", headers=headers_a)
    assert created["id"] in [c["id"] for c in listed.json()]
