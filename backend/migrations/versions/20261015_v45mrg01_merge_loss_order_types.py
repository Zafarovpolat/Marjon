"""merge v44los01 + 0c16e3a26191

Joins the ingredient loss-norm line (v44los01, on v43inv02) with the
company order_types line (0c16e3a26191, on 3231976db538). Both branches
are additive column migrations; the merge itself changes nothing.

Revision ID: v45mrg01
Revises: v44los01, 0c16e3a26191
Create Date: 2026-10-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "v45mrg01"
down_revision: Union[str, Sequence[str], None] = ("v44los01", "0c16e3a26191")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
