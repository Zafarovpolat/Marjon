"""organization-company bridge

ORG-BRIDGE-01: HQ's `Organization` (the admin-panel's tenant concept) had no
relationship to `Company` (the owner/kafe app's actual tenant) — creating an
organization from the HQ panel only ever added a directory row; the client
it represents had no way to log into the POS app. This adds an optional
1:1 link so HQ-panel organization creation can provision a real Company (+
owner User) and record the result here.

Revision ID: org01
Revises: mg03merge
Create Date: 2026-10-22

На сервере эта ревизия была навешена на pwlock01 — рядом с уже существовавшей
линией mg03merge, то есть второй головой. При переносе в main она перевешена
на mg03merge: upgrade идемпотентен (колонка проверяется через
_existing_columns), поэтому сервер, чья БД уже стояла на tz01, доводится
`stamp pwlock01` + `upgrade head` без потери данных.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "org01"
down_revision: Union[str, Sequence[str], None] = "mg03merge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    bind = op.get_bind()
    return {col["name"] for col in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    if "company_id" not in _existing_columns("organizations"):
        op.add_column(
            "organizations",
            sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            "fk_organizations_company_id", "organizations", "companies",
            ["company_id"], ["id"], ondelete="SET NULL",
        )
        op.create_unique_constraint("uq_organizations_company_id", "organizations", ["company_id"])


def downgrade() -> None:
    op.drop_constraint("uq_organizations_company_id", "organizations", type_="unique")
    op.drop_constraint("fk_organizations_company_id", "organizations", type_="foreignkey")
    op.drop_column("organizations", "company_id")
