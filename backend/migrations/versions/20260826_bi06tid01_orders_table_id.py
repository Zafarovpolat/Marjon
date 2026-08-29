"""Add canonical Order → Table relation (orders.table_id).

Phase 1 foundation for the OWNER Tables Report "Место" filter. Adds a nullable,
indexed FK from orders to tables with ON DELETE SET NULL so archiving a table
never destroys order history. The existing orders.table_number stays as the
display/history snapshot. No historical backfill is performed here — see the
Phase 1 audit for the deterministic (and deferred) backfill rule.

Revision ID: bi06tid01
Revises: bi05e1fp22
Create Date: 2026-08-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi06tid01"
down_revision: Union[str, None] = "bi05e1fp22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "orders"
_COLUMN = "table_id"
_INDEX = "ix_orders_table_id"
_FK = "orders_table_id_fkey"


def _require_postgresql() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("BI-06 orders.table_id migration requires PostgreSQL")


def _column_exists() -> bool:
    return bool(
        op.get_bind().execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = :table
                      AND column_name = :column
                )
                """
            ),
            {"table": _TABLE, "column": _COLUMN},
        ).scalar()
    )


def _index_exists() -> bool:
    return bool(
        op.get_bind().execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM pg_indexes
                    WHERE schemaname = current_schema() AND indexname = :index
                )
                """
            ),
            {"index": _INDEX},
        ).scalar()
    )


def upgrade() -> None:
    _require_postgresql()
    if not _column_exists():
        op.add_column(
            _TABLE,
            sa.Column("table_id", sa.Uuid(), nullable=True),
        )
        op.create_foreign_key(
            _FK,
            _TABLE,
            "tables",
            ["table_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if not _index_exists():
        op.create_index(_INDEX, _TABLE, ["table_id"], unique=False)
    # Historical backfill intentionally deferred: orders.table_number is free
    # text (Integer Table.number vs String column), duplicate numbers may exist
    # across halls, and legacy POS never wrote real Table ids — so no
    # unambiguous, tenant-safe match can be guaranteed in-migration. New rows
    # start with table_id = NULL until a separate, audited backfill runs.


def downgrade() -> None:
    _require_postgresql()
    if _index_exists():
        op.drop_index(_INDEX, table_name=_TABLE)
    if _column_exists():
        op.drop_constraint(_FK, _TABLE, type_="foreignkey")
        op.drop_column(_TABLE, _COLUMN)
