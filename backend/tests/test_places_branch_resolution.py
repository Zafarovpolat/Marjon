from __future__ import annotations

from uuid import uuid4

from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.companies.models import Branch
from tests.conftest import register_company


async def _branches(client, headers):
    resp = await client.get("/companies/me/branches", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _deactivate_all_branches(db_engine):
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        await session.execute(update(Branch).values(is_active=False))
        await session.commit()


# ── Registration onboarding ───────────────────────────────────────────────

async def test_registration_creates_single_default_branch(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branches = await _branches(client, headers)
    assert len(branches) == 1
    assert branches[0]["name"] == "Основной филиал"
    assert branches[0]["is_active"] is True


async def test_registration_default_branch_belongs_to_company(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    me = await client.get("/companies/me", headers=headers)
    company_id = me.json()["id"]
    branches = await _branches(client, headers)
    assert branches[0]["company_id"] == company_id


# ── Hall create branch resolution ─────────────────────────────────────────

async def test_hall_create_one_branch_auto_uses_it(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id = (await _branches(client, headers))[0]["id"]
    resp = await client.post("/halls", headers=headers, json={"name": "Зал"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["branch_id"] == branch_id


async def test_hall_create_multi_branch_requires_explicit(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    second = await client.post("/companies/me/branches", headers=headers, json={"name": "Второй филиал"})
    assert second.status_code == 201
    resp = await client.post("/halls", headers=headers, json={"name": "Зал"})
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "Укажите филиал"


async def test_hall_create_explicit_valid_branch(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    second = await client.post("/companies/me/branches", headers=headers, json={"name": "Второй филиал"})
    branch_id = second.json()["id"]
    resp = await client.post("/halls", headers=headers, json={"name": "VIP", "branch_id": branch_id})
    assert resp.status_code == 201, resp.text
    assert resp.json()["branch_id"] == branch_id


async def test_hall_create_foreign_branch_rejected(client):
    a_headers, _ = await register_company(client, slug="alpha", email="owner@alpha.example.com")
    b_headers, _ = await register_company(client, slug="beta", email="owner@beta.example.com")
    foreign_branch = (await _branches(client, b_headers))[0]["id"]
    resp = await client.post("/halls", headers=a_headers, json={"name": "Зал", "branch_id": foreign_branch})
    assert resp.status_code == 404, resp.text


async def test_hall_create_nonexistent_branch_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await client.post("/halls", headers=headers, json={"name": "Зал", "branch_id": str(uuid4())})
    assert resp.status_code == 404, resp.text


async def test_hall_create_explicit_inactive_branch_rejected(client, db_engine):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id = (await _branches(client, headers))[0]["id"]
    await _deactivate_all_branches(db_engine)
    resp = await client.post("/halls", headers=headers, json={"name": "Зал", "branch_id": branch_id})
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "Филиал неактивен"


async def test_hall_create_zero_active_branches_config_error(client, db_engine):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    await _deactivate_all_branches(db_engine)
    resp = await client.post("/halls", headers=headers, json={"name": "Зал"})
    assert resp.status_code == 409, resp.text
    assert "филиал" in resp.json()["detail"].lower()
