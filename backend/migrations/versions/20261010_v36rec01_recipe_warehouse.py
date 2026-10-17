"""V36 — per-line recipe warehouse for targeted sales deduction.

Adds product_ingredients.warehouse_id (nullable UUID → warehouses.id,
ON DELETE SET NULL): a recipe line may pin the warehouse its ingredient
is deducted from on every completed order. NULL keeps the historical
behavior — deduction from the company main warehouse (see
StockService.deduct_for_order).

Existing lines stay NULL, so no backfill and no behavior change until a
line is explicitly re-saved with a warehouse. Downgrade drops the column
(warehouse pins only; quantities untouched — documented, not silent).

Revision ID: v36rec01
Revises: v35hist01
Create Date: 2026-10-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v36rec01"
down_revision: Union[str, None] = "v35hist01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "warehouse_id" not in _columns("product_ingredients"):
        op.add_column(
            "product_ingredients",
            sa.Column("warehouse_id", sa.Uuid(), nullable=True),
        )
        op.create_foreign_key(
            "fk_product_ingredients_warehouse_id",
            "product_ingredients",
            "warehouses",
            ["warehouse_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()
    existing_fks = {
        fk["name"] for fk in sa.inspect(bind).get_foreign_keys("product_ingredients")
    }
    if "fk_product_ingredients_warehouse_id" in existing_fks:
        op.drop_constraint(
            "fk_product_ingredients_warehouse_id", "product_ingredients", type_="foreignkey"
        )
    if "warehouse_id" in _columns("product_ingredients"):
        op.drop_column("product_ingredients", "warehouse_id")
