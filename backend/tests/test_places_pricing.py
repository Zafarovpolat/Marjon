from __future__ import annotations

from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.companies.models import Branch
from tests.conftest import register_company


async def _default_branch_id(client, headers):
    resp = await client.get("/companies/me/branches", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()[0]["id"]


async def _deactivate_all_branches(db_engine):
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        await session.execute(update(Branch).values(is_active=False))
        await session.commit()


async def test_frontend_payload_shape_now_works(client):
    """SettingsPlacesPage.jsx's payload sends {name, condition, percent,
    payment_type} to /halls with no branch_id. Since Phase 5C-1, registration
    seeds one default branch, so the omitted branch_id auto-resolves to it."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id = await _default_branch_id(client, headers)

    resp = await client.post(
        "/halls", headers=headers,
        json={"name": "ЗАЛЛ", "condition": "10%", "percent": 10, "payment_type": "процент"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["pricing_type"] == "percent"
    assert body["branch_id"] == branch_id
    assert body["condition"] == "10%"
    assert float(body["percent"]) == 10.0


async def test_branch_id_auto_resolves_when_omitted(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id = await _default_branch_id(client, headers)

    resp = await client.post("/halls", headers=headers, json={"name": "Bar"})
    assert resp.status_code == 201
    assert resp.json()["branch_id"] == branch_id


async def test_no_branch_gives_clear_error(client, db_engine):
    """Legacy/broken company with zero ACTIVE branches: create without branch_id
    is a deliberate configuration conflict (409), not a silent fallback."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    await _deactivate_all_branches(db_engine)
    resp = await client.post("/halls", headers=headers, json={"name": "Bar"})
    assert resp.status_code == 409, resp.text


async def test_all_pricing_type_labels_translate(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")

    cases = {
        "процент": "percent",
        "цена за час": "hourly",
        "фиксированная цена": "fixed",
        "цена по времени": "time_based",
    }
    for label, expected in cases.items():
        resp = await client.post(
            "/halls", headers=headers, json={"name": f"Place {label}", "payment_type": label}
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["pricing_type"] == expected


async def test_invalid_pricing_type_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    await client.post("/companies/me/branches", headers=headers, json={"name": "Main"})

    resp = await client.post(
        "/halls", headers=headers, json={"name": "x", "pricing_type": "not_real"}
    )
    assert resp.status_code == 422


async def test_percent_out_of_range_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    await client.post("/companies/me/branches", headers=headers, json={"name": "Main"})

    resp = await client.post("/halls", headers=headers, json={"name": "x", "percent": 150})
    assert resp.status_code == 422


async def test_update_pricing_fields(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await client.post("/halls", headers=headers, json={"name": "VIP"})
    hall_id = created.json()["id"]

    resp = await client.patch(
        f"/halls/{hall_id}", headers=headers,
        json={"payment_type": "фиксированная цена", "percent": 5},
    )
    assert resp.status_code == 200
    assert resp.json()["pricing_type"] == "fixed"
    assert float(resp.json()["percent"]) == 5.0


async def test_write_requires_company_admin(client):
    owner_headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    await client.post(
        "/auth/users", headers=owner_headers,
        json={"email": "cashier@acme.example.com", "password": "Passw0rd!", "role_slug": "cashier"},
    )
    login = await client.post(
        "/auth/login", json={"email": "cashier@acme.example.com", "password": "Passw0rd!"}
    )
    cashier_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    denied = await client.post("/halls", headers=cashier_headers, json={"name": "x"})
    assert denied.status_code == 403

    allowed = await client.get("/halls", headers=cashier_headers)
    assert allowed.status_code == 200


async def test_place_scoped_per_company(client):
    a_headers, _ = await register_company(client, slug="alpha", email="owner@alpha.example.com")
    b_headers, _ = await register_company(client, slug="beta", email="owner@beta.example.com")

    created = await client.post("/halls", headers=a_headers, json={"name": "VIP"})
    hall_id = created.json()["id"]

    resp = await client.get(f"/halls/{hall_id}", headers=b_headers)
    assert resp.status_code == 404
