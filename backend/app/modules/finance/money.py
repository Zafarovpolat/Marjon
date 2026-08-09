from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from app.shared.exceptions import ValidationError


MONEY_SCALE = Decimal("0.01")
NUMERIC_16_2_MAX = Decimal("99999999999999.99")


def _canonical_money_amount(value: Any, *, absolute: bool) -> Decimal:
    """Normalize a signed or absolute value as PostgreSQL NUMERIC(16, 2)."""

    if value is None:
        value = 0
    if isinstance(value, bool):
        raise ValidationError("Amount must be a finite decimal number")
    try:
        amount = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError("Amount must be a finite decimal number")
    if not amount.is_finite():
        raise ValidationError("Amount must be a finite decimal number")
    if absolute:
        amount = abs(amount)
    try:
        amount = amount.quantize(MONEY_SCALE, rounding=ROUND_HALF_UP)
    except InvalidOperation:
        raise ValidationError("Amount exceeds NUMERIC(16,2) range")
    if amount.is_zero():
        amount = abs(amount)
    if abs(amount) > NUMERIC_16_2_MAX:
        raise ValidationError("Amount exceeds NUMERIC(16,2) range")
    return amount


def canonical_money_amount(value: Any) -> Decimal:
    """Normalize a finance compatibility amount as NUMERIC(16, 2).

    PostgreSQL rounds positive NUMERIC values at half away from zero. Finance
    compatibility amounts are historically absolute, so ROUND_HALF_UP mirrors
    the existing database behavior without routing a value through binary
    floating point.
    """

    return _canonical_money_amount(value, absolute=True)


def canonical_money_string(value: Any) -> str:
    """Canonicalize a signed Decimal for V2 request fingerprints."""

    return format(_canonical_money_amount(value, absolute=False), ".2f")
