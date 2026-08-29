"""Align stock-flow and modifier-group nullability safely.

Revision ID: bi02stk05
Revises: bi02inv04
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02stk05"
down_revision: Union[str, None] = "bi02inv04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("stock_movements", "company_id"),
    ("stock_movements", "warehouse_id"),
    ("stock_movements", "ingredient_id"),
    ("stock_movements", "unit"),
    ("stock_movements", "cost_price"),
    ("stock_movements", "total_cost"),
    ("stock_movements", "created_at"),
    ("stock_movements", "updated_at"),
    ("modifier_groups", "company_id"),
    ("modifier_groups", "product_id"),
    ("modifier_groups", "min_select"),
    ("modifier_groups", "max_select"),
    ("modifier_groups", "is_required"),
    ("modifier_groups", "sort_order"),
    ("modifier_groups", "created_at"),
    ("modifier_groups", "updated_at"),
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
            "BI-02 stock-flow/modifier-group NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
