"""KDS: отдельная кухонная сессия повара (вне десктопа/админки).

Проверяем контракт, на котором держится кухонный экран:
- настройка устройства логином+паролем филиала → кухонный скоуп;
- вход повара по 4-значному PIN (и только кухонной роли);
- кухонный токен не открывает ничего, кроме /kitchen/*;
- «весь заказ готов» работает одним тапом даже для ещё не начатого заказа.
"""
from __future__ import annotations

from tests.conftest import register_company

BRANCH_LOGIN = "+998 90 555-11-22"
BRANCH_PASSWORD = "Kitchen-Pass-1"


async def _kitchen_context(client, *, slug: str = "kds"):
    owner_headers, _ = await register_company(
        client, slug=slug, email=f"owner@{slug}.example.com"
    )
    branch = (
        await client.post(
            "/companies/me/branches",
            headers=owner_headers,
            json={"name": "Main", "login": BRANCH_LOGIN, "password": BRANCH_PASSWORD},
        )
    ).json()

    async def _staff(email, role_slug, pin, phone):
        created = await client.post(
            "/auth/users",
            headers=owner_headers,
            json={
                "email": email,
                "password": "Passw0rd!",
                "phone": phone,
                "role_slug": role_slug,
                "branch_id": branch["id"],
            },
        )
        assert created.status_code == 201, created.text
        user = created.json()
        setpin = await client.patch(
            f"/auth/users/{user['id']}/pin", headers=owner_headers, json={"pin": pin}
        )
        assert setpin.status_code == 204, setpin.text
        return user

    cook = await _staff(f"cook@{slug}.example.com", "kitchen", "1234", "+998901112233")
    cashier = await _staff(f"cashier@{slug}.example.com", "cashier", "5678", "+998901112244")
    product = await client.post(
        "/inventory/products", headers=owner_headers, json={"name": "Плов", "price": "42000"}
    )
    assert product.status_code == 201, product.text
    return owner_headers, branch, cook, cashier, product.json()["id"]


