"""DISHES-EXCEL: add order_items.cost_price_snapshot (sale-time COGS snapshot).

Additive, non-destructive: one NULLABLE monetary column on order_items,
frozen from Product.cost_price when an item is created. It is the only
historically-truthful cost source for the Dishes report — the current
Product.cost_price must NOT be applied to historical sales.

Legacy rows stay NULL (NO backfill): "cost unknown at sale time" is truthful,
and backfilling from the current product cost would fabricate history. NULL is
never coerced to 0 anywhere downstream.

Revision ID: bi08dcs01
Revises: bi07eml01
Create Date: 2026-09-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi08dcs01"
down_revision: Union[str, None] = "bi07eml01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _require_postgresql() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("DISHES-EXCEL cost snapshot migration requires PostgreSQL")


def _column_exists(table: str, column: str) -> bool:
    return bool(
        op.get_bind().execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = :table AND column_name = :column
                )
                """
            ),
            {"table": table, "column": column},
        ).scalar()
    )


def upgrade() -> None:
    _require_postgresql()
    # Nullable, no server_default → every existing row stays NULL (no backfill).
    if not _column_exists("order_items", "cost_price_snapshot"):
        op.add_column(
            "order_items",
            sa.Column("cost_price_snapshot", sa.Numeric(15, 2), nullable=True),
        )


def downgrade() -> None:
    _require_postgresql()
    if _column_exists("order_items", "cost_price_snapshot"):
        op.drop_column("order_items", "cost_price_snapshot")
