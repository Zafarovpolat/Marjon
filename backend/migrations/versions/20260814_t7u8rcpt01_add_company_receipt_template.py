"""Add companies.receipt_template / kitchen_receipt_template (2.5)

2.5 — «привязать конструктор чека фронта к печати». Конструктор в веб-админке
(frontend/src/pages/settings/ReceiptSettingsPage.jsx) собирает JSON-шаблон
(видимость и порядок блоков, тексты «спасибо»/подвала). Раньше он сохранялся
только в localStorage браузера и до принтера не доходил. Эти две nullable JSON
колонки на companies хранят шаблон покупательского и кухонного чеков; форматтер
ESC/POS (printers/formatter.py) читает их при печати. NULL → печать по умолчанию.

Revision ID: t7u8rcpt01
Revises: r5s6item01
Create Date: 2026-08-14
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "t7u8rcpt01"
down_revision: Union[str, None] = "r5s6item01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# JSONB на PostgreSQL, JSON — на прочих БД (совпадает с organizations.models.JsonType)
_JSON = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column("companies", sa.Column("receipt_template", _JSON, nullable=True))
    op.add_column("companies", sa.Column("kitchen_receipt_template", _JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("companies", "kitchen_receipt_template")
    op.drop_column("companies", "receipt_template")
