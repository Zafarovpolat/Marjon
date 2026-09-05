"""Align company, branch, and terminal nullability safely.

Revision ID: bi02org02
Revises: bi02auth01
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02org02"
down_revision: Union[str, None] = "bi02auth01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("companies", "timezone"),
    ("companies", "currency"),
    ("companies", "is_active"),
    ("companies", "created_at"),
    ("companies", "updated_at"),
    ("branches", "is_active"),
    ("branches", "created_at"),
    ("branches", "updated_at"),
    ("pos_terminals", "company_id"),
    ("pos_terminals", "branch_id"),
    ("pos_terminals", "is_active"),
    ("pos_terminals", "created_at"),
    ("pos_terminals", "updated_at"),
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
            "BI-02 company/branch/terminal NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
