"""Align invoice, receipt-setting, and support-ticket nullability safely.

Revision ID: bi02svc15
Revises: bi02bill14
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02svc15"
down_revision: Union[str, None] = "bi02bill14"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("invoices", "company_id"),
    ("invoices", "subscription_id"),
    ("invoices", "currency"),
    ("invoices", "status"),
    ("invoices", "created_at"),
    ("invoices", "updated_at"),
    ("receipt_template_settings", "created_at"),
    ("receipt_template_settings", "updated_at"),
    ("support_tickets", "message"),
    ("support_tickets", "status"),
    ("support_tickets", "created_at"),
    ("support_tickets", "updated_at"),
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
            "BI-02 invoice/receipt/support NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
