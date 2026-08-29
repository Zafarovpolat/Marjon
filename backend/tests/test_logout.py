from __future__ import annotations

from tests.conftest import register_company


async def test_scoped_logout_revokes_only_that_session(client):
    _, dev_a = await register_company(client, slug="acme", email="owner@acme.example.com")

    login = await client.post(
        "/auth/login", json={"email": "owner@acme.example.com", "password": "Passw0rd!"}
    )
    assert login.status_code == 200
    dev_b = login.json()

    logout = await client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {dev_a['access_token']}"},
        json={"refresh_token": dev_a["refresh_token"]},
    )
    assert logout.status_code == 204

    # Device A's refresh token is dead now...
    dead = await client.post("/auth/refresh", json={"refresh_token": dev_a["refresh_token"]})
    assert dead.status_code == 401

    # ...but device B's session is untouched.
    alive = await client.post("/auth/refresh", json={"refresh_token": dev_b["refresh_token"]})
    assert alive.status_code == 200


async def test_logout_all_revokes_every_session(client):
    _, dev_a = await register_company(client, slug="acme", email="owner@acme.example.com")
    login = await client.post(
        "/auth/login", json={"email": "owner@acme.example.com", "password": "Passw0rd!"}
    )
    dev_b = login.json()

    resp = await client.post(
        "/auth/logout-all", headers={"Authorization": f"Bearer {dev_b['access_token']}"}
    )
    assert resp.status_code == 204

    for dev in (dev_a, dev_b):
        dead = await client.post("/auth/refresh", json={"refresh_token": dev["refresh_token"]})
        assert dead.status_code == 401


async def test_logout_all_revokes_only_authenticated_users_sessions(client):
    _, user_a1 = await register_company(
        client, slug="acme", email="owner@acme.example.com"
    )
    login_a2 = await client.post(
        "/auth/login",
        json={"email": "owner@acme.example.com", "password": "Passw0rd!"},
    )
    assert login_a2.status_code == 200
    user_a2 = login_a2.json()
    _, user_b1 = await register_company(
        client, slug="beta", email="owner@beta.example.com"
    )

    logout_all = await client.post(
        "/auth/logout-all",
        headers={"Authorization": f"Bearer {user_a1['access_token']}"},
    )
    assert logout_all.status_code == 204

    for session in (user_a1, user_a2):
        revoked = await client.post(
            "/auth/refresh", json={"refresh_token": session["refresh_token"]}
        )
        assert revoked.status_code == 401

    user_b_still_active = await client.post(
        "/auth/refresh", json={"refresh_token": user_b1["refresh_token"]}
    )
    assert user_b_still_active.status_code == 200


async def test_logout_without_body_is_rejected_and_revokes_nothing(client):
    _, dev_a = await register_company(client, slug="acme", email="owner@acme.example.com")
    login = await client.post(
        "/auth/login", json={"email": "owner@acme.example.com", "password": "Passw0rd!"}
    )
    dev_b = login.json()

    resp = await client.post(
        "/auth/logout", headers={"Authorization": f"Bearer {dev_a['access_token']}"}
    )
    assert resp.status_code == 422

    for dev in (dev_a, dev_b):
        alive = await client.post("/auth/refresh", json={"refresh_token": dev["refresh_token"]})
        assert alive.status_code == 200


async def test_logout_empty_or_null_refresh_token_is_rejected_and_revokes_nothing(client):
    _, session = await register_company(client, slug="acme", email="owner@acme.example.com")
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    null_body = await client.post(
        "/auth/logout",
        headers={**headers, "Content-Type": "application/json"},
        content=b"null",
    )
    assert null_body.status_code == 422

    for body in (
        {},
        {"refresh_token": None},
        {"refresh_token": ""},
        {"refresh_token": "   "},
        {"refresh_token": "\t"},
        {"refresh_token": "\n"},
        {"refresh_token": " \t "},
    ):
        resp = await client.post("/auth/logout", headers=headers, json=body)
        assert resp.status_code == 422

    alive = await client.post(
        "/auth/refresh", json={"refresh_token": session["refresh_token"]}
    )
    assert alive.status_code == 200


async def test_logout_cannot_revoke_another_users_refresh_token(client):
    _, user_a = await register_company(client, slug="acme", email="owner@acme.example.com")
    _, user_b = await register_company(client, slug="beta", email="owner@beta.example.com")

    resp = await client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {user_a['access_token']}"},
        json={"refresh_token": user_b["refresh_token"]},
    )
    assert resp.status_code == 204

    still_alive = await client.post(
        "/auth/refresh", json={"refresh_token": user_b["refresh_token"]}
    )
    assert still_alive.status_code == 200


async def test_refresh_rotation_rejects_reused_token(client):
    _, data = await register_company(client, slug="acme", email="owner@acme.example.com")
    old_refresh = data["refresh_token"]

    first = await client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert first.status_code == 200

    reuse = await client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert reuse.status_code == 401
