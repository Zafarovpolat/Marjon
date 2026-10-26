"""Возврат закрытого заказа, отмена блюда с причиной и запрет долга официанту.

Контракт, на котором держится касса:

* закрытый заказ можно вернуть в работу (гость вернул блюдо / не получил его);
* в возвращённом заказе можно отменить позицию — только с причиной, и эта
  причина остаётся на позиции (печатается в чеке);
* итог уменьшается, повторное закрытие создаёт НОВУЮ оплату по новому итогу, а
  прежняя помечается refunded — выручка в отчётах не задваивается;
* официант НИКОГДА не закрывает заказ в долг (без полной оплаты) — 403;
  кассир/владелец закрывает как раньше;
* свой способ оплаты из веб-админки (Uzum, Yandex) сохраняется как есть.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.payments.models import Payment
from app.modules.pos.models import Order, OrderItem
from tests.conftest import register_company


async def _me(client, headers) -> dict:
    response = await client.get("/auth/me", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def _setup(client, db_engine, *, slug: str) -> dict:
    """Компания + филиал + блюдо + кассир-официант с PIN."""
    owner_headers, _ = await register_company(
        client, slug=slug, email=f"owner@{slug}.example.com"
    )
    identity = await _me(client, owner_headers)
    branch = (
        await client.post(
            "/companies/me/branches",
            headers=owner_headers,
            json={"name": "Main"},
        )
    ).json()
    product = (
        await client.post(
            "/inventory/products",
            headers=owner_headers,
            json={"name": "Жвачка", "price": "5000"},
        )
    ).json()
    waiter = (
        await client.post(
            "/auth/users",
            headers=owner_headers,
            json={
                "email": f"waiter@{slug}.example.com",
                "password": "Passw0rd!",
                "phone": "+998901112255",
                "role_slug": "waiter",
                "branch_id": branch["id"],
            },
        )
    ).json()
    setpin = await client.patch(
        f"/auth/users/{waiter['id']}/pin", headers=owner_headers, json={"pin": "4321"}
    )
    assert setpin.status_code == 204, setpin.text
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    return {
        "owner_headers": owner_headers,
        "company_id": UUID(identity["company_id"]),
        "branch_id": branch["id"],
        "product_id": product["id"],
        "waiter_id": waiter["id"],
        "sessions": sessions,
    }


async def _waiter_headers(client, ctx: dict) -> dict:
    resp = await client.post(
        "/auth/pin-login",
        json={"employee_id": ctx["waiter_id"], "pin": "4321"},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _create_order(client, ctx: dict, *, items: int = 2, headers=None) -> dict:
    resp = await client.post(
        "/pos/orders",
        headers=headers or ctx["owner_headers"],
        json={
            "branch_id": ctx["branch_id"],
            "order_type": "dine_in",
            "table_number": "7",
            "items": [
                {"product_id": ctx["product_id"], "quantity": 1}
                for _ in range(items)
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _pay(client, ctx: dict, order: dict, *, method: str = "cash") -> dict:
    resp = await client.post(
        "/payments",
        headers=ctx["owner_headers"],
        json={"order_id": order["id"], "amount": order["total_amount"], "method": method},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _reopen(client, ctx: dict, order_id: str, reason: str | None = None):
    return await client.post(
        f"/pos/orders/{order_id}/reopen",
        headers=ctx["owner_headers"],
        json={"reason": reason},
    )


async def _cancel_item(client, ctx: dict, order_id: str, item_id: str, reason: str | None):
    params = {"reason": reason} if reason else {}
    return await client.delete(
        f"/pos/orders/{order_id}/items/{item_id}",
        headers=ctx["owner_headers"],
        params=params,
    )


# ── Возврат закрытого заказа ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reopen_completed_order_returns_it_to_work(client, db_engine):
    ctx = await _setup(client, db_engine, slug="reopen-ok")
    order = await _create_order(client, ctx)
    await _pay(client, ctx, order)

    resp = await _reopen(client, ctx, order["id"], "гость вернул блюдо")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "accepted"

    async with ctx["sessions"]() as db:
        row = await db.get(Order, UUID(order["id"]))
        assert row.reopened_at is not None
        assert row.reopen_comment == "гость вернул блюдо"


@pytest.mark.asyncio
async def test_reopen_rejects_order_that_is_not_closed(client, db_engine):
    ctx = await _setup(client, db_engine, slug="reopen-live")
    order = await _create_order(client, ctx)

    resp = await _reopen(client, ctx, order["id"])
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_cancel_item_in_reopened_order_reduces_total_and_keeps_reason(
    client, db_engine
):
    ctx = await _setup(client, db_engine, slug="reopen-cancel")
    order = await _create_order(client, ctx)
    await _pay(client, ctx, order)
    assert (await _reopen(client, ctx, order["id"])).status_code == 200

    item_id = order["items"][0]["id"]
    resp = await _cancel_item(
        client, ctx, order["id"], item_id, "гость не получил жвачку"
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert Decimal(body["total_amount"]) == Decimal(order["total_amount"]) - Decimal("5000")
    # Позиция остаётся в заказе как отменённая (история не стирается) с нулевой суммой.
    cancelled = [i for i in body["items"] if i["id"] == item_id]
    assert len(cancelled) == 1
    assert cancelled[0]["status"] == "cancelled"

    async with ctx["sessions"]() as db:
        item = await db.get(OrderItem, UUID(item_id))
        assert item.status == "cancelled"
        assert item.cancel_reason == "гость не получил жвачку"


@pytest.mark.asyncio
async def test_reclosing_after_reopen_replaces_the_payment(client, db_engine):
    ctx = await _setup(client, db_engine, slug="reopen-pay")
    order = await _create_order(client, ctx)
    first = await _pay(client, ctx, order)
    await _reopen(client, ctx, order["id"])
    await _cancel_item(
        client, ctx, order["id"], order["items"][0]["id"], "гость вернул блюдо"
    )
    fresh = (await client.get(f"/pos/orders/{order['id']}", headers=ctx["owner_headers"])).json()
    second = await _pay(client, ctx, fresh)

    assert Decimal(second["amount"]) == Decimal(order["total_amount"]) - Decimal("5000")
    async with ctx["sessions"]() as db:
        rows = (
            await db.execute(select(Payment).where(Payment.order_id == UUID(order["id"])))
        ).scalars().all()
        by_id = {str(p.id): p for p in rows}
        assert by_id[first["id"]].status == "refunded"
        assert by_id[second["id"]].status == "completed"
        # Отчёты видят только новую оплату — выручка не задваивается.
        completed = [p for p in rows if p.status == "completed"]
        assert len(completed) == 1
        assert completed[0].amount == Decimal(second["amount"])


# ── Долг: официанту нельзя ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_waiter_cannot_close_order_in_debt(client, db_engine):
    ctx = await _setup(client, db_engine, slug="debt-waiter")
    waiter_headers = await _waiter_headers(client, ctx)
    order = await _create_order(client, ctx, headers=waiter_headers)

    resp = await client.patch(
        f"/pos/orders/{order['id']}/status",
        headers=waiter_headers,
        json={"status": "completed"},
    )
    assert resp.status_code == 403, resp.text
    assert "долг" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_waiter_can_close_fully_paid_order(client, db_engine):
    ctx = await _setup(client, db_engine, slug="debt-paid")
    waiter_headers = await _waiter_headers(client, ctx)
    order = await _create_order(client, ctx, headers=waiter_headers)
    await _pay(client, ctx, order)

    # Оплата уже закрыла заказ — повторное закрытие официантом не должно
    # выглядеть как долг (иначе его бы отшивало 403 на ровном месте).
    resp = await client.patch(
        f"/pos/orders/{order['id']}/status",
        headers=waiter_headers,
        json={"status": "accepted"},
    )
    assert resp.status_code == 422  # completed → accepted запрещён, но не 403


@pytest.mark.asyncio
async def test_owner_can_close_order_in_debt(client, db_engine):
    ctx = await _setup(client, db_engine, slug="debt-owner")
    order = await _create_order(client, ctx)

    resp = await client.patch(
        f"/pos/orders/{order['id']}/status",
        headers=ctx["owner_headers"],
        json={"status": "completed"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "completed"


# ── Свои способы оплаты (Uzum, Yandex) ──────────────────────────────────────


@pytest.mark.asyncio
async def test_custom_payment_method_is_stored_verbatim(client, db_engine):
    ctx = await _setup(client, db_engine, slug="custom-method")
    order = await _create_order(client, ctx)

    payment = await _pay(client, ctx, order, method="Uzum")
    assert payment["method"] == "Uzum"
    assert Decimal(payment["amount"]) == Decimal(order["total_amount"])

    listed = await client.get(
        f"/payments/order/{order['id']}", headers=ctx["owner_headers"]
    )
    assert listed.status_code == 200
    assert [p["method"] for p in listed.json()] == ["Uzum"]


# ── DEBT-CLIENT-01: должник попадает в справочник клиентов ──────────────────


@pytest.mark.asyncio
async def test_debt_close_registers_client_in_dashboard_directory(client, db_engine):
    """Закрытие «в долг» с именем и телефоном создаёт клиента в справочнике.

    Дашборд (Настройки → Клиенты) читает контрагентов типа «клиент», поэтому
    должник должен появиться именно там — иначе кассир вводил имя и телефон
    в пустоту, а долг нигде не числился.
    """
    ctx = await _setup(client, db_engine, slug="debt-client")
    order = await _create_order(client, ctx)

    resp = await client.patch(
        f"/pos/orders/{order['id']}/status",
        headers=ctx["owner_headers"],
        json={
            "status": "completed",
            "client_name": "Азиз Каримов",
            "client_phone": "+998901234567",
        },
    )
    assert resp.status_code == 200, resp.text

    listed = await client.get(
        "/finance/counterparties", headers=ctx["owner_headers"],
        params={"type": "client", "size": 50},
    )
    assert listed.status_code == 200, listed.text
    rows = listed.json()["items"] if isinstance(listed.json(), dict) else listed.json()
    clients = [row for row in rows if row.get("full_name") == "Азиз Каримов"]
    assert clients, f"клиент-должник не найден в справочнике: {rows}"
    assert clients[0]["phone"] == "+998901234567"
    assert Decimal(str(clients[0]["balance"])) == Decimal(str(order["total_amount"]))


@pytest.mark.asyncio
async def test_debt_close_without_client_keeps_directory_clean(client, db_engine):
    """Без имени и телефона справочник не засоряется «клиентом без имени»."""
    ctx = await _setup(client, db_engine, slug="debt-anon")
    order = await _create_order(client, ctx)

    resp = await client.patch(
        f"/pos/orders/{order['id']}/status",
        headers=ctx["owner_headers"],
        json={"status": "completed"},
    )
    assert resp.status_code == 200, resp.text

    listed = await client.get(
        "/finance/counterparties", headers=ctx["owner_headers"],
        params={"type": "client", "size": 50},
    )
    assert listed.status_code == 200, listed.text
    rows = listed.json()["items"] if isinstance(listed.json(), dict) else listed.json()
    assert rows == []
