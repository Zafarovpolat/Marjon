from __future__ import annotations
from datetime import datetime
from uuid import UUID
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid
from app.shared.base_model import TimeStampedModel


class FiscalReceipt(TimeStampedModel):
    __tablename__ = "fiscal_receipts"
    __table_args__ = (
        UniqueConstraint("payment_id", name="uq_fiscal_receipts_payment"),
        UniqueConstraint(
            "id", "company_id", name="uq_fiscal_receipts_id_company"
        ),
        ForeignKeyConstraint(
            ["payment_id", "company_id", "order_id"],
            ["payments.id", "payments.company_id", "payments.order_id"],
            name="fk_fiscal_receipts_payment_company_order",
        ),
    )

    company_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("companies.id"), index=True)
    order_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("orders.id"), index=True)
    payment_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("payments.id"), index=True)
    # pending | sent | failed
    status: Mapped[str] = mapped_column(String(20), default="pending")
    fiscal_code: Mapped[str | None] = mapped_column(String(255))
    receipt_url: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(50), default="ofd_uz")
    error_message: Mapped[str | None] = mapped_column(Text)


class FiscalSettings(TimeStampedModel):
    """Company-owned fiscal metadata. Credentials never live in this table."""

    __tablename__ = "fiscal_settings"
    __table_args__ = (
        UniqueConstraint("company_id", name="uq_fiscal_settings_company"),
        CheckConstraint(
            "NOT enabled OR ("
            "provider IS NOT NULL AND length(trim(provider)) > 0 AND "
            "tin IS NOT NULL AND length(trim(tin)) > 0 AND "
            "credential_ref IS NOT NULL AND length(trim(credential_ref)) > 0"
            ")",
            name="ck_fiscal_settings_enabled_metadata",
        ),
        CheckConstraint(
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
    )

    company_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    credential_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)


class FiscalOutbox(TimeStampedModel):
    """Durable local intent. No provider credentials or request payloads."""

    __tablename__ = "fiscal_outbox"
    __table_args__ = (
        UniqueConstraint(
            "receipt_id", "event_type", name="uq_fiscal_outbox_receipt_event"
        ),
        ForeignKeyConstraint(
            ["receipt_id", "company_id"],
            ["fiscal_receipts.id", "fiscal_receipts.company_id"],
            name="fk_fiscal_outbox_receipt_company",
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "status IN ('pending', 'blocked_provider_contract', 'completed')",
            name="ck_fiscal_outbox_status",
        ),
        CheckConstraint("attempt_count >= 0", name="ck_fiscal_outbox_attempts"),
        Index(
            "ix_fiscal_outbox_claim",
            "status",
            "next_attempt_at",
            "locked_at",
        ),
    )

    company_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    receipt_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("fiscal_receipts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(50), default="submit_receipt", nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(32), default="pending", nullable=False
    )
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    locked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    locked_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
