from __future__ import annotations
import io
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Iterable, Sequence
from uuid import UUID

from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin_reports.schemas import (
    AttendanceRow, CancelledItemRow, DebtCreditRow,
    DishReportRow, LoginHistoryRow, OrderReportRow,
    ProductCountRow, ProductReportRow, TableReportRow, WaiterReportRow,
)
from app.modules.auth.models import RefreshToken, User
from app.modules.finance.models import Counterparty, FinTransaction
from app.modules.hr.models import Employee, WorkShift
from app.modules.nomenclature.models import NomProduct
from app.modules.pos.models import Order, OrderItem
from app.modules.storage.models import StorageMovement


def xlsx_response(filename: str, headers: Sequence[str], rows: Iterable[Sequence]) -> StreamingResponse:
    """Генерация .xlsx (ТЗ §8, Excel-экспорт)."""
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(list(headers))
    for row in rows:
        ws.append([float(v) if isinstance(v, Decimal) else v for v in row])
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class AdminReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _movement_period(self, query, date_from: date | None, date_to: date | None):
        if date_from:
            query = query.where(func.date(StorageMovement.date) >= date_from)
        if date_to:
            query = query.where(func.date(StorageMovement.date) <= date_to)
        return query

    async def products(
        self, date_from: date | None, date_to: date | None
    ) -> list[ProductReportRow]:
        """Отчёт по продуктам: кол-во, цена, сумма, себестоимость, прибыль (ТЗ §6).

        Продажи — расходные движения склада; себестоимость — средняя цена прихода.
        """
        expense_qty = func.sum(StorageMovement.qty)
        expense_sum = func.sum(StorageMovement.qty * StorageMovement.price)
        query = (
            select(StorageMovement.product_id, NomProduct.name, expense_qty, expense_sum)
            .join(NomProduct, NomProduct.id == StorageMovement.product_id)
            .where(StorageMovement.direction == "expense")
            .group_by(StorageMovement.product_id, NomProduct.name)
        )
        query = self._movement_period(query, date_from, date_to)
        sales = (await self.db.execute(query)).all()

        # средняя себестоимость по всем приходам
        cost_query = (
            select(
                StorageMovement.product_id,
                func.sum(StorageMovement.qty * StorageMovement.price)
                / func.nullif(func.sum(StorageMovement.qty), 0),
            )
            .where(StorageMovement.direction == "income")
            .group_by(StorageMovement.product_id)
        )
        costs = dict((await self.db.execute(cost_query)).all())

        rows = []
        for product_id, name, qty, total in sales:
            qty = Decimal(qty or 0)
            total = Decimal(total or 0)
            unit_cost = Decimal(costs.get(product_id) or 0)
            cost = (unit_cost * qty).quantize(Decimal("0.01"))
            rows.append(ProductReportRow(
                product_id=product_id,
                product_name=name,
                qty=qty,
                avg_price=(total / qty).quantize(Decimal("0.01")) if qty else Decimal(0),
                total=total.quantize(Decimal("0.01")),
                cost=cost,
                profit=(total - cost).quantize(Decimal("0.01")),
            ))
        return rows

    async def products_count(
        self, date_from: date | None, date_to: date | None
    ) -> list[ProductCountRow]:
        income = func.sum(case(
            (StorageMovement.direction == "income", StorageMovement.qty), else_=0
        ))
        expense = func.sum(case(
            (StorageMovement.direction == "expense", StorageMovement.qty), else_=0
        ))
        query = (
            select(StorageMovement.product_id, NomProduct.name, income, expense)
            .join(NomProduct, NomProduct.id == StorageMovement.product_id)
            .group_by(StorageMovement.product_id, NomProduct.name)
        )
        query = self._movement_period(query, date_from, date_to)
        rows = (await self.db.execute(query)).all()
        return [
            ProductCountRow(
                product_id=r[0], product_name=r[1],
                income_qty=r[2] or 0, expense_qty=r[3] or 0,
                balance_qty=(r[2] or 0) - (r[3] or 0),
            )
            for r in rows
        ]

    async def debt_credit(
        self, date_from: date | None, date_to: date | None
    ) -> list[DebtCreditRow]:
        """Дебет/кредит по контрагентам: остатки и обороты за период (ТЗ §6)."""
        signed = case(
            (FinTransaction.direction == "income", FinTransaction.amount),
            else_=-FinTransaction.amount,
        )
        opening = func.sum(case(
            (func.date(FinTransaction.date) < (date_from or date.min), signed), else_=0
        ))
        in_period = func.date(FinTransaction.date) >= (date_from or date.min)
        if date_to:
            in_period = in_period & (func.date(FinTransaction.date) <= date_to)
        debit = func.sum(case(
            (in_period & (FinTransaction.direction == "income"), FinTransaction.amount), else_=0
        ))
        credit = func.sum(case(
            (in_period & (FinTransaction.direction == "expense"), FinTransaction.amount), else_=0
        ))

        query = (
            select(FinTransaction.counterparty_id, Counterparty.full_name, opening, debit, credit)
            .join(Counterparty, Counterparty.id == FinTransaction.counterparty_id)
            .where(FinTransaction.deleted_at.is_(None), FinTransaction.counterparty_id.is_not(None))
            .group_by(FinTransaction.counterparty_id, Counterparty.full_name)
        )
        if date_to:
            query = query.where(func.date(FinTransaction.date) <= date_to)
        rows = (await self.db.execute(query)).all()
        return [
            DebtCreditRow(
                counterparty_id=r[0], counterparty_name=r[1],
                opening_balance=r[2] or 0, debit=r[3] or 0, credit=r[4] or 0,
                closing_balance=(r[2] or 0) + (r[3] or 0) - (r[4] or 0),
            )
            for r in rows
        ]

    def _order_date_filter(self, query, date_from: date | None, date_to: date | None):
        if date_from:
            query = query.where(Order.created_at >= datetime.combine(date_from, datetime.min.time()))
        if date_to:
            query = query.where(Order.created_at <= datetime.combine(date_to, datetime.max.time()))
        return query

    async def orders_report(
        self, company_id: UUID, date_from: date | None, date_to: date | None
    ) -> list[OrderReportRow]:
        query = (
            select(
                Order.id, Order.order_number, Order.created_at,
                Order.status, Order.table_number,
                User.name.label("waiter_name"),
                func.count(OrderItem.id).label("items_count"),
                Order.total_amount,
            )
            .outerjoin(User, User.id == Order.waiter_id)
            .outerjoin(OrderItem, OrderItem.order_id == Order.id)
            .where(Order.company_id == company_id, Order.status.notin_(["cancelled"]))
            .group_by(Order.id, Order.order_number, Order.created_at,
                      Order.status, Order.table_number, User.name, Order.total_amount)
            .order_by(Order.created_at.desc())
        )
        query = self._order_date_filter(query, date_from, date_to)
        rows = (await self.db.execute(query)).all()
        return [
            OrderReportRow(
                order_id=r.id, order_number=r.order_number,
                created_at=r.created_at, status=r.status,
                table_number=r.table_number, waiter_name=r.waiter_name,
                items_count=r.items_count, total_amount=Decimal(str(r.total_amount or 0)),
            )
            for r in rows
        ]

    async def tables_report(
        self, company_id: UUID, date_from: date | None, date_to: date | None
    ) -> list[TableReportRow]:
        query = (
            select(
                Order.table_number,
                func.count(Order.id).label("cnt"),
                func.coalesce(func.sum(Order.total_amount), 0).label("rev"),
            )
            .where(
                Order.company_id == company_id,
                Order.status == "completed",
                Order.table_number.is_not(None),
            )
            .group_by(Order.table_number)
            .order_by(func.sum(Order.total_amount).desc())
        )
        query = self._order_date_filter(query, date_from, date_to)
        rows = (await self.db.execute(query)).all()
        return [
            TableReportRow(
                table_number=r.table_number, orders_count=r.cnt,
                revenue=Decimal(str(r.rev)),
                avg_check=Decimal(str(r.rev)) / r.cnt if r.cnt else Decimal("0"),
            )
            for r in rows
        ]

    async def waiters_report(
        self, company_id: UUID, date_from: date | None, date_to: date | None
    ) -> list[WaiterReportRow]:
        query = (
            select(
                Order.waiter_id,
                User.name.label("waiter_name"),
                func.count(Order.id).label("orders_count"),
                func.coalesce(func.sum(Order.total_amount), 0).label("orders_total"),
                func.coalesce(func.sum(Order.service_fee), 0).label("service_fee"),
                func.coalesce(func.sum(
                    select(func.count(OrderItem.id))
                    .where(OrderItem.order_id == Order.id)
                    .correlate(Order)
                    .scalar_subquery()
                ), 0).label("dishes_count"),
            )
            .outerjoin(User, User.id == Order.waiter_id)
            .where(Order.company_id == company_id, Order.status == "completed")
            .group_by(Order.waiter_id, User.name)
            .order_by(func.sum(Order.total_amount).desc())
        )
        query = self._order_date_filter(query, date_from, date_to)
        rows = (await self.db.execute(query)).all()
        # Процент доли обслуги официанта — из настроек компании
        from app.modules.companies.models import Company
        pct = (await self.db.execute(
            select(Company.waiter_service_percent).where(Company.id == company_id)
        )).scalar_one_or_none() or 0
        pct = Decimal(str(pct))
        return [
            WaiterReportRow(
                waiter_id=r.waiter_id, name=r.waiter_name or "—",
                orders_count=r.orders_count,
                orders_total=Decimal(str(r.orders_total)),
                dishes_count=int(r.dishes_count or 0),
                service_fee=Decimal(str(r.service_fee)),
                waiter_share=(Decimal(str(r.service_fee)) * pct / Decimal("100")).quantize(Decimal("0.01")),
            )
            for r in rows
        ]

    async def dishes_report(
        self, company_id: UUID, date_from: date | None, date_to: date | None
    ) -> list[DishReportRow]:
        query = (
            select(
                OrderItem.product_id,
                OrderItem.name,
                func.sum(OrderItem.quantity).label("qty"),
                func.avg(OrderItem.price).label("avg_price"),
                func.sum(OrderItem.total).label("total"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.company_id == company_id, Order.status.notin_(["cancelled"]))
            .group_by(OrderItem.product_id, OrderItem.name)
            .order_by(func.sum(OrderItem.total).desc())
        )
        query = self._order_date_filter(query, date_from, date_to)
        rows = (await self.db.execute(query)).all()
        return [
            DishReportRow(
                product_id=r.product_id, name=r.name, unit="Порция",
                quantity=Decimal(str(r.qty or 0)),
                price=Decimal(str(r.avg_price or 0)),
                amount=Decimal(str(r.total or 0)),
                cost=Decimal("0"), profit=Decimal(str(r.total or 0)),
                status="Завершено",
            )
            for r in rows
        ]

    async def cancelled_items(
        self, company_id: UUID, date_from: date | None, date_to: date | None
    ) -> list[CancelledItemRow]:
        query = (
            select(
                Order.created_at, Order.order_number, Order.table_number,
                Order.order_type,
                OrderItem.name, OrderItem.quantity, OrderItem.price,
                OrderItem.note.label("item_note"),
                User.name.label("waiter_name"),
            )
            .join(OrderItem, OrderItem.order_id == Order.id)
            .outerjoin(User, User.id == Order.waiter_id)
            .where(Order.company_id == company_id, Order.status == "cancelled")
            .order_by(Order.created_at.desc())
        )
        query = self._order_date_filter(query, date_from, date_to)
        rows = (await self.db.execute(query)).all()
        result = []
        order_type_labels = {
            "dine_in": "На месте",
            "takeaway": "На вынос",
            "delivery": "Доставка",
            "qr": "QR",
        }
        for r in rows:
            dt = r.created_at
            result.append(CancelledItemRow(
                date=dt.strftime("%d.%m.%Y") if dt else "",
                time=dt.strftime("%H:%M") if dt else "",
                order_number=r.order_number,
                table_number=r.table_number,
                name=r.name,
                quantity=Decimal(str(r.quantity)),
                price=Decimal(str(r.price)),
                waiter_name=r.waiter_name,
                unit="шт",
                order_type=order_type_labels.get(r.order_type, r.order_type),
                comment=r.item_note,
                author=r.waiter_name,
                station=None,
            ))
        return result

    async def login_history(self, company_id: UUID) -> list[LoginHistoryRow]:
        query = (
            select(
                RefreshToken.created_at,
                RefreshToken.revoked_at,
                RefreshToken.device_id,
                User.name,
                User.email,
            )
            .join(User, User.id == RefreshToken.user_id)
            .where(User.company_id == company_id)
            .order_by(RefreshToken.created_at.desc())
            .limit(200)
        )
        rows = (await self.db.execute(query)).all()
        result = []
        for r in rows:
            login_dt = r.created_at
            logout_dt = r.revoked_at
            result.append(LoginHistoryRow(
                date=login_dt.strftime("%d.%m.%Y") if login_dt else "",
                employee=r.name or r.email or "—",
                role="Сотрудник",
                device=r.device_id or "—",
                login=login_dt.strftime("%H:%M") if login_dt else "",
                logout=logout_dt.strftime("%H:%M") if logout_dt else "—",
                status="Успешно",
            ))
        return result

    async def attendance_history(self, company_id: UUID) -> list[AttendanceRow]:
        query = (
            select(
                WorkShift.actual_start, WorkShift.actual_end, WorkShift.status,
                User.name.label("user_name"),
                Employee.position,
            )
            .join(Employee, Employee.id == WorkShift.employee_id)
            .join(User, User.id == Employee.user_id)
            .where(WorkShift.company_id == company_id)
            .order_by(WorkShift.actual_start.desc())
            .limit(200)
        )
        rows = (await self.db.execute(query)).all()
        result = []
        for r in rows:
            start = r.actual_start
            end = r.actual_end
            hours = ""
            if start and end:
                diff = int((end - start).total_seconds())
                h, m = divmod(diff // 60, 60)
                hours = f"{h} ч {m} мин"
            result.append(AttendanceRow(
                date=start.strftime("%d.%m.%Y") if start else "",
                employee=r.user_name or "—",
                role=r.position or "—",
                start=start.strftime("%H:%M") if start else "",
                end=end.strftime("%H:%M") if end else "",
                hours=hours,
                status="Закрыта" if r.status == "completed" else r.status,
            ))
        return result
