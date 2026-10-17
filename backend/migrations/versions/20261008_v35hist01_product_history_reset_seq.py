"""V3.5 — Product history visibility checkpoint for independent resets.

Adds products.history_reset_seq (nullable integer, default NULL = never reset).
Visible history = last 2 top-ups with seq strictly greater than the checkpoint;
right after a reset the window is empty and the UI shows an explicit "0".

The append-only product_limit_topups rows are NEVER deleted by this migration
or by the reset operation itself: pre-reset events stay queryable, they just
leave the visible last-two window. Downgrade drops the column (checkpoint
state only; audit rows intact — documented, not silent).

Revision ID: v35hist01
Revises: v34stop01
Create Date: 2026-10-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v35hist01"
down_revision: Union[str, None] = "v34stop01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "history_reset_seq" not in _columns("products"):
        op.add_column(
            "products",
            sa.Column("history_reset_seq", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    if "history_reset_seq" in _columns("products"):
        op.drop_column("products", "history_reset_seq")
