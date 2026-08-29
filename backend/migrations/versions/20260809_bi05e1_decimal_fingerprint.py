"""Version durable financial-operation fingerprints.

Revision ID: bi05e1fp22
Revises: bi05c1loc21
Create Date: 2026-08-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi05e1fp22"
down_revision: Union[str, None] = "bi05c1loc21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _require_postgresql() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("BI-05E1 migration requires PostgreSQL")


def upgrade() -> None:
    _require_postgresql()
    op.add_column(
        "financial_operations",
        sa.Column(
            "fingerprint_version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )
    op.create_check_constraint(
        "ck_financial_operations_fingerprint_version",
        "financial_operations",
        "fingerprint_version IN (1, 2)",
    )
    op.alter_column(
        "financial_operations",
        "fingerprint_version",
        server_default=sa.text("2"),
    )


def downgrade() -> None:
    _require_postgresql()
    v2_rows = int(
        op.get_bind()
        .execute(
            sa.text(
                "SELECT count(*) FROM financial_operations "
                "WHERE fingerprint_version = 2"
            )
        )
        .scalar_one()
    )
    if v2_rows:
        raise RuntimeError(
            "BI-05E1 downgrade refused: V2 financial-operation fingerprints "
            "cannot be replayed by the legacy application"
        )
    op.drop_constraint(
        "ck_financial_operations_fingerprint_version",
        "financial_operations",
        type_="check",
    )
    op.drop_column("financial_operations", "fingerprint_version")
