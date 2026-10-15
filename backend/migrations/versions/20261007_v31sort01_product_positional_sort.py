"""Normalize Product positions separately per company and active state.

Data-only migration: no columns, constraints, timestamps or other product data
are changed. Previous ambiguous positions cannot be reconstructed by downgrade;
take a backup before upgrading. The rank uses stable created_at/id tie breakers.
"""
from alembic import op
import sqlalchemy as sa

revision: str = "v31sort01"
down_revision: str = "v26sup01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    if connection.dialect.name == "postgresql":
        # Block product writers during the single atomic normalization statement.
        connection.execute(sa.text("LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE"))
    connection.execute(sa.text("""
        WITH ranked AS (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY company_id, is_active
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
    # Deliberately retain the valid sequence; recover old values from the backup.
    pass
