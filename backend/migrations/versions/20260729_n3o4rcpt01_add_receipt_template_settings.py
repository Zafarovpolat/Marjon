"""Add receipt_template_settings table

Backs GET/PATCH /settings/receipt-template and /settings/kitchen-receipt-template
(app/modules/kafe_compat/router.py), one row per company holding the customer
and kitchen receipt templates the frontend editor (ReceiptSettingsPage,
ChefReceiptSettingsPage) saves — consumed by EscPosFormatter at print time.

Revision ID: n3o4rcpt01
Revises: x1y2dishlimit05
Create Date: 2026-07-29

Note: this revision opens the upstream lineage in the merged history — it is
chained onto x1y2dishlimit05, the last revision of the desktop/PIN lineage, so
the graph stays linear with a single head (bi06tnu03). The table itself is
self-contained (only FKs to companies.id), so the position is free to choose.
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.types import Uuid

revision: str = "n3o4rcpt01"
down_revision: Union[str, None] = "x1y2dishlimit05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "receipt_template_settings",
        sa.Column("id", Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("customer_template", sa.JSON(), nullable=False),
        sa.Column("kitchen_template", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("receipt_template_settings")
