from __future__ import annotations

from tests.conftest import register_company


async def _login(client, email, password="Passw0rd!"):
    login = await client.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_create_user_with_permissions_returns_them(client):
    # Тумблеры владельца, выставленные при создании, сразу видны в ответе
    # (раньше create их не принимал — extra=forbid давал 422).
    owner_headers, _ = await register_company(client, slug="perm", email="owner@perm.example.com")
    created = await client.post(
        "/auth/users",
        headers=owner_headers,
        json={
            "email": "waiter@perm.example.com",
            "password": "Passw0rd!",
            "role_slug": "waiter",
            "permissions": {"can_manage_orders": True, "can_delete_dishes": False},
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["permissions"] == {"can_manage_orders": True, "can_delete_dishes": False}


async def test_me_returns_staff_permissions(client):
    # Десктопные гейты can()/must() и PIN-подтверждения читают тумблеры из
    # /auth/me — без этого любая строгая проверка всегда была ложью.
    owner_headers, _ = await register_company(client, slug="permme", email="owner@permme.example.com")
    created = await client.post(
        "/auth/users",
        headers=owner_headers,
        json={"email": "cashier@permme.example.com", "password": "Passw0rd!", "role_slug": "cashier"},
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]
    patched = await client.patch(
        f"/auth/users/{user_id}", headers=owner_headers, json={"permissions": {"can_close_bill": True}}
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["permissions"] == {"can_close_bill": True}

    staff_headers = await _login(client, "cashier@permme.example.com")
    me = await client.get("/auth/me", headers=staff_headers)
    assert me.status_code == 200, me.text
    assert me.json()["permissions"] == {"can_close_bill": True}


async def test_me_permissions_absent_when_never_set(client):
    # Не трогали тумблеры — None, десктопные гейты ведут себя как раньше
    # (can() разрешает, must() запрещает).
    owner_headers, _ = await register_company(client, slug="permnone", email="owner@permnone.example.com")
    created = await client.post(
        "/auth/users",
        headers=owner_headers,
        json={"email": "w@permnone.example.com", "password": "Passw0rd!", "role_slug": "waiter"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["permissions"] is None

    staff_headers = await _login(client, "w@permnone.example.com")
    me = await client.get("/auth/me", headers=staff_headers)
    assert me.status_code == 200, me.text
    assert me.json().get("permissions") is None
