"""Физический контракт блоков чека: тогглы enabled и стили blockStyles
на бумаге (ESC/POS) — гейт и стиль из шаблона обязаны менять вывод
форматтера (см. frontend receiptBlockCapabilities)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from app.modules.printers.formatter import EscPosFormatter, KitchenItem, KitchenTicketData, ReceiptData

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
    items = overrides.pop("items", None) or [
        KitchenItem(name="Плов", qty="2", total=Decimal("50000"),
                    note="Без острого", modifiers=["Без казы"], course=1),
    ]
    base = {
        "order_number": "A-1042",
        "order_type": "dine_in",
        "table_number": "12",
        "waiter_name": "Aziz",
        "items": items,
        "note": "Поспешить",
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
    # render_summary() gates "Сумма блюд" on data.subtotal > 0 — same as
    # ReceiptPreview.jsx's renderSummary() (totals.subtotal > 0) — so the
    # fixture needs a non-zero subtotal to actually exercise that line.
    off = _text(EscPosFormatter().format_receipt(
        _receipt(subtotal=Decimal("50000")), template={"enabled": {"total": False}},
    ))
    # Real label is "Итого к оплате:" (ReceiptPreview.jsx line 270) — not the
    # all-caps "К ОПЛАТЕ" this test originally checked for, which never
    # appears anywhere in the formatter's output.
    assert "Итого к оплате" not in off
    # Сумма блюд печатается всегда (как в превью) — ReceiptPreview.jsx's
    # own summaryRow("Сумма блюд", …), not "Итого:".
    assert "Сумма блюд" in off
    on = _text(EscPosFormatter().format_receipt(
        _receipt(subtotal=Decimal("50000")), template={"enabled": {"total": True}},
    ))
    assert "Итого к оплате" in on


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
    # Чек клиента печатает "Номер стола:" (ReceiptPreview.jsx's customer-block
    # infoRow label at line 284) — "Стол:" belongs to the separate kitchen-
    # ticket preview (line 457) and isn't what format_receipt renders. _two_col
    # right-pads the value to the full column width, so "Номер стола: 7" never
    # appears as a literal substring — only the label does, right after the
    # style prefix bytes _window captures.
    assert DOUBLE_HEIGHT in _window(raw, "Номер стола:", 12)
    assert BOLD_ON in _window(raw, "Номер стола:", 12)
    assert DOUBLE_HEIGHT in _window(raw, "Официант:", 12)


# --- Кухонный тикет: тогглы date/orderType -----------------------------------

def test_kitchen_date_off_hides_time_only():
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"date": False}},
    ))
    assert "14:33" not in raw
    assert "На стол" in raw


def test_kitchen_order_type_off_hides_type_only():
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"orderType": False}},
    ))
    assert "На стол" not in raw
    assert "14:33" in raw


def test_kitchen_type_and_time_print_on_separate_lines():
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"date": True, "orderType": True}},
    ))
    lines = raw.splitlines()
    assert any("На стол" in ln for ln in lines)
    assert any("14:33" in ln for ln in lines)
    assert not any("На стол" in ln and "14:33" in ln for ln in lines)


def test_kitchen_legacy_created_at_fallback():
    """Старый шаблон (только legacy createdAt): поведение прежнее —
    createdAt выкл прячет время, тип заказа печатается."""
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"createdAt": False}},
    ))
    assert "14:33" not in raw
    assert "На стол" in raw


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
    # render_number_block() prints a bare "#{order_number}" (ReceiptPreview.jsx
    # line 455: #{getOrderNumber(order)}), no "ЗАКАЗ" word.
    win = _window(raw, "#A-1042", 12)
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
    win = _window(raw, "#A-1042", 12)
    assert DOUBLE_HEIGHT not in win
    assert BOLD_ON not in win


def test_chef_show_order_sum_does_not_restore_retired_total_line():
    raw = EscPosFormatter().format_kitchen_ticket(
        _ticket(),
        template={
            "enabled": {"showOrderSum": True},
            "blockStyles": {"showOrderSum": {"size": "large"}},
        },
    )
    assert "Сумма" in _text(raw)
    assert "Сумма блюд" not in _text(raw)
