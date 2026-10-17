from __future__ import annotations
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.auth.models import User
from app.modules.companies.models import Branch
from app.modules.hr.models import AttendanceLog, Employee, WorkShift
from app.modules.hr.repository import AttendanceLogRepository, EmployeeRepository, WorkShiftRepository
from app.modules.audit.service import AuditService
from app.modules.hr.schemas import (
    AttendanceApprove, AttendanceCreate, AttendanceMark, AttendanceResponse,
    EmployeeCreate, EmployeeUpdate, ShiftCreate,
)
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

    async def get_employee_by_user(self, company_id: UUID, user_id: UUID) -> Employee | None:
        """The HR record of a given user — self-service lookup (mobile Staff's
        personal-device sign-in has no owner-level access to GET /hr/employees)."""
        result = await self.db.execute(
            select(Employee).where(Employee.company_id == company_id, Employee.user_id == user_id)
        )
        return result.scalar_one_or_none()

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

    async def mark_attendance(
        self, company_id: UUID, approver_id: UUID, data: AttendanceMark
    ) -> AttendanceResponse:
        """A cashier marks a staff member in/out; that is the permission itself, so it is approved at once."""
        await require_company_resource(self.db, User, data.user_id, company_id, detail="User not found")
        now = datetime.now(timezone.utc)
        log = AttendanceLog(
            company_id=company_id,
            user_id=data.user_id,
            action=data.action,
            timestamp=now,
            method="manual",
            note=data.note,
            status="approved",
            approved_by=approver_id,
            approved_at=now,
        )
        saved = await self.att_repo.save(log)
        await self._audit(company_id, approver_id, "attendance.mark", saved,
                          {"user_id": str(data.user_id), "action": saved.action})
        return (await self._with_names([saved]))[0]

    async def _audit(self, company_id: UUID, actor_id: UUID, action: str, log: AttendanceLog, data: dict) -> None:
        try:
            await AuditService(self.db).log(
                company_id, actor_id, action, "attendance_log", entity_id=log.id, new_data=data
            )
        except Exception:
            pass

    async def _with_names(self, logs: list[AttendanceLog]) -> list[AttendanceResponse]:
        if not logs:
            return []
        user_ids = {log.user_id for log in logs if log.user_id}
        emp_ids = {log.employee_id for log in logs if log.employee_id and not log.user_id}
        names: dict[UUID, str | None] = {}
        if user_ids:
            res = await self.db.execute(select(User.id, User.name).where(User.id.in_(user_ids)))
            names.update({uid: name for uid, name in res.all()})
        emp_names: dict[UUID, str | None] = {}
        if emp_ids:
            res = await self.db.execute(
                select(Employee.id, User.name)
                .join(User, User.id == Employee.user_id)
                .where(Employee.id.in_(emp_ids))
            )
            emp_names.update({eid: name for eid, name in res.all()})
        return [
            AttendanceResponse.model_validate(log).model_copy(update={
                "employee_name": names.get(log.user_id) if log.user_id else emp_names.get(log.employee_id)
            })
            for log in logs
        ]

    async def list_attendance_log(self, company_id: UUID, day: datetime | None = None) -> list[AttendanceResponse]:
        """Attendance marks (all statuses) for one day, newest first."""
        stmt = select(AttendanceLog).where(AttendanceLog.company_id == company_id)
        if day is not None:
            start = day.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start.replace(hour=23, minute=59, second=59, microsecond=999999)
            stmt = stmt.where(AttendanceLog.timestamp >= start, AttendanceLog.timestamp <= end)
        result = await self.db.execute(stmt.order_by(AttendanceLog.timestamp.desc()))
        return await self._with_names(list(result.scalars().all()))

    async def list_pending_attendance(self, company_id: UUID) -> list[AttendanceResponse]:
        result = await self.db.execute(
            select(AttendanceLog)
            .where(AttendanceLog.company_id == company_id, AttendanceLog.status == "pending")
            .order_by(AttendanceLog.timestamp.desc())
        )
        return await self._with_names(list(result.scalars().all()))

    async def approve_attendance(
        self, company_id: UUID, log_id: UUID, approver_id: UUID, data: AttendanceApprove
    ) -> AttendanceResponse:
        log = await self.att_repo.get_by_id(log_id, company_id)
        if not log:
            raise NotFoundError("Attendance log not found")
        log.status = "approved" if data.approve else "rejected"
        log.approved_by = approver_id
        log.approved_at = datetime.now(timezone.utc)
        if data.note:
            log.note = data.note
        saved = await self.att_repo.save(log)
        await self._audit(
            company_id, approver_id, "attendance.approve" if data.approve else "attendance.reject", saved,
            {"action": saved.action, "status": saved.status},
        )
        return (await self._with_names([saved]))[0]
