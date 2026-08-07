"""Align customer and loyalty-account nullability safely.

Revision ID: bi02crm11
Revises: bi02hr10
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02crm11"
down_revision: Union[str, None] = "bi02hr10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("customers", "company_id"),
    ("customers", "source"),
    ("customers", "total_orders"),
    ("customers", "total_spent"),
    ("customers", "created_at"),
    ("customers", "updated_at"),
    ("customer_notes", "customer_id"),
    ("customer_notes", "author_id"),
    ("customer_notes", "created_at"),
    ("customer_notes", "updated_at"),
    ("loyalty_accounts", "company_id"),
    ("loyalty_accounts", "customer_id"),
    ("loyalty_accounts", "balance"),
    ("loyalty_accounts", "lifetime_points"),
    ("loyalty_accounts", "tier"),
    ("loyalty_accounts", "created_at"),
    ("loyalty_accounts", "updated_at"),
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
            "BI-02 CRM/loyalty NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
