"""Enforce local payment and fiscal transaction integrity.

Revision ID: bi05c1loc21
Revises: bi05aown20
Create Date: 2026-08-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bi05c1loc21"
down_revision: Union[str, None] = "bi05aown20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _require_postgresql() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("BI-05C1 migration requires PostgreSQL")


def _scalar(sql: str) -> int:
    return int(op.get_bind().execute(sa.text(sql)).scalar_one())


def _preflight() -> dict[str, int]:
    counts = {
        "payments_scanned": _scalar("SELECT count(*) FROM payments"),
        "payment_orphans": _scalar(
            """
            SELECT count(*)
            FROM payments p
            LEFT JOIN orders o ON o.id = p.order_id
            WHERE o.id IS NULL
            """
        ),
        "payment_company_mismatches": _scalar(
            """
            SELECT count(*)
            FROM payments p
            JOIN orders o ON o.id = p.order_id
            WHERE p.company_id IS DISTINCT FROM o.company_id
            """
        ),
        "receipts_scanned": _scalar("SELECT count(*) FROM fiscal_receipts"),
        "receipt_orphans": _scalar(
            """
            SELECT count(*)
            FROM fiscal_receipts r
            LEFT JOIN payments p ON p.id = r.payment_id
            LEFT JOIN orders o ON o.id = r.order_id
            WHERE p.id IS NULL OR o.id IS NULL
            """
        ),
        "receipt_relation_mismatches": _scalar(
            """
            SELECT count(*)
            FROM fiscal_receipts r
            JOIN payments p ON p.id = r.payment_id
            JOIN orders o ON o.id = r.order_id
            WHERE r.company_id IS DISTINCT FROM p.company_id
               OR r.order_id IS DISTINCT FROM p.order_id
               OR r.company_id IS DISTINCT FROM o.company_id
               OR p.company_id IS DISTINCT FROM o.company_id
            """
        ),
        "duplicate_receipt_groups": _scalar(
            """
            SELECT count(*)
            FROM (
                SELECT payment_id
                FROM fiscal_receipts
                GROUP BY payment_id
                HAVING count(*) > 1
            ) duplicates
            """
        ),
    }
    invalid_keys = (
        "payment_orphans",
        "payment_company_mismatches",
        "receipt_orphans",
        "receipt_relation_mismatches",
        "duplicate_receipt_groups",
    )
    if any(counts[key] for key in invalid_keys):
        summary = ", ".join(f"{key}={value}" for key, value in counts.items())
        raise RuntimeError(
            "BI-05C1 legacy integrity preflight failed; manual reconciliation "
            f"is required before migration: {summary}"
        )
    return counts


def upgrade() -> None:
    _require_postgresql()
    _preflight()

    op.create_unique_constraint(
        "uq_orders_id_company", "orders", ["id", "company_id"]
    )
    op.create_unique_constraint(
        "uq_payments_id_company_order",
        "payments",
        ["id", "company_id", "order_id"],
    )
    op.create_unique_constraint(
        "uq_fiscal_receipts_id_company",
        "fiscal_receipts",
        ["id", "company_id"],
    )
    op.create_unique_constraint(
        "uq_fiscal_receipts_payment", "fiscal_receipts", ["payment_id"]
    )

    op.execute(
        """
        ALTER TABLE payments
        ADD CONSTRAINT fk_payments_order_company
        FOREIGN KEY (order_id, company_id)
        REFERENCES orders (id, company_id)
        NOT VALID
        """
    )
    op.execute(
        "ALTER TABLE payments VALIDATE CONSTRAINT fk_payments_order_company"
    )
    op.execute(
        """
        ALTER TABLE fiscal_receipts
        ADD CONSTRAINT fk_fiscal_receipts_payment_company_order
        FOREIGN KEY (payment_id, company_id, order_id)
        REFERENCES payments (id, company_id, order_id)
        NOT VALID
        """
    )
    op.execute(
        "ALTER TABLE fiscal_receipts "
        "VALIDATE CONSTRAINT fk_fiscal_receipts_payment_company_order"
    )

    op.create_table(
        "fiscal_settings",
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=True),
        sa.Column("tin", sa.String(length=32), nullable=True),
        sa.Column("credential_ref", sa.String(length=255), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "NOT enabled OR ("
            "provider IS NOT NULL AND length(trim(provider)) > 0 AND "
            "tin IS NOT NULL AND length(trim(tin)) > 0 AND "
            "credential_ref IS NOT NULL AND length(trim(credential_ref)) > 0"
            ")",
            name="ck_fiscal_settings_enabled_metadata",
        ),
        sa.CheckConstraint(
            "credential_ref IS NULL OR ("
            "length(credential_ref) BETWEEN 10 AND 255 AND "
            "(credential_ref LIKE 'secret://%' OR "
            "credential_ref LIKE 'vault://%' OR "
            "credential_ref LIKE 'test://%') AND "
            "credential_ref NOT LIKE '% %' AND "
            "credential_ref NOT LIKE '%=%' AND "
            "lower(credential_ref) NOT LIKE '%bearer%' AND "
            "lower(credential_ref) NOT LIKE '%password%' AND "
            "lower(credential_ref) NOT LIKE '%api_key%' AND "
            "lower(credential_ref) NOT LIKE '%token%'"
            ")",
            name="ck_fiscal_settings_credential_ref",
        ),
        sa.ForeignKeyConstraint(
            ["company_id"], ["companies.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", name="uq_fiscal_settings_company"),
    )
    op.create_index(
        "ix_fiscal_settings_company_id", "fiscal_settings", ["company_id"]
    )

    op.create_table(
        "fiscal_outbox",
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("receipt_id", sa.Uuid(), nullable=False),
        sa.Column(
            "event_type",
            sa.String(length=50),
            server_default="submit_receipt",
            nullable=False,
        ),
        sa.Column(
            "status", sa.String(length=32), server_default="pending", nullable=False
        ),
        sa.Column(
            "attempt_count", sa.Integer(), server_default="0", nullable=False
        ),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by", sa.String(length=128), nullable=True),
        sa.Column("last_error_code", sa.String(length=100), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'blocked_provider_contract', 'completed')",
            name="ck_fiscal_outbox_status",
        ),
        sa.CheckConstraint(
            "attempt_count >= 0", name="ck_fiscal_outbox_attempts"
        ),
        sa.ForeignKeyConstraint(
            ["company_id"], ["companies.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["receipt_id"], ["fiscal_receipts.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["receipt_id", "company_id"],
            ["fiscal_receipts.id", "fiscal_receipts.company_id"],
            name="fk_fiscal_outbox_receipt_company",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "receipt_id", "event_type", name="uq_fiscal_outbox_receipt_event"
        ),
    )
    op.create_index(
        "ix_fiscal_outbox_company_id", "fiscal_outbox", ["company_id"]
    )
    op.create_index(
        "ix_fiscal_outbox_receipt_id", "fiscal_outbox", ["receipt_id"]
    )
    op.create_index(
        "ix_fiscal_outbox_claim",
        "fiscal_outbox",
        ["status", "next_attempt_at", "locked_at"],
    )


def downgrade() -> None:
    _require_postgresql()
    settings_count = _scalar("SELECT count(*) FROM fiscal_settings")
    outbox_count = _scalar("SELECT count(*) FROM fiscal_outbox")
    if settings_count or outbox_count:
        raise RuntimeError(
            "BI-05C1 downgrade would discard local fiscal data: "
            f"fiscal_settings={settings_count}, fiscal_outbox={outbox_count}"
        )

    op.drop_index("ix_fiscal_outbox_claim", table_name="fiscal_outbox")
    op.drop_index("ix_fiscal_outbox_receipt_id", table_name="fiscal_outbox")
    op.drop_index("ix_fiscal_outbox_company_id", table_name="fiscal_outbox")
    op.drop_table("fiscal_outbox")
    op.drop_index("ix_fiscal_settings_company_id", table_name="fiscal_settings")
    op.drop_table("fiscal_settings")

    op.drop_constraint(
        "fk_fiscal_receipts_payment_company_order",
        "fiscal_receipts",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_payments_order_company", "payments", type_="foreignkey"
    )
    op.drop_constraint(
        "uq_fiscal_receipts_payment", "fiscal_receipts", type_="unique"
    )
    op.drop_constraint(
        "uq_fiscal_receipts_id_company", "fiscal_receipts", type_="unique"
    )
    op.drop_constraint(
        "uq_payments_id_company_order", "payments", type_="unique"
    )
    op.drop_constraint("uq_orders_id_company", "orders", type_="unique")
