"""V25 — canonical dish-category flags for the OWNER category UI.

Adds categories.calculate_service / categories.show_in_menu (NOT NULL boolean,
default false). Existing categories backfill to false via server_default "0"
(conservative: no fake ON state). Idempotent like sibling migrations: a DB
bootstrapped by create_tables.py already has the columns.

Originally chained onto "v24auto01", which referenced a product-flags
migration that was never actually committed anywhere in this repo's history —
re-pointed onto 0c16e3a26191 (the nearest real ancestor) when merging
feature/toast-notifications, so the graph stays single-headed.

Revision ID: v25cat01
Revises: 0c16e3a26191
Create Date: 2026-10-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v25cat01"
down_revision: Union[str, None] = "0c16e3a26191"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    existing = _columns("categories")
    if "calculate_service" not in existing:
        op.add_column(
            "categories",
            sa.Column("calculate_service", sa.Boolean(), nullable=False, server_default="0"),
        )
    if "show_in_menu" not in existing:
        op.add_column(
            "categories",
            sa.Column("show_in_menu", sa.Boolean(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    existing = _columns("categories")
    if "show_in_menu" in existing:
        op.drop_column("categories", "show_in_menu")
    if "calculate_service" in existing:
        op.drop_column("categories", "calculate_service")
