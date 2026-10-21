"""STAFF-PIN-IS-PASSWORD-01.

Владелец заводит сотрудника одним кодом: 4 цифры в поле «Пароль» — это и
пароль учётной записи, и PIN терминала. Отдельного поля PIN в форме больше нет,
поэтому бэкенд сам выводит PIN из пароля, когда пароль целиком цифровой и
длины 4–8. Моноблок исключён: он входит по телефону и паролю, PIN у него нет.
"""
from __future__ import annotations

from tests.conftest import register_company


async def _create_staff(client, owner_headers, *, password, role_slug="cashier", phone=None):
    payload = {"password": password, "role_slug": role_slug}
    if phone:
        payload["phone"] = phone
    return await client.post("/auth/users", headers=owner_headers, json=payload)


async def test_four_digit_password_also_works_as_terminal_pin(client):
    owner_headers, _ = await register_company(
        client, slug="pinpwd", email="owner@pinpwd.example.com"
    )
    created = await _create_staff(client, owner_headers, password="2101", phone="998901112233")
    assert created.status_code == 201, created.text
    staff = created.json()

    # PIN не передавался отдельным полем — он выведен из пароля.
    login = await client.post(
        "/auth/pin-login", json={"employee_id": staff["id"], "pin": "2101"}
    )
    assert login.status_code == 200, login.text
    assert login.json()["access_token"]

    # И тот же код по-прежнему работает как обычный пароль.
    password_login = await client.post(
        "/auth/login", json={"phone": staff["phone"], "password": "2101"}
    )
    assert password_login.status_code == 200, password_login.text


async def test_alphanumeric_password_does_not_become_a_pin(client):
    owner_headers, _ = await register_company(
        client, slug="pinalpha", email="owner@pinalpha.example.com"
    )
    created = await _create_staff(client, owner_headers, password="Cashier123")
    assert created.status_code == 201, created.text
    staff = created.json()

    # Не цифровой код — PIN не выдумываем: входа по PIN у сотрудника нет.
    login = await client.post(
        "/auth/pin-login", json={"employee_id": staff["id"], "pin": "1234"}
    )
    assert login.status_code == 401, login.text


async def test_monoblock_gets_no_pin_from_its_password(client):
    owner_headers, _ = await register_company(
        client, slug="pinmono", email="owner@pinmono.example.com"
    )
    created = await _create_staff(client, owner_headers, password="2101", role_slug="monoblock")
    assert created.status_code == 201, created.text
    staff = created.json()

    login = await client.post(
        "/auth/pin-login", json={"employee_id": staff["id"], "pin": "2101"}
    )
    assert login.status_code == 401, login.text


async def test_duplicate_pin_is_reported_as_conflict(client):
    """Двое сотрудников не могут получить одинаковый код: вход на терминале
    выбирает сотрудника по PIN внутри компании, и коллизия сделала бы его
    неоднозначным. Ошибка приходит до вставки — сотрудник не остаётся созданным
    без PIN (это и был незавершаемый ретрай)."""
    owner_headers, _ = await register_company(
        client, slug="pindup", email="owner@pindup.example.com"
    )
    first = await _create_staff(client, owner_headers, password="2101")
    assert first.status_code == 201, first.text

    second = await _create_staff(client, owner_headers, password="2101")
    assert second.status_code == 409, second.text
    assert "PIN уже используется" in second.text


async def test_changing_password_moves_the_pin_with_it(client):
    owner_headers, _ = await register_company(
        client, slug="pinmove", email="owner@pinmove.example.com"
    )
    created = await _create_staff(client, owner_headers, password="2101")
    assert created.status_code == 201, created.text
    staff = created.json()

    updated = await client.patch(
        f"/auth/users/{staff['id']}", headers=owner_headers, json={"password": "7788"}
    )
    assert updated.status_code == 200, updated.text

    old = await client.post(
        "/auth/pin-login", json={"employee_id": staff["id"], "pin": "2101"}
    )
    assert old.status_code == 401, "старый PIN не должен оставаться рабочим"

    new = await client.post(
        "/auth/pin-login", json={"employee_id": staff["id"], "pin": "7788"}
    )
    assert new.status_code == 200, new.text


async def test_changing_to_a_non_numeric_password_keeps_the_existing_pin(client):
    owner_headers, _ = await register_company(
        client, slug="pinkeep", email="owner@pinkeep.example.com"
    )
    created = await _create_staff(client, owner_headers, password="2101")
    assert created.status_code == 201, created.text
    staff = created.json()

    updated = await client.patch(
        f"/auth/users/{staff['id']}", headers=owner_headers, json={"password": "Cashier123"}
    )
    assert updated.status_code == 200, updated.text

    # Пароль стал буквенным — прежний PIN сотрудника остаётся рабочим.
    login = await client.post(
        "/auth/pin-login", json={"employee_id": staff["id"], "pin": "2101"}
    )
    assert login.status_code == 200, login.text
