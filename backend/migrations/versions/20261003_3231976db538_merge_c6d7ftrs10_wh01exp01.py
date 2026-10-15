"""merge c6d7ftrs10 + wh01exp01

Revision ID: 3231976db538
Revises: c6d7ftrs10, wh01exp01
Create Date: 2026-10-03 15:16:56.341508

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3231976db538'
down_revision: Union[str, None] = ('c6d7ftrs10', 'wh01exp01')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
