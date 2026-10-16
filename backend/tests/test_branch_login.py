from __future__ import annotations

from tests.conftest import register_company


async def _create_branch(client, headers, *, name="Филиал 1", login="branch001", password="Branch123!"):
    resp = await client.post(
        "/companies/me/branches",
        headers=headers,
        json={"name": name, "login": login, "password": password},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_branch_login_success(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch = await _create_branch(client, headers)

    resp = await client.post("/auth/branch-login", json={"login": "branch001", "password": "Branch123!"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["branch"]["id"] == branch["id"]
    assert body["company"]["id"]

    # Сессия филиала рабочая: с её токеном /auth/me отвечает 200.
    bh = {"Authorization": f"Bearer {body['access_token']}"}
    me = await client.get("/auth/me", headers=bh)
    assert me.status_code == 200, me.text


async def test_branch_login_wrong_password(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    await _create_branch(client, headers)
    resp = await client.post("/auth/branch-login", json={"login": "branch001", "password": "nope"})
    assert resp.status_code == 401


async def test_branch_switch_by_owner(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch = await _create_branch(client, headers)
    resp = await client.post("/auth/branch-switch", headers=headers, json={"branch_id": branch["id"]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["access_token"]
    assert body["branch"]["id"] == branch["id"]


async def test_branch_switch_requires_auth(client):
    resp = await client.post(
        "/auth/branch-switch",
        json={"branch_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert resp.status_code == 401
