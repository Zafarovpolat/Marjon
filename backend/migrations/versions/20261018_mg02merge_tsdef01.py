"""merge mg01merge + tsdef01 (прод: expense/waste timestamp defaults)

Прод-линия после интеграции добавила `tsdef01` (NOT NULL/дефолты
created_at в expense/waste) поверх `emp01printer`, минуя нашу ветку
`att01status` (attendance_logs.status/approved_by/approved_at). Из-за этого
в графе стало два head'а: `mg01merge` и `tsdef01`.

Merge-ревизия сводит их обратно в один head. Обе линии — аддитивные
колоночные миграции в разных таблицах, конфликта в схеме нет; сам merge
ничего не меняет.

Revision ID: mg02merge
Revises: mg01merge, tsdef01
Create Date: 2026-10-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "mg02merge"
down_revision: Union[str, Sequence[str], None] = ("mg01merge", "tsdef01")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
