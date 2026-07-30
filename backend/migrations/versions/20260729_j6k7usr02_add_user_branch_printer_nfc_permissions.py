"""Add branch_id, printer_ip, nfc_id, permissions to users table

The User model (app/modules/auth/models.py) has referenced these columns for a
while, but no prior migration ever created them, so any query selecting a full
User row (login included) failed with UndefinedColumnError.

Revision ID: j6k7usr02
Revises: h4i5pin01
Create Date: 2026-07-29
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.types import Uuid

revision: str = "j6k7usr02"
down_revision: Union[str, None] = "h4i5pin01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("branch_id", Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_users_branch_id", "users", ["branch_id"])
    op.add_column("users", sa.Column("printer_ip", sa.String(45), nullable=True))
    op.add_column("users", sa.Column("nfc_id", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("permissions", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "permissions")
    op.drop_column("users", "nfc_id")
    op.drop_column("users", "printer_ip")
    op.drop_index("ix_users_branch_id", table_name="users")
    op.drop_column("users", "branch_id")
