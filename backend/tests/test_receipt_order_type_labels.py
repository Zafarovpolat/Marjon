from __future__ import annotations

from decimal import Decimal

from app.modules.printers.formatter import (
    EscPosFormatter,
    KitchenTicketData,
    ReceiptData,
    format_order_type,
)


def _receipt(**overrides):
    base = {
        "company_name": "Marjon",
        "branch_name": "Филиал",
        "order_number": "3",
        "order_type": "dine_in",
        "cashier_name": "Кассир",
        "items": [],
        "subtotal": Decimal("0"),
        "discount": Decimal("0"),
        "tax": Decimal("0"),
        "total": Decimal("0"),
        "payment_method": "—",
    }
    base.update(overrides)
    return ReceiptData(**base)


def _text(raw: bytes) -> str:
    return raw.decode("cp866")


def test_format_order_type_maps_canonical_codes():
    assert format_order_type("dine_in") == "На стол"
    assert format_order_type("takeaway") == "На вынос"
    assert format_order_type("delivery") == "Доставка"
    assert format_order_type("qr") == "QR"


def test_format_order_type_passes_unknown_through():
    assert format_order_type("На стол") == "На стол"
    assert format_order_type("mystery") == "mystery"
    assert format_order_type("") == ""
    assert format_order_type(None) == ""


def test_receipt_prints_selected_type_not_raw_code():
    raw = _text(EscPosFormatter().format_receipt(_receipt(order_type="takeaway")))
    assert "На вынос" in raw
    assert "takeaway" not in raw


def test_receipt_prints_dine_in_as_na_stol():
    raw = _text(EscPosFormatter().format_receipt(_receipt(order_type="dine_in")))
    assert "На стол" in raw
    assert "dine_in" not in raw


def test_kitchen_ticket_prints_selected_type_uppercase():
    ticket = KitchenTicketData(
        order_number="A-1042",
        order_type="delivery",
        table_number="12",
        waiter_name="Aziz",
        items=[],
    )
    raw = _text(EscPosFormatter().format_kitchen_ticket(ticket, template=None))
    assert "ДОСТАВКА" in raw
    assert "DELIVERY" not in raw
