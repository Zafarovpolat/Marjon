"""Split Product positions per product type (Блюда vs Товары).

Data-only migration (same pattern as v31sort01): separate 1..N sequences per
(company_id, product_type, is_active), stable (sort_order, created_at, id)
order. NULL product_type coalesces to 'dish' first. Mixed listings now order
by product_type first (see ProductRepository._base_query). Downgrade retains
the valid sequences; take a backup before upgrading.

Revision ID: v40typ01
Revises: v39avl01
Create Date: 2026-10-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v40typ01"
down_revision: Union[str, None] = "v39avl01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    if connection.dialect.name == "postgresql":
        # Block product writers during the atomic normalization statements.
        connection.execute(sa.text("LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE"))
    connection.execute(sa.text(
        "UPDATE products SET product_type = 'dish' WHERE product_type IS NULL"
    ))
    connection.execute(sa.text("""
        WITH ranked AS (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY company_id, COALESCE(product_type, 'dish'), is_active
                ORDER BY sort_order ASC, created_at ASC, id ASC
            ) AS position
            FROM products
        )
        UPDATE products
        SET sort_order = (SELECT position FROM ranked WHERE ranked.id = products.id)
        WHERE sort_order IS NULL OR sort_order <> (
            SELECT position FROM ranked WHERE ranked.id = products.id
        )
    """))


def downgrade() -> None:
    # Deliberately retain the valid sequences; recover old values from the backup.
    pass
