"""Add performance indexes on orders table

Revision ID: e9f0idx01
Revises: c5d6kafe01
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op

revision: str = "e9f0idx01"
down_revision: Union[str, None] = "c5d6kafe01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Frequently filtered column — every status-based query benefits
    op.create_index(
        "ix_orders_status",
        "orders",
        ["status"],
        if_not_exists=True,
    )

    # New filter added for table-occupancy endpoint (?table_number=)
    op.create_index(
        "ix_orders_table_number",
        "orders",
        ["table_number"],
        if_not_exists=True,
    )

    # Composite for branch + date range scans (the most common dashboard query)
    op.create_index(
        "ix_orders_branch_created",
        "orders",
        ["branch_id", "created_at"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_orders_branch_created", table_name="orders")
    op.drop_index("ix_orders_table_number",   table_name="orders")
    op.drop_index("ix_orders_status",          table_name="orders")
