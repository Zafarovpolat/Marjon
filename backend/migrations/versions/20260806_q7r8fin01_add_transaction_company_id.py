"""Add company_id to fin_transactions (BE-04)

/finance/transactions was reached by both the HQ admin panel and the
owner/kafe app under the same path with different intended semantics:
FinTransaction only had organization_id (an HQ concept), so the kafe-side
handlers in kafe_compat/router.py — despite their own comment claiming
"company-scoped" — never actually filtered by company at all. This adds
the missing column so the kafe endpoints can be genuinely company-scoped,
while the HQ endpoints (now moved to /hq/finance/*) keep using
organization_id unchanged.

Revision ID: q7r8fin01
Revises: p5q6logo1
Create Date: 2026-08-06
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.types import Uuid

revision: str = "q7r8fin01"
down_revision: Union[str, None] = "p5q6logo1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        column["name"]: column
        for column in inspector.get_columns("fin_transactions")
    }

    if "company_id" not in columns:
        op.add_column(
            "fin_transactions",
            sa.Column("company_id", Uuid(as_uuid=True), nullable=True),
        )
    else:
        company_column = columns["company_id"]
        if not isinstance(company_column["type"], sa.Uuid):
            raise RuntimeError(
                "fin_transactions.company_id exists with a non-UUID type"
            )
        if not company_column["nullable"]:
            raise RuntimeError(
                "fin_transactions.company_id exists but is not nullable"
            )

    company_foreign_keys = [
        foreign_key
        for foreign_key in inspector.get_foreign_keys("fin_transactions")
        if foreign_key["constrained_columns"] == ["company_id"]
    ]
    expected_foreign_key_exists = any(
        foreign_key["referred_table"] == "companies"
        and foreign_key["referred_columns"] == ["id"]
        for foreign_key in company_foreign_keys
    )
    if company_foreign_keys and not expected_foreign_key_exists:
        raise RuntimeError(
            "fin_transactions.company_id has an unexpected foreign key"
        )
    if not expected_foreign_key_exists:
        op.create_foreign_key(
            "fk_fin_transactions_company_id_companies",
            "fin_transactions",
            "companies",
            ["company_id"],
            ["id"],
            ondelete="SET NULL",
        )

    indexes = {
        index["name"]: index
        for index in inspector.get_indexes("fin_transactions")
    }
    company_index = indexes.get("ix_fin_transactions_company_id")
    if company_index is None:
        op.create_index(
            "ix_fin_transactions_company_id",
            "fin_transactions",
            ["company_id"],
        )
    elif company_index["column_names"] != ["company_id"]:
        raise RuntimeError(
            "ix_fin_transactions_company_id exists on unexpected columns"
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    index_names = {
        index["name"] for index in inspector.get_indexes("fin_transactions")
    }
    if "ix_fin_transactions_company_id" in index_names:
        op.drop_index(
            "ix_fin_transactions_company_id",
            table_name="fin_transactions",
        )
    column_names = {
        column["name"] for column in inspector.get_columns("fin_transactions")
    }
    if "company_id" in column_names:
        op.drop_column("fin_transactions", "company_id")
