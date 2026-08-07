"""add_cashier_shifts_table

Revision ID: b3f4shift01
Revises: whdoc001
Create Date: 2026-07-09
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.types import Uuid

revision: str = "b3f4shift01"
down_revision: Union[str, None] = "whdoc001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cashier_shifts",
        sa.Column("id", Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", Uuid(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("branch_id", Uuid(as_uuid=True), sa.ForeignKey("branches.id"), nullable=False, index=True),
        sa.Column("cashier_id", Uuid(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opening_cash", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("closing_cash", sa.Numeric(15, 2), nullable=True),
        sa.Column("status", sa.String(20), server_default="open", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("cashier_shifts")
