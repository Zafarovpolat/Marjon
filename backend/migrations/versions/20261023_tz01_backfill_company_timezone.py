"""backfill company timezone default

TZ-01: Company.timezone defaulted to "UTC" at the ORM level, and nothing
ever set it to anything else at company creation — so every existing
company row has the literal string "UTC" stored, not NULL. Receipts
(printers/service.py's astimezone(ZoneInfo(company.timezone))) and the
operating-day/analytics bucketing that read this field were therefore all
computing in UTC instead of local time — 5 hours behind real Tashkent wall
clock. The platform is Uzbekistan-only (see CLAUDE.md), so every row that
is still on the bad "UTC" default is backfilled to the real local zone.
A company that was ever deliberately set to a different, non-default
timezone is untouched (only rows exactly equal to "UTC" are updated).

Revision ID: tz01
Revises: org01
Create Date: 2026-10-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "tz01"
down_revision: Union[str, Sequence[str], None] = "org01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE companies SET timezone = 'Asia/Tashkent' WHERE timezone = 'UTC'"))


def downgrade() -> None:
    op.execute(sa.text("UPDATE companies SET timezone = 'UTC' WHERE timezone = 'Asia/Tashkent'"))
