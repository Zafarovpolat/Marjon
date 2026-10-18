"""expense/waste документы: server_default на created_at/updated_at

Миграция 20260929_wh01exp01 создала эти таблицы с `nullable=False` и БЕЗ
server_default — при этом модель TimeStampedModel объявляет
`server_default=func.now()`. Из-за расхождения любой INSERT, который не
проставляет метки руками, падал с

    NotNullViolationError: null value in column "created_at" of relation
    "expense_document_items" violates not-null constraint

Это ломало инвентаризацию с недостачей (любой факт ниже остатка): эндпоинт
создаёт ExpenseDocument с явными created_at/updated_at, но позиции документа
(ExpenseDocumentItem) — без них, поэтому падала вся транзакция и владелец
видел только «не удалось сохранить». То же ждало «Расход товаров».

ALTER COLUMN SET DEFAULT не переписывает таблицу (PG 11+), поэтому миграция
дешёвая и безопасна на проде.

Revision ID: tsdef01
Revises: emp01printer
Create Date: 2026-10-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "tsdef01"
down_revision: Union[str, None] = "emp01printer"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("expense_documents", "expense_document_items", "waste_documents")
COLUMNS = ("created_at", "updated_at")


def upgrade() -> None:
    for table in TABLES:
        for column in COLUMNS:
            op.alter_column(
                table,
                column,
                existing_type=sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                existing_nullable=False,
            )


def downgrade() -> None:
    for table in TABLES:
        for column in COLUMNS:
            op.alter_column(
                table,
                column,
                existing_type=sa.DateTime(timezone=True),
                server_default=None,
                existing_nullable=False,
            )
