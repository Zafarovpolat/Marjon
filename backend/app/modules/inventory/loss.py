"""Норма естественной потери ингредиента → отчётный авто-отход.

percent — % от списанного количества (10 → из 2 кг в отход 0.2 кг).
amount — единиц отхода на 1 ед. списания в тех же единицах
(0.3 → из 2 кг в отход 0.6 кг).

Результат — только для отчёта (подкатегория «Отход товаров»):
остаток не двигает, деньги не двигает. Чистая функция без БД —
покрыта unit-тестами без фикстур.
"""
from __future__ import annotations

from decimal import Decimal

LOSS_PERCENT = "percent"
LOSS_AMOUNT = "amount"

_QUANT = Decimal("0.0001")


def calc_waste_quantity(
    quantity: Decimal | float | int | str | None,
    loss_type: str | None,
    loss_value: Decimal | float | int | str | None,
) -> Decimal:
    """Сколько уйдёт в отход при списании quantity по норме (тип, значение)."""
    if quantity is None or loss_value is None:
        return Decimal("0")
    try:
        qty = Decimal(str(quantity))
        value = Decimal(str(loss_value))
    except Exception:
        return Decimal("0")
    if qty <= 0 or value <= 0:
        return Decimal("0")
    if loss_type == LOSS_PERCENT:
        return (qty * value / Decimal("100")).quantize(_QUANT)
    if loss_type == LOSS_AMOUNT:
        return (qty * value).quantize(_QUANT)
    return Decimal("0")


def loss_label(loss_type: str | None, loss_value: Decimal | None, unit: str | None = None) -> str:
    """Человекочитаемая норма для причины авто-документа."""
    if loss_type == LOSS_PERCENT:
        return f"{loss_value}%"
    if loss_type == LOSS_AMOUNT:
        suffix = f" на 1 {unit}" if unit else " на 1 ед."
        return f"{loss_value}{suffix}"
    return ""
