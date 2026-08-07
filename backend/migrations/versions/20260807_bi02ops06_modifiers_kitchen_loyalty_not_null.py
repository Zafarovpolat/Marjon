"""Align modifier, kitchen, and loyalty-transaction nullability safely.

Revision ID: bi02ops06
Revises: bi02stk05
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02ops06"
down_revision: Union[str, None] = "bi02stk05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("modifiers", "group_id"),
    ("modifiers", "company_id"),
    ("modifiers", "price_delta"),
    ("modifiers", "is_default"),
    ("modifiers", "sort_order"),
    ("modifiers", "created_at"),
    ("modifiers", "updated_at"),
    ("kitchen_stations", "company_id"),
    ("kitchen_stations", "branch_id"),
    ("kitchen_stations", "category_ids"),
    ("kitchen_stations", "is_active"),
    ("kitchen_stations", "created_at"),
    ("kitchen_stations", "updated_at"),
    ("loyalty_transactions", "company_id"),
    ("loyalty_transactions", "account_id"),
    ("loyalty_transactions", "created_at"),
    ("loyalty_transactions", "updated_at"),
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
            "BI-02 modifier/kitchen/loyalty NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
