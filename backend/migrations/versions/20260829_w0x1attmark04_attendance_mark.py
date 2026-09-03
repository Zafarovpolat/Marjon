"""Attendance mark by cashier (5.5)

5.5 — кассир отмечает приход/уход сотрудника прямо на кассе. Отметка ставится
по пользователю (users), а не по HR-карточке employee и без привязки к смене:
карточек employees и планировщика смен в кассовом клиенте нет. Поэтому
employee_id и shift_id становятся необязательными, а user_id — прямая ссылка на
отмечаемого сотрудника.

Revision ID: w0x1attmark04
Revises: v9w0brnlog03
Create Date: 2026-08-29
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "w0x1attmark04"
down_revision: Union[str, None] = "v9w0brnlog03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch-режим: на SQLite таблица пересоздаётся (FK/индексы сохраняются авто-
    # рефлексией), на PostgreSQL выполняются обычные ALTER — работает в обоих.
    with op.batch_alter_table("attendance_logs") as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=True))
        batch_op.alter_column("employee_id", existing_type=sa.Uuid(as_uuid=True), nullable=True)
        batch_op.alter_column("shift_id", existing_type=sa.Uuid(as_uuid=True), nullable=True)
        batch_op.create_index("ix_attendance_logs_user_id", ["user_id"])
        batch_op.create_foreign_key(
            "fk_attendance_logs_user_id_users", "users", ["user_id"], ["id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("attendance_logs") as batch_op:
        batch_op.drop_constraint("fk_attendance_logs_user_id_users", type_="foreignkey")
        batch_op.drop_index("ix_attendance_logs_user_id")
        batch_op.alter_column("shift_id", existing_type=sa.Uuid(as_uuid=True), nullable=False)
        batch_op.alter_column("employee_id", existing_type=sa.Uuid(as_uuid=True), nullable=False)
        batch_op.drop_column("user_id")
