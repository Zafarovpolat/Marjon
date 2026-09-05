from __future__ import annotations
import hashlib
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.auth.models import User
from app.modules.auth.security import verify_pin
from app.modules.companies.models import Branch, Company
from app.modules.crm.models import Customer
from app.modules.halls.models import Hall, Table
from app.modules.inventory.models import Product
from app.modules.kitchen.websocket import kitchen_manager
from app.modules.audit.service import AuditService
from app.modules.pos.models import Order, OrderItem, PosTerminal, CashierShift
from app.modules.pos.repository import OrderRepository, OrderItemRepository, TerminalRepository
from app.modules.rbac.models import Role, UserRole
from app.modules.pos.schemas import (
    OrderCreate, OrderItemCreate, OrderItemWaiterUpdate, OrderStatusUpdate,
    OrderUpdate, TerminalCreate, ShiftOpen, ShiftClose,
)
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError
from app.shared.tenant_scope import require_company_resource

# ── Order status state machine ───────────────────────────────────────────────
VALID_TRANSITIONS: dict[str, set[str]] = {
    "new":       {"accepted", "cooking", "ready", "completed", "cancelled"},
    "accepted":  {"cooking", "ready", "completed", "cancelled"},
    "cooking":   {"ready", "completed", "cancelled"},
    "ready":     {"completed", "cancelled"},
    "completed": set(),           # final state — no transitions
    "cancelled": set(),           # final state — no transitions
}

# 9 — роли, которым «опасные» действия с заказом (удаление/перенос позиции,
# смена стола, отмена) разрешены без отдельного права. Официант — deny-by-default:
# ему нужно И право can_manage_orders (выдаётся в веб-админке), И отдельный PIN.
PRIVILEGED_ORDER_ROLES = {"owner", "admin", "cashier"}


