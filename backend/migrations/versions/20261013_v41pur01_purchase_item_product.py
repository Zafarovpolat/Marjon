"""V41 — ссылка строки прихода на Товар (реализация).

Adds purchase_document_items.product_id (nullable UUID → products.id,
ON DELETE SET NULL): Товар, выбранный в «Добавить продуктов», хранит свою
природу для колонки Тип, а складской учёт по нему ведётся через
автопривязанный шаблон (ingredient_id — см. create_purchase). NULL у старых
и чисто-сырьевых строк — историческое поведение без изменений.
Удаление Товара линию не трогает (SET NULL), остаток на шаблоне живёт дальше.

Revision ID: v41pur01
Revises: v40typ01
Create Date: 2026-10-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v41pur01"
down_revision: Union[str, None] = "v40typ01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "product_id" not in _columns("purchase_document_items"):
        op.add_column(
            "purchase_document_items",
            sa.Column("product_id", sa.Uuid(), nullable=True),
        )
        op.create_foreign_key(
            "fk_purchase_document_items_product_id",
            "purchase_document_items",
            "products",
            ["product_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()
    existing_fks = {
        fk["name"] for fk in sa.inspect(bind).get_foreign_keys("purchase_document_items")
    }
    if "fk_purchase_document_items_product_id" in existing_fks:
        op.drop_constraint(
            "fk_purchase_document_items_product_id", "purchase_document_items", type_="foreignkey"
        )
    if "product_id" in _columns("purchase_document_items"):
        op.drop_column("purchase_document_items", "product_id")
