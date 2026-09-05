"""Add orders.cancel_comment, missing since the model gained it

Same class of bug as k8l9sync01: Order.cancel_comment (app/modules/pos/models.py)
is filled by the cancel flow in app/modules/pos/service.py, but no migration ever
created the column -- orders is created by 3dd82166af1e, and afterwards only
e9f0idx01 (indexes) and k8l9sync01 (customer_phone/customer_address/
receipt_printed_at) touch it.

On a database built purely by migrations every SELECT of the Order model
therefore fails with UndefinedColumnError. That is where seed.py dies right
after the adm_image_backgrounds fix: before inserting a demo order it looks the
order up by order_number, and the SELECT lists every mapped column.

The column is added only when missing, for the same reason as in y2z3imgbg06: a
database bootstrapped by create_tables.py (metadata.create_all + `alembic stamp
head`) already has it and may still be stamped at an earlier revision.

Revision ID: z3a4ordcmt07
Revises: y2z3imgbg06
Create Date: 2026-09-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "z3a4ordcmt07"
down_revision: Union[str, None] = "y2z3imgbg06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "orders"
_COLUMN = "cancel_comment"


def _columns() -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade() -> None:
    if _COLUMN not in _columns():
        op.add_column(_TABLE, sa.Column(_COLUMN, sa.Text(), nullable=True))


def downgrade() -> None:
    if _COLUMN in _columns():
        op.drop_column(_TABLE, _COLUMN)
