from __future__ import annotations
import logging
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.fiscal.models import FiscalReceipt
from app.modules.fiscal.repository import FiscalReceiptRepository
from app.modules.fiscal.schemas import FiscalReceiptCreate
from app.shared.exceptions import NotFoundError

logger = logging.getLogger(__name__)


class FiscalService:
    def __init__(self, db: AsyncSession):
        self.repo = FiscalReceiptRepository(db)

    async def create(self, company_id: UUID, data: FiscalReceiptCreate) -> FiscalReceipt:
        receipt = FiscalReceipt(company_id=company_id, **data.model_dump())
        saved = await self.repo.save(receipt)

        if settings.fiscal_enabled and settings.ofd_api_key:
            await self._send_to_ofd(saved)
        else:
            saved.status = "sent"
            saved.fiscal_code = f"DEMO-{saved.id}"

        return await self.repo.save(saved)

    async def _send_to_ofd(self, receipt: FiscalReceipt):
        payload = {
            "receipt_id": str(receipt.id),
            "order_id": str(receipt.order_id),
            "payment_id": str(receipt.payment_id),
            "tin": settings.ofd_tin,
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{settings.ofd_api_url}/receipts",
                    json=payload,
                    headers={"Authorization": f"Bearer {settings.ofd_api_key}"},
                )
                resp.raise_for_status()
                data = resp.json()
                receipt.status = "sent"
                receipt.fiscal_code = data.get("fiscal_code", f"OFD-{receipt.id}")
                receipt.receipt_url = data.get("receipt_url")
        except Exception as e:
            logger.error("OFD fiscalization failed for receipt %s: %s", receipt.id, e)
            receipt.status = "failed"
            receipt.error_message = str(e)[:500]

    async def get(self, company_id: UUID, receipt_id: UUID) -> FiscalReceipt:
        r = await self.repo.get_by_id(receipt_id, company_id)
        if not r:
            raise NotFoundError("Fiscal receipt not found")
        return r

    async def list(self, company_id: UUID) -> list[FiscalReceipt]:
        return await self.repo.get_all(company_id)
