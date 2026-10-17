from __future__ import annotations
import base64
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.companies.models import Branch, Company
from app.modules.kafe_compat.models import ReceiptTemplateSettings
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
from app.shared.storage import storage


# ── PRINT-LAT-01: попытка прямой печати с сервера ────────────────────────────
# Запрос печати синхронно ждёт TCP-соединения с принтером. 5 с (старое значение)
# означали 5-секундное ожидание на каждый чек, если бэкенд не в одной сети с
# принтером. 2 с достаточно любому живому LAN-принтеру, а недоступный адрес
# запоминается на минуту, чтобы следующие задания уходили на терминал сразу.
SERVER_PRINT_TIMEOUT = 2.0
PRINTER_COOLDOWN_SECONDS = 60.0
_printer_cooldown: dict[UUID, float] = {}


def _start_printer_cooldown(printer_id: UUID) -> None:
    _printer_cooldown[printer_id] = time.monotonic() + PRINTER_COOLDOWN_SECONDS


def _clear_printer_cooldown(printer_id: UUID) -> None:
    _printer_cooldown.pop(printer_id, None)


def _is_printer_cooling_down(printer_id: UUID) -> bool:
    until = _printer_cooldown.get(printer_id)
    if until is None:
        return False
    if time.monotonic() >= until:
        _printer_cooldown.pop(printer_id, None)
        return False
    return True


