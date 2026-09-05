"""Secure PIN storage + lockout fields (BE-08)

users.pin_code was a plain String(8) — i.e. designed to hold the PIN in
plaintext. The PIN is now stored as a bcrypt hash in pin_hash (via the same
hash_password()/verify_password() used for account passwords), and this
revision adds per-account lockout counters so repeated failed PIN attempts
can be throttled independently of the global rate limiter.

Merge note: pin_hash is already added earlier in the chain by h4i5pin01, and
the merged User model keeps pin_code alongside it (app/modules/pos/service.py
still accepts a legacy plaintext PIN as a fallback for rows written before
hashing).  The pin_code -> pin_hash rename this revision originally performed
would therefore both collide with the existing column and delete data still in
use, so only the additive lockout columns remain here.

Revision ID: r8s9pin01
Revises: q7r8fin01
Create Date: 2026-08-06
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "r8s9pin01"
down_revision: Union[str, None] = "q7r8fin01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("pin_failed_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("pin_locked_until", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "pin_locked_until")
    op.drop_column("users", "pin_failed_attempts")
