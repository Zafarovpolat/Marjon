"""Align printer and print-job nullability safely.

Revision ID: bi02prt09
Revises: bi02pos08
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02prt09"
down_revision: Union[str, None] = "bi02pos08"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("printers", "company_id"),
    ("printers", "branch_id"),
    ("printers", "connection_type"),
    ("printers", "port"),
    ("printers", "paper_width"),
    ("printers", "is_active"),
    ("printers", "settings"),
    ("printers", "created_at"),
    ("printers", "updated_at"),
    ("print_jobs", "company_id"),
    ("print_jobs", "printer_id"),
    ("print_jobs", "status"),
    ("print_jobs", "copies"),
    ("print_jobs", "created_at"),
    ("print_jobs", "updated_at"),
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
            "BI-02 printing NOT NULL preflight failed: " + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
