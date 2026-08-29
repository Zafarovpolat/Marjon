"""Add structured Hall price amount (halls.price_amount).

Phase 5C-2: the OWNER Settings → Место form offers "Доп. цена"
(Дополнительная цена → pricing_type=fixed, Цена за час → pricing_type=hourly)
with a real monetary amount. Until now that amount could only round-trip
through the free-text `halls.condition`, which is not a canonical price
contract. This adds a dedicated Numeric(15, 2) column following the Marjon
money convention (Decimal + Numeric(15, 2)).

Nullable on purpose: historical rows and legacy API clients keep the amount
only inside `condition`, and no value is ever parsed/backfilled out of that
free text — `price_amount` simply starts NULL. `condition` is retained as the
human-readable condition/note.

Revision ID: bi06hpa02
Revises: bi06tid01
Create Date: 2026-08-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi06hpa02"
down_revision: Union[str, None] = "bi06tid01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "halls"
_COLUMN = "price_amount"


def _require_postgresql() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("BI-06 halls.price_amount migration requires PostgreSQL")


def _column_exists() -> bool:
    return bool(
        op.get_bind().execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = :table
                      AND column_name = :column
                )
                """
            ),
            {"table": _TABLE, "column": _COLUMN},
        ).scalar()
    )


def upgrade() -> None:
    _require_postgresql()
    if not _column_exists():
        op.add_column(
            _TABLE,
            sa.Column(_COLUMN, sa.Numeric(15, 2), nullable=True),
        )
    # No backfill: halls.condition is human-written free text ("Цена за час:
    # 100 000 UZS", "10%", notes) with no guaranteed numeric form, so parsing it
    # could silently invent prices. Existing rows keep price_amount = NULL until
    # a place is re-saved through the settings form.


def downgrade() -> None:
    _require_postgresql()
    if _column_exists():
        op.drop_column(_TABLE, _COLUMN)
