from __future__ import annotations
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from uuid import UUID
from app.modules.hr.schemas import (
    AttendanceCreate, AttendanceResponse,
    EmployeeCreate, EmployeeUpdate, EmployeeResponse,
    ShiftCreate, ShiftResponse,
)
from sqlalchemy import select
from app.modules.hr.service import HRService
from app.modules.admin_reports.schemas import AttendanceRow, LoginHistoryRow
from app.modules.admin_reports.service import AdminReportService

router = APIRouter(prefix="/hr", tags=["hr"])


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


@router.post("/shifts", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(data: ShiftCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await HRService(db).create_shift(user.company_id, data)


@router.get("/shifts", response_model=list[ShiftResponse])
async def list_shifts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await HRService(db).list_shifts(user.company_id)


@router.post("/attendance", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
async def log_attendance(data: AttendanceCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await HRService(db).log_attendance(user.company_id, data)


@router.get("/attendance", response_model=list[AttendanceRow])
async def list_attendance(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await AdminReportService(db).attendance_history(user.company_id)


@router.patch("/employees/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update as sql_update
    from app.modules.hr.models import Employee
    values = data.model_dump(exclude_none=True)
    if values:
        await db.execute(
            sql_update(Employee).where(
                Employee.id == employee_id, Employee.company_id == user.company_id
            ).values(**values)
        )
        await db.commit()
    result = await db.get(Employee, employee_id)
    return EmployeeResponse.model_validate(result)


@router.delete("/employees/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update as sql_update
    from app.modules.hr.models import Employee
    await db.execute(
        sql_update(Employee).where(
            Employee.id == employee_id, Employee.company_id == user.company_id
        ).values(is_active=False)
    )
    await db.commit()


@router.get("/login-history", response_model=list[LoginHistoryRow])
async def login_history(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await AdminReportService(db).login_history(user.company_id)
