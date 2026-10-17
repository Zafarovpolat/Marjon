"""V47 — нормы остатка в карточке продукта.

Adds ingredients.avg_quantity (справочное среднее количество) and
ingredients.deficit_threshold (порог дефицита для колокольчика
уведомлений). Оба nullable — старые строки без норм работают как раньше.

Revision ID: v47avg01
Revises: v46fifo01
Create Date: 2026-10-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v47avg01"
down_revision: Union[str, None] = "v46fifo01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    cols = _columns("ingredients")
    if "avg_quantity" not in cols:
        op.add_column(
            "ingredients",
            sa.Column("avg_quantity", sa.Numeric(15, 4), nullable=True),
        )
    if "deficit_threshold" not in cols:
        op.add_column(
            "ingredients",
            sa.Column("deficit_threshold", sa.Numeric(15, 4), nullable=True),
        )


def downgrade() -> None:
    cols = _columns("ingredients")
    if "deficit_threshold" in cols:
        op.drop_column("ingredients", "deficit_threshold")
    if "avg_quantity" in cols:
        op.drop_column("ingredients", "avg_quantity")
