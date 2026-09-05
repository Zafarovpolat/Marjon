"""Align order nullability safely.

Revision ID: bi02ord07
Revises: bi02ops06
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02ord07"
down_revision: Union[str, None] = "bi02ops06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("orders", "company_id"),
    ("orders", "branch_id"),
    ("orders", "order_type"),
    ("orders", "status"),
    ("orders", "persons_count"),
    ("orders", "subtotal"),
    ("orders", "discount_amount"),
    ("orders", "tax_amount"),
    ("orders", "service_fee"),
    ("orders", "total_amount"),
    ("orders", "source"),
    ("orders", "created_at"),
    ("orders", "updated_at"),
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
            "BI-02 orders NOT NULL preflight failed: " + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
