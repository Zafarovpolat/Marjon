from __future__ import annotations

from decimal import Decimal

from app.modules.printers.formatter import EscPosFormatter, KitchenTicketData


def _ticket(**overrides):
    base = {
        "order_number": "A-1042",
        "order_type": "dine_in",
        "table_number": "12",
        "waiter_name": "Aziz",
        "items": [
            {"name": "Плов чайханский", "qty": "2", "price": "25000", "total": "50000",
             "note": "", "modifiers": ["Без казы"], "course": 1},
            {"name": "Салат Ачичук", "qty": "1", "price": "15000", "total": "15000",
             "note": "", "modifiers": [], "course": 1},
        ],
        "note": None,
        "subtotal": Decimal("65000"),
    }
    base.update(overrides)
    return KitchenTicketData(**base)


def _text(raw: bytes) -> str:
    return raw.decode("cp866")


def test_kitchen_ticket_defaults_to_table_without_money():
    """Старые шаблоны без ключа showOrderSum: та же таблица, но без денег.
    Кол-во — в правом краю, цифры строго по центру шапки."""
    raw = _text(EscPosFormatter().format_kitchen_ticket(_ticket(), template={"enabled": {}}))
    assert "Блюдо" in raw
    assert " Кол-во " in raw
    assert "Плов чайханский" in raw
    assert "   2    " in raw
    assert "Сумма блюд" not in raw
    assert "50,000" not in raw
    assert "x2  " not in raw


def test_kitchen_ticket_without_template_has_table_without_money():
    raw = _text(EscPosFormatter().format_kitchen_ticket(_ticket(), template=None))
    assert "Блюдо" in raw
    assert "Сумма блюд" not in raw


def test_kitchen_ticket_sums_table_when_enabled():
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"showOrderSum": True}},
    ))
    assert "Блюдо" in raw
    assert "Кол-во" in raw
    assert "Сумма" in raw
    assert "Плов чайханский" in raw
    assert "50,000" in raw
    assert "15,000" in raw
    # Цифры строго по центру шапки: то же 6-знаковое поле, что у "Кол-во".
    assert "  2   " in raw
    assert "Сумма блюд" in raw
    assert "65,000" in raw
    # Над итогом — одиночный пунктир во всю ширину.
    lines = [ln for ln in raw.splitlines() if ln.strip()]
    idx = next(i for i, ln in enumerate(lines) if "Сумма блюд" in ln)
    assert set(lines[idx - 1].strip()) == {"-"}
    # Табличный режим заменяет строки xN, модификаторы остаются.
    assert "x2  " not in raw
    assert "Без казы" in raw


def test_kitchen_ticket_explicit_off_keeps_table_without_money():
    raw = _text(EscPosFormatter().format_kitchen_ticket(
        _ticket(), template={"enabled": {"showOrderSum": False}},
    ))
    assert "Блюдо" in raw
    assert " Кол-во " in raw
    assert "Плов чайханский" in raw
    assert "   2    " in raw
    assert "Сумма блюд" not in raw
    assert "50,000" not in raw
    assert "x2  " not in raw