class PrinterService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = PrinterRepository(db)
        self.job_repo = PrintJobRepository(db)

    # ── Printer CRUD ─────────────────────────────────────────────────────────

    async def create(self, company_id: UUID, data: PrinterCreate) -> Printer:
        payload = data.model_dump()
        branch_id = payload.pop("branch_id", None) or await self._resolve_default_branch(company_id)
        await self._get_branch(company_id, branch_id)
        return await self.repo.save(Printer(company_id=company_id, branch_id=branch_id, **payload))

    async def _resolve_default_branch(self, company_id: UUID) -> UUID:
        """BE-13: the live printer-settings form never sends branch_id, so
        PrinterCreate.branch_id is optional — resolve it here instead of
        422ing on every printer the frontend creates. Branch has no
        is_main flag, so this picks the earliest-created one (the branch
        created at registration for a typical single-branch company);
        raises a clear error if the company has no branch at all rather
        than guessing further."""
        result = await self.db.execute(
            select(Branch)
            .where(Branch.company_id == company_id)
            .order_by(Branch.created_at.asc())
            .limit(1)
        )
        branch = result.scalars().first()
        if not branch:
            raise NotFoundError("Company has no branch to attach this printer to — create one first")
        return branch.id

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

    @staticmethod
    def _printer_encoding(printer: Printer) -> str:
        """Кодовая страница принтера (settings.encoding), по умолчанию cp866 —
        см. EscPosFormatter._CODEPAGES для того, почему это дефолт."""
        return (printer.settings or {}).get("encoding", "cp866")

    async def _get_receipt_templates(self, company_id: UUID) -> tuple[dict, dict]:
        """Шаблоны, сохранённые на фронте (ReceiptSettingsPage/ChefReceiptSettingsPage
        через GET/PATCH /settings/receipt-template|kitchen-receipt-template).
        Возвращает ({} , {}), если ещё не настроено — форматтер тогда печатает
        все блоки (прежнее поведение)."""
        row = (
            await self.db.execute(
                select(ReceiptTemplateSettings).where(ReceiptTemplateSettings.company_id == company_id)
            )
        ).scalar_one_or_none()
        if not row:
            return {}, {}
        return row.customer_template or {}, row.kitchen_template or {}

    async def _get_logo_bytes(self, company_id: UUID) -> bytes | None:
        """Лого компании (Company.logo_key, загружается через POST /companies/me/logo).
        None, если ещё не загружено — блок 'logo' в чеке тогда просто не печатается."""
        company = await self.db.get(Company, company_id)
        if not company or not company.logo_key:
            return None
        return await storage.download(company.logo_key)

    async def test_print(self, company_id: UUID, printer_id: UUID) -> PrintJob:
        """Print a test page."""
        printer = await self.get(company_id, printer_id)
        fmt = EscPosFormatter(printer.paper_width, encoding=self._printer_encoding(printer))
        data = (
            fmt.INIT + fmt.codepage_cmd + fmt.ALIGN_CENTER
            + fmt.BOLD_ON
            + fmt._line("=== TEST PAGE ===")
            + fmt.BOLD_OFF
            + fmt._line(f"Printer: {printer.name}")
            + fmt._line("Connection: OK")
            + fmt.LF * 3
            + fmt.CUT
        )
        return await self._enqueue_and_send(company_id, printer, "test", None, data)

    async def print_summary(
        self,
        company_id: UUID,
        printer_id: UUID,
        title: str,
        lines: list[str],
        footer: str | None = None,
        copies: int = 1,
    ) -> PrintJob:
        """DESK-PRINT-01: печать текстовой сводки (история заказов, отчёт, Z-отчёт).

        Раньше десктоп звал POST /printers/print/summary, которого не было —
        кнопка «Печать сводки» в HistoryPanel/ReportsPanel/BatchPrintPanel
        всегда падала с 404 и показывала тост «Ошибка печати». Печатаем тем же
        путём, что и чеки: enqueue + попытка отправить на сетевой принтер,
        иначе задание уходит терминалу филиала по WS.
        """
        printer = await self.get(company_id, printer_id)
        fmt = EscPosFormatter(printer.paper_width, encoding=self._printer_encoding(printer))

        def wrap(text: str) -> list[str]:
            """Перенос по словам в ширину бумаги: ESC/POS сам режет по символу
            и рвёт слова посередине, из-за чего отчёт читается плохо."""
            text = str(text or "")
            if len(text) <= fmt.cols:
                return [text]
            out: list[str] = []
            cur = ""
            for word in text.split():
                if not cur:
                    cur = word[: fmt.cols]
                elif len(cur) + 1 + len(word) <= fmt.cols:
                    cur = f"{cur} {word}"
                else:
                    out.append(cur)
                    cur = word
            if cur:
                out.append(cur)
            return out or [""]

        data = (
            fmt.INIT
            + fmt.codepage_cmd
            + fmt.ALIGN_CENTER
            + fmt.BOLD_ON
            + fmt.DOUBLE_HEIGHT
            + fmt._line(title[: fmt.cols])
            + fmt.NORMAL_SIZE
            + fmt.BOLD_OFF
            + fmt._line("-" * fmt.cols)
            + fmt.ALIGN_LEFT
        )
        for line in lines:
            for chunk in wrap(line):
                data += fmt._line(chunk)
        if footer:
            data += fmt._line("-" * fmt.cols) + fmt.BOLD_ON
            for chunk in wrap(footer):
                data += fmt._line(chunk)
            data += fmt.BOLD_OFF
        data += fmt.LF * 3 + fmt.CUT

        return await self._enqueue_and_send(company_id, printer, "summary", None, data, copies)

    async def print_receipt(
        self, company_id: UUID, order_id: UUID, printer_id: UUID, copies: int = 1
    ) -> PrintJob:
        printer = await self.get(company_id, printer_id)
        order = await self._get_order(company_id, order_id)
        receipt_data = await self._build_receipt_data(company_id, order)
        customer_tpl, _ = await self._get_receipt_templates(company_id)
        logo_bytes = await self._get_logo_bytes(company_id)

        fmt = EscPosFormatter(printer.paper_width, encoding=self._printer_encoding(printer))
        raw = fmt.format_receipt(receipt_data, template=customer_tpl, logo_bytes=logo_bytes)
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
        ticket_data = await self._build_kitchen_data(order)
        _, kitchen_tpl = await self._get_receipt_templates(company_id)

        fmt = EscPosFormatter(printer.paper_width, encoding=self._printer_encoding(printer))
        raw = fmt.format_kitchen_ticket(ticket_data, template=kitchen_tpl)
        return await self._enqueue_and_send(company_id, printer, "kitchen", order_id, raw, copies)

    async def get_order_for_print(self, company_id: UUID, order_id: UUID) -> Order:
        """Public wrapper around _get_order — lets the compat print-by-order
        endpoints (BE-12) validate order ownership up front, before
        auto-selecting a printer, so an unknown/foreign order_id 404s
        instead of silently returning an empty job list."""
        return await self._get_order(company_id, order_id)

    # Auto-print: find printers by type and print
    async def auto_print_receipt(self, company_id: UUID, branch_id: UUID, order_id: UUID) -> list[PrintJob]:
        printers = await self.repo.get_by_type(company_id, branch_id, "receipt")
        jobs = []
        customer_tpl, _ = await self._get_receipt_templates(company_id)
        logo_bytes = await self._get_logo_bytes(company_id)
        for printer in printers:
            order = await self._get_order(company_id, order_id)
            receipt_data = await self._build_receipt_data(company_id, order)
            fmt = EscPosFormatter(printer.paper_width, encoding=self._printer_encoding(printer))
            raw = fmt.format_receipt(receipt_data, template=customer_tpl, logo_bytes=logo_bytes)
            job = await self._enqueue_and_send(company_id, printer, "receipt", order_id, raw)
            jobs.append(job)
        return jobs

    async def auto_print_kitchen(self, company_id: UUID, branch_id: UUID, order_id: UUID) -> list[PrintJob]:
        printers = await self.repo.get_by_type(company_id, branch_id, "kitchen")
        jobs = []
        _, kitchen_tpl = await self._get_receipt_templates(company_id)
        for printer in printers:
            order = await self._get_order(company_id, order_id)
            ticket_data = await self._build_kitchen_data(order)
            fmt = EscPosFormatter(printer.paper_width, encoding=self._printer_encoding(printer))
            raw = fmt.format_kitchen_ticket(ticket_data, template=kitchen_tpl)
            job = await self._enqueue_and_send(company_id, printer, "kitchen", order_id, raw)
            jobs.append(job)
        return jobs

    # ── Job queue (for POS terminals that print locally) ─────────────────────

    async def get_pending_jobs(
        self, company_id: UUID, printer_id: UUID, max_age_minutes: int = 10
    ) -> list[PrintJob]:
        """Задания, которые терминал должен напечатать сам.

        PRINT-LAT-01: отдаём только свежие (по умолчанию 10 минут). Раньше
        очередь не фильтровалась по возрасту, и после включения опроса терминал
        при старте смены выплёвывал все когда-либо недопечатанные чеки — включая
        вчерашние. Свежее окно достаточно, чтобы пережить обрыв WS, и не
        превращается в «принтер сам печатает по утрам».
        """
        jobs = await self.job_repo.get_pending(company_id, printer_id)
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
        fresh: list[PrintJob] = []
        for job in jobs:
            created = job.created_at
            if created is not None and created.tzinfo is None:
                # SQLite отдаёт naive-время (оно в UTC) — приводим к aware.
                created = created.replace(tzinfo=timezone.utc)
            if created is None or created >= cutoff:
                fresh.append(job)
        return fresh

    async def mark_job_done(self, company_id: UUID, job_id: UUID) -> PrintJob:
        job = await self.job_repo.get_by_id(job_id, company_id)
        if not job:
            raise NotFoundError("Print job not found")
        job.status = "done"
        job.error = None
        return await self.job_repo.save(job)

    async def mark_job_failed(self, company_id: UUID, job_id: UUID, error: str | None = None) -> PrintJob:
        """PRINT-LAT-01: терминал не смог напечатать — закрываем задание.

        Раньше у терминала был только «done»: при ошибке печати (принтер
        выключен, нет ip) задание навсегда оставалось pending и всплывало в
        очереди при каждом опросе — то есть «печатается через раз».
        """
        job = await self.job_repo.get_by_id(job_id, company_id)
        if not job:
            raise NotFoundError("Print job not found")
        job.status = "failed"
        job.error = (error or "print failed")[:500]
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
        #
        # PRINT-LAT-01: раньше здесь всегда был таймаут 5 с на копию. Если бэкенд
        # стоит в облаке (или в другой подсети), а принтер — в зале, КАЖДАЯ
        # печать ждала 5 секунд, прежде чем уйти на терминал по WS: отсюда
        # «нажимаю печать и жду». Теперь:
        #   • таймаут 2 с — этого хватает любому живому принтеру в LAN;
        #   • недоступный принтер запоминается на 60 с, и следующие задания
        #     сразу идут на терминал без ожидания.
        printed = False
        if printer.connection_type == "network" and printer.ip_address:
            if _is_printer_cooling_down(printer.id):
                job.error = "Принтер недоступен с сервера — задание отправлено на терминал"
            else:
                try:
                    for _ in range(copies):
                        await print_raw(printer, raw, timeout=SERVER_PRINT_TIMEOUT)
                    job.status = "done"
                    printed = True
                    _clear_printer_cooldown(printer.id)
                except PrinterError as e:
                    # НЕ помечаем failed: принтер может быть недоступен с сервера
                    # (бэкенд в облаке), но доступен из сети заведения. Оставляем
                    # pending, чтобы задание подхватил терминал (по WS) или print_agent.
                    job.status = "pending"
                    job.error = str(e)
                    _start_printer_cooldown(printer.id)
            # Сохраняем в обеих ветках: без записи в БД объект остаётся с
            # незагруженным updated_at и сериализация ответа падает с MissingGreenlet.
            job = await self.job_repo.save(job)

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
                        # PRINT-LAT-01: ip/port прямо в сообщении — терминал
                        # печатает, даже если его список принтеров ещё не
                        # загрузился (раньше обработчик молча выходил по
                        # `if (!printer) return`, и задание висело pending).
                        "ip_address": printer.ip_address,
                        "port": printer.port,
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
        branch = (
            await self.db.execute(
                select(Branch).where(
                    Branch.id == order.branch_id, Branch.company_id == company_id
                )
            )
        ).scalar_one_or_none()
        waiter = None
        if order.waiter_id:
            waiter = (
                await self.db.execute(
                    select(_User).where(
                        _User.id == order.waiter_id, _User.company_id == company_id
                    )
                )
            ).scalar_one_or_none()

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
        )

    async def _build_kitchen_data(self, order: Order) -> KitchenTicketData:
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
        )
