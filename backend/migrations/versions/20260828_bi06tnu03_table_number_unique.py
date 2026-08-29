"""Enforce canonical Table number uniqueness per hall (active rows only).

Phase 5C-3: a table number is human-facing and must be unique among the ACTIVE
tables of a hall — "Зал #5" twice is invalid, while "Зал #5" + "Бар #5" is
valid, and a soft-deleted "Зал #5" must not block creating a new one. So the
constraint is a PARTIAL unique index over (hall_id, number) WHERE is_active,
not an unconditional UNIQUE. The application pre-check exists only for a
friendly 409; this index is the concurrency-safe final authority.

Preflight: existing ACTIVE duplicates are reported and the migration FAILS.
Nothing is deleted, deactivated, renumbered or merged — picking a winner among
real seating rows is a business decision, not a migration's.

Revision ID: bi06tnu03
Revises: bi06hpa02
Create Date: 2026-08-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi06tnu03"
down_revision: Union[str, None] = "bi06hpa02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "tables"
_INDEX = "uq_tables_hall_number_active"
_PREDICATE = "is_active"
_DUPLICATE_SAMPLE_LIMIT = 10


def _require_postgresql() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("BI-06 tables uniqueness migration requires PostgreSQL")


def _index_exists() -> bool:
    return bool(
        op.get_bind()
        .execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM pg_indexes
                    WHERE schemaname = current_schema() AND indexname = :index
                )
                """
            ),
            {"index": _INDEX},
        )
        .scalar()
    )


def _preflight() -> None:
    """Fail loudly on pre-existing ACTIVE duplicates; never repair data."""
    rows = (
        op.get_bind()
        .execute(
            sa.text(
                """
                SELECT hall_id, number, count(*) AS active_count
                FROM tables
                WHERE is_active
                GROUP BY hall_id, number
                HAVING count(*) > 1
                ORDER BY count(*) DESC, hall_id, number
                LIMIT :limit
                """
            ),
            {"limit": _DUPLICATE_SAMPLE_LIMIT},
        )
        .fetchall()
    )
    if not rows:
        return
    total_groups = (
        op.get_bind()
        .execute(
            sa.text(
                """
                SELECT count(*) FROM (
                    SELECT hall_id FROM tables
                    WHERE is_active
                    GROUP BY hall_id, number
                    HAVING count(*) > 1
                ) duplicates
                """
            )
        )
        .scalar()
    )
    sample = "; ".join(
        f"hall_id={row.hall_id} number={row.number} count={row.active_count}"
        for row in rows
    )
    raise RuntimeError(
        "BI-06 table-number preflight failed: duplicate ACTIVE (hall_id, number) "
        f"groups={total_groups}. Manual reconciliation is required before this "
        "migration can create the partial unique index — no rows were deleted, "
        f"deactivated or renumbered. First {len(rows)} group(s): {sample}"
    )


def upgrade() -> None:
    _require_postgresql()
    _preflight()
    if not _index_exists():
        op.create_index(
            _INDEX,
            _TABLE,
            ["hall_id", "number"],
            unique=True,
            postgresql_where=sa.text(_PREDICATE),
        )


def downgrade() -> None:
    _require_postgresql()
    if _index_exists():
        op.drop_index(_INDEX, table_name=_TABLE)
