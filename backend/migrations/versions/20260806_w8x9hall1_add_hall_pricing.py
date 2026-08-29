"""Add place-pricing fields to halls (BE-14)

Текущий /halls didn't match the "places" screen at all —
SettingsPlacesPage.jsx posts {name, condition, percent, payment_type} to
this exact endpoint (no branch_id), while HallCreate only knew name/
description/branch_id (branch_id required, no default). Extended the
existing Hall model (ТЗ's "Вариант A") rather than adding a parallel
/settings/places endpoint, since the frontend already targets /halls.

Revision ID: w8x9hall1
Revises: v6w7prn1
Create Date: 2026-08-06
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector
from sqlalchemy.types import Uuid

revision: str = "w8x9hall1"
down_revision: Union[str, None] = "v6w7prn1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector: Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _ensure_legacy_base_tables(inspector: Inspector) -> None:
    """Recover old chains where the inserted base revision is implicit.

    Databases already beyond b4c5hall0 treat it as an applied ancestor.  The
    old graph could reach that state without halls because the models entered
    the application without an Alembic revision.
    """
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
        )
        op.create_index("ix_tables_hall_id", "tables", ["hall_id"])
    elif "ix_tables_hall_id" not in _index_names(inspector, "tables"):
        op.create_index("ix_tables_hall_id", "tables", ["hall_id"])


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    _ensure_legacy_base_tables(inspector)
    columns = {
        column["name"] for column in inspector.get_columns("halls")
    }

    if "condition" not in columns:
        op.add_column("halls", sa.Column("condition", sa.Text(), nullable=True))
    if "percent" not in columns:
        op.add_column(
            "halls",
            sa.Column("percent", sa.Numeric(5, 2), nullable=True),
        )
    if "pricing_type" not in columns:
        op.add_column(
            "halls",
            sa.Column("pricing_type", sa.String(20), nullable=True),
        )
    if "payment_type_id" not in columns:
        op.add_column(
            "halls",
            sa.Column(
                "payment_type_id",
                Uuid(as_uuid=True),
                sa.ForeignKey("fin_payment_types.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "halls" not in inspector.get_table_names():
        return
    columns = {
        column["name"] for column in inspector.get_columns("halls")
    }
    for column_name in (
        "payment_type_id",
        "pricing_type",
        "percent",
        "condition",
    ):
        if column_name in columns:
            op.drop_column("halls", column_name)
