"""Восстанавливает колонки подтверждения у attendance_logs.

DESK-ATT-01. Исходная схема (до консолидации моделей) содержала у отметки
посещаемости поля status/approved_by/approved_at — на них рассчитана очередь
подтверждения в десктопе (AttendancePanel: approve/reject). При консолидации
колонки потерялись в модели, но остались в уже развёрнутых базах. В результате
INSERT новой отметки падал с "NOT NULL constraint failed: attendance_logs.status"
(колонка NOT NULL без server_default), а очередь подтверждения не работала.

Миграция идемпотентна: на базах, где колонки уже есть, ничего не меняет.

Revision ID: att01status
Revises: br01login
Create Date: 2026-10-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "att01status"
down_revision: Union[str, None] = "br01login"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "attendance_logs"


def _existing_columns() -> set[str]:
    bind = op.get_bind()
    return {col["name"] for col in sa.inspect(bind).get_columns(_TABLE)}


def upgrade() -> None:
    existing = _existing_columns()

    if "status" not in existing:
        op.add_column(
            _TABLE,
            sa.Column(
                "status",
                sa.String(20),
                nullable=False,
                server_default="approved",
            ),
        )
    if "approved_by" not in existing:
        op.add_column(_TABLE, sa.Column("approved_by", sa.Uuid(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "fk_attendance_logs_approved_by_users",
            _TABLE,
            "users",
            ["approved_by"],
            ["id"],
        )
    if "approved_at" not in existing:
        op.add_column(_TABLE, sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    existing = _existing_columns()
    if "approved_at" in existing:
        op.drop_column(_TABLE, "approved_at")
    if "approved_by" in existing:
        op.drop_constraint("fk_attendance_logs_approved_by_users", _TABLE, type_="foreignkey")
        op.drop_column(_TABLE, "approved_by")
    if "status" in existing:
        op.drop_column(_TABLE, "status")
