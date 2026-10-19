"""password login lockout counters

PWD-LOCK-01: per-account throttling for password logins. PIN login already had
pin_failed_attempts/pin_locked_until; password login had nothing but the
per-IP rate limit (10/minute), which is not enough now that passwords can be
as short as 4 characters (PWD-POLICY-01) — 10 000 combinations for an
all-digit password.

`users` covers /auth/login, /auth/admin/login and /auth/monoblock-login.
`branches` covers /auth/branch-login: the branch password lives on the branch
row, not on a user, so it needs its own counters.

Revision ID: pwlock01
Revises: mg01merge
Create Date: 2026-10-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "pwlock01"
down_revision: Union[str, Sequence[str], None] = "mg01merge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("password_failed_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("password_locked_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "branches",
        sa.Column("password_failed_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "branches",
        sa.Column("password_locked_until", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("branches", "password_locked_until")
    op.drop_column("branches", "password_failed_attempts")
    op.drop_column("users", "password_locked_until")
    op.drop_column("users", "password_failed_attempts")
