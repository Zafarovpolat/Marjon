"""Align catalog nullability safely.

Revision ID: bi02cat03
Revises: bi02org02
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02cat03"
down_revision: Union[str, None] = "bi02org02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("categories", "sort_order"),
    ("categories", "is_active"),
    ("categories", "created_at"),
    ("categories", "updated_at"),
    ("products", "tax_rate"),
    ("products", "unit"),
    ("products", "sort_order"),
    ("products", "is_active"),
    ("products", "is_available"),
    ("products", "created_at"),
    ("products", "updated_at"),
    ("product_branch", "product_id"),
    ("product_branch", "branch_id"),
    ("product_branch", "is_available"),
    ("product_branch", "stop_list"),
    ("product_branch", "created_at"),
    ("product_branch", "updated_at"),
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
            "BI-02 catalog NOT NULL preflight failed: " + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
