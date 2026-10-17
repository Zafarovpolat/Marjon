"""V37 — warehouse active/archive status.

Adds warehouses.is_active (NOT NULL, default TRUE): existing rows read
back as active, new rows are active unless created otherwise. Powers the
Active/Archived tabs and the status toggle of the owner stock screen;
deletion of a referenced warehouse stays 409-guarded, archive is the
soft path. Downgrade drops the column (status only — names, stock and
documents untouched).

Revision ID: v37wh01
Revises: v36rec01
Create Date: 2026-10-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v37wh01"
down_revision: Union[str, None] = "v36rec01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "is_active" not in _columns("warehouses"):
        op.add_column(
            "warehouses",
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        )


def downgrade() -> None:
    if "is_active" in _columns("warehouses"):
        op.drop_column("warehouses", "is_active")
