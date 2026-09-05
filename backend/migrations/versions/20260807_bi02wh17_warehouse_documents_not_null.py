"""Align remaining warehouse-document nullability safely.

Revision ID: bi02wh17
Revises: bi02pur16
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02wh17"
down_revision: Union[str, None] = "bi02pur16"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("transfer_documents", "items_count"),
    ("transfer_documents", "status"),
    ("transfer_documents", "created_at"),
    ("transfer_documents", "updated_at"),
    ("inventory_checks", "check_type"),
    ("inventory_checks", "status"),
    ("inventory_checks", "created_at"),
    ("inventory_checks", "updated_at"),
    ("write_off_documents", "items_count"),
    ("write_off_documents", "status"),
    ("write_off_documents", "created_at"),
    ("write_off_documents", "updated_at"),
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
            "BI-02 warehouse-document NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
