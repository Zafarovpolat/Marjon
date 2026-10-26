"""reopen closed order: orders.reopened_at / reopened_by_id / reopen_comment

REOPEN-01: касса должна уметь возвращать ЗАКРЫТЫЙ заказ в работу — гость
вернул блюдо (или не получил его) и просит деньги назад. Кассир открывает
заказ, отменяет позицию с обязательной причиной, итог уменьшается, сдача
выдаётся, заказ закрывается снова. Повторное закрытие разрешает именно
reopened_at: прежние completed-платежи помечаются refunded, новой оплатой
становится запись по новому итогу.

Revision ID: rp01
Revises: tz01
Create Date: 2026-10-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.types import Uuid

revision: str = "rp01"
down_revision: Union[str, Sequence[str], None] = "tz01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("reopened_by_id", Uuid(as_uuid=True), nullable=True))
        batch.add_column(sa.Column("reopen_comment", sa.Text(), nullable=True))
        batch.create_foreign_key(
            "fk_orders_reopened_by_id_users",
            "users", ["reopened_by_id"], ["id"], ondelete="SET NULL",
        )
        batch.create_index("ix_orders_reopened_by_id", ["reopened_by_id"])
    # CANCEL-COMMENT-01: причина отмены блюда — обязательна на кассе и всегда
    # печатается в чеке (раньше уходила только в журнал аудита).
    with op.batch_alter_table("order_items") as batch:
        batch.add_column(sa.Column("cancel_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("order_items") as batch:
        batch.drop_column("cancel_reason")
    with op.batch_alter_table("orders") as batch:
        batch.drop_index("ix_orders_reopened_by_id")
        batch.drop_constraint("fk_orders_reopened_by_id_users", type_="foreignkey")
        batch.drop_column("reopen_comment")
        batch.drop_column("reopened_by_id")
        batch.drop_column("reopened_at")
