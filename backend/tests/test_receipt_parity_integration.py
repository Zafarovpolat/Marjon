"""DB-backed wiring tests for the receipt/kitchen-ticket pipeline — the part
tests/test_receipt_formatter.py's pure unit tests cannot cover: does
PrinterService actually resolve a real waiter name, a real cancellation flag
and a real item total from the database and hand them to the formatter.

Print jobs don't expose their raw payload over HTTP (PrintJobResponse
intentionally doesn't — see schemas.py), so these tests set up state through
the normal API (client fixture) and then call PrinterService directly against
the same test database to inspect the formatted bytes.
"""
from __future__ import annotations

import base64
from uuid import UUID

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.printers.service import PrinterService
from tests.conftest import create_staff_headers, register_company


@pytest_asyncio.fixture
async def session_factory(db_engine):
    return async_sessionmaker(db_engine, expire_on_commit=False)


async def _setup(client):
    owner_headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    waiter_headers = await create_staff_headers(client, owner_headers, email="waiter@acme.example.com", role_slug="waiter")
    waiter_me = (await client.get("/auth/me", headers=waiter_headers)).json()
    await client.patch(f"/auth/users/{waiter_me['id']}", headers=owner_headers, json={"name": "Алишер"})

    branch = (await client.post("/companies/me/branches", headers=owner_headers, json={"name": "Main"})).json()
    category = (await client.post("/inventory/categories", headers=owner_headers, json={"name": "Горячее", "slug": "hot"})).json()
    product = (await client.post(
        "/inventory/products", headers=owner_headers,
        json={"name": "Плов Ташкентский", "category_id": category["id"], "price": "35000"},
    )).json()
    kitchen_printer = (await client.post(
        "/printers", headers=owner_headers,
        json={"branch_id": branch["id"], "name": "Kitchen", "printer_type": "kitchen", "connection_type": "network", "ip_address": "192.0.2.9", "port": 9100},
    )).json()
    receipt_printer = (await client.post(
        "/printers", headers=owner_headers,
        json={"branch_id": branch["id"], "name": "Receipt", "printer_type": "receipt", "connection_type": "network", "ip_address": "192.0.2.10", "port": 9100},
    )).json()

    order = (await client.post(
        "/pos/orders", headers=waiter_headers,
        json={"branch_id": branch["id"], "order_type": "delivery", "table_number": "12", "items": [{"product_id": product["id"], "quantity": "2"}]},
    )).json()
    assert "id" in order, order

    return {
        "owner_headers": owner_headers,
        "waiter_headers": waiter_headers,
        "company_id": UUID(order["company_id"]),
        "order_id": UUID(order["id"]),
        "order_number": order["order_number"],
        "kitchen_printer_id": UUID(kitchen_printer["id"]),
        "receipt_printer_id": UUID(receipt_printer["id"]),
    }


async def _kitchen_payload(session_factory, company_id, order_id, printer_id) -> bytes:
    """Raw bytes from the REAL print_kitchen_ticket path — raster by default
    since the kitchen typography-parity change. Use this only to assert on
    the bytes themselves (e.g. GS v 0 presence); it is not text and must not
    be cp866-decoded for substring checks — use _kitchen_payload_text for that."""
    async with session_factory() as session:
        job = await PrinterService(session).print_kitchen_ticket(company_id, order_id, printer_id)
        return base64.b64decode(job.payload)


async def _kitchen_payload_text(session_factory, company_id, order_id, printer_id) -> str:
    """Text-mode payload, built the same way PrinterService.print_kitchen_ticket
    resolves its data (real waiter/order/template lookups via
    _build_kitchen_data), but rendered through EscPosFormatter.format_kitchen_ticket
    directly — bypassing the raster-primary routing. These DB-resolution
    correctness checks (real waiter name, real item total, cancel marker,
    real order number) are orthogonal to which renderer is chosen; raster
    bytes are a bitmap and cannot be substring-matched for content."""
    from app.modules.printers.formatter import EscPosFormatter

    async with session_factory() as session:
        svc = PrinterService(session)
        printer = await svc.get(company_id, printer_id)
        order = await svc._get_order(company_id, order_id)
        ticket_data = await svc._build_kitchen_data(company_id, order)
        _, kitchen_tpl = await svc._get_receipt_templates(company_id)
        fmt = EscPosFormatter(printer.paper_width, encoding=svc._printer_encoding(printer))
        raw = fmt.format_kitchen_ticket(ticket_data, template=kitchen_tpl)
        return raw.decode("cp866")


