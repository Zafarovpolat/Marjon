from __future__ import annotations
from decimal import Decimal
from datetime import date
from uuid import UUID
from pydantic import Field
from app.shared.base_schema import BaseSchema


class UserActivityRank(BaseSchema):
    rank: int
    user_id: UUID
    user_name: str
    sessions: int
    avg_session_seconds: int
    total_session_seconds: int


class SalesReport(BaseSchema):
    date: date
    orders_count: int
    revenue: Decimal
    avg_check: Decimal


class TopProduct(BaseSchema):
    product_id: UUID
    name: str
    quantity_sold: Decimal
    revenue: Decimal


class PaymentMethodSummary(BaseSchema):
    method: str
    amount: Decimal
    count: int


class OrderLocationSummary(BaseSchema):
    name: str
    count: int
    order_type: str | None = None


class AvgCheckSegment(BaseSchema):
    name: str
    avg_check: Decimal
    orders_count: int
    order_type: str | None = None


class DashboardResponse(BaseSchema):
    today_revenue: Decimal
    today_orders: int
    avg_check: Decimal
    active_orders: int
    cash_total: Decimal = Decimal("0")
    non_cash_total: Decimal = Decimal("0")
    payment_methods: list[PaymentMethodSummary] = Field(default_factory=list)
    order_locations: list[OrderLocationSummary] = Field(default_factory=list)
    avg_check_segments: list[AvgCheckSegment] = Field(default_factory=list)


class ZReportResponse(BaseSchema):
    date: date
    shift_opened_at: str | None = None
    shift_closed_at: str | None = None
    is_closed: bool = False
    orders_count: int
    cancelled_orders_count: int
    payments_count: int
    fiscal_receipts_count: int
    gross_sales: Decimal
    discounts_total: Decimal
    service_fee_total: Decimal
    tax_total: Decimal
    refunds_total: Decimal
    net_sales: Decimal
    cash_total: Decimal
    cash_received_total: Decimal
    change_given_total: Decimal
    non_cash_total: Decimal
    avg_check: Decimal
    payment_methods: list[PaymentMethodSummary]
