"""Add missing columns found by comparing models against the DB schema

Same class of bug as h4i5pin01 / j6k7usr02: these columns exist on the
SQLAlchemy models but were never added by a migration, so any query touching
them raised UndefinedColumnError (e.g. seed.py failing on companies.cancel_password).
Found via `alembic revision --autogenerate` diffed against every model module.

Revision ID: k8l9sync01
Revises: j6k7usr02
Create Date: 2026-07-29
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "k8l9sync01"
down_revision: Union[str, None] = "j6k7usr02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("cancel_password", sa.String(64), nullable=True))
    op.add_column(
        "companies",
        sa.Column("waiter_service_percent", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("orders", sa.Column("customer_phone", sa.String(30), nullable=True))
    op.add_column("orders", sa.Column("customer_address", sa.Text(), nullable=True))
    op.add_column("orders", sa.Column("receipt_printed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "order_items",
        sa.Column("takeaway", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("order_items", "takeaway")
    op.drop_column("orders", "receipt_printed_at")
    op.drop_column("orders", "customer_address")
    op.drop_column("orders", "customer_phone")
    op.drop_column("companies", "waiter_service_percent")
    op.drop_column("companies", "cancel_password")
