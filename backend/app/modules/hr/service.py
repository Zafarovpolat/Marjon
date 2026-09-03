from __future__ import annotations
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.hr.models import AttendanceLog, Employee, WorkShift
from app.modules.hr.repository import AttendanceLogRepository, EmployeeRepository, WorkShiftRepository
from app.modules.hr.schemas import AttendanceApprove, AttendanceCreate, AttendanceMark, EmployeeCreate, EmployeeUpdate, ShiftCreate
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

    async def mark_attendance(
        self, company_id: UUID, approver_id: UUID, data: AttendanceMark
    ) -> AttendanceResponse:
        # 5.5 — кассир отмечает приход/уход сотрудника. Отметка кассира — это и есть
        # разрешение «зайти», поэтому она сразу approved и логируется в audit.
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
        try:
            await AuditService(self.att_repo.db).log(
                company_id, approver_id, "attendance.mark", "attendance_log",
                entity_id=saved.id,
                new_data={"user_id": str(data.user_id), "action": saved.action},
            )
        except Exception:
            pass
        rows = await self._with_names([saved])
        return rows[0]

    async def _with_names(self, logs: list[AttendanceLog]) -> list[AttendanceResponse]:
        # 5.5 — подставляем имя сотрудника: сначала по user_id, иначе по employee→user.
        from app.modules.auth.models import User
        if not logs:
            return []
        user_ids = {log.user_id for log in logs if log.user_id}
        emp_ids = {log.employee_id for log in logs if log.employee_id and not log.user_id}
        names: dict[UUID, str | None] = {}
        if user_ids:
            res = await self.att_repo.db.execute(
                select(User.id, User.name).where(User.id.in_(user_ids))
            )
            names.update({uid: name for uid, name in res.all()})
        emp_user: dict[UUID, str | None] = {}
        if emp_ids:
            res = await self.att_repo.db.execute(
                select(Employee.id, User.name)
                .join(User, User.id == Employee.user_id)
                .where(Employee.id.in_(emp_ids))
            )
            emp_user.update({eid: name for eid, name in res.all()})
        out: list[AttendanceResponse] = []
        for log in logs:
            name = names.get(log.user_id) if log.user_id else emp_user.get(log.employee_id)
            out.append(AttendanceResponse.model_validate(log).model_copy(update={"employee_name": name}))
        return out

    async def list_attendance_log(self, company_id: UUID, day: datetime | None = None) -> list[AttendanceResponse]:
        # 5.5 — журнал отметок (приход/уход) за день для экрана кассира. Все статусы.
        stmt = select(AttendanceLog).where(AttendanceLog.company_id == company_id)
        if day is not None:
            start = day.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start.replace(hour=23, minute=59, second=59, microsecond=999999)
            stmt = stmt.where(AttendanceLog.timestamp >= start, AttendanceLog.timestamp <= end)
        stmt = stmt.order_by(AttendanceLog.timestamp.desc())
        result = await self.att_repo.db.execute(stmt)
        return await self._with_names(list(result.scalars().all()))

    async def list_pending_attendance(self, company_id: UUID) -> list[AttendanceResponse]:
        # 5.5 — очередь неподтверждённых отметок для экрана кассира.
        result = await self.att_repo.db.execute(
            select(AttendanceLog)
            .where(
                AttendanceLog.company_id == company_id,
                AttendanceLog.status == "pending",
            )
            .order_by(AttendanceLog.timestamp.desc())
        )
        return await self._with_names(list(result.scalars().all()))

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
