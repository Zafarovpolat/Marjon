"""Append-only history of cumulative sale-allowance top-ups.

Revision ID: v33top01
Revises: v32dec01
Create Date: 2026-10-07

New table product_limit_topups: one row per confirmed top-up
(ADD amount TO available allowance). Rows are never deleted by the app —
resetting the allowance zeroes counters only; the audit trail stays.
Idempotency is enforced by (company_id, idempotency_key).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v33top01"
down_revision: Union[str, None] = "v32dec01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_limit_topups",
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 3), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("idempotency_key", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "company_id",
            "idempotency_key",
            name="uq_topup_company_idempotency",
        ),
        sa.UniqueConstraint(
            "product_id",
            "seq",
            name="uq_topup_product_seq",
        ),
    )
    op.create_index("ix_product_limit_topups_company_id", "product_limit_topups", ["company_id"])
    op.create_index("ix_product_limit_topups_product_id", "product_limit_topups", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_product_limit_topups_product_id", table_name="product_limit_topups")
    op.drop_index("ix_product_limit_topups_company_id", table_name="product_limit_topups")
    op.drop_table("product_limit_topups")
