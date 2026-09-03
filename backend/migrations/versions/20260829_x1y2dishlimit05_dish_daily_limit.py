"""Dish daily limit / auto stop-list (D3)

D3 «максимум блюда»: добавляем блюду дневной лимит порций и счётчик проданного.
При sold_count >= daily_limit блюдо авто-встаёт в стоп-лист (is_available=False).
Списание — при создании заказа/дозаказа; сброс счётчика — ручной (кассир/повар).
NULL daily_limit = без ограничения (текущее поведение сохраняется).

Revision ID: x1y2dishlimit05
Revises: w0x1attmark04
Create Date: 2026-08-29
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "x1y2dishlimit05"
down_revision: Union[str, None] = "w0x1attmark04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch-режим: на SQLite таблица пересоздаётся, на PostgreSQL — обычные ALTER.
    # sold_count с server_default "0" — чтобы существующие строки не были NULL.
    with op.batch_alter_table("products") as batch_op:
        batch_op.add_column(sa.Column("daily_limit", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("sold_count", sa.Integer(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("products") as batch_op:
        batch_op.drop_column("sold_count")
        batch_op.drop_column("daily_limit")
