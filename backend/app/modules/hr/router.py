from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import (
    get_current_user, require_permission_or_admin, user_can_view_past_periods,
)
from app.modules.auth.models import User
from app.modules.hr.schemas import (
    AttendanceApprove, AttendanceCreate, AttendanceMark, AttendanceResponse,
    EmployeeCreate, EmployeeUpdate, EmployeeResponse,
    ShiftCreate, ShiftResponse,
)
from sqlalchemy import select
from app.modules.hr.service import HRService
from app.modules.admin_reports.schemas import AttendanceRow, LoginHistoryRow
from app.modules.admin_reports.service import AdminReportService

router = APIRouter(prefix="/hr", tags=["hr"])

# 5.5 — приход/уход (attendance) доступен владельцу/админу компании либо
# сотруднику, которому владелец выдал permissions.can_approve_attendance в
# веб-админке. С терминала это право не выдаётся (см. desktop StaffRightsPanel),
# поэтому гейт закрывает и прямой вызов API в обход UI.
require_attendance_access = require_permission_or_admin("can_approve_attendance")
# Прошлые дни (история отметок) — отдельный тумблер владельца.
require_past_periods = require_permission_or_admin("can_view_past_periods")


@router.post("/employees", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(data: EmployeeCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await HRService(db).create_employee(user.company_id, data)


@router.get("/employees", response_model=list[EmployeeResponse])
async def list_employees(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.modules.hr.models import Employee as EmpModel
    employees = await HRService(db).list_employees(user.company_id)
    result = []
    for emp in employees:
        user_row = await db.execute(
            select(User.name, User.phone, User.email).where(User.id == emp.user_id)
        )
        row = user_row.one_or_none()
        resp = EmployeeResponse.model_validate(emp)
        if row:
            resp = resp.model_copy(update={"name": row.name, "phone": row.phone, "email": row.email})
        result.append(resp)
    return result


@router.patch("/employees/{employee_id}", response_model=EmployeeResponse)
async def update_employee(employee_id: UUID, data: EmployeeUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await HRService(db).update_employee(user.company_id, employee_id, data)


@router.delete("/employees/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(employee_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await HRService(db).delete_employee(user.company_id, employee_id)


@router.post("/shifts", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(data: ShiftCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await HRService(db).create_shift(user.company_id, data)


@router.get("/shifts", response_model=list[ShiftResponse])
async def list_shifts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await HRService(db).list_shifts(user.company_id)


@router.post("/attendance", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
async def log_attendance(data: AttendanceCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await HRService(db).log_attendance(user.company_id, data)


# 5.5 — кассир отмечает приход/уход сотрудника (сразу approved, логируется в audit)
@router.post("/attendance/mark", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
async def mark_attendance(data: AttendanceMark, user: User = Depends(require_attendance_access), db: AsyncSession = Depends(get_db)):
    return await HRService(db).mark_attendance(user.company_id, user.id, data)


# 5.5 — журнал отметок за день (все статусы) для экрана посещаемости кассира
@router.get("/attendance/log", response_model=list[AttendanceResponse])
async def attendance_log(
    date: str | None = None,
    user: User = Depends(require_attendance_access),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime as _dt, timezone as _tz
    day = _dt.now(_tz.utc)
    # Другой день можно запросить только с правом can_view_past_periods:
    # без него параметр date игнорируется и журнал всегда за сегодня.
    if date and await user_can_view_past_periods(user, db):
        try:
            day = _dt.fromisoformat(date).replace(tzinfo=_tz.utc)
        except ValueError:
            pass
    return await HRService(db).list_attendance_log(user.company_id, day)


# 5.5 — очередь неподтверждённых отметок (вход/уход повара) для экрана кассира
@router.get("/attendance/pending", response_model=list[AttendanceResponse])
async def pending_attendance(user: User = Depends(require_attendance_access), db: AsyncSession = Depends(get_db)):
    return await HRService(db).list_pending_attendance(user.company_id)


# 5.5 — кассир подтверждает/отклоняет вход-уход повара (логируется в audit)
@router.post("/attendance/{log_id}/approve", response_model=AttendanceResponse)
async def approve_attendance(
    log_id: UUID,
    data: AttendanceApprove,
    user: User = Depends(require_attendance_access),
    db: AsyncSession = Depends(get_db),
):
    return await HRService(db).approve_attendance(user.company_id, log_id, user.id, data)


@router.get("/attendance", response_model=list[AttendanceRow])
# История отметок за всё время (отчёт веб-админки) — это и есть «прошлые дни».
async def list_attendance(user: User = Depends(require_past_periods), db: AsyncSession = Depends(get_db)):
    return await AdminReportService(db).attendance_history(user.company_id)


@router.get("/login-history", response_model=list[LoginHistoryRow])
async def login_history(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await AdminReportService(db).login_history(user.company_id)
