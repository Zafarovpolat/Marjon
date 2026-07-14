from __future__ import annotations
from datetime import date as Date, datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field
from app.shared.base_schema import BaseResponseSchema


class StorageCreate(BaseModel):
    name: str
    organization_id: UUID | None = None


class StorageUpdate(BaseModel):
    name: str | None = None
    organization_id: UUID | None = None


class StorageResponse(BaseResponseSchema):
    name: str
    organization_id: UUID | None


class ProviderCreate(BaseModel):
    name: str
    phone: str | None = None
    comment: str | None = None


class ProviderUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    comment: str | None = None


class ProviderResponse(BaseResponseSchema):
    name: str
    phone: str | None
    comment: str | None


class ComingItemIn(BaseModel):
    category_id: UUID | None = None
    product_id: UUID
    type: str | None = None
    price: Decimal = Decimal(0)
    qty: Decimal = Decimal(0)


class ComingItemResponse(BaseResponseSchema):
    coming_id: UUID
    category_id: UUID | None
    product_id: UUID
    type: str | None
    price: Decimal
    qty: Decimal
    total: Decimal


class ComingCreate(BaseModel):
    number: str
    provider_id: UUID | None = None
    storage_id: UUID
    receipt_date: Date | None = None
    registration_date: Date | None = None
    comment: str | None = None
    items: list[ComingItemIn] = Field(default_factory=list)


class ComingUpdate(BaseModel):
    number: str | None = None
    provider_id: UUID | None = None
    storage_id: UUID | None = None
    receipt_date: Date | None = None
    registration_date: Date | None = None
    comment: str | None = None
    items: list[ComingItemIn] | None = None


class ComingResponse(BaseResponseSchema):
    number: str
    provider_id: UUID | None
    storage_id: UUID
    receipt_date: Date | None
    registration_date: Date | None
    acceptance_date: Date | None
    comment: str | None
    status: str
    total_sum: Decimal
    items: list[ComingItemResponse] = Field(default_factory=list)
    document_number: str | None = None
    provider_name: str | None = None
    storage_name: str | None = None
    items_count: int | None = None
    total: Decimal | None = None
    date: str | None = None


class MovementCreate(BaseModel):
    storage_id: UUID
    product_id: UUID
    direction: str = Field(..., pattern="^(income|expense)$")
    qty: Decimal
    price: Decimal = Decimal(0)
    date: datetime | None = None
    comment: str | None = None


class MovementResponse(BaseResponseSchema):
    storage_id: UUID
    product_id: UUID
    direction: str
    qty: Decimal
    price: Decimal
    date: datetime
    coming_id: UUID | None
    comment: str | None


class StorageBalanceRow(BaseModel):
    storage_id: UUID
    storage_name: str
    product_id: UUID
    product_name: str
    opening_qty: Decimal
    income_qty: Decimal
    expense_qty: Decimal
    closing_qty: Decimal
    name: str | None = None
    category: str | None = None
    quantity: Decimal | None = None
    balance: Decimal | None = None
    unit: str | None = None
    status: str | None = None


class FlowReportRow(BaseModel):
    storage_id: UUID
    storage_name: str
    product_id: UUID
    product_name: str
    qty: Decimal
    total: Decimal
    date: str | None = None
    document_number: str | None = None
    provider_name: str | None = None
    reason: str | None = None
    items_count: int | None = None
    status: str | None = None
