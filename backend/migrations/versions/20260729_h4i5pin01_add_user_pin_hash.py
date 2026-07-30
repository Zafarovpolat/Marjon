"""Add pin_hash to users table

Revision ID: h4i5pin01
Revises: g2h3usr01
Create Date: 2026-07-29
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "h4i5pin01"
down_revision: Union[str, None] = "g2h3usr01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pin_hash", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "pin_hash")
