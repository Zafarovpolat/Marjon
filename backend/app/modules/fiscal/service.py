from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.fiscal.models import FiscalOutbox, FiscalReceipt, FiscalSettings
from app.modules.fiscal.repository import FiscalReceiptRepository
from app.modules.fiscal.runtime import FiscalRuntime, get_fiscal_runtime
from app.modules.fiscal.schemas import FiscalReceiptCreate, FiscalSettingsUpdate
from app.modules.payments.models import Payment
from app.modules.pos.models import Order
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError


Checkpoint = Callable[[str], Awaitable[None]]


@dataclass(frozen=True)
class FiscalSchedulePlan:
    provider: str
    tin: str
    credential_ref: str


class FiscalService:
    def __init__(
        self,
        db: AsyncSession,
        runtime: FiscalRuntime | None = None,
    ):
        self.db = db
        self.repo = FiscalReceiptRepository(db)
        self.runtime = runtime or get_fiscal_runtime()

    async def get_settings(self, company_id: UUID) -> FiscalSettings | None:
        return (
            await self.db.execute(
                select(FiscalSettings).where(FiscalSettings.company_id == company_id)
            )
        ).scalar_one_or_none()

    async def save_settings(
        self,
        company_id: UUID,
        data: FiscalSettingsUpdate,
    ) -> FiscalSettings:
        if data.enabled:
            if not data.provider or not data.tin or not data.credential_ref:
                raise ValidationError(
                    "Enabled fiscal settings require provider, tin, and credential_ref"
                )
            await self.runtime.assert_ready(
                company_id=company_id,
                provider=data.provider,
                credential_ref=data.credential_ref,
            )

        settings = await self.get_settings(company_id)
        if settings is None:
            settings = FiscalSettings(company_id=company_id)
            self.db.add(settings)
        settings.enabled = data.enabled
        settings.provider = data.provider
        settings.tin = data.tin
        settings.credential_ref = data.credential_ref
        try:
            await self.db.commit()
            await self.db.refresh(settings)
        except Exception:
            await self.db.rollback()
            raise
        return settings

    async def prepare_company(
        self,
        company_id: UUID,
        *,
        require_enabled: bool = False,
    ) -> FiscalSchedulePlan | None:
        settings = await self.get_settings(company_id)
        if settings is None or not settings.enabled:
            if require_enabled:
                raise ValidationError("Fiscalization is disabled for this company")
            return None
        if not settings.provider or not settings.tin or not settings.credential_ref:
            raise ValidationError("Fiscal configuration is incomplete")
        await self.runtime.assert_ready(
            company_id=company_id,
            provider=settings.provider,
            credential_ref=settings.credential_ref,
        )
        return FiscalSchedulePlan(
            provider=settings.provider,
            tin=settings.tin,
            credential_ref=settings.credential_ref,
        )

    async def schedule_payment(
        self,
        *,
        company_id: UUID,
        order: Order,
        payment: Payment,
        plan: FiscalSchedulePlan,
        checkpoint: Checkpoint | None = None,
    ) -> tuple[FiscalReceipt, FiscalOutbox]:
        if (
            order.company_id != company_id
            or payment.company_id != company_id
            or payment.order_id != order.id
        ):
            raise ValidationError("Payment, order, and company do not match")
        if payment.status != "completed":
            raise ValidationError("Only a completed payment can be fiscalized")
        existing_id = await self.db.scalar(
            select(FiscalReceipt.id)
            .where(FiscalReceipt.payment_id == payment.id)
            .limit(1)
        )
        if existing_id is not None:
            raise ConflictError("Fiscal receipt already exists for this payment")

        receipt = FiscalReceipt(
            company_id=company_id,
            order_id=order.id,
            payment_id=payment.id,
            provider=plan.provider,
            status="pending",
        )
        self.db.add(receipt)
        await self.db.flush()
        if checkpoint is not None:
            await checkpoint("after_receipt")

        event = FiscalOutbox(
            company_id=company_id,
            receipt_id=receipt.id,
            event_type="submit_receipt",
            status="pending",
        )
        self.db.add(event)
        await self.db.flush()
        if checkpoint is not None:
            await checkpoint("after_outbox")
        return receipt, event

    async def create(
        self,
        company_id: UUID,
        data: FiscalReceiptCreate,
    ) -> FiscalReceipt:
        try:
            order = (
                await self.db.execute(
                    select(Order)
                    .where(Order.id == data.order_id, Order.company_id == company_id)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if order is None:
                raise NotFoundError("Order not found")
            payment = (
                await self.db.execute(
                    select(Payment)
                    .where(
                        Payment.id == data.payment_id,
                        Payment.company_id == company_id,
                        Payment.order_id == order.id,
                    )
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if payment is None:
                raise NotFoundError("Payment not found for this order")

            plan = await self.prepare_company(company_id, require_enabled=True)
            assert plan is not None
            if data.provider != plan.provider:
                raise ValidationError("Fiscal provider is server controlled")
            receipt, _ = await self.schedule_payment(
                company_id=company_id,
                order=order,
                payment=payment,
                plan=plan,
            )
            await self.db.commit()
            await self.db.refresh(receipt)
            return receipt
        except IntegrityError as exc:
            await self.db.rollback()
            raise ConflictError("Fiscal receipt already exists for this payment") from exc
        except Exception:
            await self.db.rollback()
            raise

    async def get(self, company_id: UUID, receipt_id: UUID) -> FiscalReceipt:
        receipt = await self.repo.get_by_id(receipt_id, company_id)
        if receipt is None:
            raise NotFoundError("Fiscal receipt not found")
        return receipt

    async def list(self, company_id: UUID) -> list[FiscalReceipt]:
        return await self.repo.get_all(company_id)
