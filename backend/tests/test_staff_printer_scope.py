"""Привязка сотрудника к принтеру: компания И филиал.

Дефект, который закрывает файл
------------------------------
`create_company_user` / `update_company_user` проверяли только
`printer.company_id == company_id`. В сети с несколькими филиалами это
разрешало привязать официанта филиала A к принтеру филиала B: десктоп печатает
чек на «принтер сотрудника», то есть чек филиала A уходил на чужой адрес/кассу,
а свой принтер не получал ничего. Молчаливая ошибка конфигурации, которую
невозможно заметить по логам.

STAFF-PRINTER-SCOPE-01: привязка ограничена филиалом сотрудника. Когда филиал
не задан (владелец/админ без филиала) — принтер любого филиала компании
допустим, это осознанная привязка «печатать сюда».

Плюс контракт «не прислали поле» ≠ «прислали null»: PATCH карточки без
`printer_id` не должен сбрасывать привязку, а `printer_id: null` — должен.
"""

from __future__ import annotations

import pytest

from tests.conftest import register_company


async def _create_branch(client, headers, name: str) -> str:
    response = await client.post(
        "/companies/me/branches", headers=headers, json={"name": name}
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


async def _create_printer(client, headers, *, name: str, branch_id: str) -> str:
    response = await client.post(
        "/printers",
        headers=headers,
        json={
            "name": name,
            "type": "Чековый",
            "ip_address": "192.168.1.50",
            "port": 9100,
            "zone": name,
            "is_active": True,
            "branch_id": branch_id,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _create_staff(client, headers, *, email: str, branch_id: str, printer_id: str | None):
    payload = {
        "email": email,
        "password": "Passw0rd!",
        "role_slug": "waiter",
        "branch_id": branch_id,
    }
    if printer_id is not None:
        payload["printer_id"] = printer_id
    return await client.post("/auth/users", headers=headers, json=payload)


async def _staff_row(client, headers, email: str) -> dict:
    """Отдельного GET /auth/users/{id} нет — ищем строку в списке сотрудников."""
    listing = await client.get("/auth/users", headers=headers)
    assert listing.status_code == 200, listing.text
    for row in listing.json():
        if row.get("email") == email:
            return row
    raise AssertionError(f"сотрудник {email!r} не найден в списке")


@pytest.fixture
async def two_branches(client):
    """Компания с двумя филиалами и по принтеру в каждом."""
    headers, _ = await register_company(client, slug="net", email="owner@net.example.com")
    first_branch = await _create_branch(client, headers, "Филиал A")
    second_branch = await _create_branch(client, headers, "Филиал B")
    first_printer = await _create_printer(
        client, headers, name="Касса A", branch_id=first_branch
    )
    second_printer = await _create_printer(
        client, headers, name="Касса B", branch_id=second_branch
    )
    return {
        "headers": headers,
        "first_branch": first_branch,
        "second_branch": second_branch,
        "first_printer": first_printer,
        "second_printer": second_printer,
    }


@pytest.mark.asyncio
async def test_staff_can_be_bound_to_a_printer_of_its_own_branch(client, two_branches) -> None:
    response = await _create_staff(
        client,
        two_branches["headers"],
        email="waiter-a@net.example.com",
        branch_id=two_branches["first_branch"],
        printer_id=two_branches["first_printer"],
    )
    assert response.status_code == 201, response.text
    assert response.json()["printer_id"] == two_branches["first_printer"]


@pytest.mark.asyncio
async def test_staff_cannot_be_bound_to_a_printer_of_another_branch(client, two_branches) -> None:
    response = await _create_staff(
        client,
        two_branches["headers"],
        email="waiter-x@net.example.com",
        branch_id=two_branches["first_branch"],
        printer_id=two_branches["second_printer"],
    )
    assert response.status_code == 422, (
        "сотрудник филиала A не должен привязываться к принтеру филиала B: "
        f"{response.text}"
    )
    # Сотрудник не должен появиться «наполовину созданным».
    listing = await client.get("/auth/users", headers=two_branches["headers"])
    assert listing.status_code == 200, listing.text
    emails = {row.get("email") for row in listing.json()}
    assert "waiter-x@net.example.com" not in emails


@pytest.mark.asyncio
async def test_staff_without_branch_may_use_any_company_printer(client, two_branches) -> None:
    """Владелец/админ без филиала привязывается к принтеру любого филиала компании."""
    response = await _create_staff(
        client,
        two_branches["headers"],
        email="owner-printer@net.example.com",
        branch_id=None,  # type: ignore[arg-type]
        printer_id=two_branches["second_printer"],
    )
    assert response.status_code == 201, response.text
    assert response.json()["printer_id"] == two_branches["second_printer"]


@pytest.mark.asyncio
async def test_printer_from_another_company_is_rejected(client, two_branches) -> None:
    other_headers, _ = await register_company(
        client, slug="othernet", email="owner@othernet.example.com"
    )
    branches = await client.get("/companies/me/branches", headers=other_headers)
    assert branches.status_code == 200, branches.text
    foreign_printer = await _create_printer(
        client, other_headers, name="Чужая касса", branch_id=branches.json()[0]["id"]
    )

    response = await _create_staff(
        client,
        two_branches["headers"],
        email="waiter-foreign@net.example.com",
        branch_id=two_branches["first_branch"],
        printer_id=foreign_printer,
    )
    assert response.status_code == 422, (
        f"принтер чужой компании (tenant) не должен привязываться: {response.text}"
    )


@pytest.mark.asyncio
async def test_rebinding_to_another_branch_printer_is_rejected(client, two_branches) -> None:
    created = await _create_staff(
        client,
        two_branches["headers"],
        email="waiter-rebind@net.example.com",
        branch_id=two_branches["first_branch"],
        printer_id=two_branches["first_printer"],
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]

    response = await client.patch(
        f"/auth/users/{user_id}",
        headers=two_branches["headers"],
        json={"printer_id": two_branches["second_printer"]},
    )
    assert response.status_code == 422, (
        f"перепривязка на принтер чужого филиала должна отклоняться: {response.text}"
    )
    row = await _staff_row(client, two_branches["headers"], "waiter-rebind@net.example.com")
    assert row["printer_id"] == two_branches["first_printer"], (
        "после отказа привязка обязана остаться прежней"
    )


@pytest.mark.asyncio
async def test_patch_without_printer_id_keeps_the_binding(client, two_branches) -> None:
    created = await _create_staff(
        client,
        two_branches["headers"],
        email="waiter-keep@net.example.com",
        branch_id=two_branches["first_branch"],
        printer_id=two_branches["first_printer"],
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]

    response = await client.patch(
        f"/auth/users/{user_id}",
        headers=two_branches["headers"],
        json={"name": "Новое имя"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["printer_id"] == two_branches["first_printer"], (
        "PATCH без printer_id не должен сбрасывать привязку"
    )


@pytest.mark.asyncio
async def test_explicit_null_printer_id_unbinds(client, two_branches) -> None:
    created = await _create_staff(
        client,
        two_branches["headers"],
        email="waiter-unbind@net.example.com",
        branch_id=two_branches["first_branch"],
        printer_id=two_branches["first_printer"],
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]

    response = await client.patch(
        f"/auth/users/{user_id}",
        headers=two_branches["headers"],
        json={"printer_id": None},
    )
    assert response.status_code == 200, response.text
    assert response.json()["printer_id"] is None


@pytest.mark.asyncio
async def test_moving_staff_to_another_branch_keeps_printer_contract(client, two_branches) -> None:
    """Переезд в другой филиал не должен оставлять привязку к принтеру старого.

    Привязка сама не переезжает: после смены филиала сотрудник печатает на
    принтер нового филиала (printer_id = null) либо владелец явно выбирает
    принтер нового филиала. Главное — нельзя остаться с принтером старого.
    """
    created = await _create_staff(
        client,
        two_branches["headers"],
        email="waiter-move@net.example.com",
        branch_id=two_branches["first_branch"],
        printer_id=two_branches["first_printer"],
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]

    moved = await client.patch(
        f"/auth/users/{user_id}",
        headers=two_branches["headers"],
        json={"branch_id": two_branches["second_branch"], "printer_id": None},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["branch_id"] == two_branches["second_branch"]
    assert moved.json()["printer_id"] is None

    rebound = await client.patch(
        f"/auth/users/{user_id}",
        headers=two_branches["headers"],
        json={"printer_id": two_branches["second_printer"]},
    )
    assert rebound.status_code == 200, rebound.text
    assert rebound.json()["printer_id"] == two_branches["second_printer"]
