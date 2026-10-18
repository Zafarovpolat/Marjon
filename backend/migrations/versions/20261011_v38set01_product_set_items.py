"""V38 — set composition: dishes inside a dish (combo sets).

New table set_items: one row per dish inside a set product
(set_product_id → products.id). The component (product_id → products.id)
is itself a finished dish, NOT raw stock: quantity is portions per set,
price is the component price inside the set (line sum = qty × price).

Both FKs are ON DELETE CASCADE: deleting either side cleans the lines.
Downgrade drops the table (composition only; products untouched).

Revision ID: v38set01
Revises: v37wh01
Create Date: 2026-10-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v38set01"
down_revision: Union[str, None] = "v37wh01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "set_items",
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("set_product_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("price", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["set_product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_set_items_company_id", "set_items", ["company_id"])
    op.create_index("ix_set_items_set_product_id", "set_items", ["set_product_id"])
    op.create_index("ix_set_items_product_id", "set_items", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_set_items_product_id", table_name="set_items")
    op.drop_index("ix_set_items_set_product_id", table_name="set_items")
    op.drop_index("ix_set_items_company_id", table_name="set_items")
    op.drop_table("set_items")
