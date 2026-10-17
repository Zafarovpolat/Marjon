"""Add company-owned units and tenant-safe product unit references.

Revision ID: un02cmp01
Revises: wh02mrg01
Create Date: 2026-10-03

Existing nm_units rows remain untouched and therefore become global system
units (company_id IS NULL). Existing products remain untouched (unit_id NULL).

Originally chained onto a tuple (wh01exp01, c6d7ftrs10) — redundant, since
c6d7ftrs10 is already an ancestor of wh01exp01 on this line. Re-pointed onto
wh02mrg01 (wh01exp01's actual single child here) when merging
feature/toast-notifications a second time, to keep the single-head chain.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "un02cmp01"
down_revision: Union[str, None] = "wh02mrg01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "nm_units",
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_nm_units_company_id_companies",
        "nm_units",
        "companies",
        ["company_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_nm_units_company_id", "nm_units", ["company_id"], unique=False)

    op.add_column(
        "products",
        sa.Column("unit_id", sa.Uuid(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_products_unit_id_nm_units",
        "products",
        "nm_units",
        ["unit_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_products_unit_id", "products", ["unit_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_products_unit_id", table_name="products")
    op.drop_constraint("fk_products_unit_id_nm_units", "products", type_="foreignkey")
    op.drop_column("products", "unit_id")

    op.drop_index("ix_nm_units_company_id", table_name="nm_units")
    op.drop_constraint("fk_nm_units_company_id_companies", "nm_units", type_="foreignkey")
    op.drop_column("nm_units", "company_id")
