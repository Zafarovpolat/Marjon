"""V42 — позиции инвентаризации и связанные документы корректировки.

Adds inventory_check_items (строка проверки: снапшот остатка stock_qty,
факт actual_qty, расхождение diff_qty = actual − stock, себестоимость) и
inventory_checks.purchase_doc_id / expense_doc_id (связанные документы:
излишки → приход, недостачи → расход, см. create_inventory_check).

Revision ID: v42inv01
Revises: v41pur01
Create Date: 2026-10-14
"""
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op


revision: str = "v42inv01"
down_revision: Union[str, None] = "v41pur01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if "inventory_check_items" not in _tables():
        op.create_table(
            "inventory_check_items",
            sa.Column("id", sa.Uuid(), primary_key=True, default=uuid4),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("check_id", sa.Uuid(), sa.ForeignKey("inventory_checks.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("ingredient_id", sa.Uuid(), sa.ForeignKey("ingredients.id"), nullable=True),
            sa.Column("product_id", sa.Uuid(), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
            sa.Column("name", sa.String(500), nullable=False),
            sa.Column("unit", sa.String(20), nullable=False, server_default="кг"),
            sa.Column("stock_qty", sa.Numeric(15, 4), nullable=False, server_default="0"),
            sa.Column("actual_qty", sa.Numeric(15, 4), nullable=False, server_default="0"),
            sa.Column("diff_qty", sa.Numeric(15, 4), nullable=False, server_default="0"),
            sa.Column("cost_price", sa.Numeric(15, 4), nullable=False, server_default="0"),
        )
    cols = _columns("inventory_checks")
    if "purchase_doc_id" not in cols:
        op.add_column("inventory_checks", sa.Column("purchase_doc_id", sa.Uuid(), nullable=True))
    if "expense_doc_id" not in cols:
        op.add_column("inventory_checks", sa.Column("expense_doc_id", sa.Uuid(), nullable=True))


def downgrade() -> None:
    if "inventory_check_items" in _tables():
        op.drop_table("inventory_check_items")
    cols = _columns("inventory_checks")
    if "purchase_doc_id" in cols:
        op.drop_column("inventory_checks", "purchase_doc_id")
    if "expense_doc_id" in cols:
        op.drop_column("inventory_checks", "expense_doc_id")
