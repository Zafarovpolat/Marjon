"""Align order-item, cashier-shift, and payment nullability safely.

Revision ID: bi02pos08
Revises: bi02ord07
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02pos08"
down_revision: Union[str, None] = "bi02ord07"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("order_items", "order_id"),
    ("order_items", "product_id"),
    ("order_items", "discount"),
    ("order_items", "status"),
    ("order_items", "modifiers"),
    ("order_items", "course"),
    ("order_items", "created_at"),
    ("order_items", "updated_at"),
    ("cashier_shifts", "opening_cash"),
    ("cashier_shifts", "status"),
    ("cashier_shifts", "created_at"),
    ("cashier_shifts", "updated_at"),
    ("payments", "company_id"),
    ("payments", "order_id"),
    ("payments", "status"),
    ("payments", "provider_data"),
    ("payments", "created_at"),
    ("payments", "updated_at"),
)


def _columns_with_nulls() -> list[str]:
    bind = op.get_bind()
    failures: list[str] = []
    for table_name, column_name in _COLUMNS:
        count = bind.execute(
            sa.text(
                f'SELECT count(*) FROM "{table_name}" '
                f'WHERE "{column_name}" IS NULL'
            )
        ).scalar_one()
        if count:
            failures.append(f"{table_name}.{column_name} ({count} NULL rows)")
    return failures


def upgrade() -> None:
    failures = _columns_with_nulls()
    if failures:
        raise RuntimeError(
            "BI-02 order-item/shift/payment NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
