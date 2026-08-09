from __future__ import annotations
from datetime import datetime
from uuid import UUID
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid
from app.shared.base_model import SoftDeleteMixin, TimeStampedModel
from app.modules.organizations.models import JsonType


class Counterparty(TimeStampedModel, SoftDeleteMixin):
    __tablename__ = "fin_counterparties"
    __table_args__ = (
        CheckConstraint(
            "(scope_kind = 'company' AND company_id IS NOT NULL AND organization_id IS NULL) OR "
            "(scope_kind = 'organization' AND organization_id IS NOT NULL AND company_id IS NULL) OR "
            "(scope_kind = 'legacy' AND company_id IS NULL AND organization_id IS NULL)",
            name="ck_fin_counterparties_ownership",
        ),
        Index("ix_fin_counterparties_scope_kind", "scope_kind"),
        Index("ix_fin_counterparties_company", "company_id"),
        Index("ix_fin_counterparties_organization", "organization_id"),
    )

    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    balance: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    type: Mapped[str] = mapped_column(String(32), default="client")  # provider|client|employee|other
    scope_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="legacy")
    company_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT")
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT")
    )


class PaymentType(TimeStampedModel):
    __tablename__ = "fin_payment_types"
    __table_args__ = (
        CheckConstraint(
            "(scope_kind = 'system' AND company_id IS NULL AND organization_id IS NULL AND source_template_id IS NULL) OR "
            "(scope_kind = 'company' AND company_id IS NOT NULL AND organization_id IS NULL) OR "
            "(scope_kind = 'organization' AND organization_id IS NOT NULL AND company_id IS NULL) OR "
            "(scope_kind = 'legacy' AND company_id IS NULL AND organization_id IS NULL AND source_template_id IS NULL)",
            name="ck_fin_payment_types_ownership",
        ),
        Index("ix_fin_payment_types_scope_kind", "scope_kind"),
        Index("ix_fin_payment_types_company", "company_id"),
        Index("ix_fin_payment_types_organization", "organization_id"),
        Index("ix_fin_payment_types_source_template", "source_template_id"),
        Index(
            "uq_fin_payment_types_company_source",
            "company_id", "source_template_id",
            unique=True,
            postgresql_where=text("scope_kind = 'company' AND source_template_id IS NOT NULL"),
            sqlite_where=text("scope_kind = 'company' AND source_template_id IS NOT NULL"),
        ),
        Index(
            "uq_fin_payment_types_organization_source",
            "organization_id", "source_template_id",
            unique=True,
            postgresql_where=text("scope_kind = 'organization' AND source_template_id IS NOT NULL"),
            sqlite_where=text("scope_kind = 'organization' AND source_template_id IS NOT NULL"),
        ),
    )

    sort: Mapped[int] = mapped_column(default=0)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str | None] = mapped_column(String(32))  # card|cash|transfer|...
    status: Mapped[bool] = mapped_column(Boolean, default=True)
    scope_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="legacy")
    company_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT")
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    source_template_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("fin_payment_types.id", ondelete="RESTRICT")
    )


class TransactionCategory(TimeStampedModel):
    __tablename__ = "fin_transaction_categories"
    __table_args__ = (
        CheckConstraint(
            "(scope_kind = 'system' AND company_id IS NULL AND organization_id IS NULL AND source_template_id IS NULL) OR "
            "(scope_kind = 'company' AND company_id IS NOT NULL AND organization_id IS NULL) OR "
            "(scope_kind = 'organization' AND organization_id IS NOT NULL AND company_id IS NULL) OR "
            "(scope_kind = 'legacy' AND company_id IS NULL AND organization_id IS NULL AND source_template_id IS NULL)",
            name="ck_fin_transaction_categories_ownership",
        ),
        Index("ix_fin_transaction_categories_scope_kind", "scope_kind"),
        Index("ix_fin_transaction_categories_company", "company_id"),
        Index("ix_fin_transaction_categories_organization", "organization_id"),
        Index("ix_fin_transaction_categories_source_template", "source_template_id"),
        Index(
            "uq_fin_transaction_categories_company_source",
            "company_id", "source_template_id",
            unique=True,
            postgresql_where=text("scope_kind = 'company' AND source_template_id IS NOT NULL"),
            sqlite_where=text("scope_kind = 'company' AND source_template_id IS NOT NULL"),
        ),
        Index(
            "uq_fin_transaction_categories_organization_source",
            "organization_id", "source_template_id",
            unique=True,
            postgresql_where=text("scope_kind = 'organization' AND source_template_id IS NOT NULL"),
            sqlite_where=text("scope_kind = 'organization' AND source_template_id IS NOT NULL"),
        ),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # income|expense
    parent_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("fin_transaction_categories.id", ondelete="SET NULL")
    )
    status: Mapped[bool] = mapped_column(Boolean, default=True)
    scope_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="legacy")
    company_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT")
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    source_template_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("fin_transaction_categories.id", ondelete="RESTRICT")
    )


