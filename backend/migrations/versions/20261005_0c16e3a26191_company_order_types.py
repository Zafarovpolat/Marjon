"""company order_types (типы заказа: dine_in/takeaway/delivery).

NULL = все включены (как раньше).

Chained onto v24auto01 when merging feature/toast-notifications a second
time: that branch had since grown its own un02cmp01 -> v24auto01 line on
top of wh02mrg01, and added a v45mrg01 no-op stub re-joining this migration
there — dropped (same reasoning as the c6d7ftrs10+wh01exp01 stub this
migration itself replaced originally) since v24auto01 -> this -> v25cat01
already keeps everything on one line.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '0c16e3a26191'
down_revision: Union[str, None] = 'v24auto01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Cross-DB JSON: JSONB on Postgres, plain JSON on SQLite — matches the model
# (app/modules/organizations/models.py: JsonType) and sibling migrations
# (e.g. c6d7ftrs10's receipt_template / kitchen_receipt_template).
_JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.add_column("companies", sa.Column("order_types", _JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("companies", "order_types")
