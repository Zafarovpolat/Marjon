"""Restore branch terminal login credentials (branches.login / password_hash)

The desktop cashier app signs in through POST /auth/branch-login (branch phone
+ password), and Branch.login / Branch.password_hash back that flow. The
consolidated upstream chain dropped them while the desktop kept calling the
endpoint. Idempotent: databases that already ran the older v9w0brnlog03
migration keep their columns.

Revision ID: d7e8brnlog11
Revises: c6d7ftrs10
Create Date: 2026-09-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7e8brnlog11"
down_revision: Union[str, None] = "c6d7ftrs10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {c["name"] for c in inspector.get_columns("branches")}
    if "login" not in columns:
        op.add_column("branches", sa.Column("login", sa.String(100), nullable=True))
    if "password_hash" not in columns:
        op.add_column("branches", sa.Column("password_hash", sa.String(255), nullable=True))
    indexes = {i["name"] for i in inspector.get_indexes("branches")}
    if "ix_branches_login" not in indexes:
        op.create_index("ix_branches_login", "branches", ["login"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_branches_login", table_name="branches")
    op.drop_column("branches", "password_hash")
    op.drop_column("branches", "login")
