"""Add attendance_logs approval columns (5.5)

5.5 — «кассир подтверждает вход/уход повара + логирование». Отметка прихода/ухода
повара (attendance_logs) теперь создаётся со статусом pending и ждёт подтверждения
кассира. Кассир через POST /hr/attendance/{id}/approve подтверждает или отклоняет
отметку — фиксируются кто подтвердил (approved_by) и когда (approved_at), само
действие пишется в audit_logs. Существующие строки помечаем approved (server_default),
чтобы не подвесить исторические записи.

Revision ID: u8v9attapp02
Revises: t7u8rcpt01
Create Date: 2026-08-14
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.types import Uuid

revision: str = "u8v9attapp02"
down_revision: Union[str, None] = "t7u8rcpt01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Новые строки → pending; исторические (server_default) → approved
    op.add_column(
        "attendance_logs",
        sa.Column("status", sa.String(20), nullable=False, server_default="approved"),
    )
    op.add_column(
        "attendance_logs",
        sa.Column("approved_by", Uuid(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "attendance_logs",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    # server_default нужен только для заполнения существующих строк; далее значение
    # задаёт приложение (default="pending" в модели).
    op.alter_column("attendance_logs", "status", server_default=None)


def downgrade() -> None:
    op.drop_column("attendance_logs", "approved_at")
    op.drop_column("attendance_logs", "approved_by")
    op.drop_column("attendance_logs", "status")
