"""V26 — canonical company flag for the global support floating button.

Adds companies.show_support_button (NOT NULL boolean, default true).
Existing companies backfill to true via server_default "1" (preserves current
behavior: the button is visible unless explicitly disabled).
Idempotent like sibling migrations.

Revision ID: v26sup01
Revises: v25cat01
Create Date: 2026-10-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v26sup01"
down_revision: Union[str, None] = "v25cat01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "show_support_button" not in _columns("companies"):
        op.add_column(
            "companies",
            sa.Column("show_support_button", sa.Boolean(), nullable=False, server_default="1"),
        )


def downgrade() -> None:
    if "show_support_button" in _columns("companies"):
        op.drop_column("companies", "show_support_button")
