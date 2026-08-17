from __future__ import annotations
import base64
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.companies.models import Branch
from app.modules.printers.formatter import (
    EscPosFormatter, KitchenTicketData, ReceiptData, ReceiptLine,
)
from app.modules.printers.models import PrintJob, Printer
from app.modules.printers.printer_client import PrinterError, print_raw
from app.modules.printers.repository import PrintJobRepository, PrinterRepository
from app.modules.printers.ws_manager import printer_ws_manager
from app.modules.printers.schemas import PrinterCreate, PrinterUpdate
from app.modules.pos.models import Order, OrderItem
from app.modules.payments.models import Payment
from app.shared.exceptions import NotFoundError


class PrinterService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = PrinterRepository(db)
        self.job_repo = PrintJobRepository(db)

    # ── Printer CRUD ─────────────────────────────────────────────────────────

    async def create(self, company_id: UUID, data: PrinterCreate) -> Printer:
        await self._get_branch(company_id, data.branch_id)
        return await self.repo.save(Printer(company_id=company_id, **data.model_dump()))

    async def list(self, company_id: UUID) -> list[Printer]:
        return await self.repo.get_all(company_id)

    async def get(self, company_id: UUID, printer_id: UUID) -> Printer:
        p = await self.repo.get_by_id(printer_id, company_id)
        if not p:
            raise NotFoundError("Printer not found")
        return p

    async def update(self, company_id: UUID, printer_id: UUID, data: PrinterUpdate) -> Printer:
        p = await self.get(company_id, printer_id)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(p, field, value)
        return await self.repo.save(p)

    async def delete(self, company_id: UUID, printer_id: UUID) -> None:
        p = await self.get(company_id, printer_id)
        await self.repo.delete(p)

    # ── Print actions ─────────────────────────────────────────────────────────

    async def test_print(self, company_id: UUID, printer_id: UUID) -> PrintJob:
        """Print a test page."""
        printer = await self.get(company_id, printer_id)
        fmt = EscPosFormatter(printer.paper_width, charset=(printer.settings or {}).get("charset", "cp866"))
        data = (
            fmt.INIT + fmt.ALIGN_CENTER
            + fmt.BOLD_ON
            + b"=== TEST PAGE ===\n"
            + fmt.BOLD_OFF
            + f"Printer: {printer.name}\n".encode()
            + b"Connection: OK\n"
            + fmt.LF * 3
            + fmt.CUT
        )
        return await self._enqueue_and_send(company_id, printer, "test", None, data)

    async def print_receipt(
        self, company_id: UUID, order_id: UUID, printer_id: UUID, copies: int = 1
    ) -> PrintJob:
        printer = await self.get(company_id, printer_id)
        order = await self._get_order(company_id, order_id)
        receipt_data = await self._build_receipt_data(company_id, order)

        fmt = EscPosFormatter(printer.paper_width, charset=(printer.settings or {}).get("charset", "cp866"))
        raw = fmt.format_receipt(receipt_data)
        job = await self._enqueue_and_send(company_id, printer, "receipt", order_id, raw, copies)
        # Отметка «чек напечатан» → стол «ожидает оплату» (сбросится при дозаказе)
        try:
            if order.status not in ("completed", "cancelled"):
                order.receipt_printed_at = datetime.now(timezone.utc)
                await self.db.commit()
        except Exception:
            pass
        return job

    async def print_kitchen_ticket(
        self, company_id: UUID, order_id: UUID, printer_id: UUID, copies: int = 1
    ) -> PrintJob:
        printer = await self.get(company_id, printer_id)
        order = await self._get_order(company_id, order_id)
        ticket_data = await self._build_kitchen_data(order, company_id)

        fmt = EscPosFormatter(printer.paper_width, charset=(printer.settings or {}).get("charset", "cp866"))
        raw = fmt.format_kitchen_ticket(ticket_data)
        return await self._enqueue_and_send(company_id, printer, "kitchen", order_id, raw, copies)

    async def print_summary(
        self,
        company_id: UUID,
        printer_id: UUID,
        title: str,
        lines: list[str],
        footer: str | None = None,
        copies: int = 1,
    ) -> PrintJob:
        """Общий чек-сводка (История/Отчёты): строки формирует клиент."""
        printer = await self.get(company_id, printer_id)
        fmt = EscPosFormatter(printer.paper_width, charset=(printer.settings or {}).get("charset", "cp866"))
        raw = fmt.format_summary(title, lines, footer)
        return await self._enqueue_and_send(company_id, printer, "summary", None, raw, copies)

    async def print_split_receipt(
        self,
        company_id: UUID,
        order_id: UUID,
        printer_id: UUID,
        mode: str = "items",
        parts: list | None = None,
        ways: int | None = None,
        copies: int = 1,
    ) -> list[PrintJob]:
        """2.1 — раздельный чек: печатает несколько чеков-частей одного заказа.

        mode="even"  → делит сумму поровну на `ways` частей (без списка блюд);
        mode="items" → каждая часть печатает выбранные позиции с пропорциональной
        долей скидки/сервисного сбора/НДС. Возвращает список PrintJob по частям.
        """
        printer = await self.get(company_id, printer_id)
        order = await self._get_order(company_id, order_id)
        base = await self._build_receipt_data(company_id, order)

        slices = self._build_split_slices(base, mode, parts, ways)
        if not slices:
            raise NotFoundError("Нет позиций для раздельного чека")

        fmt = EscPosFormatter(printer.paper_width, charset=(printer.settings or {}).get("charset", "cp866"))
        jobs: list[PrintJob] = []
        for sl in slices:
            raw = fmt.format_receipt(sl)
            jobs.append(await self._enqueue_and_send(company_id, printer, "receipt", order_id, raw, copies))

        try:
            if order.status not in ("completed", "cancelled"):
                order.receipt_printed_at = datetime.now(timezone.utc)
                await self.db.commit()
        except Exception:
            pass
        return jobs

    def _split_child(self, base: ReceiptData, note: str, items, subtotal, discount, service_fee, tax, total) -> ReceiptData:
        """Копия шапки базового чека с итогами конкретной части."""
        return ReceiptData(
            company_name=base.company_name,
            branch_name=base.branch_name,
            order_number=base.order_number,
            order_type=base.order_type,
            cashier_name=base.cashier_name,
            items=items,
            subtotal=subtotal,
            discount=discount,
            tax=tax,
            total=total,
            payment_method=base.payment_method,
            cash_received=None,          # по части наличные/сдача не считаем
            change_given=None,
            table_number=base.table_number,
            customer_name=base.customer_name,
            fiscal_code=None,            # фискальный код — только на общем чеке
            service_fee=service_fee,
            waiter_name=base.waiter_name,
            template=base.template,
            split_note=note,
        )

    def _build_split_slices(self, base: ReceiptData, mode: str, parts, ways) -> list[ReceiptData]:
        if mode == "even":
            n = max(1, int(ways or 1))
            zero = Decimal("0")
            out: list[ReceiptData] = []
            for i in range(1, n + 1):
                out.append(self._split_child(
                    base,
                    f"Поровну: {i} из {n}",
                    [],                                   # деление поровну — без списка блюд
                    (base.subtotal or zero) / n,
                    (base.discount or zero) / n,
                    (base.service_fee or zero) / n,
                    (base.tax or zero) / n,
                    (base.total or zero) / n,
                ))
            return out

        # mode == "items"
        src = base.items
        base_subtotal = base.subtotal or Decimal("0")
        out = []
        parts = parts or []
        for pi, part in enumerate(parts, 1):
            lines: list[ReceiptLine] = []
            part_subtotal = Decimal("0")
            for ref in part:
                idx = getattr(ref, "index", None)
                if idx is None or idx < 0 or idx >= len(src):
                    continue
                orig = src[idx]
                ref_qty = getattr(ref, "qty", None)
                qty = orig.qty if ref_qty is None else Decimal(ref_qty)
                if qty <= 0:
                    continue
                total = (orig.price or Decimal("0")) * qty
                lines.append(ReceiptLine(
                    name=orig.name, qty=qty, price=orig.price, total=total, modifiers=orig.modifiers,
                ))
                part_subtotal += total
            if not lines:
                continue
            # Долю скидки/сбора/НДС делим пропорционально сумме позиций части.
            ratio = (part_subtotal / base_subtotal) if base_subtotal > 0 else Decimal("0")
            discount = (base.discount or Decimal("0")) * ratio
            fee = (base.service_fee or Decimal("0")) * ratio
            tax = (base.tax or Decimal("0")) * ratio
            total = part_subtotal - discount + fee + tax
            out.append(self._split_child(
                base, f"Часть {pi} из {len(parts)}", lines, part_subtotal, discount, fee, tax, total,
            ))
        return out

    # Auto-print: find printers by type and print
    async def auto_print_receipt(self, company_id: UUID, branch_id: UUID, order_id: UUID) -> list[PrintJob]:
        printers = await self.repo.get_by_type(company_id, branch_id, "receipt")
        jobs = []
        for printer in printers:
            order = await self._get_order(company_id, order_id)
            receipt_data = await self._build_receipt_data(company_id, order)
            fmt = EscPosFormatter(printer.paper_width, charset=(printer.settings or {}).get("charset", "cp866"))
            raw = fmt.format_receipt(receipt_data)
            job = await self._enqueue_and_send(company_id, printer, "receipt", order_id, raw)
            jobs.append(job)
        return jobs

    async def auto_print_kitchen(self, company_id: UUID, branch_id: UUID, order_id: UUID) -> list[PrintJob]:
        printers = await self.repo.get_by_type(company_id, branch_id, "kitchen")
        jobs = []
        for printer in printers:
            order = await self._get_order(company_id, order_id)
            ticket_data = await self._build_kitchen_data(order, company_id)
            fmt = EscPosFormatter(printer.paper_width, charset=(printer.settings or {}).get("charset", "cp866"))
            raw = fmt.format_kitchen_ticket(ticket_data)
            job = await self._enqueue_and_send(company_id, printer, "kitchen", order_id, raw)
            jobs.append(job)
        return jobs

    # ── Job queue (for POS terminals that print locally) ─────────────────────

    async def get_pending_jobs(self, company_id: UUID, printer_id: UUID) -> list[PrintJob]:
        return await self.job_repo.get_pending(company_id, printer_id)

    async def mark_job_done(self, company_id: UUID, job_id: UUID) -> PrintJob:
        job = await self.job_repo.get_by_id(job_id, company_id)
        if not job:
            raise NotFoundError("Print job not found")
        job.status = "done"
        return await self.job_repo.save(job)

    # ── Internal ─────────────────────────────────────────────────────────────

    async def _enqueue_and_send(
        self,
        company_id: UUID,
        printer: Printer,
        job_type: str,
        ref_id: UUID | None,
        raw: bytes,
        copies: int = 1,
    ) -> PrintJob:
        payload = base64.b64encode(raw).decode()
        job = PrintJob(
            company_id=company_id,
            printer_id=printer.id,
            job_type=job_type,
            ref_id=ref_id,
            payload=payload,
            copies=copies,
            status="pending",
        )
        job = await self.job_repo.save(job)

        # Шаг 1. Пробуем напечатать сразу с сервера (принтер в одной сети с бэкендом).
        printed = False
        if printer.connection_type == "network" and printer.ip_address:
            try:
                for _ in range(copies):
                    await print_raw(printer, raw)
                job.status = "done"
                printed = True
            except PrinterError as e:
                # НЕ помечаем failed: принтер может быть недоступен с сервера
                # (бэкенд в облаке), но доступен из сети заведения. Оставляем
                # pending, чтобы задание подхватил терминал (по WS) или print_agent.
                job.status = "pending"
                job.error = str(e)
            await self.job_repo.save(job)

        # Шаг 2. Не напечатали сами — отдаём задание терминалам филиала по WebSocket.
        # Терминал печатает локально и закрывает задание через POST /printers/jobs/{id}/done.
        if not printed:
            try:
                await printer_ws_manager.broadcast(
                    company_id,
                    printer.branch_id,
                    {
                        "event": "print_job",
                        "job_id": str(job.id),
                        "printer_id": str(printer.id),
                        "payload": payload,
                        "copies": copies,
                        "job_type": job_type,
                    },
                )
            except Exception:  # noqa: BLE001 — доставка по WS не должна ронять оплату/заказ
                pass

        return job

    async def _get_branch(self, company_id: UUID, branch_id: UUID) -> Branch:
        result = await self.db.execute(
            select(Branch).where(Branch.id == branch_id, Branch.company_id == company_id)
        )
        branch = result.scalar_one_or_none()
        if not branch:
            raise NotFoundError("Branch not found")
        return branch

    async def _get_order(self, company_id: UUID, order_id: UUID) -> Order:
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.id == order_id, Order.company_id == company_id)
        )
        order = result.scalar_one_or_none()
        if not order:
            raise NotFoundError("Order not found")
        return order

    async def _build_receipt_data(self, company_id: UUID, order: Order) -> ReceiptData:
        # Get last payment
        pay_result = await self.db.execute(
            select(Payment).where(
                Payment.company_id == company_id,
                Payment.order_id == order.id,
                Payment.status == "completed",
            )
        )
        payment = pay_result.scalars().first()

        lines = [
            ReceiptLine(
                name=item.name,
                qty=item.quantity,
                price=item.price,
                total=item.total,
                modifiers=[m.get("name", "") for m in (item.modifiers or [])],
            )
            for item in order.items
        ]

        # Названия компании/филиала/официанта для «подробного» чека
        from app.modules.companies.models import Company, Branch
        from app.modules.auth.models import User as _User
        company = (await self.db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
        branch = (await self.db.execute(select(Branch).where(Branch.id == order.branch_id))).scalar_one_or_none()
        waiter = None
        if order.waiter_id:
            waiter = (await self.db.execute(select(_User).where(_User.id == order.waiter_id))).scalar_one_or_none()

        return ReceiptData(
            company_name=(company.name if company else "—"),
            branch_name=(branch.name if branch else "—"),
            order_number=order.order_number,
            order_type=order.order_type,
            cashier_name=(waiter.name if waiter and waiter.name else "Кассир"),
            items=lines,
            subtotal=order.subtotal,
            discount=order.discount_amount,
            tax=order.tax_amount,
            total=order.total_amount,
            payment_method=payment.method if payment else "—",
            cash_received=payment.cash_received if payment else None,
            change_given=payment.change_given if payment else None,
            table_number=order.table_number,
            service_fee=order.service_fee,
            waiter_name=(waiter.name if waiter else None),
            # 2.5 — шаблон конструктора чека (может быть None → печать по умолчанию)
            template=(company.receipt_template if company else None),
        )

    async def _build_kitchen_data(self, order: Order, company_id: UUID | None = None) -> KitchenTicketData:
        # 2.5 — шаблон кухонного чека из конструктора (companies.kitchen_receipt_template)
        kitchen_template = None
        if company_id:
            from app.modules.companies.models import Company
            company = (await self.db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
            kitchen_template = company.kitchen_receipt_template if company else None
        items = [
            {
                "name": item.name,
                "qty": str(item.quantity),
                "note": item.note,
                "modifiers": [m.get("name", "") for m in (item.modifiers or [])],
                "course": item.course,
            }
            for item in order.items
            if item.status not in ("cancelled", "served")
        ]
        return KitchenTicketData(
            order_number=order.order_number,
            order_type=order.order_type,
            table_number=order.table_number,
            waiter_name=None,
            items=items,
            note=order.note,
            template=kitchen_template,
        )
