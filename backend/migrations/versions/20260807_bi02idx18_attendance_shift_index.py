"""Add the missing attendance shift index safely.

Revision ID: bi02idx18
Revises: bi02wh17
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi02idx18"
down_revision: Union[str, None] = "bi02wh17"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "attendance_logs"
_INDEX = "ix_attendance_logs_shift_id"
_COLUMNS = ["shift_id"]
_INDEX_STATE_SQL = sa.text(
    """
    SELECT
        index_relation.oid AS index_oid,
        table_relation.relname AS table_name,
        access_method.amname AS access_method,
        index_catalog.indisunique AS is_unique,
        index_catalog.indisvalid AS is_valid,
        index_catalog.indisready AS is_ready,
        index_catalog.indnkeyatts AS key_attribute_count,
        index_catalog.indnatts AS attribute_count,
        index_catalog.indpred IS NULL AS has_no_predicate,
        index_catalog.indexprs IS NULL AS has_no_expressions,
        ARRAY(
            SELECT pg_get_indexdef(
                index_relation.oid,
                key_position,
                TRUE
            )
            FROM generate_series(
                1,
                index_catalog.indnkeyatts
            ) AS key_position
            ORDER BY key_position
        ) AS key_columns,
        pg_get_indexdef(index_relation.oid) AS definition
    FROM pg_index AS index_catalog
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_catalog.indexrelid
    JOIN pg_class AS table_relation
      ON table_relation.oid = index_catalog.indrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = index_relation.relnamespace
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    WHERE namespace.nspname = current_schema()
      AND index_relation.relname = :index_name
    """
)


def _index_state():
    return (
        op.get_bind()
        .execute(_INDEX_STATE_SQL, {"index_name": _INDEX})
        .mappings()
        .one_or_none()
    )


def _matches_expected_definition(state) -> bool:
    definition = state["definition"] or ""
    return all(
        (
            state["table_name"] == _TABLE,
            state["access_method"] == "btree",
            state["is_unique"] is False,
            state["is_valid"] is True,
            state["is_ready"] is True,
            state["key_attribute_count"] == len(_COLUMNS),
            state["attribute_count"] == len(_COLUMNS),
            state["has_no_predicate"] is True,
            state["has_no_expressions"] is True,
            list(state["key_columns"]) == _COLUMNS,
            definition.startswith(f"CREATE INDEX {_INDEX} ON "),
            definition.endswith(f"USING btree ({', '.join(_COLUMNS)})"),
        )
    )


def _drop_index_concurrently() -> None:
    op.drop_index(
        _INDEX,
        table_name=_TABLE,
        postgresql_concurrently=True,
        if_exists=True,
    )


def upgrade() -> None:
    state = _index_state()
    if state is not None and _matches_expected_definition(state):
        return
    with op.get_context().autocommit_block():
        if state is not None:
            _drop_index_concurrently()
        op.create_index(
            _INDEX,
            _TABLE,
            _COLUMNS,
            unique=False,
            postgresql_concurrently=True,
        )


def downgrade() -> None:
    if _index_state() is None:
        return
    with op.get_context().autocommit_block():
        _drop_index_concurrently()
