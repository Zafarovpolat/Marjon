from __future__ import annotations

from tests.conftest import register_company


async def _category(client, headers, name="Салаты", slug="salads"):
    resp = await client.post("/inventory/categories", headers=headers, json={"name": name, "slug": slug})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_category_update_and_delete(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    cat = await _category(client, headers)

    patched = await client.patch(f"/inventory/categories/{cat['id']}", headers=headers, json={"name": "Закуски"})
    assert patched.status_code == 200, patched.text
    assert patched.json()["name"] == "Закуски"

    deleted = await client.delete(f"/inventory/categories/{cat['id']}", headers=headers)
    assert deleted.status_code == 204
    listing = await client.get("/inventory/categories", headers=headers)
    assert cat["id"] not in {c["id"] for c in listing.json()}


async def test_category_with_products_cannot_be_deleted(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    cat = await _category(client, headers)
    product = await client.post(
        "/inventory/products", headers=headers,
        json={"name": "Ачичук", "price": "15000", "category_id": cat["id"]},
    )
    assert product.status_code == 201, product.text

    resp = await client.delete(f"/inventory/categories/{cat['id']}", headers=headers)
    assert resp.status_code == 409


async def test_category_of_another_company_is_not_reachable(client):
    owner_a, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    owner_b, _ = await register_company(client, slug="other", email="owner@other.example.com")
    cat = await _category(client, owner_a)

    assert (await client.patch(f"/inventory/categories/{cat['id']}", headers=owner_b, json={"name": "x"})).status_code == 404
    assert (await client.delete(f"/inventory/categories/{cat['id']}", headers=owner_b)).status_code == 404