def _quantize(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class OrderService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = OrderRepository(db)

    # ── Права на «опасные» действия официанта (9) ──────────────────────────────

    async def _user_role_slugs(self, user: User | None) -> set[str]:
        """Слаги ролей пользователя (Role⋈UserRole). Пусто → привилегий нет."""
        if not user:
            return set()
        rows = (await self.db.execute(
            select(Role.slug).join(UserRole, UserRole.role_id == Role.id).where(
                UserRole.user_id == user.id
            )
        )).scalars().all()
        return set(rows)

    async def _require_order_permission(self, user: User | None, action_label: str) -> None:
        """Проверка ТОЛЬКО права (без PIN). Привилегированные роли — сразу ок;
        официант — только с явным правом can_manage_orders из веб-админки;
        остальные без права — запрет (deny-by-default)."""
        slugs = await self._user_role_slugs(user)
        if slugs & PRIVILEGED_ORDER_ROLES:
            return
        perms = (user.permissions or {}) if user else {}
        if not perms.get("can_manage_orders"):
            raise ValidationError(f"Нет прав для {action_label}. Обратитесь к менеджеру.")

    async def _verify_action_pin(self, company_id: UUID, user: User | None, pin: str | None) -> None:
        """Отдельный PIN подтверждения опасного действия. По образцу cancel():
        сначала спец-пароль компании, иначе личный PIN/пароль сотрудника."""
        if not pin:
            raise ValidationError("Введите PIN подтверждения")
        company = (await self.db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
        if company and company.cancel_password:
            if pin != company.cancel_password:
                raise ValidationError("Неверный PIN подтверждения")
            return
        ok = False
        if user:
            fresh = (await self.db.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
            ok = bool(fresh) and (
                verify_pin(pin, fresh.password_hash)
                or verify_pin(pin, fresh.pin_hash)
                or bool(fresh.pin_code and pin == fresh.pin_code)
            )
        if not ok:
            raise ValidationError("Неверный PIN подтверждения")

    async def _guard_order_action(
        self, company_id: UUID, user: User | None, pin: str | None, action_label: str
    ) -> None:
        """Гейт «опасного» действия: право + отдельный PIN.
        Привилегированные роли (владелец/админ/менеджер/кассир) — без PIN;
        официант с правом can_manage_orders — обязан подтвердить отдельным PIN."""
        slugs = await self._user_role_slugs(user)
        if slugs & PRIVILEGED_ORDER_ROLES:
            return
        perms = (user.permissions or {}) if user else {}
        if not perms.get("can_manage_orders"):
            raise ValidationError(f"Нет прав для {action_label}. Обратитесь к менеджеру.")
        await self._verify_action_pin(company_id, user, pin)

    async def _assert_company_waiter(self, company_id: UUID, waiter_id: UUID) -> User:
        """Назначаемый официант должен быть сотрудником ЭТОЙ компании (tenant isolation):
        иначе через waiter_id можно было бы привязать чужого пользователя и его долю обслуги."""
        target = (await self.db.execute(
            select(User).where(User.id == waiter_id, User.company_id == company_id)
        )).scalar_one_or_none()
        if not target:
            raise NotFoundError("Сотрудник не найден в этой компании")
        return target

    # ── Create ────────────────────────────────────────────────────────────────

    async def create(self, company_id: UUID, waiter_id: UUID, data: OrderCreate) -> Order:
        await self._get_branch(company_id, data.branch_id)
        await require_company_resource(
            self.db, PosTerminal, data.terminal_id, company_id, detail="POS terminal not found"
        )
        await require_company_resource(
            self.db, Customer, data.customer_id, company_id, detail="Customer not found"
        )
        # Canonical table relation: when table_id is supplied it is authoritative —
        # validate tenant/branch ownership + active state and let the server own the
        # table_number snapshot. Otherwise fall back to the legacy free-text number.
        table_id = None
        table_number = data.table_number
        if data.table_id is not None:
            table = await self._resolve_table(company_id, data.table_id, data.branch_id)
            table_id = table.id
            table_number = str(table.number)
        order_number = await self._generate_daily_number(company_id)

        order = Order(
            company_id=company_id,
            waiter_id=waiter_id,
            order_number=order_number,
            branch_id=data.branch_id,
            terminal_id=data.terminal_id,
            customer_id=data.customer_id,
            order_type=data.order_type,
            table_id=table_id,
            table_number=table_number,
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
                added_by=waiter_id,
            )
            self.db.add(item)

            # D3: списываем порции из дневного лимита блюда (авто-стоп при исчерпании).
            try:
                self._apply_sale_to_limit(product, item_data.quantity)
            except Exception:
                pass

        # Calculate totals (обслуга — только с позиций «в зале»)
        order.subtotal = subtotal
        self._recalculate_totals(order, data.discount_amount, data.service_fee_rate, service_base=service_base)
        await self.db.commit()
        try:
            await kitchen_manager.broadcast(
                company_id, data.branch_id, "new_order", {"order_id": str(order.id)}
            )
        except Exception:
            pass
        try:
            from app.modules.printers.service import PrinterService
            await PrinterService(self.db).auto_print_kitchen(
                company_id, order.branch_id, order.id
            )
        except Exception:
            pass
        try:
            await AuditService(self.db).log(
                company_id, waiter_id, "order.create", "order",
                entity_id=order.id,
                new_data={"order_number": order.order_number, "total": str(order.total_amount)},
            )
        except Exception:
            pass
        # 7.4 — постоянные клиенты: регистрируем/обновляем карточку клиента по телефону,
        # чтобы номер попадал в автокомплит при следующем заказе. Не фатально для заказа.
        try:
            await self._upsert_customer(company_id, order)
        except Exception:
            pass
        # Ответ собираем ПОСЛЕДНИМ действием, как и в остальных методах сервиса.
        # Любой UPDATE выше (customer_id при доставке, receipt_printed_at при
        # авто-печати) делает updated_at устаревшим (onupdate=func.now()), и Pydantic
        # на сериализации полез бы за ним в БД уже вне greenlet-контекста:
        # MissingGreenlet → 500 без CORS-заголовков → в кассе это «Network Error».
        return await self.get(company_id, order.id)

    async def _upsert_customer(self, company_id: UUID, order: Order) -> None:
        """7.4 — при создании заказа заводим/обновляем клиента по телефону.

        Если официант/кассир выбрал клиента из автокомплита — приходит customer_id.
        Если ввёл новый номер (доставка) — customer_id пустой, но есть customer_phone:
        создаём новую карточку, чтобы номер стал «постоянным» и всплывал в подсказках
        в следующий раз. Обновляем счётчики визитов/суммы и время последнего визита.
        """
        from app.modules.crm.models import Customer

        customer: Customer | None = None
        if order.customer_id:
            customer = (
                await self.db.execute(
                    select(Customer).where(
                        Customer.id == order.customer_id,
                        Customer.company_id == company_id,
                    )
                )
            ).scalar_one_or_none()

        phone = (order.customer_phone or "").strip()
        if customer is None and phone:
            customer = (
                await self.db.execute(
                    select(Customer).where(
                        Customer.company_id == company_id,
                        Customer.phone == phone,
                    )
                )
            ).scalar_one_or_none()
            if customer is None:
                customer = Customer(
                    company_id=company_id,
                    phone=phone,
                    source=order.order_type or "pos",
                )
                self.db.add(customer)
                await self.db.flush()
            # проставляем связь заказ → клиент, если её не было
            if not order.customer_id:
                order.customer_id = customer.id

        if customer is None:
            return

        customer.total_orders = (customer.total_orders or 0) + 1
        customer.total_spent = (customer.total_spent or Decimal("0")) + (order.total_amount or Decimal("0"))
        customer.last_visit_at = datetime.now(timezone.utc)
        await self.db.commit()

    # ── Read ──────────────────────────────────────────────────────────────────

    async def get(self, company_id: UUID, order_id: UUID) -> Order:
        order = await self.repo.get_by_id(order_id, company_id)
        if not order:
            raise NotFoundError("Order not found")
        await self._attach_waiter_names([order])
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
            orders = await self.repo.get_by_status(company_id, status, branch_id, selected_date)
        else:
            orders = await self.repo.get_all(
                company_id,
                selected_date=selected_date,
                branch_id=branch_id,
                active_only=active_only,
                table_number=table_number,
                limit=limit,
                offset=offset,
            )
        await self._attach_waiter_names(orders)
        return orders

    async def _attach_waiter_names(self, orders: list[Order]) -> None:
        """Подставляет order.waiter_name (кто создал заказ) и item.added_by_name
        (кто добавил позицию — 9.4) для ответа API. Имена резолвим одним запросом."""
        ids: set[UUID] = {o.waiter_id for o in orders if o.waiter_id}
        for o in orders:
            for it in o.items:
                if getattr(it, "added_by", None):
                    ids.add(it.added_by)
        names: dict[UUID, str] = {}
        if ids:
            rows = (await self.db.execute(
                select(User.id, User.name, User.email).where(User.id.in_(ids))
            )).all()
            names = {r.id: (r.name or r.email or "") for r in rows}
        for o in orders:
            o.waiter_name = names.get(o.waiter_id) if o.waiter_id else None
            for it in o.items:
                it.added_by_name = names.get(it.added_by) if getattr(it, "added_by", None) else None

    # ── Update status (state machine) ─────────────────────────────────────────

    async def update_status(self, company_id: UUID, order_id: UUID, data: OrderStatusUpdate) -> Order:
        order = await self.get(company_id, order_id)
        current = order.status
        target = data.status

        # Один и тот же статус — не ошибка, а no-op (напр. дозаказ в уже готовящийся стол:
        # add_item сам держит заказ в «cooking», а cooking→cooking запрещён переходами ниже).
        if target == current:
            return await self.get(company_id, order_id)

        if target not in VALID_TRANSITIONS.get(current, set()):
            raise ValidationError(
                f"Невозможно перевести заказ из '{current}' в '{target}'. "
                f"Допустимые переходы: {VALID_TRANSITIONS.get(current, set()) or 'нет'}"
            )

        order.status = target
        if target == "cooking":
            # Kitchen accepted the whole order — move its pending items into cooking too,
            # otherwise "mark item ready" fails validation (pending can't skip to ready).
            for item in order.items:
                if item.status == "pending":
                    item.status = "cooking"
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

    async def cancel(
        self,
        company_id: UUID,
        order_id: UUID,
        password: str | None = None,
        comment: str | None = None,
        user: User | None = None,
    ) -> Order:
        order = await self.get(company_id, order_id)
        if order.status in ("completed", "cancelled"):
            raise ValidationError(f"Невозможно отменить заказ в статусе '{order.status}'")
        # 9 — официанту отмена доступна только с правом can_manage_orders.
        # Отдельный PIN тут — существующий пароль отмены (ниже), повторный не требуем.
        await self._require_order_permission(user, "отмены заказа")
        # Пароль отмены обязателен всегда: сначала спец-пароль из админки,
        # если он не задан — личный пароль сотрудника, который отменяет.
        company = (await self.db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
        if not password:
            raise ValidationError("Введите пароль отмены заказа")
        if company and company.cancel_password:
            if password != company.cancel_password:
                raise ValidationError("Неверный пароль отмены заказа")
        else:
            ok = False
            if user:
                fresh = (await self.db.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
                # Сотрудники входят по PIN — принимаем и пароль, и PIN
                ok = bool(fresh) and (
                    verify_pin(password, fresh.password_hash)
                    or verify_pin(password, fresh.pin_hash)
                    or bool(fresh.pin_code and password == fresh.pin_code)
                )
            if not ok:
                raise ValidationError("Неверный пароль отмены заказа")
        order.status = "cancelled"
        order.cancel_comment = (comment or "").strip() or None
        # D3: возвращаем списанные порции в дневной лимит по всем позициям заказа.
        for it in order.items:
            if it.status != "cancelled":
                try:
                    await self._restore_to_limit(company_id, it.product_id, it.quantity)
                except Exception:
                    pass
        saved = await self.repo.save(order)
        try:
            await kitchen_manager.broadcast(
                company_id, order.branch_id, "order_cancelled", {"order_id": str(order_id)}
            )
        except Exception:
            pass
        return saved

    # ── Add item to existing order ────────────────────────────────────────────

    async def add_item(self, company_id: UUID, order_id: UUID, item_data: OrderItemCreate, user: User | None = None) -> Order:
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
            # 9.4 — кто добавил дозаказ (иначе автор заказа-создателя)
            added_by=(user.id if user else order.waiter_id),
        )
        self.db.add(item)
        await self.db.flush()

        # D3: дозаказ тоже списывает порции из дневного лимита (авто-стоп при исчерпании).
        try:
            self._apply_sale_to_limit(product, item_data.quantity)
        except Exception:
            pass

        order.subtotal += item_total_after_discount
        # Дозаказ → снова «готовится», сбрасываем отметку печати чека (стол снова занят)
        order.receipt_printed_at = None
        if order.status in ("ready", "new", "accepted"):
            order.status = "cooking"
        self._recalculate_totals(order, service_base=await self._service_base_q(order.id))
        await self.db.commit()
        return await self.get(company_id, order_id)

    # ── Remove item from order ────────────────────────────────────────────────

    async def remove_item(
        self, company_id: UUID, order_id: UUID, item_id: UUID,
        reason: str | None = None, user: User | None = None, pin: str | None = None,
    ) -> Order:
        order = await self.get(company_id, order_id)
        if order.status in ("completed", "cancelled"):
            raise ValidationError("Нельзя удалить позицию из завершённого или отменённого заказа")
        # 9 — удаление позиции: право + отдельный PIN (для официанта).
        await self._guard_order_action(company_id, user, pin, "удаления позиции")

        item = await self._get_order_item(order, item_id)
        removed = {"item_id": str(item.id), "name": item.name, "qty": str(item.quantity), "total": str(item.total)}
        order.subtotal -= item.total
        item.status = "cancelled"
        item.total = Decimal("0")
        # D3: возвращаем списанную порцию в дневной лимит удаляемой позиции.
        try:
            await self._restore_to_limit(company_id, item.product_id, item.quantity)
        except Exception:
            pass
        self._recalculate_totals(order, service_base=await self._service_base_q(order.id))
        await self.db.commit()
        # 3.3 — журналируем удаление позиции: кто, когда, что, причина.
        try:
            await AuditService(self.db).log(
                company_id, user.id if user else None, "order.item_remove", "order",
                entity_id=order_id,
                old_data=removed,
                new_data={"reason": (reason or "").strip() or None},
            )
        except Exception:
            pass
        return await self.get(company_id, order_id)

    async def _subtotal_q(self, order_id: UUID) -> Decimal:
        res = await self.db.execute(
            select(func.coalesce(func.sum(OrderItem.total), 0)).where(
                OrderItem.order_id == order_id, OrderItem.status != "cancelled",
            )
        )
        return Decimal(str(res.scalar_one() or 0))

    # ── Move item to another table ────────────────────────────────────────────

    async def move_item(self, company_id: UUID, order_id: UUID, item_id: UUID, target_table: str, user: User | None = None, pin: str | None = None) -> Order:
        """Перекинуть позицию на другой стол. Находит/создаёт заказ на целевом столе,
        помечает позицию «перемещено», перепечатывает кухонный чек, пустой исходный отменяет."""
        order = await self.get(company_id, order_id)
        if order.status in ("completed", "cancelled"):
            raise ValidationError("Нельзя перемещать позицию завершённого/отменённого заказа")
        # 9 — перенос позиции: право + отдельный PIN (для официанта).
        await self._guard_order_action(company_id, user, pin, "переноса позиции")
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
                order_number=await self._generate_daily_number(company_id),
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

        # 3.3 — журналируем перенос позиции между столами.
        try:
            await AuditService(self.db).log(
                company_id, user.id if user else None, "order.item_move", "order",
                entity_id=order.id,
                old_data={"item_id": str(item.id), "name": item.name, "from_table": order.table_number},
                new_data={"to_table": target_table, "target_order_id": str(target.id)},
            )
        except Exception:
            pass

        # Повторная печать кухонного чека целевого заказа + уведомления
        try:
            from app.modules.printers.service import PrinterService
            await PrinterService(self.db).auto_print_kitchen(company_id, target.branch_id, target.id)
        except Exception:
            pass
        try:
            await kitchen_manager.broadcast(company_id, target.branch_id, "order_updated", {"order_id": str(target.id)})
            await kitchen_manager.broadcast(company_id, order.branch_id, "order_updated", {"order_id": str(order.id)})
        except Exception:
            pass
        return await self.get(company_id, target.id)

    # ── Смена ответственного официанта у позиции ──────────────────────────────

    async def set_item_waiter(
        self, company_id: UUID, order_id: UUID, item_id: UUID,
        data: OrderItemWaiterUpdate, user: User | None = None,
    ) -> Order:
        """Переназначить ответственного официанта у ОДНОЙ позиции заказа.
        Нужно кассиру: официант 1 мог случайно внести блюдо в стол официанта 2,
        а доля обслуги считается по ответственному. Пишем в OrderItem.added_by."""
        order = await self.get(company_id, order_id)
        if order.status in ("completed", "cancelled"):
            raise ValidationError("Нельзя редактировать завершённый или отменённый заказ")
        await self._guard_order_action(company_id, user, data.action_pin, "смены официанта у позиции")
        item = await self._get_order_item(order, item_id)
        target = await self._assert_company_waiter(company_id, data.waiter_id)

        old_waiter = item.added_by
        if str(old_waiter or "") == str(target.id):
            return order  # ничего не меняется — не пишем в журнал
        item.added_by = target.id
        await self.db.commit()

        try:
            await AuditService(self.db).log(
                company_id, user.id if user else None, "order.item_waiter_change", "order",
                entity_id=order.id,
                old_data={"item_id": str(item.id), "name": item.name,
                          "waiter_id": str(old_waiter) if old_waiter else None},
                new_data={"waiter_id": str(target.id),
                          "reason": (data.reason or "").strip() or None},
            )
        except Exception:
            pass
        return await self.get(company_id, order_id)

    # ── Update order (discount / service fee / note) ──────────────────────────

    async def update_order(self, company_id: UUID, order_id: UUID, data: OrderUpdate, user: User | None = None) -> Order:
        order = await self.get(company_id, order_id)
        if order.status in ("completed", "cancelled"):
            raise ValidationError("Нельзя редактировать завершённый или отменённый заказ")

        # 3.3 — фиксируем «до», чтобы залогировать смену стола/официанта.
        old_table = order.table_number
        old_waiter = order.waiter_id

        # 9 — смена стола: право + отдельный PIN (для официанта). Гейтим до мутации,
        # только если стол реально меняется (прочие правки заказа не ограничены).
        table_changing = (
            data.table_number is not None
            and str(data.table_number) != str(old_table or "")
        )
        if table_changing:
            await self._guard_order_action(company_id, user, data.action_pin, "смены стола")

        # Смена ответственного официанта двигает долю обслуги → тот же гейт, что у смены стола
        # (кассир/владелец/админ — без PIN, официант — только с правом can_manage_orders и PIN).
        waiter_changing = (
            data.waiter_id is not None
            and str(data.waiter_id) != str(old_waiter or "")
        )
        if waiter_changing:
            await self._guard_order_action(company_id, user, data.action_pin, "смены официанта")
            await self._assert_company_waiter(company_id, data.waiter_id)

        table_id_provided = "table_id" in data.model_fields_set
        table_number_provided = "table_number" in data.model_fields_set
        # Snapshot invariant: while an authoritative table_id is set, table_number is
        # a server-owned snapshot of Table.number — not an independently editable
        # field. A table_number-only PATCH (table_id omitted) on such an order would
        # let the snapshot drift from the relation, so reject it. The client must
        # change the relation explicitly (send table_id, or table_id=null to detach).
        # Legacy orders (table_id already NULL) keep free-text table_number edits.
        if table_number_provided and not table_id_provided and order.table_id is not None:
            raise ConflictError(
                "Заказ привязан к столу (table_id) — table_number является снимком "
                "и не редактируется отдельно. Передайте table_id (или table_id=null, "
                "чтобы отвязать) для изменения привязки."
            )

        if data.note is not None:
            order.note = data.note
        if data.table_number is not None:
            order.table_number = data.table_number
        # table_id is authoritative: applied after table_number so that when both
        # are sent the canonical Table.number snapshot wins. An explicit null clears
        # the relation without touching the retained table_number snapshot.
        if table_id_provided:
            if data.table_id is None:
                order.table_id = None
            else:
                table = await self._resolve_table(company_id, data.table_id, order.branch_id)
                order.table_id = table.id
                order.table_number = str(table.number)
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
        # Журналируем только реальные изменения стола/официанта.
        reason = (data.reason or "").strip() or None
        try:
            if (data.table_number is not None and str(data.table_number) != str(old_table or "")):
                await AuditService(self.db).log(
                    company_id, user.id if user else None, "order.table_change", "order",
                    entity_id=order_id, old_data={"table": old_table},
                    new_data={"table": order.table_number, "reason": reason},
                )
            if (data.waiter_id is not None and str(data.waiter_id) != str(old_waiter or "")):
                await AuditService(self.db).log(
                    company_id, user.id if user else None, "order.waiter_change", "order",
                    entity_id=order_id, old_data={"waiter_id": str(old_waiter) if old_waiter else None},
                    new_data={"waiter_id": str(order.waiter_id) if order.waiter_id else None, "reason": reason},
                )
        except Exception:
            pass
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

    async def _get_company_timezone(self, company_id: UUID) -> str:
        result = await self.db.execute(select(Company.timezone).where(Company.id == company_id))
        return result.scalar_one_or_none() or "Asia/Tashkent"

    async def _generate_daily_number(self, company_id: UUID) -> str:
        """Сформировать номер заказа вида YYMMDD-NNN.

        Номер уникален в пределах компании и НИКОГДА не повторяется:
        - префикс локальной даты (YYMMDD) — номера не совпадают в разные дни;
        - порядковый счётчик считается по всей компании за день, без привязки
          к филиалу/залу/типу заказа — одинаковый номер не выдаётся в разных залах.
        Конкурентные запросы сериализуются advisory-lock'ом на Postgres; на SQLite
        запись и так сериализуется самим движком.
        """
        tz_str = await self._get_company_timezone(company_id)
        try:
            tz = ZoneInfo(tz_str)
        except (ZoneInfoNotFoundError, KeyError):
            try:
                tz = ZoneInfo("Asia/Tashkent")
            except (ZoneInfoNotFoundError, KeyError):
                # Windows без пакета tzdata — не роняем создание заказа
                tz = timezone.utc

        now_local = datetime.now(tz)
        today_local = now_local.date()

        # Сериализуем конкурентные запросы в пределах компании за день
        # (pg_advisory_xact_lock — только Postgres; на SQLite пропускаем)
        if self.db.bind.dialect.name == "postgresql":
            lock_key = int.from_bytes(
                hashlib.sha256(f"{company_id}:{today_local}".encode()).digest()[:8],
                "big", signed=True,
            )
            await self.db.execute(text("SELECT pg_advisory_xact_lock(:k)").bindparams(k=lock_key))

        # Считаем заказы компании за локальный календарный день (в UTC-границах)
        day_start = datetime.combine(today_local, datetime.min.time()).replace(tzinfo=tz).astimezone(timezone.utc)
        day_end   = datetime.combine(today_local + timedelta(days=1), datetime.min.time()).replace(tzinfo=tz).astimezone(timezone.utc)

        result = await self.db.execute(
            select(func.count(Order.id)).where(
                Order.company_id == company_id,
                Order.created_at >= day_start,
                Order.created_at < day_end,
            )
        )
        count = result.scalar_one()
        # Номер вида YYMMDD-NNN — глобально уникален по компании, не повторяется между днями
        return f"{today_local:%y%m%d}-{count + 1:03d}"

    async def _get_branch(self, company_id: UUID, branch_id: UUID) -> Branch:
        result = await self.db.execute(
            select(Branch).where(Branch.id == branch_id, Branch.company_id == company_id)
        )
        branch = result.scalar_one_or_none()
        if not branch:
            raise NotFoundError("Branch not found")
        return branch

    async def _resolve_table(self, company_id: UUID, table_id: UUID, branch_id: UUID) -> Table:
        """Resolve a canonical Table for an order.

        Table has no direct company_id — ownership is proven through its Hall
        (Table.hall_id → Hall.company_id), so a plain company-scoped lookup is not
        enough. We join Hall and require:
          - Hall.company_id == the order's company (tenant isolation)
          - Hall.branch_id == the order's branch (branch compatibility)
          - both Table and Hall active (no new orders against archived seating)
        Never loads another tenant's row; a miss on any condition is a 404.
        """
        result = await self.db.execute(
            select(Table)
            .join(Hall, Hall.id == Table.hall_id)
            .where(
                Table.id == table_id,
                Table.is_active.is_(True),
                Hall.company_id == company_id,
                Hall.branch_id == branch_id,
                Hall.is_active.is_(True),
            )
        )
        table = result.scalar_one_or_none()
        if table is None:
            raise NotFoundError("Table not found")
        return table

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

    # ── D3 «максимум блюда»: списание/возврат порций дневного лимита ────────────
    def _apply_sale_to_limit(self, product: Product, quantity: Decimal) -> None:
        """Списать порции из дневного лимита блюда; при исчерпании — авто-стоп.

        Лимит на всю компанию (product.daily_limit). NULL = без ограничения.
        Количество может быть дробным (весовые позиции) — берём целые порции.
        Вызывать под try: сбой учёта не должен ронять оформление заказа.
        """
        if getattr(product, "daily_limit", None) is None:
            return
        product.sold_count = (product.sold_count or 0) + int(quantity)
        if product.sold_count >= product.daily_limit:
            product.is_available = False  # авто-стоп: «само ставится в стоп»

    async def _restore_to_limit(self, company_id: UUID, product_id: UUID, quantity: Decimal) -> None:
        """Вернуть порции в дневной лимит при отмене заказа/удалении позиции.

        Счётчик не опускаем ниже нуля. Стоп НЕ снимаем автоматически — возврат
        блюда в продажу ручной (по образцу ручного пополнения/тумблера).
        Ищем товар без фильтра is_active (могли снять со стопа). Best-effort.
        """
        product = (await self.db.execute(
            select(Product).where(Product.id == product_id, Product.company_id == company_id)
        )).scalar_one_or_none()
        if product is None or getattr(product, "daily_limit", None) is None:
            return
        product.sold_count = max(0, (product.sold_count or 0) - int(quantity))

    async def _get_order_item(self, order: Order, item_id: UUID) -> OrderItem:
        for item in order.items:
            if item.id == item_id and item.status != "cancelled":
                return item
        raise NotFoundError("Order item not found")


class TerminalService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TerminalRepository(db)

    async def create(self, company_id: UUID, data: TerminalCreate) -> PosTerminal:
        await require_company_resource(
            self.db, Branch, data.branch_id, company_id, detail="Branch not found"
        )
        return await self.repo.save(PosTerminal(company_id=company_id, **data.model_dump()))

    async def list(self, company_id: UUID) -> list[PosTerminal]:
        return await self.repo.get_all(company_id)


class ShiftService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def open_shift(self, company_id: UUID, cashier_id: UUID, data: ShiftOpen) -> CashierShift:
        await require_company_resource(
            self.db, Branch, data.branch_id, company_id, detail="Branch not found"
        )
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
