"""branches: login + password_hash (вход «как филиал» с начального экрана)

Модель Branch (app/modules/companies/models.py) имеет колонки login/password_hash,
но ни одна существующая миграция их не создаёт: локально база собиралась через
metadata.create_all, а в CI (alembic upgrade head на чистом Postgres) сидеры
падали с UndefinedColumnError: column branches.login does not exist.

Revision ID: br01login
Revises: 0c16e3a26191
Create Date: 2026-10-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "br01login"
down_revision: Union[str, None] = "0c16e3a26191"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns() -> set[str]:
    bind = op.get_bind()
    return {col["name"] for col in sa.inspect(bind).get_columns("branches")}


def _existing_indexes() -> set[str]:
    bind = op.get_bind()
    return {idx["name"] for idx in sa.inspect(bind).get_indexes("branches")}


def upgrade() -> None:
    # Идемпотентно, как att01status: на базах, собранных через
    # metadata.create_all, колонки и индекс уже есть, а ревизия не отмечена —
    # без проверки upgrade падал бы на DuplicateColumn. На чистом Postgres
    # (CI) ветка «всё создать» отрабатывает как раньше.
    existing = _existing_columns()
    if "login" not in existing:
        op.add_column("branches", sa.Column("login", sa.String(150), nullable=True))
    if "ix_branches_login" not in _existing_indexes():
        # unique=True + index=True в модели даёт один уникальный индекс
        # (та же схема, что ix_users_username в a1f2admin01).
        op.create_index("ix_branches_login", "branches", ["login"], unique=True)
    if "password_hash" not in existing:
        op.add_column("branches", sa.Column("password_hash", sa.String(255), nullable=True))


def downgrade() -> None:
    existing = _existing_columns()
    if "password_hash" in existing:
        op.drop_column("branches", "password_hash")
    if "ix_branches_login" in _existing_indexes():
        op.drop_index("ix_branches_login", table_name="branches")
    if "login" in existing:
        op.drop_column("branches", "login")
