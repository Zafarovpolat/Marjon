"""Add order_items.added_by (кто добавил позицию)

9.4 — в модалке оплаты нужно показывать по каждой позиции время добавления
(created_at уже есть) и КЕМ она добавлена. Колонка order_items.added_by
ссылается на users.id и заполняется в OrderService.create (автор заказа)
и OrderService.add_item (сотрудник, делающий дозаказ). Nullable —
исторические позиции остаются без автора.

Revision ID: r5s6item01
Revises: p3q4sync03
Create Date: 2026-08-14
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.types import Uuid

revision: str = "r5s6item01"
down_revision: Union[str, None] = "p3q4sync03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "order_items",
        sa.Column("added_by", Uuid(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("order_items", "added_by")
