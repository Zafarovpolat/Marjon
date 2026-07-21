"""Add avatar_url to users table

Revision ID: g2h3usr01
Revises: f1a2pay01
Create Date: 2026-07-20
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "g2h3usr01"
down_revision: Union[str, None] = "f1a2pay01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
