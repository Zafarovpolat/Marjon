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


def upgrade() -> None:
    op.add_column("branches", sa.Column("login", sa.String(150), nullable=True))
    # unique=True + index=True в модели даёт один уникальный индекс
    # (та же схема, что ix_users_username в a1f2admin01).
    op.create_index("ix_branches_login", "branches", ["login"], unique=True)
    op.add_column("branches", sa.Column("password_hash", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("branches", "password_hash")
    op.drop_index("ix_branches_login", table_name="branches")
    op.drop_column("branches", "login")
