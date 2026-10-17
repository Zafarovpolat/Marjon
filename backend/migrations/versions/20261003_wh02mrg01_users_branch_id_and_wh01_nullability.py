"""WH-02: add users.branch_id (model gained it, migration never did) and
align WH-01 expense/waste document nullability with their models.

Surfaced by the origin/main <-> redesign-mobile merge's Postgres parity test
(requires TEST_DATABASE_URL, so neither side's regular CI runs it alone):

  * `User.branch_id` (auth/models.py) is read/written by branch-login's
    terminal-user creation, create_company_user/update_company_user, and
    the branch-scoped /auth/staff-users listing — but no migration ever
    created the column, so a fresh Postgres schema would 500 the moment any
    of that code ran a real query against it.
  * expense_documents / expense_document_items / waste_documents (WH-01,
    20260929_wh01exp01) were created with every non-PK column nullable=True,
    while their SQLAlchemy models (inventory/warehouse_models.py) declare
    them as plain (non-Optional) Mapped[...] — i.e. NOT NULL was intended.

Revision ID: wh02mrg01
Revises: wh01exp01
Create Date: 2026-10-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "wh02mrg01"
down_revision: Union[str, None] = "wh01exp01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NOT_NULL_COLUMNS = (
    ("expense_documents", "items_count"),
    ("expense_documents", "total_amount"),
    ("expense_documents", "status"),
    ("expense_document_items", "quantity"),
    ("expense_document_items", "unit"),
    ("expense_document_items", "cost_price"),
    ("expense_document_items", "total"),
    ("waste_documents", "quantity"),
    ("waste_documents", "unit"),
    ("waste_documents", "cost_price"),
    ("waste_documents", "total_amount"),
    ("waste_documents", "status"),
    ("waste_documents", "is_automatic"),
)


def _columns_with_nulls() -> list[str]:
    bind = op.get_bind()
    failures: list[str] = []
    for table_name, column_name in _NOT_NULL_COLUMNS:
        count = bind.execute(
            sa.text(f'SELECT count(*) FROM "{table_name}" WHERE "{column_name}" IS NULL')
        ).scalar_one()
        if count:
            failures.append(f"{table_name}.{column_name} ({count} NULL rows)")
    return failures


def upgrade() -> None:
    op.add_column("users", sa.Column("branch_id", sa.Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_users_branch_id", "users", ["branch_id"])

    failures = _columns_with_nulls()
    if failures:
        raise RuntimeError("WH-02 expense/waste NOT NULL preflight failed: " + ", ".join(failures))
    for table_name, column_name in _NOT_NULL_COLUMNS:
        op.alter_column(table_name, column_name, nullable=False)


def downgrade() -> None:
    for table_name, column_name in _NOT_NULL_COLUMNS:
        op.alter_column(table_name, column_name, nullable=True)
    op.drop_index("ix_users_branch_id", table_name="users")
    op.drop_column("users", "branch_id")
