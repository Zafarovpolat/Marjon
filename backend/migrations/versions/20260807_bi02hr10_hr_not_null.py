"""Align employee, work-shift, and attendance nullability safely.

Revision ID: bi02hr10
Revises: bi02prt09
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02hr10"
down_revision: Union[str, None] = "bi02prt09"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("employees", "company_id"),
    ("employees", "user_id"),
    ("employees", "branch_id"),
    ("employees", "salary_type"),
    ("employees", "salary_amount"),
    ("employees", "created_at"),
    ("employees", "updated_at"),
    ("work_shifts", "company_id"),
    ("work_shifts", "branch_id"),
    ("work_shifts", "employee_id"),
    ("work_shifts", "status"),
    ("work_shifts", "created_at"),
    ("work_shifts", "updated_at"),
    ("attendance_logs", "company_id"),
    ("attendance_logs", "employee_id"),
    ("attendance_logs", "shift_id"),
    ("attendance_logs", "method"),
    ("attendance_logs", "created_at"),
    ("attendance_logs", "updated_at"),
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
            "BI-02 HR NOT NULL preflight failed: " + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
