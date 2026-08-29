"""Align core inventory nullability safely.

Revision ID: bi02inv04
Revises: bi02cat03
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02inv04"
down_revision: Union[str, None] = "bi02cat03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("ingredients", "company_id"),
    ("ingredients", "unit"),
    ("ingredients", "is_active"),
    ("ingredients", "created_at"),
    ("ingredients", "updated_at"),
    ("warehouses", "company_id"),
    ("warehouses", "is_main"),
    ("warehouses", "created_at"),
    ("warehouses", "updated_at"),
    ("stock_items", "company_id"),
    ("stock_items", "warehouse_id"),
    ("stock_items", "ingredient_id"),
    ("stock_items", "quantity"),
    ("stock_items", "unit"),
    ("stock_items", "min_quantity"),
    ("stock_items", "cost_price"),
    ("stock_items", "created_at"),
    ("stock_items", "updated_at"),
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
            "BI-02 core inventory NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
