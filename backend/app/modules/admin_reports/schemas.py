from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel


class OrderReportRow(BaseModel):
    order_id: UUID
    order_number: str
    created_at: datetime
    status: str
    table_number: str | None
    waiter_name: str | None
    items_count: int
    total_amount: Decimal


class TableReportRow(BaseModel):
    table_number: str
    orders_count: int
    revenue: Decimal
    avg_check: Decimal


class WaiterReportRow(BaseModel):
    waiter_id: UUID | None
    name: str
    orders_count: int
    orders_total: Decimal
    dishes_count: int
    service_fee: Decimal = Decimal("0")
    waiter_share: Decimal = Decimal("0")


class DishReportRow(BaseModel):
    product_id: UUID
    name: str
    unit: str
    quantity: Decimal
    price: Decimal
    amount: Decimal
    cost: Decimal
    profit: Decimal
    status: str


class CancelledItemRow(BaseModel):
    date: str
    time: str
    order_number: str
    table_number: str | None
    name: str
    quantity: Decimal
    price: Decimal
    waiter_name: str | None
    unit: str
    order_type: str | None = None
    comment: str | None = None
    author: str | None = None
    station: str | None = None


class LoginHistoryRow(BaseModel):
    date: str
    employee: str
    role: str
    device: str
    login: str
    logout: str
    status: str


class AttendanceRow(BaseModel):
    date: str
    employee: str
    role: str
    start: str
    end: str
    hours: str
    status: str


class ProductReportRow(BaseModel):
    product_id: UUID
    product_name: str
    qty: Decimal
    avg_price: Decimal
    total: Decimal
    cost: Decimal
    profit: Decimal


class ProductCountRow(BaseModel):
    product_id: UUID
    product_name: str
    income_qty: Decimal
    expense_qty: Decimal
    balance_qty: Decimal


class DebtCreditRow(BaseModel):
    counterparty_id: UUID
    counterparty_name: str
    opening_balance: Decimal
    debit: Decimal   # приход (income)
    credit: Decimal  # расход (expense)
    closing_balance: Decimal
