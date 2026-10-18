from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
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


class AttendanceMark(BaseSchema):
    """Cashier marks a staff member in/out; approved immediately."""
    user_id: UUID
    action: str  # check_in | check_out
    note: str | None = None


class AttendanceApprove(BaseSchema):
    approve: bool = True
    note: str | None = None


class AttendanceResponse(BaseResponseSchema):
    user_id: UUID | None = None
    employee_id: UUID | None = None
    shift_id: UUID | None = None
    action: str
    timestamp: datetime
    method: str
    note: str | None
    status: str = "approved"
    approved_by: UUID | None = None
    approved_at: datetime | None = None
    employee_name: str | None = None


# ── DESK-ATT-01: контракт посещаемости для десктоп-кассы ─────────────────────
# Десктоп (AttendancePanel.jsx) работает не с итогами смен, а с отдельными
# отметками «пришёл/ушёл»: ему нужны user_id (чтобы сопоставить со списком
# сотрудников) и employee_name (чтобы подписать строку журнала).


class AttendanceLogRow(BaseResponseSchema):
    user_id: UUID
    employee_name: str
    action: str
    timestamp: datetime
    method: str
    note: str | None = None
    # approved | pending | rejected — клиент рисует бейдж статуса и решает,
    # показывать ли кнопки подтверждения (очередь AttendancePanel).
    status: str = "approved"


class AttendanceMarkRequest(BaseSchema):
    """Отметка прихода/ухода, сделанная кассиром с терминала."""

    user_id: UUID
    action: Literal["check_in", "check_out"]
    note: str | None = None


class AttendanceDecision(BaseSchema):
    """Решение по отметке из очереди подтверждения (десктоп)."""

    approve: bool
    note: str | None = None
