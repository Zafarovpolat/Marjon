"""Create halls, tables, product_recipes tables

Same class of bug as k8l9sync01: Hall/Table (app/modules/halls/models.py) and
ProductRecipe (app/modules/inventory/models.py) have existed as SQLAlchemy
models for a while, but migrations/env.py never imported halls.models (so
autogenerate never saw it) and no migration ever created product_recipes
either. Found by importing every model module and diffing against the DB.

Revision ID: m1n2sync02
Revises: k8l9sync01
Create Date: 2026-07-29
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.types import Uuid

revision: str = "m1n2sync02"
down_revision: Union[str, None] = "k8l9sync01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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
    op.drop_table("tables")
    op.drop_table("halls")
