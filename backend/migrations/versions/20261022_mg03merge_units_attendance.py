"""Merge default-unit ordering and attendance IP migrations.

Revision ID: mg03merge
Revises: un03sort01, att01ip
Create Date: 2026-10-22

Both parent migrations are independent. This revision only joins their
histories so deployments keep a single Alembic head from either branch.
"""

revision = "mg03merge"
down_revision = ("un03sort01", "att01ip")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
