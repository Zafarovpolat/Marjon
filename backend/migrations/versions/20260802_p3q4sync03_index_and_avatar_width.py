"""Согласовать схему с моделями: индекс attendance_logs.shift_id и ширина users.avatar_url

Revision ID: p3q4sync03
Revises: m1n2sync02
Create Date: 2026-08-02

Первый честный прогон `alembic check` на чистом Postgres показал 271
расхождение схемы с моделями. Эта миграция закрывает те из них, которые
безопасны на живых данных:

  • ix_attendance_logs_shift_id — модель объявляет индекс, в базе его нет.
    Создание индекса данные не трогает.
  • users.avatar_url — в модели String(512), а миграция g2h3usr01 создала
    VARCHAR(500). Расширение поля безопасно: существующие значения короче.

Остальные 266 расхождений — это NOT NULL: миграции создавали колонки без
флага, а модели считают их обязательными. Сюда они НЕ включены сознательно.
Приложение всегда пишет значения само, поэтому реального вреда нет, а вот
массовый ALTER ... SET NOT NULL на боевой базе может упасть на первой же
строке с NULL и оставить миграцию наполовину применённой. Это работа для
отдельного окна с бэкапом; перед ней нужно прогнать
backend/scripts/check_nulls.py, который покажет, есть ли вообще такие строки.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision: str = "p3q4sync03"
down_revision: str | None = "m1n2sync02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # if_not_exists — база могла быть создана из моделей через create_tables.py,
    # тогда индекс уже на месте (docker-entrypoint выбирает этот путь, если
    # alembic не смог применить миграции).
    op.create_index(
        "ix_attendance_logs_shift_id",
        "attendance_logs",
        ["shift_id"],
        if_not_exists=True,
    )
    op.alter_column(
        "users",
        "avatar_url",
        existing_type=sa.String(length=500),
        type_=sa.String(length=512),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "avatar_url",
        existing_type=sa.String(length=512),
        type_=sa.String(length=500),
        existing_nullable=True,
    )
    op.drop_index("ix_attendance_logs_shift_id", table_name="attendance_logs", if_exists=True)
