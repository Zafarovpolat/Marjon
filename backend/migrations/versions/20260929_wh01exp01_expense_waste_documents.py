"""WH-01: expense (Расход) and waste (Отход) warehouse documents.

Adds three tables so the owner web panel can run full warehouse CRUD:
  * expense_documents        — документ расхода (шапка, зеркалит приход)
  * expense_document_items   — позиции расхода
  * waste_documents          — построчный отход (одна позиция на документ)

Проведение (status="accepted") расхода/отхода уменьшает остатки через
StockMovement (type="expense" / "waste"); сами движения пишутся в уже
существующую stock_movements. Миграция только создаёт таблицы — данные не
трогает. Идемпотентна: создаёт таблицу только если её ещё нет.

Revision ID: wh01exp01
Revises: bi08dcs01
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "wh01exp01"
down_revision: Union[str, None] = "bi08dcs01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _require_postgresql() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("WH-01 expense/waste migration requires PostgreSQL")


def _table_exists(table: str) -> bool:
    return bool(
        op.get_bind().execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = current_schema()
                      AND table_name = :table
                )
                """
            ),
            {"table": table},
        ).scalar()
    )


def upgrade() -> None:
    _require_postgresql()

    if not _table_exists("expense_documents"):
        op.create_table(
            "expense_documents",
            sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("number", sa.Integer(), nullable=False),
            sa.Column("receiver", sa.String(255), nullable=True),
            sa.Column("warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id"), nullable=True),
            sa.Column("warehouse_name", sa.String(255), nullable=True),
            sa.Column("date", sa.String(20), nullable=True),
            sa.Column("registered_at", sa.String(40), nullable=True),
            sa.Column("accepted_at", sa.String(40), nullable=True),
            sa.Column("items_count", sa.Integer(), nullable=True),
            sa.Column("total_amount", sa.Numeric(15, 2), nullable=True),
            sa.Column("status", sa.String(20), nullable=True),
            sa.Column("created_by", sa.Uuid(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_by_name", sa.String(255), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
        )
        op.create_index("ix_expense_documents_company_id", "expense_documents", ["company_id"])

    if not _table_exists("expense_document_items"):
        op.create_table(
            "expense_document_items",
            sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("document_id", sa.Uuid(as_uuid=True), sa.ForeignKey("expense_documents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("ingredient_id", sa.Uuid(as_uuid=True), sa.ForeignKey("ingredients.id"), nullable=True),
            sa.Column("name", sa.String(500), nullable=False),
            sa.Column("quantity", sa.Numeric(15, 4), nullable=True),
            sa.Column("unit", sa.String(20), nullable=True),
            sa.Column("cost_price", sa.Numeric(15, 4), nullable=True),
            sa.Column("total", sa.Numeric(15, 2), nullable=True),
        )
        op.create_index("ix_expense_document_items_document_id", "expense_document_items", ["document_id"])

    if not _table_exists("waste_documents"):
        op.create_table(
            "waste_documents",
            sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("number", sa.Integer(), nullable=False),
            sa.Column("category", sa.String(255), nullable=True),
            sa.Column("warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id"), nullable=True),
            sa.Column("warehouse_name", sa.String(255), nullable=True),
            sa.Column("ingredient_id", sa.Uuid(as_uuid=True), sa.ForeignKey("ingredients.id"), nullable=True),
            sa.Column("name", sa.String(500), nullable=False),
            sa.Column("quantity", sa.Numeric(15, 4), nullable=True),
            sa.Column("unit", sa.String(20), nullable=True),
            sa.Column("cost_price", sa.Numeric(15, 4), nullable=True),
            sa.Column("total_amount", sa.Numeric(15, 2), nullable=True),
            sa.Column("reason", sa.String(500), nullable=True),
            sa.Column("date", sa.String(20), nullable=True),
            sa.Column("registered_at", sa.String(40), nullable=True),
            sa.Column("accepted_at", sa.String(40), nullable=True),
            sa.Column("status", sa.String(20), nullable=True),
            sa.Column("is_automatic", sa.Boolean(), nullable=True),
            sa.Column("created_by", sa.Uuid(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_by_name", sa.String(255), nullable=True),
        )
        op.create_index("ix_waste_documents_company_id", "waste_documents", ["company_id"])


def downgrade() -> None:
    _require_postgresql()
    if _table_exists("waste_documents"):
        op.drop_index("ix_waste_documents_company_id", table_name="waste_documents")
        op.drop_table("waste_documents")
    if _table_exists("expense_document_items"):
        op.drop_index("ix_expense_document_items_document_id", table_name="expense_document_items")
        op.drop_table("expense_document_items")
    if _table_exists("expense_documents"):
        op.drop_index("ix_expense_documents_company_id", table_name="expense_documents")
        op.drop_table("expense_documents")