async def _receipt_payload(session_factory, company_id, order_id, printer_id) -> bytes:
    """Raw bytes from the REAL print_receipt path — raster by default since
    RASTER CUSTOMER RECEIPT V1. Use this only to assert on the bytes
    themselves (e.g. GS v 0 presence); it is not text and must not be
    cp866-decoded for substring checks — use _receipt_payload_text for that."""
    async with session_factory() as session:
        job = await PrinterService(session).print_receipt(company_id, order_id, printer_id)
        return base64.b64decode(job.payload)


async def _receipt_payload_text(session_factory, company_id, order_id, printer_id) -> str:
    """Text-mode payload, built the same way PrinterService.print_receipt
    resolves its data (real waiter/order/payment/template lookups via
    _build_receipt_data), but rendered through EscPosFormatter.format_receipt
    directly — bypassing the raster-primary routing. These DB-resolution
    correctness checks (order type label, real order number, real payment
    amount, order-creation date) are orthogonal to which renderer is chosen;
    raster bytes are a bitmap and cannot be substring-matched for content."""
    from app.modules.printers.formatter import EscPosFormatter

    async with session_factory() as session:
        svc = PrinterService(session)
        printer = await svc.get(company_id, printer_id)
        order = await svc._get_order(company_id, order_id)
        receipt_data = await svc._build_receipt_data(company_id, order)
        customer_tpl, _ = await svc._get_receipt_templates(company_id)
        fmt = EscPosFormatter(printer.paper_width, encoding=svc._printer_encoding(printer))
        raw = fmt.format_receipt(receipt_data, template=customer_tpl)
        return raw.decode("cp866")


async def test_kitchen_ticket_resolves_the_real_waiter_name(client, session_factory):
    ctx = await _setup(client)
    text = await _kitchen_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["kitchen_printer_id"])
    # Before this fix, _build_kitchen_data hard-coded waiter_name=None — the
    # line simply never appeared on a physical kitchen ticket.
    assert "Официант: Алишер" in text


async def test_kitchen_ticket_show_order_sum_prints_the_real_item_total(client, session_factory):
    ctx = await _setup(client)
    await client.patch(
        "/settings/kitchen-receipt-template", headers=ctx["owner_headers"],
        json={"enabled": {"showOrderSum": True}},
    )
    text = await _kitchen_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["kitchen_printer_id"])
    # 2 x 35 000 = 70 000, the OrderItem's real .total — never fabricated.
    assert "70,000" in text


async def test_kitchen_ticket_show_order_sum_off_hides_amount_by_default(client, session_factory):
    ctx = await _setup(client)
    text = await _kitchen_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["kitchen_printer_id"])
    assert "70,000" not in text


async def test_kitchen_ticket_quantity_is_canonically_formatted(client, session_factory):
    """Before this fix, _build_kitchen_data used str(item.quantity) directly
    — Order.quantity is Numeric(x,3), so a whole count printed as "2.000"
    instead of the canonical "2" format_quantity() already guarantees
    everywhere else (customer receipt, format_quantity's own unit tests)."""
    ctx = await _setup(client)
    text = await _kitchen_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["kitchen_printer_id"])
    assert "Плов Ташкентский" in text
    # Кол-во centered in its 8-wide header field (no showOrderSum column).
    assert "   2    " in text
    assert "2.000" not in text


async def test_cancelled_order_kitchen_ticket_shows_cancel_marker_once(client, session_factory):
    ctx = await _setup(client)
    cancel = await client.delete(f"/pos/orders/{ctx['order_id']}", headers=ctx["owner_headers"])
    assert cancel.status_code in (200, 204), cancel.text

    text = await _kitchen_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["kitchen_printer_id"])
    assert "ОТМЕНА" in text
    assert text.count(f"#{ctx['order_number']}") == 1