class FinTransaction(TimeStampedModel, SoftDeleteMixin):
    __tablename__ = "fin_transactions"

    date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)  # income|expense
    payment_type_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("fin_payment_types.id", ondelete="SET NULL")
    )
    counterparty_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("fin_counterparties.id", ondelete="SET NULL"), index=True
    )
    category_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("fin_transaction_categories.id", ondelete="SET NULL"), index=True
    )
    finance_template_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("fin_templates.id", ondelete="SET NULL"), index=True
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), index=True
    )
    # BE-04: separate from organization_id (HQ concept) — set/filtered by the
    # kafe-panel endpoints (kafe_compat/router.py) so owner data stays scoped
    # to their own company, independent of the HQ admin panel's org-scoping.
    company_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), index=True
    )
    comment: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    # Идемпотентность критичных операций оплаты (ТЗ §4.2)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), index=True)

    counterparty: Mapped[Counterparty | None] = relationship()


class FinancialOperation(TimeStampedModel):
    """Durable idempotency reservation for money-changing operations."""

    __tablename__ = "financial_operations"
    __table_args__ = (
        UniqueConstraint(
            "scope_kind",
            "scope_id",
            "operation_type",
            "idempotency_key",
            name="uq_financial_operations_scope_operation_key",
        ),
    )

    # Polymorphic tenant boundary: company for app/POS operations and
    # organization for HQ finance operations. The application derives and
    # authorizes this scope; it is never accepted as a free-form API field.
    scope_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    scope_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    operation_type: Mapped[str] = mapped_column(String(64), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="processing"
    )
    result_metadata: Mapped[dict | None] = mapped_column(JsonType)


class FinanceTemplate(TimeStampedModel):
    __tablename__ = "fin_templates"
    __table_args__ = (
        CheckConstraint(
            "(scope_kind = 'system' AND company_id IS NULL AND organization_id IS NULL AND source_template_id IS NULL) OR "
            "(scope_kind = 'company' AND company_id IS NOT NULL AND organization_id IS NULL) OR "
            "(scope_kind = 'organization' AND organization_id IS NOT NULL AND company_id IS NULL) OR "
            "(scope_kind = 'legacy' AND company_id IS NULL AND organization_id IS NULL AND source_template_id IS NULL)",
            name="ck_fin_templates_ownership",
        ),
        Index("ix_fin_templates_scope_kind", "scope_kind"),
        Index("ix_fin_templates_company", "company_id"),
        Index("ix_fin_templates_organization", "organization_id"),
        Index("ix_fin_templates_source_template", "source_template_id"),
        Index(
            "uq_fin_templates_company_source", "company_id", "source_template_id",
            unique=True,
            postgresql_where=text("scope_kind = 'company' AND source_template_id IS NOT NULL"),
            sqlite_where=text("scope_kind = 'company' AND source_template_id IS NOT NULL"),
        ),
        Index(
            "uq_fin_templates_organization_source", "organization_id", "source_template_id",
            unique=True,
            postgresql_where=text("scope_kind = 'organization' AND source_template_id IS NOT NULL"),
            sqlite_where=text("scope_kind = 'organization' AND source_template_id IS NOT NULL"),
        ),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JsonType)
    scope_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="legacy")
    company_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT")
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    source_template_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("fin_templates.id", ondelete="RESTRICT")
    )


class FinanceHistory(TimeStampedModel):
    """Аудит изменений финансовых сумм (ТЗ §4.4, §5.6)."""

    __tablename__ = "fin_history"
    __table_args__ = (
        CheckConstraint(
            "(scope_kind = 'company' AND company_id IS NOT NULL AND organization_id IS NULL) OR "
            "(scope_kind = 'organization' AND organization_id IS NOT NULL AND company_id IS NULL) OR "
            "(scope_kind = 'legacy' AND company_id IS NULL AND organization_id IS NULL)",
            name="ck_fin_history_ownership",
        ),
        Index("ix_fin_history_scope_kind", "scope_kind"),
        Index("ix_fin_history_company", "company_id"),
        Index("ix_fin_history_organization", "organization_id"),
    )

    status: Mapped[str | None] = mapped_column(String(32))
    ref_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), index=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    scope_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="legacy")
    company_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT")
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL")
    )
    new_amount: Mapped[float | None] = mapped_column(Numeric(16, 2))
    old_amount: Mapped[float | None] = mapped_column(Numeric(16, 2))
    type: Mapped[str | None] = mapped_column(String(32))
    user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    comment: Mapped[str | None] = mapped_column(Text)


class FinanceOwnershipMapping(TimeStampedModel):
    """Persistent audit trail for deterministic BI-05A legacy remediation."""

    __tablename__ = "finance_ownership_mappings"

    mapping_key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    legacy_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    target_scope: Mapped[str] = mapped_column(String(16), nullable=False)
    target_scope_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    resolved_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), index=True)
    resolution: Mapped[str] = mapped_column(String(32), nullable=False)
    legacy_metadata: Mapped[dict | None] = mapped_column(JsonType)
