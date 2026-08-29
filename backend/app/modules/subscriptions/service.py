from __future__ import annotations
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone, timedelta
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.subscriptions.models import Invoice, Plan, Subscription
from app.modules.subscriptions.repository import InvoiceRepository, PlanRepository, SubscriptionRepository
from app.modules.subscriptions.schemas import PlanCreate, SubscriptionCreate
from app.shared.exceptions import NotFoundError


class SubscriptionService:
    def __init__(
        self,
        db: AsyncSession,
        failure_injector: Callable[[str], Awaitable[None]] | None = None,
    ):
        self.db = db
        self.failure_injector = failure_injector
        self.plan_repo = PlanRepository(db)
        self.sub_repo = SubscriptionRepository(db)
        self.inv_repo = InvoiceRepository(db)

    async def _checkpoint(self, name: str) -> None:
        if self.failure_injector is not None:
            await self.failure_injector(name)

    async def list_plans(self) -> list[Plan]:
        return await self.plan_repo.get_active()

    async def create_plan(self, data: PlanCreate) -> Plan:
        return await self.plan_repo.save(Plan(**data.model_dump()))

    async def subscribe(self, company_id: UUID, data: SubscriptionCreate) -> Subscription:
        plan = await self.plan_repo.get_by_id(data.plan_id)
        if not plan:
            raise NotFoundError("Plan not found")

        now = datetime.now(timezone.utc)
        sub = Subscription(
            company_id=company_id,
            plan_id=data.plan_id,
            billing_cycle=data.billing_cycle,
            status="trial",
            trial_ends_at=now + timedelta(days=14),
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        try:
            self.db.add(sub)
            await self.db.flush()
            await self._checkpoint("after_subscription")

            price = plan.price_monthly if data.billing_cycle == "monthly" else plan.price_yearly
            invoice = Invoice(
                company_id=company_id,
                subscription_id=sub.id,
                amount=price,
                status="open",
                due_date=now + timedelta(days=14),
            )
            self.db.add(invoice)
            await self.db.flush()
            await self._checkpoint("after_invoice")
            await self.db.commit()
            await self.db.refresh(sub)
            return sub
        except Exception:
            await self.db.rollback()
            raise

    async def get_current(self, company_id: UUID) -> Subscription | None:
        return await self.sub_repo.get_active(company_id)
