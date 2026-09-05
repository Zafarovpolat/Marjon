"""Align purchase-document nullability safely.

Revision ID: bi02pur16
Revises: bi02svc15
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02pur16"
down_revision: Union[str, None] = "bi02svc15"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("purchase_documents", "items_count"),
    ("purchase_documents", "total_amount"),
    ("purchase_documents", "status"),
    ("purchase_documents", "created_at"),
    ("purchase_documents", "updated_at"),
    ("purchase_document_items", "quantity"),
    ("purchase_document_items", "unit"),
    ("purchase_document_items", "cost_price"),
    ("purchase_document_items", "total"),
    ("purchase_document_items", "created_at"),
    ("purchase_document_items", "updated_at"),
)


def _columns_with_nulls() -> list[str]:
    bind = op.get_bind()
    failures: list[str] = []
    for table_name, column_name in _COLUMNS:
        count = bind.execute(
            sa.text(
                f'SELECT count(*) FROM "{table_name}" '
                f'WHERE "{column_name}" IS NULL'
            )
        ).scalar_one()
        if count:
            failures.append(f"{table_name}.{column_name} ({count} NULL rows)")
    return failures


def upgrade() -> None:
    failures = _columns_with_nulls()
    if failures:
        raise RuntimeError(
            "BI-02 purchase-document NOT NULL preflight failed: "
            + ", ".join(failures)
        )
    for table_name, column_name in _COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(table_name, column_name, nullable=True)
