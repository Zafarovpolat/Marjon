"""branches: login + password_hash (вход «как филиал» с начального экрана)

Модель Branch (app/modules/companies/models.py) имеет колонки login/password_hash,
но ни одна существующая миграция их не создаёт: локально база собиралась через
metadata.create_all, а в CI (alembic upgrade head на чистом Postgres) сидеры
падали с UndefinedColumnError: column branches.login does not exist.

ВАЖНО (после мерджа main ← prod-current): в prod-линии ту же пару колонок уже
создаёт миграция `d7e8brnlog11` (20260925), и она — предок этой ревизии. Пока
ветки жили раздельно, дубликата не было; после мерджа на чистой базе alembic
проходит d7e8brnlog11, а затем эта миграция падала с

    asyncpg.exceptions.DuplicateColumnError: column "login" of relation "branches"
    already exists

Поэтому миграция сделана идемпотентной (тот же приём, что в att01status) и
приведена к фактической ширине из d7e8brnlog11 / модели — String(100), а не 150.
На базах, где колонки уже есть, она ничего не делает; на старых базах, где их
действительно нет, — создаёт.

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
    inspector = sa.inspect(op.get_bind())
    columns = {c["name"] for c in inspector.get_columns("branches")}
    if "login" not in columns:
        op.add_column("branches", sa.Column("login", sa.String(100), nullable=True))
    if "password_hash" not in columns:
        op.add_column("branches", sa.Column("password_hash", sa.String(255), nullable=True))
    # unique=True + index=True в модели даёт один уникальный индекс
    # (та же схема, что ix_users_username в a1f2admin01).
    indexes = {i["name"] for i in inspector.get_indexes("branches")}
    if "ix_branches_login" not in indexes:
        op.create_index("ix_branches_login", "branches", ["login"], unique=True)


def downgrade() -> None:
    # Намеренно no-op: колонки создаёт предок d7e8brnlog11, и откат этой ревизии
    # не должен сносить его схему. Если колонки создала именно она (база без
    # d7e8brnlog11), откат всё равно безопасен: данные в них не критичны, а
    # повторный upgrade вернёт колонки.
    pass
