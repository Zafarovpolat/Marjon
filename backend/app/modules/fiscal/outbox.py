from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.fiscal.models import FiscalOutbox
from app.shared.exceptions import ValidationError


class FiscalOutboxClaimService:
    """Claim-only infrastructure; it never performs a provider network call."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def claim_one(
        self,
        *,
        worker_id: str,
        now: datetime | None = None,
        lease_timeout: timedelta = timedelta(minutes=5),
    ) -> FiscalOutbox | None:
        if not worker_id or len(worker_id) > 128:
            raise ValidationError("Fiscal outbox worker_id is invalid")
        claim_time = now or datetime.now(timezone.utc)
        stale_before = claim_time - lease_timeout
        event = (
            await self.db.execute(
                select(FiscalOutbox)
                .where(
                    FiscalOutbox.status == "pending",
                    FiscalOutbox.next_attempt_at <= claim_time,
                    or_(
                        FiscalOutbox.locked_at.is_(None),
                        FiscalOutbox.locked_at <= stale_before,
                    ),
                )
                .order_by(FiscalOutbox.created_at, FiscalOutbox.id)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
        ).scalar_one_or_none()
        if event is None:
            await self.db.rollback()
            return None
        event.locked_at = claim_time
        event.locked_by = worker_id
        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def release(
        self,
        *,
        event_id: UUID,
        worker_id: str,
        last_error_code: str | None = None,
    ) -> bool:
        event = (
            await self.db.execute(
                select(FiscalOutbox)
                .where(
                    FiscalOutbox.id == event_id,
                    FiscalOutbox.status == "pending",
                    FiscalOutbox.locked_by == worker_id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if event is None:
            await self.db.rollback()
            return False
        event.locked_at = None
        event.locked_by = None
        event.last_error_code = last_error_code
        await self.db.commit()
        return True
