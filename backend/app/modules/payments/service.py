from __future__ import annotations
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.finance.idempotency import (
    OP_PAYMENT_PROCESS,
    SCOPE_COMPANY,
    FinancialOperationService,
    request_fingerprint,
)
from app.modules.finance.models import FinancialOperation
from app.modules.payments.models import Payment
from app.modules.payments.repository import PaymentRepository
from app.modules.payments.schemas import PaymentCreate
from app.modules.pos.models import Order
from app.modules.kitchen.websocket import kitchen_manager
from app.modules.fiscal.service import FiscalService
from app.modules.fiscal.schemas import FiscalReceiptCreate
from app.modules.audit.service import AuditService
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError


class PaymentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = PaymentRepository(db)

    async def _operation_payment(
        self,
        operation: FinancialOperation,
        company_id: UUID,
    ) -> Payment:
        try:
            payment_id = UUID((operation.result_metadata or {})["payment_id"])
        except (KeyError, TypeError, ValueError):
            raise ConflictError("Stored idempotency result is unavailable")
        payment = (
            await self.db.execute(
                select(Payment).where(
                    Payment.id == payment_id,
                    Payment.company_id == company_id,
                )
            )
        ).scalar_one_or_none()
        if payment is None:
            raise ConflictError("Stored idempotency result is unavailable")
        return payment

    async def process(
        self,
        company_id: UUID,
        cashier_id: UUID,
        data: PaymentCreate,
        idempotency_key: str | None = None,
    ) -> Payment:
        # The order row is the serialization point for payment completion.
        # All business validations below intentionally run after this lock.
        result = await self.db.execute(
            select(Order)
            .where(Order.id == data.order_id, Order.company_id == company_id)
            .with_for_update()
        )
        order = result.scalar_one_or_none()
        if not order:
            raise NotFoundError("Order not found")

        operation = None
        if idempotency_key is not None:
            claim = await FinancialOperationService(self.db).claim(
                scope_kind=SCOPE_COMPANY,
                scope_id=company_id,
                operation_type=OP_PAYMENT_PROCESS,
                idempotency_key=idempotency_key,
                fingerprint=request_fingerprint(data),
            )
            operation = claim.operation
            if not claim.is_new:
                payment = await self._operation_payment(operation, company_id)
                await self.db.commit()
                return payment

        if order.status in ("cancelled",):
            raise ValidationError("Невозможно оплатить отменённый заказ")

        if order.status == "completed":
            raise ValidationError("Заказ уже оплачен")

        completed_payment_id = await self.db.scalar(
            select(Payment.id)
            .where(
                Payment.company_id == company_id,
                Payment.order_id == order.id,
                Payment.status == "completed",
            )
            .limit(1)
        )
        if completed_payment_id is not None:
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
        self.db.add(payment)
        order.status = "completed"
        self.db.add(order)
        await self.db.flush()
        if operation is not None:
            FinancialOperationService.complete(
                operation, {"payment_id": str(payment.id)}
            )
        await self.db.commit()
        await self.db.refresh(payment)

        try:
            await kitchen_manager.broadcast(
                company_id, order.branch_id, "order_completed",
                {"order_id": str(order.id), "order_number": order.order_number},
            )
        except Exception:
            pass

        try:
            await FiscalService(self.db).create(
                company_id,
                FiscalReceiptCreate(order_id=data.order_id, payment_id=payment.id),
            )
        except Exception:
            pass

        try:
            await AuditService(self.db).log(
                company_id, cashier_id, "payment.create", "payment",
                entity_id=payment.id,
                new_data={"order_id": str(data.order_id), "amount": str(data.amount), "method": data.method},
            )
        except Exception:
            pass

        return payment

    async def list_for_order(self, company_id: UUID, order_id: UUID) -> list[Payment]:
        return await self.repo.get_by_order(company_id, order_id)
