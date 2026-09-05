"""Align adm_image_backgrounds with the ImageBackground model

The table is created in exactly one place -- a1f2admin01 -- with
name/photo/id/created_at/updated_at, and no later revision touches it. The model
(app/modules/admin_settings/models.py) additionally declares company_id (a
background belongs to a company), sort_order and is_active. So on a database
built purely by migrations every SELECT of that model fails with
UndefinedColumnError: column adm_image_backgrounds.company_id does not exist --
which is exactly where seed.py dies on a clean PostgreSQL.

photo is widened String(512) -> Text for the same reason: the column holds
either a URL or a data:image/...;base64 payload, and the latter does not fit in
512 characters.

Columns are added only when missing. A database bootstrapped by
create_tables.py (metadata.create_all + `alembic stamp head`, the local SQLite
path) already has them, and such a database may still be stamped at an earlier
revision. The photo retype is skipped on SQLite, whose dialect has no ALTER
COLUMN TYPE.

Revision ID: y2z3imgbg06
Revises: bi06tnu03
Create Date: 2026-09-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "y2z3imgbg06"
down_revision: Union[str, None] = "bi06tnu03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "adm_image_backgrounds"
_INDEX = "ix_adm_image_backgrounds_company_id"


def _columns() -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def _indexes() -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(_TABLE)}


def _supports_alter_type() -> bool:
    return op.get_bind().dialect.name != "sqlite"


def upgrade() -> None:
    existing = _columns()

    if "company_id" not in existing:
        op.add_column(
            _TABLE,
            sa.Column(
                "company_id",
                sa.Uuid(as_uuid=True),
                sa.ForeignKey("companies.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )
    if _INDEX not in _indexes():
        op.create_index(_INDEX, _TABLE, ["company_id"])

    # sort_order/is_active в модели не-Optional с питоновскими дефолтами, поэтому
    # NOT NULL + server_default: у уже существующих строк значения взять негде.
    if "sort_order" not in existing:
        op.add_column(
            _TABLE,
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        )
    if "is_active" not in existing:
        op.add_column(
            _TABLE,
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    if _supports_alter_type():
        op.alter_column(
            _TABLE,
            "photo",
            existing_type=sa.String(length=512),
            type_=sa.Text(),
            existing_nullable=True,
        )


def downgrade() -> None:
    if _supports_alter_type():
        op.alter_column(
            _TABLE,
            "photo",
            existing_type=sa.Text(),
            type_=sa.String(length=512),
            existing_nullable=True,
        )

    existing = _columns()
    if "is_active" in existing:
        op.drop_column(_TABLE, "is_active")
    if "sort_order" in existing:
        op.drop_column(_TABLE, "sort_order")
    if _INDEX in _indexes():
        op.drop_index(_INDEX, table_name=_TABLE)
    if "company_id" in existing:
        op.drop_column(_TABLE, "company_id")
