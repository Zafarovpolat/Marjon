from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.auth.models import User
from app.modules.auth.security import hash_password
from tests.conftest import create_staff_headers, register_company


async def _company_id(client, headers) -> UUID:
    return UUID((await client.get("/auth/me", headers=headers)).json()["company_id"])


async def _hq_headers(client, db_engine):
    email = f"hq-{uuid4().hex[:8]}@marjon.local"
    password = "RootPass1!"
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        db.add(User(
            email=email,
            password_hash=hash_password(password),
            is_superadmin=True,
            is_active=True,
        ))
        await db.commit()
    login = await client.post(
        "/auth/admin/login", json={"email": email, "password": password}
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_units_global_company_scope_and_mutation_matrix(client, db_engine):
    owner_a, _ = await register_company(
        client, slug="units-a", email="owner-a@units.example.com"
    )
    owner_b, _ = await register_company(
        client, slug="units-b", email="owner-b@units.example.com"
    )
    company_a = await _company_id(client, owner_a)
    company_b = await _company_id(client, owner_b)
    hq = await _hq_headers(client, db_engine)

    global_created = await client.post(
        "/units", headers=hq,
        json={"name": "System kilogram", "short_name": "kg", "sort": 1},
    )
    assert global_created.status_code == 201, global_created.text
    global_unit = global_created.json()
    assert global_unit["company_id"] is None
    assert global_unit["is_global"] is True

    spoofed = await client.post(
        "/units", headers=owner_a,
        json={"name": "Spoof", "company_id": str(company_b)},
    )
    assert spoofed.status_code == 422

    own_created = await client.post(
        "/units", headers=owner_a,
        json={"name": "Owner litre", "short_name": "l", "status": True},
    )
    assert own_created.status_code == 201, own_created.text
    own_unit = own_created.json()
    assert UUID(own_unit["company_id"]) == company_a
    assert own_unit["is_global"] is False

    foreign_created = await client.post(
        "/units", headers=owner_b,
        json={"name": "Company B piece", "short_name": "pc"},
    )
    assert foreign_created.status_code == 201, foreign_created.text
    foreign_unit = foreign_created.json()
    assert UUID(foreign_unit["company_id"]) == company_b

    listing = await client.get("/units", headers=owner_a)
    assert listing.status_code == 200
    visible_ids = {item["id"] for item in listing.json()["items"]}
    assert global_unit["id"] in visible_ids
    assert own_unit["id"] in visible_ids
    assert foreign_unit["id"] not in visible_ids
    assert (await client.get(f"/units/{foreign_unit['id']}", headers=owner_a)).status_code == 404

    staff = await create_staff_headers(
        client, owner_a, email="cashier@units.example.com", role_slug="cashier"
    )
    staff_listing = await client.get("/units", headers=staff)
    staff_ids = {item["id"] for item in staff_listing.json()["items"]}
    assert global_unit["id"] in staff_ids
    assert own_unit["id"] in staff_ids
    assert foreign_unit["id"] not in staff_ids
    assert (await client.post(
        "/units", headers=staff, json={"name": "Forbidden staff unit"}
    )).status_code == 403

    updated = await client.patch(
        f"/units/{own_unit['id']}", headers=owner_a,
        json={"name": "Owner litre edited", "status": False, "sort": 9},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Owner litre edited"
    assert updated.json()["status"] is False
    assert updated.json()["sort"] == 9
    assert (await client.patch(
        f"/units/{global_unit['id']}", headers=owner_a, json={"sort": 3}
    )).status_code == 404
    assert (await client.patch(
        f"/units/{foreign_unit['id']}", headers=owner_a, json={"sort": 3}
    )).status_code == 404

    assert (await client.delete(
        f"/units/{global_unit['id']}", headers=owner_a
    )).status_code == 404
    assert (await client.delete(
        f"/units/{foreign_unit['id']}", headers=owner_a
    )).status_code == 404
    assert (await client.delete(
        f"/units/{own_unit['id']}", headers=owner_a
    )).status_code == 204
    assert (await client.get(
        f"/units/{own_unit['id']}", headers=owner_a
    )).status_code == 404

    hq_updated = await client.patch(
        f"/units/{global_unit['id']}", headers=hq, json={"status": False}
    )
    assert hq_updated.status_code == 200
    assert hq_updated.json()["company_id"] is None
    assert hq_updated.json()["status"] is False
    assert (await client.patch(
        f"/units/{foreign_unit['id']}", headers=hq, json={"sort": 5}
    )).status_code == 404
    assert (await client.delete(
        f"/units/{global_unit['id']}", headers=hq
    )).status_code == 204


async def test_product_unit_must_be_global_or_owned_by_product_company(client, db_engine):
    owner_a, _ = await register_company(
        client, slug="products-a", email="owner-a@products.example.com"
    )
    owner_b, _ = await register_company(
        client, slug="products-b", email="owner-b@products.example.com"
    )
    hq = await _hq_headers(client, db_engine)

    global_unit = (await client.post(
        "/units", headers=hq, json={"name": "Global serving"}
    )).json()
    own_unit = (await client.post(
        "/units", headers=owner_a, json={"name": "A serving"}
    )).json()
    foreign_unit = (await client.post(
        "/units", headers=owner_b, json={"name": "B serving"}
    )).json()

    global_product = await client.post(
        "/inventory/products", headers=owner_a,
        json={"name": "Global unit dish", "price": 100, "unit_id": global_unit["id"]},
    )
    assert global_product.status_code == 201, global_product.text
    assert global_product.json()["unit_id"] == global_unit["id"]

    own_product = await client.post(
        "/inventory/products", headers=owner_a,
        json={"name": "Own unit dish", "price": 100, "unit_id": own_unit["id"]},
    )
    assert own_product.status_code == 201, own_product.text
    assert own_product.json()["unit_id"] == own_unit["id"]

    foreign_product = await client.post(
        "/inventory/products", headers=owner_a,
        json={"name": "Foreign unit dish", "price": 100, "unit_id": foreign_unit["id"]},
    )
    assert foreign_product.status_code == 404

    cross_update = await client.patch(
        f"/inventory/products/{own_product.json()['id']}", headers=owner_a,
        json={"unit_id": foreign_unit["id"]},
    )
    assert cross_update.status_code == 404
