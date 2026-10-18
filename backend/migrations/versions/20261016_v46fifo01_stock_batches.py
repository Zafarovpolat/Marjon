"""V46 — FIFO-партии склада (stock_batches).

Один приход = одна партия (qty_initial/remaining + цена).
Расход списывает старые партии первыми. Backfill: по одной партии
на каждый StockItem с qty > 0 (текущая себестоимость).

Revision ID: v46fifo01
Revises: v44los01
Create Date: 2026-10-16

Originally chained onto v45mrg01 — a no-op merge stub (v44los01 + the
old company-order-types line) dropped when merging feature/toast-
notifications the third time, for the same reason as the stubs before
it: both parents were already on one line by then, so the merge point
added nothing. Re-pointed directly onto v44los01.
"""
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "v46fifo01"
down_revision: Union[str, None] = "v44los01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if "stock_batches" not in _tables():
        op.create_table(
            "stock_batches",
            sa.Column("id", sa.Uuid(), primary_key=True, default=uuid4),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("warehouse_id", sa.Uuid(), sa.ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("ingredient_id", sa.Uuid(), sa.ForeignKey("ingredients.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("purchase_doc_id", sa.Uuid(), nullable=True),
            sa.Column("quantity_initial", sa.Numeric(15, 4), nullable=False, server_default="0"),
            sa.Column("quantity_remaining", sa.Numeric(15, 4), nullable=False, server_default="0"),
            sa.Column("cost_price", sa.Numeric(15, 4), nullable=False, server_default="0"),
            sa.Column("unit", sa.String(20), nullable=False, server_default="кг"),
        )
    # Backfill: один batch на остаток (идемпотентно — только если пусто).
    bind = op.get_bind()
    if "stock_batches" in _tables() and "stock_items" in _tables():
        count = bind.execute(sa.text("SELECT COUNT(*) FROM stock_batches")).scalar() or 0
        if count == 0:
            bind.execute(sa.text(
                """
                INSERT INTO stock_batches
                    (id, created_at, updated_at, company_id, warehouse_id,
                     ingredient_id, purchase_doc_id,
                     quantity_initial, quantity_remaining, cost_price, unit)
                SELECT gen_random_uuid(), NOW(), NOW(),
                    company_id, warehouse_id, ingredient_id, NULL,
                    quantity, quantity, cost_price, unit
                FROM stock_items
                WHERE quantity > 0
                """
            ))


def downgrade() -> None:
    if "stock_batches" in _tables():
        op.drop_table("stock_batches")
