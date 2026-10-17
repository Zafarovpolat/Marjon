"""V3.2/V3.3 — Product stop-reason flag for safe manual/auto-stop distinction.

Adds products.limit_auto_stopped (NOT NULL boolean, default false).
Only the POS auto-stop on quota exhaustion sets it; every manual action
(availability PATCH, absolute limit PATCH, allowance reset, top-up unlock)
clears it. A top-up therefore lifts only exhaustion stops — a manual lock
survives top-ups even when the quota is exhausted.

V3.3 correction: NO backfill UPDATE. The old heuristic
(unavailable + limit set + sold >= limit) does NOT prove an automatic stop —
a manually stopped, exhausted product matches it too. All existing rows keep
FALSE (ambiguous historical stops stay manual/unknown and are NEVER reopened
automatically). New auto-stop events set the flag from deploy on; new manual
actions clear it.

Safe re-enable path for a previously exhausted product whose stop reason is
unknown: authorized PATCH /inventory/products/{id}/availability
{"is_available": true} (or absolute PATCH /limit with a number, which also
returns it to sale). Both are explicit human actions that clear the flag.
Availability of every row is left untouched by this migration.

Idempotent like sibling column-restore migrations: a DB bootstrapped by
create_tables.py already has the column.

Revision ID: v34stop01
Revises: v33top01
Create Date: 2026-10-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v34stop01"
down_revision: Union[str, None] = "v33top01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "limit_auto_stopped" not in _columns("products"):
        op.add_column(
            "products",
            sa.Column("limit_auto_stopped", sa.Boolean(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    if "limit_auto_stopped" in _columns("products"):
        op.drop_column("products", "limit_auto_stopped")
