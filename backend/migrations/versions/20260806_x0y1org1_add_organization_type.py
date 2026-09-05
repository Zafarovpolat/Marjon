"""Add type to organizations (BE-15)

Revision ID: x0y1org1
Revises: w8x9hall1
Create Date: 2026-08-06
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "x0y1org1"
down_revision: Union[str, None] = "w8x9hall1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        column["name"]: column for column in inspector.get_columns("organizations")
    }
    organization_type = columns.get("type")

    if organization_type is None:
        op.add_column(
            "organizations",
            sa.Column("type", sa.String(50), nullable=True),
        )
    else:
        column_type = organization_type["type"]
        if not isinstance(column_type, sa.String) or column_type.length != 50:
            raise RuntimeError(
                "organizations.type exists with an unexpected SQL type"
            )

    op.execute(
        sa.text(
            "UPDATE organizations SET type = 'restaurant' WHERE type IS NULL"
        )
    )
    if organization_type is None or organization_type["nullable"]:
        op.alter_column(
            "organizations",
            "type",
            existing_type=sa.String(50),
            nullable=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    column_names = {
        column["name"] for column in inspector.get_columns("organizations")
    }
    if "type" in column_names:
        op.drop_column("organizations", "type")
