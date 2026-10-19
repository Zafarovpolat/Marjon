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
Revises: mg02merge
Create Date: 2026-10-19

Примечание при мердже: в ветке toast ревизия висела на `mg01merge`, но после
мерджа main ← prod-current единственная голова — `mg02merge` (слияние
mg01merge + tsdef01). Ревизия новая, ни на одном стенде не применялась,
поэтому перевешена на текущую голову: иначе граф получал вторую голову и
`alembic upgrade head` падал бы с «Multiple head revisions».

Upgrade идемпотентен (тот же приём, что в att01status/br01login): на базах,
собранных через metadata.create_all, колонки уже есть, а ревизия не отмечена.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "pwlock01"
down_revision: Union[str, Sequence[str], None] = "mg02merge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    bind = op.get_bind()
    return {col["name"] for col in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    user_columns = _existing_columns("users")
    if "password_failed_attempts" not in user_columns:
        op.add_column(
            "users",
            sa.Column("password_failed_attempts", sa.Integer(), nullable=False, server_default="0"),
        )
    if "password_locked_until" not in user_columns:
        op.add_column(
            "users",
            sa.Column("password_locked_until", sa.DateTime(timezone=True), nullable=True),
        )
    branch_columns = _existing_columns("branches")
    if "password_failed_attempts" not in branch_columns:
        op.add_column(
            "branches",
            sa.Column("password_failed_attempts", sa.Integer(), nullable=False, server_default="0"),
        )
    if "password_locked_until" not in branch_columns:
        op.add_column(
            "branches",
            sa.Column("password_locked_until", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    # Счётчики не несут данных, которые нельзя потерять, но и снимать их
    # автоматически не нужно: откат ревизии не должен ломать модель, которая
    # уже на них ссылается.
    pass
