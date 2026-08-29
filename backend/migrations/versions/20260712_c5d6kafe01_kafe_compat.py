"""kafe_compat: user pin_code + support_tickets

Revision ID: c5d6kafe01
Revises: b4c5hall0
Create Date: 2026-07-12
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "c5d6kafe01"
down_revision: Union[str, None] = "b4c5hall0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PIN для быстрого входа сотрудников (ТЗ §3.2)
    op.add_column("users", sa.Column("pin_code", sa.String(8), nullable=True))

    # Тикеты поддержки из плавающего виджета (ТЗ Web §3.14)
    op.create_table(
        "support_tickets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("country", sa.String(8), nullable=True),
        sa.Column("message", sa.Text(), server_default="", nullable=False),
        sa.Column("status", sa.String(20), server_default="new", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("support_tickets")
    op.drop_column("users", "pin_code")
