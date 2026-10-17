"""V24 — Product AUTO/SET quick toggles for OWNER dishes table.

Adds products.is_auto / products.is_set (NOT NULL boolean, default false).
Existing products backfill to false via server_default "0" (same convention
as b5c6modpos09 show_in_pos "1"). Idempotent like sibling column-restore
migrations: a DB bootstrapped by create_tables.py already has the columns.

Revision ID: v24auto01
Revises: un02cmp01
Create Date: 2026-10-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v24auto01"
down_revision: Union[str, None] = "un02cmp01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    existing = _columns("products")
    if "is_auto" not in existing:
        op.add_column(
            "products",
            sa.Column("is_auto", sa.Boolean(), nullable=False, server_default="0"),
        )
    if "is_set" not in existing:
        op.add_column(
            "products",
            sa.Column("is_set", sa.Boolean(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    existing = _columns("products")
    if "is_set" in existing:
        op.drop_column("products", "is_set")
    if "is_auto" in existing:
        op.drop_column("products", "is_auto")
