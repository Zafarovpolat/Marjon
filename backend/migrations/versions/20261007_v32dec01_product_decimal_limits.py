"""Exact Decimal limits: products.daily_limit/sold_count Integer → NUMERIC(12,3).

Schema-only migration, no table recreation, no DB reset. PostgreSQL converts
integer → numeric exactly (1212 → 1212.000): existing values migrate 1:1,
no data loss on upgrade. Scale 3 matches the canonical OrderItem.quantity
Numeric(10,3): limit arithmetic stays in one exact Decimal domain.

DOWNGRADE IS LOSSY BY NATURE: fractional production data would truncate to
integer (1212.500 → 1212). Provided for emergency rollback only — back up
first and reconcile sold_count manually. Do not pretend it is lossless.
"""
from alembic import op
import sqlalchemy as sa

revision: str = "v32dec01"
down_revision: str = "v31sort01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "products", "daily_limit",
        existing_type=sa.Integer(),
        type_=sa.Numeric(12, 3),
        existing_nullable=True,
    )
    op.alter_column(
        "products", "sold_count",
        existing_type=sa.Integer(),
        type_=sa.Numeric(12, 3),
        existing_nullable=False,
        existing_server_default=sa.text("0"),
    )


def downgrade() -> None:
    # LOSSY: fractional digits are truncated by the cast back to Integer.
    op.alter_column(
        "products", "daily_limit",
        existing_type=sa.Numeric(12, 3),
        type_=sa.Integer(),
        existing_nullable=True,
    )
    op.alter_column(
        "products", "sold_count",
        existing_type=sa.Numeric(12, 3),
        type_=sa.Integer(),
        existing_nullable=False,
        existing_server_default=sa.text("0"),
    )
