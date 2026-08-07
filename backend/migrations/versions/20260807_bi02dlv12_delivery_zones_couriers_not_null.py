"""Align delivery-zone and courier nullability safely.

Revision ID: bi02dlv12
Revises: bi02crm11
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02dlv12"
down_revision: Union[str, None] = "bi02crm11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("delivery_zones", "company_id"),
    ("delivery_zones", "branch_id"),
    ("delivery_zones", "polygon"),
    ("delivery_zones", "delivery_fee"),
    ("delivery_zones", "min_order"),
    ("delivery_zones", "estimated_minutes"),
    ("delivery_zones", "is_active"),
    ("delivery_zones", "created_at"),
    ("delivery_zones", "updated_at"),
    ("couriers", "company_id"),
    ("couriers", "user_id"),
    ("couriers", "vehicle_type"),
    ("couriers", "is_active"),
    ("couriers", "is_available"),
    ("couriers", "created_at"),
    ("couriers", "updated_at"),
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
            "BI-02 delivery-zone/courier NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
