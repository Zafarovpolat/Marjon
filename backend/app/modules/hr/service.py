from __future__ import annotations
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.hr.models import AttendanceLog, Employee, WorkShift
from app.modules.hr.repository import AttendanceLogRepository, EmployeeRepository, WorkShiftRepository
from app.modules.hr.schemas import AttendanceApprove, AttendanceCreate, EmployeeCreate, EmployeeUpdate, ShiftCreate
from app.modules.hr.schemas import AttendanceResponse
from app.modules.audit.service import AuditService
from app.shared.exceptions import NotFoundError


class HRService:
    def __init__(self, db: AsyncSession):
        self.emp_repo = EmployeeRepository(db)
        self.shift_repo = WorkShiftRepository(db)
        self.att_repo = AttendanceLogRepository(db)

    async def create_employee(self, company_id: UUID, data: EmployeeCreate) -> Employee:
        return await self.emp_repo.save(Employee(company_id=company_id, **data.model_dump()))

    async def list_employees(self, company_id: UUID) -> list[Employee]:
        return await self.emp_repo.get_all(company_id)

    async def update_employee(self, company_id: UUID, employee_id: UUID, data: EmployeeUpdate) -> Employee:
        emp = await self.emp_repo.get_by_id(employee_id, company_id)
        if not emp:
            raise NotFoundError("Employee not found")
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(emp, field, value)
        return await self.emp_repo.save(emp)

    async def delete_employee(self, company_id: UUID, employee_id: UUID) -> None:
        emp = await self.emp_repo.get_by_id(employee_id, company_id)
        if not emp:
            raise NotFoundError("Employee not found")
        await self.emp_repo.delete(emp)

    async def create_shift(self, company_id: UUID, data: ShiftCreate) -> WorkShift:
        return await self.shift_repo.save(WorkShift(company_id=company_id, **data.model_dump()))

    async def list_shifts(self, company_id: UUID) -> list[WorkShift]:
        return await self.shift_repo.get_all(company_id)

    async def log_attendance(self, company_id: UUID, data: AttendanceCreate) -> AttendanceLog:
        # 5.5 — отметка повара создаётся со статусом pending и ждёт подтверждения кассира
        log = AttendanceLog(
            company_id=company_id,
            timestamp=datetime.now(timezone.utc),
            status="pending",
            **data.model_dump(),
        )
        return await self.att_repo.save(log)

    async def list_pending_attendance(self, company_id: UUID) -> list[AttendanceResponse]:
        # 5.5 — очередь неподтверждённых отметок для экрана кассира.
        # Джойним employees→users, чтобы отдать кассиру имя повара, а не UUID.
        from app.modules.auth.models import User
        result = await self.att_repo.db.execute(
            select(AttendanceLog, User.name)
            .join(Employee, Employee.id == AttendanceLog.employee_id)
            .join(User, User.id == Employee.user_id)
            .where(
                AttendanceLog.company_id == company_id,
                AttendanceLog.status == "pending",
            )
            .order_by(AttendanceLog.timestamp.desc())
        )
        rows: list[AttendanceResponse] = []
        for log, name in result.all():
            rows.append(AttendanceResponse.model_validate(log).model_copy(update={"employee_name": name}))
        return rows

    async def approve_attendance(
        self, company_id: UUID, log_id: UUID, approver_id: UUID, data: AttendanceApprove
    ) -> AttendanceLog:
        # 5.5 — кассир подтверждает/отклоняет вход-уход повара; действие логируется
        log = await self.att_repo.get_by_id(log_id, company_id)
        if not log:
            raise NotFoundError("Attendance log not found")
        log.status = "approved" if data.approve else "rejected"
        log.approved_by = approver_id
        log.approved_at = datetime.now(timezone.utc)
        if data.note:
            log.note = data.note
        saved = await self.att_repo.save(log)
        try:
            await AuditService(self.att_repo.db).log(
                company_id, approver_id,
                "attendance.approve" if data.approve else "attendance.reject",
                "attendance_log", entity_id=saved.id,
                new_data={
                    "employee_id": str(saved.employee_id),
                    "action": saved.action,
                    "status": saved.status,
                },
            )
        except Exception:
            pass
        return saved
