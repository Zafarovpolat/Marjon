from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from uuid import UUID
from app.shared.base_schema import BaseSchema, BaseResponseSchema


class WarehouseResponse(BaseResponseSchema):
    company_id: UUID
    name: str
    is_active: bool


# ── Purchase ─────────────────────────────────────────────────────────────────

class PurchaseItemCreate(BaseSchema):
    name: str
    quantity: Decimal
    unit: str
    cost_price: Decimal


class PurchaseCreate(BaseSchema):
    supplier: str | None = None
    warehouse_name: str
    date: str | None = None
    note: str | None = None
    items: list[PurchaseItemCreate] = []


class PurchaseUpdate(BaseSchema):
    status: str | None = None
    supplier: str | None = None
    note: str | None = None


class PurchaseItemResponse(BaseResponseSchema):
    purchase_id: UUID
    name: str
    quantity: Decimal
    unit: str
    cost_price: Decimal


class PurchaseResponse(BaseResponseSchema):
    company_id: UUID
    number: int
    supplier: str | None
    warehouse_name: str
    date: str | None
    note: str | None
    status: str
    total_amount: Decimal
    items_count: int
    registered_at: str | None
    accepted_at: str | None
    created_by_name: str | None = None


# ── Transfer ──────────────────────────────────────────────────────────────────

class TransferCreate(BaseSchema):
    from_warehouse_name: str
    to_warehouse_name: str
    date: str | None = None
    items_count: int = 0


class TransferResponse(BaseResponseSchema):
    company_id: UUID
    from_warehouse_name: str
    to_warehouse_name: str
    date: str | None
    items_count: int
    status: str


# ── InventoryCheck ────────────────────────────────────────────────────────────

class InventoryCheckCreate(BaseSchema):
    warehouse_name: str
    comment: str | None = None
    check_type: str = "Приход и расход учтены"


class InventoryCheckResponse(BaseResponseSchema):
    company_id: UUID
    warehouse_name: str
    comment: str | None
    check_type: str
    status: str
    created_by_name: str | None = None


# ── WriteOff ──────────────────────────────────────────────────────────────────

class WriteOffCreate(BaseSchema):
    category: str
    items_count: int = 0
    note: str | None = None


class WriteOffResponse(BaseResponseSchema):
    company_id: UUID
    category: str
    items_count: int
    note: str | None
    status: str
    created_by_name: str | None = None
