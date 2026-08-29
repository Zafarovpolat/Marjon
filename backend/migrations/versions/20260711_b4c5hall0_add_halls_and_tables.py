"""Add the base halls and tables schema.

Revision ID: b4c5hall0
Revises: b3f4shift01
Create Date: 2026-07-11

The halls models entered the application between these revisions without a
matching migration.  A marker comment lets downgrade remove only tables that
this revision actually created; legacy tables discovered during upgrade are
never claimed or dropped.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector
from sqlalchemy.types import Uuid


revision: str = "b4c5hall0"
down_revision: Union[str, None] = "b3f4shift01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CREATED_COMMENT = "Created by Alembic revision b4c5hall0"


def _index_names(inspector: Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "halls" not in existing_tables:
        op.create_table(
            "halls",
            sa.Column("company_id", Uuid(as_uuid=True), nullable=False),
            sa.Column("branch_id", Uuid(as_uuid=True), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("id", Uuid(as_uuid=True), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["branch_id"], ["branches.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["company_id"], ["companies.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            comment=_CREATED_COMMENT,
        )
        op.create_index("ix_halls_branch_id", "halls", ["branch_id"])
        op.create_index("ix_halls_company_id", "halls", ["company_id"])
    else:
        hall_indexes = _index_names(inspector, "halls")
        if "ix_halls_branch_id" not in hall_indexes:
            op.create_index("ix_halls_branch_id", "halls", ["branch_id"])
        if "ix_halls_company_id" not in hall_indexes:
            op.create_index("ix_halls_company_id", "halls", ["company_id"])

    if "tables" not in existing_tables:
        op.create_table(
            "tables",
            sa.Column("hall_id", Uuid(as_uuid=True), nullable=False),
            sa.Column("number", sa.Integer(), nullable=False),
            sa.Column("capacity", sa.Integer(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("id", Uuid(as_uuid=True), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["hall_id"], ["halls.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            comment=_CREATED_COMMENT,
        )
        op.create_index("ix_tables_hall_id", "tables", ["hall_id"])
    elif "ix_tables_hall_id" not in _index_names(inspector, "tables"):
        op.create_index("ix_tables_hall_id", "tables", ["hall_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if (
        "tables" in existing_tables
        and inspector.get_table_comment("tables").get("text") == _CREATED_COMMENT
    ):
        op.drop_table("tables")
    if (
        "halls" in existing_tables
        and inspector.get_table_comment("halls").get("text") == _CREATED_COMMENT
    ):
        op.drop_table("halls")
