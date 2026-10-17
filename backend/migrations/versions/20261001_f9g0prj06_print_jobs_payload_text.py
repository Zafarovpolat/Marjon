"""print_jobs.payload: VARCHAR(65535) -> TEXT

A raster customer receipt's base64 payload (receipt_raster.py — tens of KB)
routinely exceeds 65535 chars on an ordinary multi-item order, which
previously hard-failed the whole print request with asyncpg's
StringDataRightTruncationError before any bytes reached the printer.
VARCHAR(65535) and TEXT store identically in Postgres; this only removes the
length cap.

Revision ID: f9g0prj06
Revises: e8f9att05
Create Date: 2026-10-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f9g0prj06"
down_revision: Union[str, None] = "e8f9att05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "print_jobs", "payload",
        existing_type=sa.String(65535),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "print_jobs", "payload",
        existing_type=sa.Text(),
        type_=sa.String(65535),
        existing_nullable=False,
    )
