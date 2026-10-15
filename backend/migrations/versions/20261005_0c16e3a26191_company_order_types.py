"""company order_types (типы заказа: dine_in/takeaway/delivery).

NULL = все включены (как раньше).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0c16e3a26191'
down_revision: Union[str, None] = '3231976db538'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("order_types", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("companies", "order_types")
