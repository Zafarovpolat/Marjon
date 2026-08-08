from __future__ import annotations
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.auth.models import User
from app.modules.companies.models import Branch
from app.modules.hr.models import AttendanceLog, Employee, WorkShift
from app.modules.hr.repository import AttendanceLogRepository, EmployeeRepository, WorkShiftRepository
from app.modules.hr.schemas import AttendanceCreate, EmployeeCreate, EmployeeUpdate, ShiftCreate
from app.shared.exceptions import NotFoundError
from app.shared.tenant_scope import require_company_resource


class HRService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.emp_repo = EmployeeRepository(db)
        self.shift_repo = WorkShiftRepository(db)
        self.att_repo = AttendanceLogRepository(db)

    async def create_employee(self, company_id: UUID, data: EmployeeCreate) -> Employee:
        await require_company_resource(
            self.db, User, data.user_id, company_id, detail="User not found"
        )
        await require_company_resource(
            self.db, Branch, data.branch_id, company_id, detail="Branch not found"
        )
        return await self.emp_repo.save(Employee(company_id=company_id, **data.model_dump()))

    async def list_employees(self, company_id: UUID) -> list[Employee]:
        return await self.emp_repo.get_all(company_id)

    async def update_employee(self, company_id: UUID, employee_id: UUID, data: EmployeeUpdate) -> Employee:
        emp = await self.emp_repo.get_by_id(employee_id, company_id)
        if not emp:
            raise NotFoundError("Employee not found")
        await require_company_resource(
            self.db, Branch, data.branch_id, company_id, detail="Branch not found"
        )
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(emp, field, value)
        return await self.emp_repo.save(emp)

    async def delete_employee(self, company_id: UUID, employee_id: UUID) -> None:
        emp = await self.emp_repo.get_by_id(employee_id, company_id)
        if not emp:
            raise NotFoundError("Employee not found")
        emp.is_active = False
        await self.emp_repo.save(emp)

    async def create_shift(self, company_id: UUID, data: ShiftCreate) -> WorkShift:
        await require_company_resource(
            self.db, Employee, data.employee_id, company_id, detail="Employee not found"
        )
        await require_company_resource(
            self.db, Branch, data.branch_id, company_id, detail="Branch not found"
        )
        return await self.shift_repo.save(WorkShift(company_id=company_id, **data.model_dump()))

    async def list_shifts(self, company_id: UUID) -> list[WorkShift]:
        return await self.shift_repo.get_all(company_id)

    async def log_attendance(self, company_id: UUID, data: AttendanceCreate) -> AttendanceLog:
        employee = await require_company_resource(
            self.db, Employee, data.employee_id, company_id, detail="Employee not found"
        )
        shift = await require_company_resource(
            self.db, WorkShift, data.shift_id, company_id, detail="Shift not found"
        )
        if shift.employee_id != employee.id:
            raise NotFoundError("Shift not found")
        log = AttendanceLog(
            company_id=company_id,
            timestamp=datetime.now(timezone.utc),
            **data.model_dump(),
        )
        return await self.att_repo.save(log)
