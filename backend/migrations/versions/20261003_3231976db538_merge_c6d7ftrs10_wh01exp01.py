"""merge c6d7ftrs10 + wh01exp01 (исторический мерж, приведён к линейной цепочке)

Revision ID: 3231976db538
Revises: wh01exp01
Create Date: 2026-10-03 15:16:56.341508

Ранее down_revision был кортежем ('c6d7ftrs10', 'wh01exp01') — это ветвило
граф, чего запрещает test_revision_graph_is_linear_complete_and_has_one_head.
wh01exp01 теперь строится поверх c6d7ftrs10, поэтому достаточно одного родителя.
Upgrade/downgrade остаются no-op: реальных изменений схемы мерж не делал.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3231976db538'
down_revision: Union[str, None] = 'wh01exp01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
