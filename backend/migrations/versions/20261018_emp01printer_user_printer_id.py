"""users: printer_id — принтер, закреплённый за сотрудником

Веб-админка показывала в карточке сотрудника поле «IP адрес принтера», но оно
было чистой заглушкой (CASHIER-FE-01: visual-only, никогда не уходило на бэкенд)
— колонки не существовало. Теперь привязка настоящая: владелец выбирает принтер
из уже добавленных в разделе «Настройка принтеров», а десктоп печатает чек
именно на него.

FK с ON DELETE SET NULL: удаление принтера не блокируется и не ломает карточку
сотрудника — привязка просто снимается, печать возвращается к принтеру филиала.

Revision ID: emp01printer
Revises: v48pwd01
Create Date: 2026-10-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "emp01printer"
down_revision: Union[str, None] = "v48pwd01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("printer_id", sa.Uuid(as_uuid=True), nullable=True))
    op.create_index("ix_users_printer_id", "users", ["printer_id"])
    op.create_foreign_key(
        "fk_users_printer_id_printers",
        "users",
        "printers",
        ["printer_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_printer_id_printers", "users", type_="foreignkey")
    op.drop_index("ix_users_printer_id", table_name="users")
    op.drop_column("users", "printer_id")