async def _device_token(client) -> str:
    resp = await client.post(
        "/auth/kitchen/session", json={"login": BRANCH_LOGIN, "password": BRANCH_PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


async def _cook_token(client) -> str:
    device = await _device_token(client)
    resp = await client.post(
        "/auth/kitchen/pin",
        headers={"Authorization": f"Bearer {device}"},
        json={"pin": "1234"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


async def test_kitchen_session_binds_device_to_branch(client):
    _, branch, _, _, _ = await _kitchen_context(client)
    resp = await client.post(
        "/auth/kitchen/session", json={"login": BRANCH_LOGIN, "password": BRANCH_PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["branch"]["id"] == branch["id"]
    assert body["company"]["slug"] == "kds"
    assert body["access_token"] and body["refresh_token"]


async def test_kitchen_session_rejects_bad_branch_password(client):
    await _kitchen_context(client)
    resp = await client.post(
        "/auth/kitchen/session", json={"login": BRANCH_LOGIN, "password": "nope"}
    )
    assert resp.status_code == 401


async def test_cook_pin_login_returns_name_and_kitchen_scope(client):
    _, branch, cook, _, _ = await _kitchen_context(client)
    device = await _device_token(client)

    resp = await client.post(
        "/auth/kitchen/pin", headers={"Authorization": f"Bearer {device}"}, json={"pin": "1234"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["branch"]["id"] == branch["id"]
    assert body["user_name"] == cook["name"] or body["user_name"] is None

    cook_headers = {"Authorization": f"Bearer {body['access_token']}"}
    # Кухонный экран видит заказы своего филиала без явного branch_id.
    orders = await client.get("/kitchen/orders", headers=cook_headers)
    assert orders.status_code == 200, orders.text
    assert orders.json() == []


async def test_kitchen_pin_only_accepts_kitchen_role(client):
    await _kitchen_context(client)
    device = await _device_token(client)

    cashier = await client.post(
        "/auth/kitchen/pin", headers={"Authorization": f"Bearer {device}"}, json={"pin": "5678"}
    )
    assert cashier.status_code == 401, "PIN кассира не должен открывать кухонную сессию"

    wrong = await client.post(
        "/auth/kitchen/pin", headers={"Authorization": f"Bearer {device}"}, json={"pin": "0000"}
    )
    assert wrong.status_code == 401


async def test_kitchen_pin_requires_device_session(client):
    await _kitchen_context(client)
    resp = await client.post("/auth/kitchen/pin", json={"pin": "1234"})
    assert resp.status_code == 401


async def test_kitchen_token_is_limited_to_kitchen_endpoints(client):
    _, branch, _, _, _ = await _kitchen_context(client)
    cook_headers = {"Authorization": f"Bearer {await _cook_token(client)}"}

    # Кухня — можно.
    assert (await client.get("/kitchen/orders", headers=cook_headers)).status_code == 200
    # Касса, сотрудники и склад — закрыто, несмотря на валидный токен.
    assert (
        await client.get("/pos/orders", headers=cook_headers, params={"branch_id": branch["id"]})
    ).status_code == 403
    assert (await client.get("/auth/users", headers=cook_headers)).status_code == 403
    assert (await client.get("/warehouse/list", headers=cook_headers)).status_code == 403


async def test_kitchen_order_ready_marks_untouched_order(client, monkeypatch):
    from unittest.mock import AsyncMock

    # Заказ в тесте не должен уходить на реальный принтер/в POS-сокеты.
    monkeypatch.setattr(
        "app.modules.printers.service.print_raw",
        AsyncMock(side_effect=AssertionError("No physical printing in tests")),
    )
    monkeypatch.setattr(
        "app.modules.printers.service.printer_ws_manager.broadcast", AsyncMock()
    )
    owner_headers, branch, _, _, product_id = await _kitchen_context(client)
    order = await client.post(
        "/pos/orders",
        headers=owner_headers,
        json={
            "branch_id": branch["id"],
            "order_type": "takeaway",
            "items": [{"product_id": product_id, "quantity": "1"}],
        },
    )
    assert order.status_code == 201, order.text
    order_id = order.json()["id"]

    cook_headers = {"Authorization": f"Bearer {await _cook_token(client)}"}
    ready = await client.patch(f"/kitchen/orders/{order_id}/ready", headers=cook_headers)
    assert ready.status_code == 200, ready.text
    assert ready.json()["status"] == "ready"

    # Прямой POS-эндпоинт кухонной сессии по-прежнему закрыт.
    direct = await client.patch(
        f"/pos/orders/{order_id}/status", headers=cook_headers, json={"status": "completed"}
    )
    assert direct.status_code == 403


async def test_kitchen_refresh_keeps_kitchen_scope(client):
    """Продление сессии не должно повышать её до полного доступа к API."""
    await _kitchen_context(client)
    device = await _device_token(client)
    login = await client.post(
        "/auth/kitchen/pin", headers={"Authorization": f"Bearer {device}"}, json={"pin": "1234"}
    )
    refreshed = await client.post(
        "/auth/refresh", json={"refresh_token": login.json()["refresh_token"]}
    )
    assert refreshed.status_code == 200, refreshed.text
    headers = {"Authorization": f"Bearer {refreshed.json()['access_token']}"}
    assert (await client.get("/kitchen/orders", headers=headers)).status_code == 200
    assert (await client.get("/auth/users", headers=headers)).status_code == 403


async def test_cook_branch_comes_from_hr_record(client):
    """Реальный редактор сотрудников хранит филиал повара в HR-записи, а не в
    User.branch_id. Кухонный экран всё равно должен открывать заказы филиала,
    а не падать с «branch_id is required»."""
    owner_headers, branch, _, _, _ = await _kitchen_context(client, slug="kds-hr")

    cook = (
        await client.post(
            "/auth/users",
            headers=owner_headers,
            json={
                "email": "hr-cook@kds-hr.example.com",
                "password": "Passw0rd!",
                "phone": "+998901119999",
                "role_slug": "kitchen",
            },
        )
    ).json()
    cook_login = await client.post(
        "/auth/login", json={"email": "hr-cook@kds-hr.example.com", "password": "Passw0rd!"}
    )
    me = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {cook_login.json()['access_token']}"}
    )
    assert me.json()["branch_id"] is None, "филиал повара живёт в HR-записи"

    hr = await client.post(
        "/hr/employees",
        headers=owner_headers,
        json={
            "user_id": cook["id"],
            "branch_id": branch["id"],
            "position": "Повар",
            "hire_date": "2026-01-01",
        },
    )
    assert hr.status_code == 201, hr.text
    assert (
        await client.patch(
            f"/auth/users/{cook['id']}/pin", headers=owner_headers, json={"pin": "2468"}
        )
    ).status_code == 204

    device = await _device_token(client)
    login = await client.post(
        "/auth/kitchen/pin", headers={"Authorization": f"Bearer {device}"}, json={"pin": "2468"}
    )
    assert login.status_code == 200, login.text
    cook_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    orders = await client.get("/kitchen/orders", headers=cook_headers)
    assert orders.status_code == 200, orders.text


async def test_cook_of_another_branch_cannot_pin_into_this_terminal(client):
    owner_headers, branch_a, _, _, _ = await _kitchen_context(client, slug="kds-b")
    branch_b = (
        await client.post(
            "/companies/me/branches",
            headers=owner_headers,
            json={"name": "Second", "login": "+998 90 777-33-11", "password": "Second-Pass-1"},
        )
    ).json()
    cook_b = (
        await client.post(
            "/auth/users",
            headers=owner_headers,
            json={
                "email": "cook-b@kds-b.example.com",
                "password": "Passw0rd!",
                "phone": "+998901118888",
                "role_slug": "kitchen",
                "branch_id": branch_b["id"],
            },
        )
    ).json()
    await client.patch(f"/auth/users/{cook_b['id']}/pin", headers=owner_headers, json={"pin": "1357"})

    device = await _device_token(client)   # терминал филиала A
    resp = await client.post(
        "/auth/kitchen/pin", headers={"Authorization": f"Bearer {device}"}, json={"pin": "1357"}
    )
    assert resp.status_code == 401, "повар другого филиала не входит на этот экран"
