"""client IP on work shifts (attendance journal)

ATT-IP-01: веб-страница «Посещаемость» показывает смены (work_shifts), поэтому
IP устройства нужен именно на смене — там же, где actual_start/actual_end.
`attendance_logs` хранит отдельные отметки, но веб-страница читает не их.

Значения необязательные: у исторических смен IP нет и взяться ему неоткуда,
поэтому UI честно показывает «—» вместо выдуманного адреса.

Revision ID: att01ip
Revises: pwlock01
Create Date: 2026-10-22

Upgrade идемпотентен (тот же приём, что в pwlock01/att01status): на базах,
собранных через metadata.create_all, колонки уже есть, а ревизия не отмечена.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "att01ip"
down_revision: Union[str, Sequence[str], None] = "pwlock01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    bind = op.get_bind()
    return {col["name"] for col in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    columns = _existing_columns("work_shifts")
    for name in ("check_in_ip", "check_out_ip"):
        if name not in columns:
            op.add_column("work_shifts", sa.Column(name, sa.String(length=64), nullable=True))


def downgrade() -> None:
    # IP — диагностические данные, но модель на них уже ссылается: откат
    # ревизии не должен ломать работающий код. Колонки остаются.
    pass
