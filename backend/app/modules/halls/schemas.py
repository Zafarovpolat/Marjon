from __future__ import annotations
from uuid import UUID
from app.shared.base_schema import BaseSchema, BaseResponseSchema


class HallCreate(BaseSchema):
    branch_id: UUID
    name: str
    description: str | None = None


class HallUpdate(BaseSchema):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class TableCreate(BaseSchema):
    number: int
    capacity: int = 4


class TableUpdate(BaseSchema):
    number: int | None = None
    capacity: int | None = None
    is_active: bool | None = None


class TableResponse(BaseResponseSchema):
    hall_id: UUID
    number: int
    capacity: int
    is_active: bool


class HallResponse(BaseResponseSchema):
    company_id: UUID
    branch_id: UUID
    name: str
    description: str | None
    is_active: bool
    tables: list[TableResponse] = []
