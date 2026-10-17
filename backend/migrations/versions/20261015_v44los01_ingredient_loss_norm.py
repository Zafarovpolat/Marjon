"""V44 — норма естественной потери ингредиента для отчётного авто-отхода.

Adds ingredients.loss_type ('percent' | 'amount', nullable) and
ingredients.loss_value (nullable numeric). Both nullable → existing rows
need no backfill: NULL = норма не задана, авто-отход не считается.
Idempotent like sibling migrations.

Revision ID: v44los01
Revises: v43inv02
Create Date: 2026-10-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v44los01"
down_revision: Union[str, None] = "v43inv02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    columns = _columns("ingredients")
    if "loss_type" not in columns:
        op.add_column(
            "ingredients",
            sa.Column("loss_type", sa.String(16), nullable=True),
        )
    if "loss_value" not in columns:
        op.add_column(
            "ingredients",
            sa.Column("loss_value", sa.Numeric(15, 4), nullable=True),
        )


def downgrade() -> None:
    columns = _columns("ingredients")
    if "loss_value" in columns:
        op.drop_column("ingredients", "loss_value")
    if "loss_type" in columns:
        op.drop_column("ingredients", "loss_type")
