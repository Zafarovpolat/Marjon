from __future__ import annotations
import io
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Iterable, Sequence
from uuid import UUID

from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin_reports.schemas import (
    AttendanceRow, CancelledItemRow, DebtCreditRow,
    DishReportRow, LoginHistoryRow, OrderReportRow,
    ProductCountRow, ProductReportRow, TableReportRow, WaiterReportRow,
)
from app.modules.auth.models import RefreshToken, User
from app.modules.finance.models import Counterparty, FinTransaction
from app.modules.finance.ownership import FinanceScope, require_finance_reference
from app.modules.hr.models import Employee, WorkShift
from app.modules.companies.models import Branch
from app.modules.inventory.models import Product
from app.modules.pos.models import Order, OrderItem
from app.shared.tenant_scope import require_company_resource


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

    async def _validate_branch(
        self, company_id: UUID, branch_id: UUID | None
    ) -> None:
        if branch_id is not None:
            await require_company_resource(
                self.db,
                Branch,
                branch_id,
                company_id,
                detail="Branch not found",
            )

    async def products(
        self,
        company_id: UUID,
        date_from: date | None,
        date_to: date | None,
        branch_id: UUID | None = None,
    ) -> list[ProductReportRow]:
        """Completed company sales grouped by tenant-owned product identity."""
        await self._validate_branch(company_id, branch_id)
        quantity = func.sum(OrderItem.quantity)
        total_amount = func.sum(OrderItem.total)
        query = (
            select(
                Product.id,
                Product.name,
                quantity,
                total_amount,
                func.coalesce(Product.cost_price, 0),
            )
            .select_from(OrderItem)
            .join(
                Order,
                and_(
                    Order.id == OrderItem.order_id,
                    Order.company_id == company_id,
                ),
            )
            .join(
                Product,
                and_(
                    Product.id == OrderItem.product_id,
                    Product.company_id == company_id,
                ),
            )
            .join(
                Branch,
                and_(
                    Branch.id == Order.branch_id,
                    Branch.company_id == company_id,
                ),
            )
            .where(
                Order.company_id == company_id,
                Product.company_id == company_id,
                Branch.company_id == company_id,
                Order.status == "completed",
                OrderItem.status != "cancelled",
            )
            .group_by(Product.id, Product.name, Product.cost_price)
        )
        if branch_id is not None:
            query = query.where(Order.branch_id == branch_id)
        query = self._order_date_filter(query, date_from, date_to)
        sales = (await self.db.execute(query)).all()

        rows = []
        for product_id, name, qty, total, unit_cost in sales:
            qty = Decimal(qty or 0)
            total = Decimal(total or 0)
            unit_cost = Decimal(unit_cost or 0)
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
        self,
        company_id: UUID,
        date_from: date | None,
        date_to: date | None,
        branch_id: UUID | None = None,
    ) -> list[ProductCountRow]:
        """Known product outflow from completed sales in the company schema."""
        await self._validate_branch(company_id, branch_id)
        expense = func.sum(OrderItem.quantity)
        query = (
            select(Product.id, Product.name, expense)
            .select_from(OrderItem)
            .join(
                Order,
                and_(
                    Order.id == OrderItem.order_id,
                    Order.company_id == company_id,
                ),
            )
            .join(
                Product,
                and_(
                    Product.id == OrderItem.product_id,
                    Product.company_id == company_id,
                ),
            )
            .join(
                Branch,
                and_(
                    Branch.id == Order.branch_id,
                    Branch.company_id == company_id,
                ),
            )
            .where(
                Order.company_id == company_id,
                Product.company_id == company_id,
                Branch.company_id == company_id,
                Order.status == "completed",
                OrderItem.status != "cancelled",
            )
            .group_by(Product.id, Product.name)
        )
        if branch_id is not None:
            query = query.where(Order.branch_id == branch_id)
        query = self._order_date_filter(query, date_from, date_to)
        rows = (await self.db.execute(query)).all()
        result = []
        for product_id, product_name, expense_qty in rows:
            expense_qty = Decimal(expense_qty or 0)
            result.append(
                ProductCountRow(
                    product_id=product_id,
                    product_name=product_name,
                    income_qty=Decimal("0"),
                    expense_qty=expense_qty,
                    balance_qty=-expense_qty,
                )
            )
        return result

    async def debt_credit(
        self,
        company_id: UUID,
        date_from: date | None,
        date_to: date | None,
        counterparty_id: UUID | None = None,
    ) -> list[DebtCreditRow]:
        """Дебет/кредит по контрагентам: остатки и обороты за период (ТЗ §6)."""
        scope = FinanceScope("company", company_id)
        await require_finance_reference(
            self.db,
            Counterparty,
            counterparty_id,
            scope,
            allow_system=False,
            detail="Counterparty not found",
        )
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
            .join(
                Counterparty,
                and_(
                    Counterparty.id == FinTransaction.counterparty_id,
                    Counterparty.scope_kind == "company",
                    Counterparty.company_id == company_id,
                    Counterparty.organization_id.is_(None),
                    Counterparty.deleted_at.is_(None),
                ),
            )
            .where(
                FinTransaction.deleted_at.is_(None),
                FinTransaction.counterparty_id.is_not(None),
                FinTransaction.company_id == company_id,
                FinTransaction.organization_id.is_(None),
                Counterparty.scope_kind == "company",
                Counterparty.company_id == company_id,
            )
            .group_by(FinTransaction.counterparty_id, Counterparty.full_name)
        )
        if counterparty_id is not None:
            query = query.where(FinTransaction.counterparty_id == counterparty_id)
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
        return [
            WaiterReportRow(
                waiter_id=r.waiter_id, name=r.waiter_name or "—",
                orders_count=r.orders_count,
                orders_total=Decimal(str(r.orders_total)),
                dishes_count=int(r.dishes_count or 0),
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
                OrderItem.name, OrderItem.quantity, OrderItem.price,
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
