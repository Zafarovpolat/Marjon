from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from app.shared.base_schema import BaseSchema, BaseResponseSchema


class EmployeeCreate(BaseSchema):
    user_id: UUID
    branch_id: UUID
    position: str
    hire_date: date
    salary_type: str = "fixed"
    salary_amount: Decimal = Decimal("0")


class EmployeeUpdate(BaseSchema):
    position: str | None = None
    branch_id: UUID | None = None
    salary_type: str | None = None
    salary_amount: Decimal | None = None


class EmployeeResponse(BaseResponseSchema):
    company_id: UUID
    user_id: UUID
    branch_id: UUID
    position: str
    hire_date: date
    salary_type: str
    salary_amount: Decimal
    name: str | None = None
    phone: str | None = None
    email: str | None = None


class ShiftCreate(BaseSchema):
    employee_id: UUID
    branch_id: UUID
    scheduled_start: datetime
    scheduled_end: datetime


class ShiftResponse(BaseResponseSchema):
    company_id: UUID
    employee_id: UUID
    branch_id: UUID
    scheduled_start: datetime
    scheduled_end: datetime
    actual_start: datetime | None
    actual_end: datetime | None
    status: str


class AttendanceCreate(BaseSchema):
    employee_id: UUID
    shift_id: UUID
    action: str
    method: str = "manual"
    note: str | None = None


class AttendanceResponse(BaseResponseSchema):
    employee_id: UUID
    shift_id: UUID
    action: str
    timestamp: datetime
    method: str
    note: str | None
    # 5.5 — статус подтверждения кассиром
    status: str = "pending"
    approved_by: UUID | None = None
    approved_at: datetime | None = None
    # 5.5 — имя сотрудника (повара) для экрана кассира; заполняется в очереди pending
    employee_name: str | None = None


class AttendanceApprove(BaseSchema):
    # 5.5 — approve=True → подтвердить вход/уход повара, False → отклонить
    approve: bool = True
    note: str | None = None
