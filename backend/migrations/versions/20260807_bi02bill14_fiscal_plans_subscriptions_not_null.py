"""Align fiscal, plan, and subscription nullability safely.

Revision ID: bi02bill14
Revises: bi02evt13
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02bill14"
down_revision: Union[str, None] = "bi02evt13"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("fiscal_receipts", "company_id"),
    ("fiscal_receipts", "order_id"),
    ("fiscal_receipts", "payment_id"),
    ("fiscal_receipts", "status"),
    ("fiscal_receipts", "provider"),
    ("fiscal_receipts", "created_at"),
    ("fiscal_receipts", "updated_at"),
    ("plans", "features"),
    ("plans", "is_active"),
    ("plans", "created_at"),
    ("plans", "updated_at"),
    ("subscriptions", "company_id"),
    ("subscriptions", "plan_id"),
    ("subscriptions", "status"),
    ("subscriptions", "billing_cycle"),
    ("subscriptions", "created_at"),
    ("subscriptions", "updated_at"),
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
            "BI-02 fiscal/plan/subscription NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
