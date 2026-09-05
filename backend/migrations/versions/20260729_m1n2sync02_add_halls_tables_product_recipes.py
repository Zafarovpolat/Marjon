"""Create halls, tables, product_recipes tables

Same class of bug as k8l9sync01: Hall/Table (app/modules/halls/models.py) and
ProductRecipe (app/modules/inventory/models.py) have existed as SQLAlchemy
models for a while, but migrations/env.py never imported halls.models (so
autogenerate never saw it) and no migration ever created product_recipes
either. Found by importing every model module and diffing against the DB.

Revision ID: m1n2sync02
Revises: k8l9sync01
Create Date: 2026-07-29

After the branch merge, halls/tables are already created earlier in the chain by
b4c5hall0, so they are only topped up here when missing (index names match, both
revisions derive them from the same models).  product_recipes exists only in this
lineage, so it stays unconditional -- and it alone is dropped on downgrade:
b4c5hall0 owns halls/tables and removes them via its own marker comment.
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector
from sqlalchemy.types import Uuid

revision: str = "m1n2sync02"
down_revision: Union[str, None] = "k8l9sync01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector: Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "halls" not in existing_tables:
        op.create_table(
            "halls",
            sa.Column("id", Uuid(as_uuid=True), primary_key=True),
            sa.Column("company_id", Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("branch_id", Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    else:
        hall_indexes = _index_names(inspector, "halls")
        if "ix_halls_company_id" not in hall_indexes:
            op.create_index("ix_halls_company_id", "halls", ["company_id"])
        if "ix_halls_branch_id" not in hall_indexes:
            op.create_index("ix_halls_branch_id", "halls", ["branch_id"])

    if "tables" not in existing_tables:
        op.create_table(
            "tables",
            sa.Column("id", Uuid(as_uuid=True), primary_key=True),
            sa.Column("hall_id", Uuid(as_uuid=True), sa.ForeignKey("halls.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("number", sa.Integer(), nullable=False),
            sa.Column("capacity", sa.Integer(), nullable=False, server_default="4"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    elif "ix_tables_hall_id" not in _index_names(inspector, "tables"):
        op.create_index("ix_tables_hall_id", "tables", ["hall_id"])

    op.create_table(
        "product_recipes",
        sa.Column("id", Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("product_id", Uuid(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("ingredient_id", Uuid(as_uuid=True), sa.ForeignKey("ingredients.id"), nullable=False, index=True),
        sa.Column("quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("unit", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("product_recipes")