async def test_active_order_kitchen_ticket_has_no_cancel_marker(client, session_factory):
    ctx = await _setup(client)
    text = await _kitchen_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["kitchen_printer_id"])
    assert "ОТМЕНА" not in text


async def test_receipt_shows_order_type_and_payment_labels(client, session_factory):
    ctx = await _setup(client)
    text = await _receipt_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["receipt_printer_id"])
    assert "Доставка" in text  # order_type=delivery -> ORDER_TYPE_LABELS


async def test_receipt_and_kitchen_ticket_agree_on_the_real_order_number(client, session_factory):
    ctx = await _setup(client)
    receipt_text = await _receipt_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["receipt_printer_id"])
    kitchen_text = await _kitchen_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["kitchen_printer_id"])
    # Customer receipt's bottomOrderNumber prints the bare number (matches
    # ReceiptPreview.jsx's getOrderNumber(), no "#"); the kitchen ticket's
    # orderNumber block keeps the "#" (its own, separate contract).
    assert str(ctx["order_number"]) in receipt_text
    assert f"#{ctx['order_number']}" in kitchen_text


async def test_unpaid_order_receipt_prints_no_payment_row(client, session_factory):
    """Before this fix, _build_receipt_data defaulted payment_method to the
    placeholder "—" for an unpaid order, and the formatter printed a bare
    "Оплата: —" line — a pre-bill must not fabricate a payment line, matching
    ReceiptPreview.jsx's getPaymentRows() (empty when nothing has been paid)."""
    ctx = await _setup(client)
    text = await _receipt_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["receipt_printer_id"])
    assert "Оплата" not in text
    assert "—" not in text


async def test_paid_order_receipt_shows_real_payment_method_and_amount(client, session_factory):
    ctx = await _setup(client)
    order = (await client.get(f"/pos/orders/{ctx['order_id']}", headers=ctx["owner_headers"])).json()
    pay = await client.post(
        "/payments", headers=ctx["waiter_headers"],
        json={"order_id": str(ctx["order_id"]), "amount": order["total_amount"], "method": "card"},
    )
    assert pay.status_code in (200, 201), pay.text

    text = await _receipt_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["receipt_printer_id"])
    assert "Карта:" in text
    assert "Оплата:" not in text  # the method name IS the label, not a generic "Оплата:" prefix


async def test_receipt_date_time_uses_order_creation_not_print_time(client, session_factory):
    """ReceiptPreview.jsx: infoRow("dateTime", "Дата:", formatCustomerDate(
    order.created_at)) — a reprint must show the same timestamp every time,
    not whatever moment the print button happened to be pressed."""
    ctx = await _setup(client)
    order = (await client.get(f"/pos/orders/{ctx['order_id']}", headers=ctx["owner_headers"])).json()
    created_at = order["created_at"]  # ISO, e.g. "2026-09-29T15:44:47.18..."
    day_month_year = created_at[8:10] + "." + created_at[5:7] + "." + created_at[0:4]

    text = await _receipt_payload_text(session_factory, ctx["company_id"], ctx["order_id"], ctx["receipt_printer_id"])
    assert "Дата: " in text
    assert day_month_year in text


async def test_real_print_receipt_path_uses_raster_by_default(client, session_factory):
    """RASTER CUSTOMER RECEIPT V1: the real POST /printers/print/receipt path
    (PrinterService.print_receipt, exactly what Desktop calls) must choose
    the raster renderer, not text-mode, for a normal customer receipt."""
    ctx = await _setup(client)
    raw = await _receipt_payload(session_factory, ctx["company_id"], ctx["order_id"], ctx["receipt_printer_id"])
    assert raw.startswith(b"\x1b\x40")  # ESC @ init — still a valid print payload
    assert b"\x1dv0\x00" in raw  # GS v 0 — raster block present
    # text-mode's items-table header would be these literal cp866 bytes if
    # the fallback had fired instead; a raster payload cannot contain them
    # as plain text (they are pixel data, not Cyrillic cp866 bytes).
    assert "Блюдо".encode("cp866") not in raw
