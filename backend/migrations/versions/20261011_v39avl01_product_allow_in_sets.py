"""V39 — Product availability-for-sets toggle (OWNER dishes table).

Adds products.allow_in_sets (NOT NULL boolean, default false): the СЕТ
column switch marks a dish as offered inside set-composition dialogs.
Existing products backfill to false via server_default "0" (same convention
as V24 is_auto/is_set). It drives ONLY the Товар filter of the set panel —
is_set (the row's nature) is untouched.

Revision ID: v39avl01
Revises: v38set01
Create Date: 2026-10-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v39avl01"
down_revision: Union[str, None] = "v38set01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    existing = _columns("products")
    if "allow_in_sets" not in existing:
        op.add_column(
            "products",
            sa.Column("allow_in_sets", sa.Boolean(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    existing = _columns("products")
    if "allow_in_sets" in existing:
        op.drop_column("products", "allow_in_sets")
