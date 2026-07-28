from __future__ import annotations
import hashlib
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.companies.models import Branch, Company
from app.modules.inventory.models import Product
from app.modules.kitchen.websocket import kitchen_manager
from app.modules.audit.service import AuditService
from app.modules.pos.models import Order, OrderItem, PosTerminal, CashierShift
from app.modules.pos.repository import OrderRepository, OrderItemRepository, TerminalRepository
from app.modules.pos.schemas import (
    OrderCreate, OrderItemCreate, OrderStatusUpdate,
    OrderUpdate, TerminalCreate, ShiftOpen, ShiftClose,
)
from app.shared.exceptions import NotFoundError, ValidationError

# ── Order status state machine ───────────────────────────────────────────────
VALID_TRANSITIONS: dict[str, set[str]] = {
    "new":       {"accepted", "cooking", "cancelled"},
    "accepted":  {"cooking", "cancelled"},
    "cooking":   {"ready", "cancelled"},
    "ready":     {"completed", "cancelled"},
    "completed": set(),           # final state — no transitions
    "cancelled": set(),           # final state — no transitions
}


def _quantize(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class OrderService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = OrderRepository(db)

    # ── Create ────────────────────────────────────────────────────────────────

    async def create(self, company_id: UUID, waiter_id: UUID, data: OrderCreate) -> Order:
        await self._get_branch(company_id, data.branch_id)
        order_number = await self._generate_daily_number(company_id, data.branch_id)

        order = Order(
            company_id=company_id,
            waiter_id=waiter_id,
            order_number=order_number,
            branch_id=data.branch_id,
            terminal_id=data.terminal_id,
            customer_id=data.customer_id,
            order_type=data.order_type,
            table_number=data.table_number,
            persons_count=data.persons_count,
            note=data.note,
            customer_phone=data.customer_phone,
            customer_address=data.customer_address,
            # Заказ с позициями сразу уходит повару → статус «готовится»
            status="cooking" if data.items else "new",
        )
        self.db.add(order)
        await self.db.flush()

        subtotal = Decimal("0")
        service_base = Decimal("0")
        for item_data in data.items:
            product = await self._get_product(company_id, item_data.product_id)
            item_total = _quantize(product.price * item_data.quantity)

            # Apply per-item discount if provided
            item_discount = _quantize(item_data.discount) if item_data.discount else Decimal("0")
            item_total_after_discount = max(item_total - item_discount, Decimal("0"))
            subtotal += item_total_after_discount
            if not item_data.takeaway:
                service_base += item_total_after_discount

            item = OrderItem(
                order_id=order.id,
                product_id=product.id,
                name=product.name,
                price=product.price,
                quantity=item_data.quantity,
                discount=item_discount,
                total=item_total_after_discount,
                note=item_data.note,
                modifiers=item_data.modifiers,
                course=item_data.course,
                takeaway=item_data.takeaway,
            )
            self.db.add(item)

        # Calculate totals (обслуга — только с позиций «в зале»)
        order.subtotal = subtotal
        self._recalculate_totals(order, data.discount_amount, data.service_fee_rate, service_base=service_base)
        await self.db.commit()
        created_order = await self.get(company_id, order.id)
        try:
            await kitchen_manager.broadcast(
                company_id, data.branch_id, "new_order", {"order_id": str(created_order.id)}
            )
        except Exception:
            pass
        try:
            from app.modules.printers.service import PrinterService
            await PrinterService(self.db).auto_print_kitchen(
                company_id, created_order.branch_id, created_order.id
            )
        except Exception:
            pass
        try:
            await AuditService(self.db).log(
                company_id, waiter_id, "order.create", "order",
                entity_id=created_order.id,
                new_data={"order_number": created_order.order_number, "total": str(created_order.total_amount)},
            )
        except Exception:
            pass
        return created_order

    # ── Read ──────────────────────────────────────────────────────────────────

    async def get(self, company_id: UUID, order_id: UUID) -> Order:
        order = await self.repo.get_by_id(order_id, company_id)
        if not order:
            raise NotFoundError("Order not found")
        return order

    async def list(
        self,
        company_id: UUID,
        branch_id: UUID | None = None,
        status: str | None = None,
        selected_date: date | None = None,
        active_only: bool = False,
        table_number: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[Order]:
        if status:
            return await self.repo.get_by_status(company_id, status, branch_id, selected_date)
        return await self.repo.get_all(
            company_id,
            selected_date=selected_date,
            branch_id=branch_id,
            active_only=active_only,
            table_number=table_number,
            limit=limit,
            offset=offset,
        )

    # ── Update status (state machine) ─────────────────────────────────────────

    async def update_status(self, company_id: UUID, order_id: UUID, data: OrderStatusUpdate) -> Order:
        order = await self.get(company_id, order_id)
        current = order.status
        target = data.status

        if target not in VALID_TRANSITIONS.get(current, set()):
            raise ValidationError(
                f"Невозможно перевести заказ из '{current}' в '{target}'. "
                f"Допустимые переходы: {VALID_TRANSITIONS.get(current, set()) or 'нет'}"
            )

        order.status = target
        await self.repo.save(order)
        updated_order = await self.get(company_id, order_id)
        try:
            await kitchen_manager.broadcast(
                company_id, order.branch_id, "order_updated",
                {"order_id": str(order_id), "status": target},
            )
        except Exception:
            pass
        try:
            await AuditService(self.db).log(
                company_id, None, "order.status_change", "order",
                entity_id=order_id,
                old_data={"status": current}, new_data={"status": target},
            )
        except Exception:
            pass
        return updated_order

    # ── Cancel ────────────────────────────────────────────────────────────────

    async def cancel(self, company_id: UUID, order_id: UUID, password: str | None = None) -> Order:
        order = await self.get(company_id, order_id)
        if order.status in ("completed", "cancelled"):
            raise ValidationError(f"Невозможно отменить заказ в статусе '{order.status}'")
        # Спец-пароль отмены (если задан в админке) обязателен
        company = (await self.db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
        if company and company.cancel_password:
            if not password or password != company.cancel_password:
                raise ValidationError("Неверный пароль отмены заказа")
        order.status = "cancelled"
        saved = await self.repo.save(order)
        try:
            await kitchen_manager.broadcast(
                company_id, order.branch_id, "order_cancelled", {"order_id": str(order_id)}
            )
        except Exception:
            pass
        return saved

    # ── Add item to existing order ────────────────────────────────────────────

    async def add_item(self, company_id: UUID, order_id: UUID, item_data: OrderItemCreate) -> Order:
        order = await self.get(company_id, order_id)
        if order.status in ("completed", "cancelled"):
            raise ValidationError("Нельзя добавить позицию к завершённому или отменённому заказу")

        product = await self._get_product(company_id, item_data.product_id)
        item_total = _quantize(product.price * item_data.quantity)
        item_discount = _quantize(item_data.discount) if item_data.discount else Decimal("0")
        item_total_after_discount = max(item_total - item_discount, Decimal("0"))

        item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            name=product.name,
            price=product.price,
            quantity=item_data.quantity,
            discount=item_discount,
            total=item_total_after_discount,
            note=item_data.note,
            modifiers=item_data.modifiers,
            course=item_data.course,
            takeaway=item_data.takeaway,
        )
        self.db.add(item)
        await self.db.flush()

        order.subtotal += item_total_after_discount
        # Дозаказ → снова «готовится», сбрасываем отметку печати чека (стол снова занят)
        order.receipt_printed_at = None
        if order.status in ("ready", "new", "accepted"):
            order.status = "cooking"
        self._recalculate_totals(order, service_base=await self._service_base_q(order.id))
        await self.db.commit()
        return await self.get(company_id, order_id)

    # ── Remove item from order ────────────────────────────────────────────────

    async def remove_item(self, company_id: UUID, order_id: UUID, item_id: UUID) -> Order:
        order = await self.get(company_id, order_id)
        if order.status in ("completed", "cancelled"):
            raise ValidationError("Нельзя удалить позицию из завершённого или отменённого заказа")

        item = await self._get_order_item(order, item_id)
        order.subtotal -= item.total
        item.status = "cancelled"
        item.total = Decimal("0")
        self._recalculate_totals(order, service_base=await self._service_base_q(order.id))
        await self.db.commit()
        return await self.get(company_id, order_id)

    async def _subtotal_q(self, order_id: UUID) -> Decimal:
        res = await self.db.execute(
            select(func.coalesce(func.sum(OrderItem.total), 0)).where(
                OrderItem.order_id == order_id, OrderItem.status != "cancelled",
            )
        )
        return Decimal(str(res.scalar_one() or 0))

    # ── Move item to another table ────────────────────────────────────────────

    async def move_item(self, company_id: UUID, order_id: UUID, item_id: UUID, target_table: str) -> Order:
        """Перекинуть позицию на другой стол. Находит/создаёт заказ на целевом столе,
        помечает позицию «перемещено», перепечатывает кухонный чек, пустой исходный отменяет."""
        order = await self.get(company_id, order_id)
        if order.status in ("completed", "cancelled"):
            raise ValidationError("Нельзя перемещать позицию завершённого/отменённого заказа")
        item = await self._get_order_item(order, item_id)
        if item.status == "cancelled":
            raise ValidationError("Позиция отменена")
        target_table = str(target_table).strip()
        if not target_table or target_table == str(order.table_number or ""):
            raise ValidationError("Выберите другой стол")

        # Найти активный заказ на целевом столе или создать новый
        target = (await self.db.execute(
            select(Order).where(
                Order.company_id == company_id, Order.branch_id == order.branch_id,
                Order.table_number == target_table,
                Order.status.notin_(["completed", "cancelled"]),
            ).order_by(Order.created_at.desc())
        )).scalars().first()
        if not target:
            target = Order(
                company_id=company_id, branch_id=order.branch_id, waiter_id=order.waiter_id,
                order_number=await self._generate_daily_number(company_id, order.branch_id),
                order_type="dine_in", table_number=target_table, status="cooking",
            )
            self.db.add(target)
            await self.db.flush()

        # Пометка «перемещено» → попадёт в кухонный чек
        mark = f"[перемещено со стола {order.table_number}]"
        item.note = f"{item.note} {mark}".strip() if item.note else mark
        item.order_id = target.id
        target.receipt_printed_at = None
        await self.db.flush()

        # Пересчёт обоих заказов
        order.subtotal = await self._subtotal_q(order.id)
        self._recalculate_totals(order, service_base=await self._service_base_q(order.id))
        target.subtotal = await self._subtotal_q(target.id)
        self._recalculate_totals(target, service_base=await self._service_base_q(target.id))

        # Пустой исходный заказ — отменить (стол освобождается)
        remaining = (await self.db.execute(
            select(func.count(OrderItem.id)).where(
                OrderItem.order_id == order.id, OrderItem.status != "cancelled",
            )
        )).scalar_one()
        if remaining == 0:
            order.status = "cancelled"

        await self.db.commit()

        # Повторная печать кухонного чека целевого заказа + уведомления
        try:
            from app.modules.printers.service import PrinterService
            await PrinterService(self.db).auto_print_kitchen(company_id, target.branch_id, target.id)
        except Exception:
            pass
        try:
            await kitchen_manager.broadcast(company_id, "order_updated", {"order_id": str(target.id)})
            await kitchen_manager.broadcast(company_id, "order_updated", {"order_id": str(order.id)})
        except Exception:
            pass
        return await self.get(company_id, target.id)

    # ── Update order (discount / service fee / note) ──────────────────────────

    async def update_order(self, company_id: UUID, order_id: UUID, data: OrderUpdate) -> Order:
        order = await self.get(company_id, order_id)
        if order.status in ("completed", "cancelled"):
            raise ValidationError("Нельзя редактировать завершённый или отменённый заказ")

        if data.note is not None:
            order.note = data.note
        if data.table_number is not None:
            order.table_number = data.table_number
        if data.persons_count is not None:
            order.persons_count = data.persons_count
        if data.customer_phone is not None:
            order.customer_phone = data.customer_phone
        if data.customer_address is not None:
            order.customer_address = data.customer_address
        if data.waiter_id is not None:
            order.waiter_id = data.waiter_id

        self._recalculate_totals(order, data.discount_amount, data.service_fee_rate,
                                 service_base=await self._service_base_q(order.id))
        await self.repo.save(order)
        return await self.get(company_id, order_id)

    # ── Internals ─────────────────────────────────────────────────────────────

    def _recalculate_totals(
        self,
        order: Order,
        discount_override: Decimal | None = None,
        service_fee_rate_override: float | None = None,
        service_base: Decimal | None = None,
    ) -> None:
        """Пересчёт налога, скидки, обслуги, итога.
        service_base — сумма позиций «в зале» (без takeaway); обслуга берётся с неё.
        Если не передана — обслуга считается со всей суммы (обратная совместимость)."""
        subtotal = order.subtotal

        # Discount (manual amount)
        if discount_override is not None:
            order.discount_amount = _quantize(discount_override)
        after_discount = max(subtotal - order.discount_amount, Decimal("0"))

        # Tax (НДС 12% — from settings, applied after discount) — на всё
        tax_rate = Decimal(str(settings.default_tax_rate))
        order.tax_amount = _quantize(after_discount * tax_rate)

        # Service fee (rate-based) — только на позиции «в зале»
        if service_fee_rate_override is not None:
            fee_rate = Decimal(str(service_fee_rate_override))
        else:
            fee_rate = Decimal(str(settings.default_service_fee_rate))
        fee_base = after_discount if service_base is None else service_base
        order.service_fee = _quantize(fee_base * fee_rate)

        order.total_amount = _quantize(after_discount + order.tax_amount + order.service_fee)

    async def _service_base_q(self, order_id: UUID) -> Decimal:
        """Сумма активных позиций «в зале» (не отменённых, не takeaway) для обслуги."""
        res = await self.db.execute(
            select(func.coalesce(func.sum(OrderItem.total), 0)).where(
                OrderItem.order_id == order_id,
                OrderItem.status != "cancelled",
                OrderItem.takeaway.is_(False),
            )
        )
        return Decimal(str(res.scalar_one() or 0))

    async def _generate_daily_number(self, company_id: UUID, branch_id: UUID) -> str:
        """Generate daily order number: YYYYMMDD-NNNN (serialized via advisory lock)."""
        tz_str = await self._get_company_timezone(company_id)
        try:
            tz = ZoneInfo(tz_str)
        except (ZoneInfoNotFoundError, KeyError):
            tz = ZoneInfo("Asia/Tashkent")

        now_local = datetime.now(tz)
        today_local = now_local.date()

        # Serialize concurrent requests for the same company/branch/day
        lock_key = int.from_bytes(
            hashlib.sha256(f"{company_id}:{branch_id}:{today_local}".encode()).digest()[:8],
            "big", signed=True,
        )
        await self.db.execute(text("SELECT pg_advisory_xact_lock(:k)").bindparams(k=lock_key))

        # Count in UTC range that corresponds to local calendar day
        day_start = datetime.combine(today_local, datetime.min.time()).replace(tzinfo=tz).astimezone(timezone.utc)
        day_end   = datetime.combine(today_local + timedelta(days=1), datetime.min.time()).replace(tzinfo=tz).astimezone(timezone.utc)

        result = await self.db.execute(
            select(func.count(Order.id)).where(
                Order.company_id == company_id,
                Order.branch_id == branch_id,
                Order.created_at >= day_start,
                Order.created_at < day_end,
            )
        )
        count = result.scalar_one()
        # Простой порядковый номер (по очереди), сбрасывается ежедневно по филиалу
        return str(count + 1)

    async def _get_branch(self, company_id: UUID, branch_id: UUID) -> Branch:
        result = await self.db.execute(
            select(Branch).where(Branch.id == branch_id, Branch.company_id == company_id)
        )
        branch = result.scalar_one_or_none()
        if not branch:
            raise NotFoundError("Branch not found")
        return branch

    async def _get_product(self, company_id: UUID, product_id: UUID) -> Product:
        result = await self.db.execute(
            select(Product).where(
                Product.id == product_id,
                Product.company_id == company_id,
                Product.is_active == True,
            )
        )
        product = result.scalar_one_or_none()
        if not product:
            raise NotFoundError("Product not found or inactive")
        return product

    async def _get_order_item(self, order: Order, item_id: UUID) -> OrderItem:
        for item in order.items:
            if item.id == item_id and item.status != "cancelled":
                return item
        raise NotFoundError("Order item not found")


class TerminalService:
    def __init__(self, db: AsyncSession):
        self.repo = TerminalRepository(db)

    async def create(self, company_id: UUID, data: TerminalCreate) -> PosTerminal:
        return await self.repo.save(PosTerminal(company_id=company_id, **data.model_dump()))

    async def list(self, company_id: UUID) -> list[PosTerminal]:
        return await self.repo.get_all(company_id)


class ShiftService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def open_shift(self, company_id: UUID, cashier_id: UUID, data: ShiftOpen) -> CashierShift:
        existing = await self._get_open_shift(company_id, data.branch_id)
        if existing:
            raise ValidationError("Смена уже открыта. Закройте текущую смену перед открытием новой.")

        shift = CashierShift(
            company_id=company_id,
            branch_id=data.branch_id,
            cashier_id=cashier_id,
            opened_at=datetime.now(timezone.utc),
            opening_cash=data.opening_cash,
            status="open",
        )
        self.db.add(shift)
        await self.db.commit()
        await self.db.refresh(shift)
        return shift

    async def close_shift(self, company_id: UUID, cashier_id: UUID, data: ShiftClose) -> CashierShift:
        result = await self.db.execute(
            select(CashierShift).where(
                CashierShift.company_id == company_id,
                CashierShift.cashier_id == cashier_id,
                CashierShift.status == "open",
            )
        )
        shift = result.scalar_one_or_none()
        if not shift:
            raise NotFoundError("Нет открытой смены для закрытия")

        shift.closed_at = datetime.now(timezone.utc)
        shift.closing_cash = data.closing_cash
        shift.status = "closed"
        self.db.add(shift)
        await self.db.commit()
        await self.db.refresh(shift)
        return shift

    async def get_current(self, company_id: UUID, branch_id: UUID) -> CashierShift | None:
        return await self._get_open_shift(company_id, branch_id)

    async def get_shift_for_date(self, company_id: UUID, selected_date: date) -> CashierShift | None:
        day_start = datetime.combine(selected_date, datetime.min.time())
        day_end = datetime.combine(selected_date, datetime.max.time())
        result = await self.db.execute(
            select(CashierShift).where(
                CashierShift.company_id == company_id,
                CashierShift.opened_at >= day_start,
                CashierShift.opened_at <= day_end,
            ).order_by(CashierShift.opened_at.desc())
        )
        return result.scalar_one_or_none()

    async def _get_open_shift(self, company_id: UUID, branch_id: UUID) -> CashierShift | None:
        result = await self.db.execute(
            select(CashierShift).where(
                CashierShift.company_id == company_id,
                CashierShift.branch_id == branch_id,
                CashierShift.status == "open",
            )
        )
        return result.scalar_one_or_none()
