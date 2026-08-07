"""Align auth and RBAC nullability without inventing legacy data.

Revision ID: bi02auth01
Revises: z4a5ingr1
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02auth01"
down_revision: Union[str, None] = "z4a5ingr1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("users", "is_active"),
    ("users", "is_superadmin"),
    ("users", "created_at"),
    ("users", "updated_at"),
    ("refresh_tokens", "created_at"),
    ("refresh_tokens", "updated_at"),
    ("roles", "is_system"),
    ("roles", "created_at"),
    ("roles", "updated_at"),
    ("permissions", "created_at"),
    ("permissions", "updated_at"),
    ("role_permissions", "created_at"),
    ("role_permissions", "updated_at"),
    ("user_roles", "created_at"),
    ("user_roles", "updated_at"),
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
            "BI-02 auth/RBAC NOT NULL preflight failed: " + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
