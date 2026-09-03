from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from uuid import UUID
from typing import Literal
from pydantic import Field
from app.shared.base_schema import BaseSchema, BaseResponseSchema


class OrderItemCreate(BaseSchema):
    product_id: UUID
    quantity: Decimal = Field(..., gt=0)
    discount: Decimal | None = None
    note: str | None = None
    modifiers: list[dict] = Field(default_factory=list)
    course: int = 1
    takeaway: bool = False


class OrderCreate(BaseSchema):
    branch_id: UUID
    terminal_id: UUID | None = None
    customer_id: UUID | None = None
    order_type: Literal["dine_in", "takeaway", "delivery", "qr"] = "dine_in"
    table_number: str | None = None
    persons_count: int = 1
    note: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    discount_amount: Decimal | None = None
    service_fee_rate: float | None = None
    items: list[OrderItemCreate] = Field(default_factory=list)


class OrderUpdate(BaseSchema):
    """Partial update for order-level fields."""
    note: str | None = None
    table_number: str | None = None
    persons_count: int | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    waiter_id: UUID | None = None
    discount_amount: Decimal | None = None
    service_fee_rate: float | None = None
    reason: str | None = None  # 3.3 — причина смены стола/официанта (пишется в audit)
    action_pin: str | None = None  # 9 — отдельный PIN подтверждения смены стола (для официанта)


class OrderStatusUpdate(BaseSchema):
    status: Literal["new", "accepted", "cooking", "ready", "completed", "cancelled"]


class OrderItemWaiterUpdate(BaseSchema):
    """Смена ответственного официанта у ОТДЕЛЬНОЙ позиции заказа.
    Кассир исправляет путаницу, когда блюдо внёс не тот официант
    (доля обслуги считается по ответственному)."""
    waiter_id: UUID
    reason: str | None = None       # причина (пишется в audit)
    action_pin: str | None = None   # PIN подтверждения (для официанта; кассир — без PIN)


class OrderItemResponse(BaseResponseSchema):
    order_id: UUID
    product_id: UUID
    name: str
    price: Decimal
    quantity: Decimal
    discount: Decimal
    total: Decimal
    status: str
    note: str | None
    modifiers: list
    course: int
    takeaway: bool = False
    # 9.4 — кто и когда добавил позицию (created_at из BaseResponseSchema = время добавления)
    added_by: UUID | None = None
    added_by_name: str | None = None


class OrderResponse(BaseResponseSchema):
    company_id: UUID
    branch_id: UUID
    order_number: str
    order_type: str
    status: str
    table_number: str | None
    persons_count: int
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    service_fee: Decimal
    total_amount: Decimal
    note: str | None
    source: str
    customer_phone: str | None = None
    customer_address: str | None = None
    receipt_printed_at: datetime | None = None
    waiter_id: UUID | None = None
    waiter_name: str | None = None
    cancel_comment: str | None = None
    items: list[OrderItemResponse] = Field(default_factory=list)


class TerminalCreate(BaseSchema):
    branch_id: UUID
    name: str


class TerminalResponse(BaseResponseSchema):
    company_id: UUID
    branch_id: UUID
    name: str
    is_active: bool


class ShiftOpen(BaseSchema):
    branch_id: UUID
    opening_cash: Decimal = Decimal("0")


class ShiftClose(BaseSchema):
    closing_cash: Decimal = Decimal("0")


class ShiftResponse(BaseResponseSchema):
    company_id: UUID
    branch_id: UUID
    cashier_id: UUID
    opened_at: datetime
    closed_at: datetime | None
    opening_cash: Decimal
    closing_cash: Decimal | None
    status: str
