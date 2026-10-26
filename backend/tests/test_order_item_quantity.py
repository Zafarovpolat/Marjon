"""Плюс/минус на уже внесённой позиции заказа.

Касса правит количество прямо в корзине, и это безопасно до оплаты: склад
списывается в `/payments` (`deduct_for_order`), а кухонный чек печатается
только в `create()` — дозаказ и правка количества его не печатают.

Контракт:
* `PATCH /pos/orders/{id}/items/{item_id}` меняет количество и пересчитывает
  сумму позиции, subtotal и итог заказа;
* ноль и отрицательное — 422 (убирать позицию нужно отменой с причиной);
* отменённую позицию менять нельзя — 404;
* в закрытом/отменённом заказе — 422.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

import pytest

from tests.conftest import register_company

PRICE = Decimal("5000")


async def _setup(client, *, slug: str) -> dict:
    owner_headers, _ = await register_company(
        client, slug=slug, email=f"owner@{slug}.example.com"
    )
    branch = (
        await client.post(
            "/companies/me/branches", headers=owner_headers, json={"name": "Main"}
        )
    ).json()
    product = (
        await client.post(
            "/inventory/products",
            headers=owner_headers,
            json={"name": "Жвачка", "price": str(PRICE)},
        )
    ).json()
    return {
        "owner_headers": owner_headers,
        "branch_id": branch["id"],
        "product_id": product["id"],
    }


async def _create_order(client, ctx: dict) -> dict:
    resp = await client.post(
        "/pos/orders",
        headers=ctx["owner_headers"],
        json={
            "branch_id": ctx["branch_id"],
            "order_type": "takeaway",
            "items": [{"product_id": ctx["product_id"], "quantity": 1}],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _set_qty(client, ctx: dict, order_id: str, item_id: str, quantity):
    return await client.patch(
        f"/pos/orders/{order_id}/items/{item_id}",
        headers=ctx["owner_headers"],
        json={"quantity": quantity},
    )


@pytest.mark.asyncio
async def test_plus_and_minus_change_quantity_and_totals(client):
    ctx = await _setup(client, slug="qty-arith")
    order = await _create_order(client, ctx)
    item_id = order["items"][0]["id"]
    assert Decimal(order["subtotal"]) == PRICE

    resp = await _set_qty(client, ctx, order["id"], item_id, 3)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    item = next(i for i in body["items"] if i["id"] == item_id)
    assert Decimal(item["quantity"]) == Decimal("3")
    assert Decimal(item["total"]) == PRICE * 3
    assert Decimal(body["subtotal"]) == PRICE * 3
    assert Decimal(body["total_amount"]) == PRICE * 3

    resp = await _set_qty(client, ctx, order["id"], item_id, 1)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert Decimal(body["subtotal"]) == PRICE
    assert Decimal(body["total_amount"]) == PRICE


@pytest.mark.asyncio
async def test_same_quantity_is_a_noop(client):
    ctx = await _setup(client, slug="qty-noop")
    order = await _create_order(client, ctx)
    item_id = order["items"][0]["id"]

    resp = await _set_qty(client, ctx, order["id"], item_id, 1)
    assert resp.status_code == 200, resp.text
    assert Decimal(resp.json()["subtotal"]) == PRICE


@pytest.mark.asyncio
async def test_zero_quantity_is_rejected(client):
    ctx = await _setup(client, slug="qty-zero")
    order = await _create_order(client, ctx)
    item_id = order["items"][0]["id"]

    resp = await _set_qty(client, ctx, order["id"], item_id, 0)
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_cancelled_item_cannot_be_changed(client):
    ctx = await _setup(client, slug="qty-cancelled")
    order = await _create_order(client, ctx)
    item_id = order["items"][0]["id"]

    cancel = await client.delete(
        f"/pos/orders/{order['id']}/items/{item_id}",
        headers=ctx["owner_headers"],
        params={"reason": "гость передумал"},
    )
    assert cancel.status_code == 200, cancel.text

    resp = await _set_qty(client, ctx, order["id"], item_id, 2)
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_closed_order_rejects_quantity_change(client):
    ctx = await _setup(client, slug="qty-closed")
    order = await _create_order(client, ctx)
    item_id = order["items"][0]["id"]

    paid = await client.post(
        "/payments",
        headers=ctx["owner_headers"],
        json={
            "order_id": order["id"],
            "amount": order["total_amount"],
            "method": "cash",
        },
    )
    assert paid.status_code == 201, paid.text

    resp = await _set_qty(client, ctx, order["id"], item_id, 2)
    assert resp.status_code == 422, resp.text
