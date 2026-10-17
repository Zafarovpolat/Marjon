"""Attendance marks per user with cashier confirmation

The cashier marks a staff member in/out (approved at once) and confirms or
rejects a cook's check-in/out. attendance_logs gets user_id, status,
approved_by, approved_at; employee_id / shift_id become optional because a
mark does not need an HR employee card or a work shift. Existing rows were
already recorded, so they are backfilled as "approved".

Revision ID: e8f9att05
Revises: d7e8brnlog11
Create Date: 2026-09-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.types import Uuid

revision: str = "e8f9att05"
down_revision: Union[str, None] = "d7e8brnlog11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {c["name"] for c in inspector.get_columns("attendance_logs")}

    if "user_id" not in columns:
        op.add_column(
            "attendance_logs",
            sa.Column("user_id", Uuid(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        )
        op.create_index("ix_attendance_logs_user_id", "attendance_logs", ["user_id"])
    if "status" not in columns:
        op.add_column(
            "attendance_logs",
            sa.Column("status", sa.String(20), nullable=False, server_default="approved"),
        )
        op.alter_column("attendance_logs", "status", server_default=None)
    if "approved_by" not in columns:
        op.add_column(
            "attendance_logs",
            sa.Column("approved_by", Uuid(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        )
    if "approved_at" not in columns:
        op.add_column(
            "attendance_logs",
            sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        )
    op.alter_column("attendance_logs", "employee_id", existing_type=Uuid(as_uuid=True), nullable=True)
    op.alter_column("attendance_logs", "shift_id", existing_type=Uuid(as_uuid=True), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM attendance_logs WHERE employee_id IS NULL OR shift_id IS NULL")
    op.alter_column("attendance_logs", "shift_id", existing_type=Uuid(as_uuid=True), nullable=False)
    op.alter_column("attendance_logs", "employee_id", existing_type=Uuid(as_uuid=True), nullable=False)
    op.drop_column("attendance_logs", "approved_at")
    op.drop_column("attendance_logs", "approved_by")
    op.drop_column("attendance_logs", "status")
    op.drop_index("ix_attendance_logs_user_id", table_name="attendance_logs")
    op.drop_column("attendance_logs", "user_id")
