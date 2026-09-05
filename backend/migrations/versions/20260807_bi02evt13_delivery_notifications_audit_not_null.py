"""Align delivery-order, notification, and audit nullability safely.

Revision ID: bi02evt13
Revises: bi02dlv12
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02evt13"
down_revision: Union[str, None] = "bi02dlv12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("delivery_orders", "company_id"),
    ("delivery_orders", "order_id"),
    ("delivery_orders", "status"),
    ("delivery_orders", "delivery_fee"),
    ("delivery_orders", "created_at"),
    ("delivery_orders", "updated_at"),
    ("notifications", "company_id"),
    ("notifications", "user_id"),
    ("notifications", "channel"),
    ("notifications", "status"),
    ("notifications", "data"),
    ("notifications", "created_at"),
    ("notifications", "updated_at"),
    ("audit_logs", "company_id"),
    ("audit_logs", "created_at"),
    ("audit_logs", "updated_at"),
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
            "BI-02 delivery/notification/audit NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
