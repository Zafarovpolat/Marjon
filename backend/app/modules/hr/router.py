from __future__ import annotations
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import require_company_app_user, require_web_owner
from app.modules.auth.models import User
from uuid import UUID
from app.modules.hr.schemas import (
    AttendanceCreate, AttendanceResponse,
    EmployeeCreate, EmployeeUpdate, EmployeeResponse,
    ShiftCreate, ShiftResponse,
    AttendanceApprove, AttendanceMark,
)
from sqlalchemy import select
from app.modules.hr.service import HRService
from app.modules.admin_reports.schemas import AttendanceRow, LoginHistoryRow
from app.modules.admin_reports.service import AdminReportService
from app.shared.exceptions import NotFoundError

router = APIRouter(prefix="/hr", tags=["hr"])


@router.post("/employees", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(data: EmployeeCreate, user: User = Depends(require_web_owner), db: AsyncSession = Depends(get_db)):
    return await HRService(db).create_employee(user.company_id, data)


@router.get("/employees", response_model=list[EmployeeResponse])
async def list_employees(user: User = Depends(require_web_owner), db: AsyncSession = Depends(get_db)):
    from app.modules.hr.models import Employee as EmpModel
    employees = await HRService(db).list_employees(user.company_id)
    result = []
    for emp in employees:
        user_row = await db.execute(
            select(User.name, User.phone, User.email).where(
                User.id == emp.user_id, User.company_id == user.company_id
            )
        )
        row = user_row.one_or_none()
        resp = EmployeeResponse.model_validate(emp)
        if row:
            resp = resp.model_copy(update={"name": row.name, "phone": row.phone, "email": row.email})
        result.append(resp)
    return result


@router.get("/employees/me", response_model=EmployeeResponse)
async def my_employee(user: User = Depends(require_company_app_user), db: AsyncSession = Depends(get_db)):
    """The signed-in user's own HR employee record — branch, position, hire
    date. Self-service lookup for a personal-device sign-in (mobile Staff
    app, /auth/login): there is no shared terminal to carry owner-level
    access to GET /hr/employees, and most staff roles don't set User.branch_id
    (that column is monoblock-only — a human employee's branch lives on their
    Employee record instead)."""
    emp = await HRService(db).get_employee_by_user(user.company_id, user.id)
    if emp is None:
        raise NotFoundError("Employee record not found")
    return EmployeeResponse.model_validate(emp).model_copy(update={"name": user.name, "phone": user.phone, "email": user.email})


@router.post("/shifts", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(data: ShiftCreate, user: User = Depends(require_web_owner), db: AsyncSession = Depends(get_db)):
    return await HRService(db).create_shift(user.company_id, data)


@router.get("/shifts", response_model=list[ShiftResponse])
async def list_shifts(user: User = Depends(require_web_owner), db: AsyncSession = Depends(get_db)):
    return await HRService(db).list_shifts(user.company_id)


@router.post("/attendance", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
async def log_attendance(data: AttendanceCreate, user: User = Depends(require_web_owner), db: AsyncSession = Depends(get_db)):
    return await HRService(db).log_attendance(user.company_id, data)


# A cashier marks a staff member in/out (approved at once, audited)
@router.post("/attendance/mark", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
async def mark_attendance(
    data: AttendanceMark, user: User = Depends(require_company_app_user), db: AsyncSession = Depends(get_db)
):
    return await HRService(db).mark_attendance(user.company_id, user.id, data)


# Day journal of attendance marks (all statuses) for the attendance screen
@router.get("/attendance/log", response_model=list[AttendanceResponse])
async def attendance_log(
    date: str | None = None,
    user: User = Depends(require_company_app_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime as _dt, timezone as _tz
    day = _dt.now(_tz.utc)
    if date:
        try:
            day = _dt.fromisoformat(date).replace(tzinfo=_tz.utc)
        except ValueError:
            pass
    return await HRService(db).list_attendance_log(user.company_id, day)


# Queue of unconfirmed marks (cook check-in/out) for the cashier
@router.get("/attendance/pending", response_model=list[AttendanceResponse])
async def pending_attendance(user: User = Depends(require_company_app_user), db: AsyncSession = Depends(get_db)):
    return await HRService(db).list_pending_attendance(user.company_id)


# The cashier confirms or rejects a cook's check-in/out (audited)
@router.post("/attendance/{log_id}/approve", response_model=AttendanceResponse)
async def approve_attendance(
    log_id: UUID,
    data: AttendanceApprove,
    user: User = Depends(require_company_app_user),
    db: AsyncSession = Depends(get_db),
):
    return await HRService(db).approve_attendance(user.company_id, log_id, user.id, data)


@router.get("/attendance", response_model=list[AttendanceRow])
async def list_attendance(user: User = Depends(require_web_owner), db: AsyncSession = Depends(get_db)):
    return await AdminReportService(db).attendance_history(user.company_id)


@router.patch("/employees/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    user: User = Depends(require_web_owner),
    db: AsyncSession = Depends(get_db),
):
    return await HRService(db).update_employee(user.company_id, employee_id, data)


@router.delete("/employees/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: UUID,
    user: User = Depends(require_web_owner),
    db: AsyncSession = Depends(get_db),
):
    await HRService(db).delete_employee(user.company_id, employee_id)


@router.get("/login-history", response_model=list[LoginHistoryRow])
async def login_history(user: User = Depends(require_web_owner), db: AsyncSession = Depends(get_db)):
    return await AdminReportService(db).login_history(user.company_id)
