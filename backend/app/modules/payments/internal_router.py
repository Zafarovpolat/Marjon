from __future__ import annotations
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.infrastructure.database.session import get_db
from app.modules.payments.models import Payment
from app.modules.payments.repository import PaymentRepository
from app.modules.pos.models import Order
from app.modules.kitchen.websocket import kitchen_manager

router = APIRouter(prefix="/internal", tags=["internal"])


def verify_secret(x_webhook_secret: str = Header(...)) -> None:
    if x_webhook_secret != settings.webhook_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


# ── Order lookup for gateways ─────────────────────────────────────────────────

@router.get("/orders/{order_id}", dependencies=[Depends(verify_secret)])
async def get_order_for_gateway(order_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return {
        "id": str(order.id),
        "total_amount": float(order.total_amount),
        "status": order.status,
        "company_id": str(order.company_id),
    }


# ── Payment webhook from gateways ─────────────────────────────────────────────

class PaymentWebhookIn(BaseModel):
    order_id: UUID
    amount: Decimal
    method: str          # "payme" | "click"
    gateway_tx_id: str
    action: str          # "confirm" | "cancel"


@router.post("/payment-webhook", dependencies=[Depends(verify_secret)],
             status_code=status.HTTP_200_OK)
async def payment_webhook(data: PaymentWebhookIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.id == data.order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if data.action == "confirm":
        if order.status == "completed":
            # Idempotent — already confirmed, just return ok
            return {"ok": True}

        payment = Payment(
            company_id=order.company_id,
            order_id=order.id,
            amount=data.amount,
            method=data.method,
            status="completed",
            fiscal_code=data.gateway_tx_id,
        )
        repo = PaymentRepository(db)
        await repo.save(payment)

        order.status = "completed"
        db.add(order)
        await db.commit()

        try:
            await kitchen_manager.broadcast(
                order.company_id, order.branch_id, "order_completed",
                {"order_id": str(order.id), "order_number": order.order_number},
            )
        except Exception:
            pass

    elif data.action == "cancel":
        if order.status == "completed":
            order.status = "cancelled"
            db.add(order)
            await db.commit()

    return {"ok": True}
