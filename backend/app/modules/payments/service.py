from __future__ import annotations
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.payments.models import Payment
from app.modules.payments.repository import PaymentRepository
from app.modules.payments.schemas import PaymentCreate
from app.modules.pos.models import Order
from app.modules.kitchen.websocket import kitchen_manager
from app.modules.fiscal.service import FiscalService
from app.modules.fiscal.schemas import FiscalReceiptCreate
from app.modules.audit.service import AuditService
from app.shared.exceptions import NotFoundError, ValidationError

import logging

logger = logging.getLogger(__name__)


async def record_fiscal_and_audit(
    db: AsyncSession,
    payment: Payment,
    *,
    actor_id: UUID | None = None,
    source: str = "pos",
) -> None:
    """Фискальный чек + запись аудита для успешно проведённой оплаты.

    Единый путь и для кассы, и для вебхуков провайдеров (Click/Payme/Uzum/gateway),
    чтобы онлайн-оплата не обходила фискализацию (ОФД soliq.uz) и журнал аудита.
    Best-effort: не роняет уже проведённую оплату, ошибки логируются.
    """
    try:
        await FiscalService(db).create(
            payment.company_id,
            FiscalReceiptCreate(order_id=payment.order_id, payment_id=payment.id),
        )
    except Exception:
        logger.exception("Фискализация не удалась для payment %s", payment.id)
    try:
        await AuditService(db).log(
            payment.company_id,
            actor_id if actor_id is not None else payment.cashier_id,
            f"payment.complete.{source}", "payment",
            entity_id=payment.id,
            new_data={
                "order_id": str(payment.order_id),
                "amount": str(payment.amount),
                "method": payment.method,
            },
        )
    except Exception:
        logger.exception("Аудит не удался для payment %s", payment.id)


class PaymentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = PaymentRepository(db)

    async def process(self, company_id: UUID, cashier_id: UUID, data: PaymentCreate) -> Payment:
        result = await self.db.execute(
            select(Order).where(Order.id == data.order_id, Order.company_id == company_id)
        )
        order = result.scalar_one_or_none()
        if not order:
            raise NotFoundError("Order not found")

        if order.status in ("cancelled",):
            raise ValidationError("Невозможно оплатить отменённый заказ")

        if order.status == "completed":
            raise ValidationError("Заказ уже оплачен")

        # Validate payment amount matches order total
        if data.amount != order.total_amount:
            raise ValidationError(
                f"Сумма оплаты ({data.amount}) не совпадает с суммой заказа ({order.total_amount})"
            )

        # Cash change calculation
        change_given = None
        if data.method == "cash" and data.cash_received is not None:
            if data.cash_received < data.amount:
                raise ValidationError("Полученная сумма меньше суммы заказа")
            change_given = data.cash_received - data.amount

        payment = Payment(
            company_id=company_id,
            order_id=data.order_id,
            amount=data.amount,
            method=data.method,
            status="completed",
            cashier_id=cashier_id,
            cash_received=data.cash_received,
            change_given=change_given,
        )
        # Платёж и заказ фиксируем ОДНОЙ транзакцией: раньше платёж коммитился
        # отдельно от заказа, и сбой между двумя commit'ами оставлял платёж
        # "completed" без завершённого заказа.
        self.db.add(payment)
        order.status = "completed"
        self.db.add(order)
        await self.db.commit()
        await self.db.refresh(payment)
        saved = payment

        try:
            await kitchen_manager.broadcast(
                company_id, order.branch_id, "order_completed",
                {"order_id": str(order.id), "order_number": order.order_number},
            )
        except Exception:
            pass

        # Фискальный чек + аудит единым путём (тот же, что зовут вебхуки провайдеров)
        await record_fiscal_and_audit(self.db, saved, actor_id=cashier_id, source="pos")

        return saved

    async def list_for_order(self, company_id: UUID, order_id: UUID) -> list[Payment]:
        return await self.repo.get_by_order(company_id, order_id)
