from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.analytics.schemas import AvgCheckSegment, DashboardResponse, OrderLocationSummary, PaymentMethodSummary, SalesReport, TopProduct, UserActivityRank, ZReportResponse
from app.modules.auth.models import RefreshToken, User
from app.modules.companies.models import Company
from app.modules.fiscal.models import FiscalReceipt
from app.modules.payments.models import Payment
from app.modules.pos.models import Order, OrderItem, CashierShift


class AnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _company_tz(self, company_id: UUID) -> ZoneInfo:
        result = await self.db.execute(
            select(Company.timezone).where(Company.id == company_id)
        )
        tz_str = result.scalar_one_or_none() or "Asia/Tashkent"
        try:
            return ZoneInfo(tz_str)
        except (ZoneInfoNotFoundError, KeyError):
            return ZoneInfo("Asia/Tashkent")

    @staticmethod
    def _date_bounds(selected_date: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
        """Return UTC-aware [day_start, day_end) for a local calendar date."""
        day_start = datetime.combine(selected_date, datetime.min.time()).replace(tzinfo=tz).astimezone(timezone.utc)
        day_end   = datetime.combine(selected_date + timedelta(days=1), datetime.min.time()).replace(tzinfo=tz).astimezone(timezone.utc)
        return day_start, day_end

    async def dashboard(self, company_id: UUID, selected_date: date | None = None) -> DashboardResponse:
        tz = await self._company_tz(company_id)
        if selected_date:
            day_start, day_end = self._date_bounds(selected_date, tz)
        else:
            now_local = datetime.now(tz)
            today = now_local.date()
            day_start, day_end = self._date_bounds(today, tz)
            day_end = datetime.now(timezone.utc)  # up to now, not end of day

        result = await self.db.execute(
            select(func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0))
            .where(
                Order.company_id == company_id,
                Order.status.notin_(["cancelled"]),
                Order.created_at >= day_start,
                Order.created_at <= day_end,
            )
        )
        count, revenue = result.one()

        active = await self.db.execute(
            select(func.count(Order.id))
            .where(
                Order.company_id == company_id,
                Order.status.in_(["new", "accepted", "cooking", "ready"]),
            )
        )
        active_count = active.scalar_one()

        payments = await self.db.execute(
            select(
                Payment.method,
                func.count(Payment.id),
                func.coalesce(func.sum(Payment.amount), 0),
            )
            .where(
                Payment.company_id == company_id,
                Payment.status == "completed",
                Payment.created_at >= day_start,
                Payment.created_at <= day_end,
            )
            .group_by(Payment.method)
        )
        payment_rows = payments.all()
        payment_methods = [
            PaymentMethodSummary(
                method=row.method,
                count=row[1],
                amount=Decimal(str(row[2] or 0)),
            )
            for row in payment_rows
        ]
        cash_total = sum(Decimal(str(row[2] or 0)) for row in payment_rows if row.method == "cash")
        non_cash_total = sum(Decimal(str(row[2] or 0)) for row in payment_rows if row.method != "cash")

        locations = await self.db.execute(
            select(
                Order.order_type,
                Order.table_number,
                func.count(Order.id),
                func.coalesce(func.sum(Order.total_amount), 0),
            )
            .where(
                Order.company_id == company_id,
                Order.status == "completed",
                Order.created_at >= day_start,
                Order.created_at <= day_end,
            )
            .group_by(Order.order_type, Order.table_number)
        )
        location_rows = locations.all()
        order_locations = [
            OrderLocationSummary(
                name=row.table_number or row.order_type or "dine_in",
                count=row[2],
                order_type=row.order_type,
            )
            for row in location_rows
        ]
        avg_check_segments = [
            AvgCheckSegment(
                name=row.table_number or row.order_type or "dine_in",
                orders_count=row[2],
                avg_check=Decimal(str(row[3] or 0)) / row[2] if row[2] else Decimal("0"),
                order_type=row.order_type,
            )
            for row in location_rows
        ]

        avg_check = Decimal(str(revenue)) / count if count > 0 else Decimal("0")
        return DashboardResponse(
            today_revenue=Decimal(str(revenue)),
            today_orders=count,
            avg_check=avg_check,
            active_orders=active_count,
            cash_total=cash_total,
            non_cash_total=non_cash_total,
            payment_methods=payment_methods,
            order_locations=order_locations,
            avg_check_segments=avg_check_segments,
        )

    async def sales_report(self, company_id: UUID, date_from: date, date_to: date) -> list[SalesReport]:
        tz = await self._company_tz(company_id)
        start, _ = self._date_bounds(date_from, tz)
        _, end    = self._date_bounds(date_to, tz)
        result = await self.db.execute(
            select(
                func.date(func.timezone(str(tz), Order.created_at)).label("day"),
                func.count(Order.id).label("cnt"),
                func.coalesce(func.sum(Order.total_amount), 0).label("rev"),
            )
            .where(
                Order.company_id == company_id,
                Order.status.notin_(["cancelled"]),
                Order.created_at >= start,
                Order.created_at < end,
            )
            .group_by(func.date(func.timezone(str(tz), Order.created_at)))
            .order_by(func.date(func.timezone(str(tz), Order.created_at)))
        )
        rows = result.all()
        return [
            SalesReport(
                date=row.day,
                orders_count=row.cnt,
                revenue=Decimal(str(row.rev)),
                avg_check=Decimal(str(row.rev)) / row.cnt if row.cnt > 0 else Decimal("0"),
            )
            for row in rows
        ]

    async def top_products(
        self,
        company_id: UUID,
        limit: int = 20,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[TopProduct]:
        query = (
            select(
                OrderItem.product_id,
                OrderItem.name,
                func.sum(OrderItem.quantity).label("qty"),
                func.sum(OrderItem.total).label("rev"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.company_id == company_id, Order.status.notin_(["cancelled"]))
            .group_by(OrderItem.product_id, OrderItem.name)
            .order_by(func.sum(OrderItem.total).desc())
            .limit(limit)
        )
        if date_from or date_to:
            tz = await self._company_tz(company_id)
        if date_from:
            query = query.where(Order.created_at >= self._date_bounds(date_from, tz)[0])
        if date_to:
            query = query.where(Order.created_at < self._date_bounds(date_to, tz)[1])

        result = await self.db.execute(
            query
        )
        return [
            TopProduct(
                product_id=row.product_id,
                name=row.name,
                quantity_sold=Decimal(str(row.qty)),
                revenue=Decimal(str(row.rev)),
            )
            for row in result.all()
        ]

    async def z_report(self, company_id: UUID, selected_date: date) -> ZReportResponse:
        tz = await self._company_tz(company_id)
        day_start, day_end = self._date_bounds(selected_date, tz)

        completed_orders = await self.db.execute(
            select(
                func.count(Order.id),
                func.coalesce(func.sum(Order.subtotal), 0),
                func.coalesce(func.sum(Order.discount_amount), 0),
                func.coalesce(func.sum(Order.service_fee), 0),
                func.coalesce(func.sum(Order.tax_amount), 0),
                func.coalesce(func.sum(Order.total_amount), 0),
            )
            .where(
                Order.company_id == company_id,
                Order.status == "completed",
                Order.created_at >= day_start,
                Order.created_at <= day_end,
            )
        )
        orders_count, gross_sales, discounts_total, service_fee_total, tax_total, net_sales = completed_orders.one()

        cancelled_orders = await self.db.execute(
            select(func.count(Order.id))
            .where(
                Order.company_id == company_id,
                Order.status == "cancelled",
                Order.created_at >= day_start,
                Order.created_at <= day_end,
            )
        )
        cancelled_orders_count = cancelled_orders.scalar_one()

        payments = await self.db.execute(
            select(
                Payment.method,
                func.count(Payment.id),
                func.coalesce(func.sum(Payment.amount), 0),
                func.coalesce(func.sum(Payment.cash_received), 0),
                func.coalesce(func.sum(Payment.change_given), 0),
            )
            .where(
                Payment.company_id == company_id,
                Payment.status == "completed",
                Payment.created_at >= day_start,
                Payment.created_at <= day_end,
            )
            .group_by(Payment.method)
        )
        payment_rows = payments.all()

        payment_methods = [
            PaymentMethodSummary(
                method=row.method,
                count=row[1],
                amount=Decimal(str(row[2] or 0)),
            )
            for row in payment_rows
        ]
        payments_count = sum(row[1] for row in payment_rows)
        cash_total = sum(Decimal(str(row[2] or 0)) for row in payment_rows if row.method == "cash")
        cash_received_total = sum(Decimal(str(row[3] or 0)) for row in payment_rows)
        change_given_total = sum(Decimal(str(row[4] or 0)) for row in payment_rows)
        non_cash_total = sum(Decimal(str(row[2] or 0)) for row in payment_rows if row.method != "cash")

        refunds = await self.db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(
                Payment.company_id == company_id,
                Payment.status == "refunded",
                Payment.created_at >= day_start,
                Payment.created_at <= day_end,
            )
        )
        refunds_total = Decimal(str(refunds.scalar_one() or 0))

        fiscal = await self.db.execute(
            select(func.count(FiscalReceipt.id))
            .where(
                FiscalReceipt.company_id == company_id,
                FiscalReceipt.status == "sent",
                FiscalReceipt.created_at >= day_start,
                FiscalReceipt.created_at <= day_end,
            )
        )
        fiscal_receipts_count = fiscal.scalar_one()

        shift_result = await self.db.execute(
            select(CashierShift).where(
                CashierShift.company_id == company_id,
                CashierShift.opened_at >= day_start,
                CashierShift.opened_at <= day_end,
            ).order_by(CashierShift.opened_at.desc())
        )
        shift = shift_result.scalar_one_or_none()
        shift_opened = shift.opened_at.strftime("%H:%M") if shift else None
        shift_closed = shift.closed_at.strftime("%H:%M") if shift and shift.closed_at else None
        shift_is_closed = shift.status == "closed" if shift else False

        net_sales_decimal = Decimal(str(net_sales or 0))
        return ZReportResponse(
            date=selected_date,
            shift_opened_at=shift_opened,
            shift_closed_at=shift_closed,
            is_closed=shift_is_closed,
            orders_count=orders_count,
            cancelled_orders_count=cancelled_orders_count,
            payments_count=payments_count,
            fiscal_receipts_count=fiscal_receipts_count,
            gross_sales=Decimal(str(gross_sales or 0)),
            discounts_total=Decimal(str(discounts_total or 0)),
            service_fee_total=Decimal(str(service_fee_total or 0)),
            tax_total=Decimal(str(tax_total or 0)),
            refunds_total=refunds_total,
            net_sales=net_sales_decimal,
            cash_total=cash_total,
            cash_received_total=cash_received_total,
            change_given_total=change_given_total,
            non_cash_total=non_cash_total,
            avg_check=net_sales_decimal / orders_count if orders_count else Decimal("0"),
            payment_methods=payment_methods,
        )

    async def user_activity_ranking(
        self,
        company_id: UUID,
        limit: int = 20,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[UserActivityRank]:
        # Duration per session capped at 24 h to avoid stale open sessions skewing averages
        cap = func.least(
            func.coalesce(RefreshToken.revoked_at, func.now()),
            RefreshToken.created_at + timedelta(hours=24),
        )
        duration_secs = func.extract("epoch", cap - RefreshToken.created_at)

        query = (
            select(
                User.id,
                User.name,
                func.count(RefreshToken.id).label("sessions"),
                func.coalesce(func.avg(duration_secs), 0).label("avg_secs"),
                func.coalesce(func.sum(duration_secs), 0).label("total_secs"),
            )
            .join(RefreshToken, RefreshToken.user_id == User.id)
            .where(User.company_id == company_id)
            .group_by(User.id, User.name)
            .order_by(func.count(RefreshToken.id).desc())
            .limit(limit)
        )
        if date_from or date_to:
            tz = await self._company_tz(company_id)
        if date_from:
            query = query.where(
                RefreshToken.created_at >= self._date_bounds(date_from, tz)[0]
            )
        if date_to:
            query = query.where(
                RefreshToken.created_at < self._date_bounds(date_to, tz)[1]
            )

        result = await self.db.execute(query)
        return [
            UserActivityRank(
                rank=i + 1,
                user_id=row.id,
                user_name=row.name or "—",
                sessions=row.sessions,
                avg_session_seconds=int(row.avg_secs or 0),
                total_session_seconds=int(row.total_secs or 0),
            )
            for i, row in enumerate(result.all())
        ]
