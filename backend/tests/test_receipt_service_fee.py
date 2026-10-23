from __future__ import annotations

from decimal import Decimal

from app.modules.printers.formatter import (
    EscPosFormatter,
    ReceiptData,
    derive_service_rate_percent,
    format_rate_percent,
)


def _receipt(**overrides):
    base = {
        "company_name": "Marjon",
        "branch_name": "Филиал",
        "order_number": "3",
        "order_type": "На стол",
        "cashier_name": "Кассир",
        "items": [],
        "subtotal": Decimal("100000"),
        "discount": Decimal("0"),
        "tax": Decimal("0"),
        "total": Decimal("120000"),
        "payment_method": "—",
    }
    base.update(overrides)
    return ReceiptData(**base)


def _text(raw: bytes) -> str:
    return raw.decode("cp866")


def test_derive_service_rate_percent_from_frozen_numbers():
    # Заказ дня продажи 20%: 20000 / 100000 — ставка дня продажи,
    # а не текущая из настроек.
    assert derive_service_rate_percent(Decimal("20000"), Decimal("100000")) == Decimal("20")


def test_derive_service_rate_percent_rounds_to_two():
    assert derive_service_rate_percent(Decimal("8000"), Decimal("144000")) == Decimal("5.56")


def test_derive_service_rate_percent_guards():
    assert derive_service_rate_percent(Decimal("0"), Decimal("100000")) is None
    assert derive_service_rate_percent(Decimal("20000"), Decimal("0")) is None
    assert derive_service_rate_percent(None, None) is None


def test_format_rate_percent_trims_zeros():
    assert format_rate_percent(Decimal("20")) == "20"
    assert format_rate_percent(Decimal("10.50")) == "10.5"
    assert format_rate_percent(None) == ""
    assert format_rate_percent(Decimal("0")) == ""


def test_receipt_prints_service_with_hall_percent():
    raw = _text(EscPosFormatter().format_receipt(
        _receipt(service_fee=Decimal("20000"), service_fee_rate=Decimal("20")),
    ))
    assert "Обслуга 20%" in raw
    assert "20,000" in raw


def test_receipt_without_known_rate_keeps_plain_label():
    raw = _text(EscPosFormatter().format_receipt(
        _receipt(service_fee=Decimal("20000")),
    ))
    assert "Обслуга" in raw
    assert "%" not in [ln for ln in raw.splitlines() if "Обслуга" in ln][0]


def test_receipt_hides_zero_service():
    raw = _text(EscPosFormatter().format_receipt(_receipt(service_fee=Decimal("0"))))
    assert "Обслуга" not in raw
