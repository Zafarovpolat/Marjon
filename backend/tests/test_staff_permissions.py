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


async def test_create_cook_persists_toggles_and_pin_for_kds(client):
    """Повар из карточки веб-админки: один POST приносит и тумблеры, и PIN.

    KITCHEN-01: карточка повара — продуктовый drawer, он шлёт role_slug=kitchen,
    branch_id, printer_id, permissions {can_cook_printer, can_print_cancel} и
    pin одним запросом. Проверяем полный круг: запись сохранилась, GET
    /auth/users отдаёт тумблеры обратно (иначе UI показывает их снятыми), а
    PIN реально открывает кухонный экран — иначе повара заводят «в никуда».
    """
    owner_headers, _ = await register_company(
        client, slug="permkitchen", email="owner@permkitchen.example.com"
    )
    branch = (
        await client.post(
            "/companies/me/branches",
            headers=owner_headers,
            json={"name": "Main", "login": "+998 90 555-44-33", "password": "Kitchen-Pass-2"},
        )
    ).json()

    created = await client.post(
        "/auth/users",
        headers=owner_headers,
        json={
            "password": "Cook1234",
            "phone": "+998901112233",
            "role_slug": "kitchen",
            "role_name": "Повар Али",
            "branch_id": branch["id"],
            "printer_id": None,
            "permissions": {"can_cook_printer": True, "can_print_cancel": True},
            "pin": "4321",
        },
    )
    assert created.status_code == 201, created.text
    cook = created.json()
    assert cook["role_slug"] == "kitchen"
    assert cook["branch_id"] == branch["id"]
    assert cook["permissions"] == {"can_cook_printer": True, "can_print_cancel": True}

    # Список сотрудников — источник префилла карточки в админке.
    listed = await client.get("/auth/users", headers=owner_headers)
    assert listed.status_code == 200, listed.text
    saved = next(user for user in listed.json() if user["id"] == cook["id"])
    assert saved["role_slug"] == "kitchen"
    assert saved["permissions"] == {"can_cook_printer": True, "can_print_cancel": True}

    # PIN из того же POST открывает кухонный экран филиала.
    device = await client.post(
        "/auth/kitchen/session",
        json={"login": "+998 90 555-44-33", "password": "Kitchen-Pass-2"},
    )
    assert device.status_code == 200, device.text
    login = await client.post(
        "/auth/kitchen/pin",
        headers={"Authorization": f"Bearer {device.json()['access_token']}"},
        json={"pin": "4321"},
    )
    assert login.status_code == 200, login.text
    cook_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get("/kitchen/orders", headers=cook_headers)).status_code == 200
