"""Add payment_gateway_settings table (per-company Payme/Click/Uzum credentials)

Revision ID: f1a2pay01
Revises: e9f0idx01
Create Date: 2026-07-20
"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "f1a2pay01"
down_revision: Union[str, None] = "e9f0idx01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payment_gateway_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False, index=True),

        sa.Column("payme_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("payme_merchant_id", sa.String(255), nullable=True),
        sa.Column("payme_key", sa.String(255), nullable=True),

        sa.Column("click_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("click_merchant_id", sa.String(64), nullable=True),
        sa.Column("click_service_id", sa.String(64), nullable=True),
        sa.Column("click_secret_key", sa.String(255), nullable=True),

        sa.Column("uzum_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("uzum_store_id", sa.String(255), nullable=True),
        sa.Column("uzum_key", sa.String(255), nullable=True),

        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),

        sa.UniqueConstraint("company_id", name="uq_payment_gateway_settings_company"),
    )


def downgrade() -> None:
    op.drop_table("payment_gateway_settings")
