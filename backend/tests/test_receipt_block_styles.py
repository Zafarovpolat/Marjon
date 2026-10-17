"""Физический контракт блоков чека: тогглы enabled и стили blockStyles
на бумаге (ESC/POS) — гейт и стиль из шаблона обязаны менять вывод
форматтера (см. frontend receiptBlockCapabilities)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from app.modules.printers.formatter import EscPosFormatter, KitchenTicketData, ReceiptData

# GS ! 0x01 — double height (size "large"); ESC E 01 — bold.
DOUBLE_HEIGHT = b"\x1d\x21\x01"
BOLD_ON = b"\x1b\x45\x01"


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


def _ticket(**overrides):
    base = {
        "order_number": "A-1042",
        "order_type": "dine_in",
        "table_number": "12",
        "waiter_name": "Aziz",
        "items": [
            {"name": "Плов", "qty": "2", "price": "25000", "total": "50000",
             "note": "Без острого", "modifiers": ["Без казы"], "course": 1},
        ],
        "note": "Поспешить",
        "subtotal": Decimal("50000"),
        "printed_at": datetime(2026, 10, 17, 14, 33),
    }
    base.update(overrides)
    return KitchenTicketData(**base)


def _text(raw: bytes) -> str:
    return raw.decode("cp866")


def _window(raw: bytes, needle: str, size: int = 16) -> bytes:
    """Байты непосредственно перед вхождением needle (там префикс стиля)."""
    idx = raw.find(needle.encode("cp866"))
    assert idx >= 0, f"не найдено: {needle!r}"
    return raw[max(0, idx - size):idx]


# --- Чек клиента: bottomOrderNumber -----------------------------------------

def test_bottom_order_number_prints_by_default():
    raw = _text(EscPosFormatter().format_receipt(_receipt()))
    lines = raw.splitlines()
    caption = next((i for i, ln in enumerate(lines) if "НОМЕР ЗАКАЗА" in ln), None)
    assert caption is not None, "блок bottomOrderNumber не напечатан"
    assert lines[caption + 1].strip() == "3"


def test_bottom_order_number_honors_toggle():
    raw = _text(EscPosFormatter().format_receipt(
        _receipt(), template={"enabled": {"bottomOrderNumber": False}},
    ))
    assert "НОМЕР ЗАКАЗА" not in raw


def test_bottom_order_number_default_style_is_large_bold_center():
    raw = EscPosFormatter().format_receipt(
        _receipt(), template={"enabled": {"bottomOrderNumber": True}},
    )
    win = _window(raw, "НОМЕР ЗАКАЗА")
    assert DOUBLE_HEIGHT in win  # large
    assert BOLD_ON in win        # bold


def test_bottom_order_number_standard_style_has_no_size_code():
    raw = EscPosFormatter().format_receipt(
        _receipt(),
        template={
            "enabled": {"bottomOrderNumber": True},
            "blockStyles": {"bottomOrderNumber": {"size": "standard", "weight": "standard"}},
        },
    )
    win = _window(raw, "НОМЕР ЗАКАЗА")
    assert DOUBLE_HEIGHT not in win
    assert BOLD_ON not in win


# --- Чек клиента: total ------------------------------------------------------

def test_total_toggle_gates_payment_line_but_not_subtotal():
    off = _text(EscPosFormatter().format_receipt(
        _receipt(), template={"enabled": {"total": False}},
    ))
    assert "К ОПЛАТЕ" not in off
    assert "Итого:" in off  # сумма блюд печатается всегда (как в превью)
    on = _text(EscPosFormatter().format_receipt(
        _receipt(), template={"enabled": {"total": True}},
    ))
    assert "К ОПЛАТЕ" in on


# --- Чек клиента: стили table/waiter ----------------------------------------

def test_table_and_waiter_styles_apply_on_paper():
    raw = EscPosFormatter().format_receipt(
        _receipt(table_number="7", waiter_name="Aziz"),
        template={
            "enabled": {"table": True, "waiter": True},
            "blockStyles": {
                "table": {"size": "large", "weight": "bold"},
                "waiter": {"size": "large", "weight": "bold"},
            },
        },
    )
    assert DOUBLE_HEIGHT in _window(raw, "Стол: 7", 12)
    assert BOLD_ON in _window(raw, "Стол: 7", 12)
    assert DOUBLE_HEIGHT in _window(raw, "Официант: Aziz", 12)


# --- Кухонный тикет: тогглы date/orderType -----------------------------------

def test_kitchen_date_off_hides_time_only():
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"date": False}},
    ))
    assert "14:33" not in raw
    assert "НА СТОЛ" in raw


def test_kitchen_order_type_off_hides_type_only():
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"orderType": False}},
    ))
    assert "НА СТОЛ" not in raw
    assert "14:33" in raw


def test_kitchen_type_and_time_print_on_separate_lines():
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"date": True, "orderType": True}},
    ))
    lines = raw.splitlines()
    assert any("НА СТОЛ" in ln for ln in lines)
    assert any("14:33" in ln for ln in lines)
    assert not any("НА СТОЛ" in ln and "14:33" in ln for ln in lines)


def test_kitchen_legacy_created_at_fallback():
    """Старый шаблон (только legacy createdAt): поведение прежнее —
    createdAt выкл прячет время, тип заказа печатается."""
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"createdAt": False}},
    ))
    assert "14:33" not in raw
    assert "НА СТОЛ" in raw


# --- Кухонный тикет: comment против legacy-ключей ----------------------------

def test_kitchen_comment_toggle_hides_item_and_order_notes():
    off = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"comment": False}},
    ))
    assert "Без острого" not in off
    assert "КОММЕНТАРИЙ" not in off
    on = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"comment": True}},
    ))
    assert "Без острого" in on
    assert "Поспешить" in on


def test_kitchen_legacy_item_and_order_note_keys_still_work():
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"itemComments": False, "orderNote": False}},
    ))
    assert "Без острого" not in raw
    assert "КОММЕНТАРИЙ" not in raw


def test_kitchen_comment_key_wins_over_legacy_keys():
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(),
        template={"enabled": {"comment": False, "itemComments": True, "orderNote": True}},
    ))
    assert "Без острого" not in raw
    assert "КОММЕНТАРИЙ" not in raw


# --- Кухонный тикет: стили шефа ----------------------------------------------

def test_chef_order_number_default_style_is_large_bold():
    raw = EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {}},
    )
    win = _window(raw, "ЗАКАЗ #A-1042", 12)
    assert DOUBLE_HEIGHT in win
    assert BOLD_ON in win


def test_chef_order_number_standard_style_overrides_default():
    raw = EscPosFormatter().format_kitchen_ticket(
        _ticket(),
        template={
            "enabled": {},
            "blockStyles": {"orderNumber": {"size": "standard", "weight": "standard"}},
        },
    )
    win = _window(raw, "ЗАКАЗ #A-1042", 12)
    assert DOUBLE_HEIGHT not in win
    assert BOLD_ON not in win


def test_chef_show_order_sum_total_line_uses_style():
    raw = EscPosFormatter().format_kitchen_ticket(
        _ticket(),
        template={
            "enabled": {"showOrderSum": True},
            "blockStyles": {"showOrderSum": {"size": "large"}},
        },
    )
    assert DOUBLE_HEIGHT in _window(raw, "Сумма блюд", 12)
