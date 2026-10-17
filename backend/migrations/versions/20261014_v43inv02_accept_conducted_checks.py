"""V43 — проведённые инвентаризации всегда «accepted» (бэкфил статусов).

Под новое правило create_inventory_check: проверка проведена (склад выбран,
учёт включён) — статус accepted, даже если всё сошлось. Переводим старые
draft-шапки с выбранным складом в accepted. Автодокументы при их наличии уже
созданы раньше, остатки уже сдвинуты — двигаем только статус.

Revision ID: v43inv02
Revises: v42inv01
Create Date: 2026-10-14
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v43inv02"
down_revision: Union[str, None] = "v42inv01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "inventory_checks" not in tables:
        return
    cols = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("inventory_checks")}
    if "status" not in cols or "warehouse_id" not in cols:
        return
    op.execute(
        sa.text(
            "UPDATE inventory_checks SET status = 'accepted' "
            "WHERE status = 'draft' AND warehouse_id IS NOT NULL"
        )
    )


def downgrade() -> None:
    # Состояние до бэкфила восстановить нельзя — только вперёд.
    pass
