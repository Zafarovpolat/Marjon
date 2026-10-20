from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import (
    effective_branch_filter,
    require_company_app_user,
    require_permission_or_admin,
    require_web_owner,
)
from app.modules.auth.models import User
from uuid import UUID
from app.modules.hr.schemas import (
    AttendanceCreate, AttendanceDecision, AttendanceLogRow, AttendanceMarkRequest,
    AttendanceResponse,
    EmployeeCreate, EmployeeUpdate, EmployeeResponse,
    ShiftCreate, ShiftResponse,
)
from app.modules.hr.models import AttendanceLog
from sqlalchemy import func, select
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
    employees = await HRService(db).list_employees(user.company_id, effective_branch_filter(user))
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
    return await HRService(db).list_shifts(user.company_id, effective_branch_filter(user))


@router.post("/attendance", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
async def log_attendance(data: AttendanceCreate, user: User = Depends(require_web_owner), db: AsyncSession = Depends(get_db)):
    return await HRService(db).log_attendance(user.company_id, data)


@router.get("/attendance", response_model=list[AttendanceRow])
async def list_attendance(user: User = Depends(require_web_owner), db: AsyncSession = Depends(get_db)):
    return await AdminReportService(db, web_timezone="Asia/Tashkent").attendance_history(user.company_id, effective_branch_filter(user))


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
    return await AdminReportService(db, web_timezone="Asia/Tashkent").login_history(user.company_id, effective_branch_filter(user))


# ── DESK-ATT-01: посещаемость с десктоп-кассы ────────────────────────────────
# AttendancePanel.jsx (режим кассира) зовёт /hr/attendance/log, /mark и
# /pending. Ни одного из этих путей на бэкенде не было: журнал всегда был
# пуст (404 глотался через .catch), а кнопки «Пришёл/Ушёл» показывали тост
# «Ошибка». Веб-страница посещаемости работает через /hr/attendance (итоги
# смен) и её не трогаем — десктопу нужны именно отдельные отметки.


@router.get("/attendance/log", response_model=list[AttendanceLogRow])
async def attendance_log(
    day: date | None = Query(None, alias="date"),
    user: User = Depends(require_company_app_user),
    db: AsyncSession = Depends(get_db),
):
    """Отметки прихода/ухода за день (по умолчанию — за сегодня).

    Отклонённые (status='rejected') в журнал не попадают: кассир их уже
    отклонил, и в истории смены они только путают. Прошлые дни отдаём лишь
    при праве can_view_past_periods — как в отчётах, чтобы тумблер владельца
    работал одинаково везде.
    """
    from app.modules.auth.dependencies import user_can_view_past_periods

    today = datetime.now(timezone.utc).date()
    target = day or today
    if target != today and not await user_can_view_past_periods(user, db):
        target = today

    return await _attendance_rows(
        db,
        company_id=user.company_id,
        branch_id=effective_branch_filter(user),
        extra=(func.date(AttendanceLog.timestamp) == target, AttendanceLog.status != "rejected"),
    )


@router.get("/attendance/pending", response_model=list[AttendanceLogRow])
async def attendance_pending(
    user: User = Depends(require_permission_or_admin("can_approve_attendance")),
    db: AsyncSession = Depends(get_db),
):
    """Самостоятельные отметки, ждущие подтверждения кассира.

    Отметка кассира создаётся сразу approved (кассир и есть разрешение войти),
    а отметка сотрудника по PIN попадает сюда как pending — до подтверждения
    она не считается в журнале смены.
    """
    return await _attendance_rows(
        db,
        company_id=user.company_id,
        branch_id=effective_branch_filter(user),
        extra=(AttendanceLog.status == "pending",),
        limit=100,
    )


@router.post("/attendance/{log_id}/approve", response_model=AttendanceLogRow)
async def approve_attendance(
    log_id: UUID,
    data: AttendanceDecision,
    user: User = Depends(require_permission_or_admin("can_approve_attendance")),
    db: AsyncSession = Depends(get_db),
):
    """Подтвердить или отклонить отметку из очереди."""
    stmt = select(AttendanceLog).where(
        AttendanceLog.id == log_id, AttendanceLog.company_id == user.company_id
    )
    log = (await db.execute(stmt)).scalars().first()
    if log is None:
        raise NotFoundError("Отметка не найдена")

    log.status = "approved" if data.approve else "rejected"
    log.approved_by = user.id
    log.approved_at = datetime.now(timezone.utc)
    if data.note:
        log.note = data.note
    await db.commit()
    await db.refresh(log)

    rows = await _attendance_rows(
        db,
        company_id=user.company_id,
        branch_id=None,
        extra=(AttendanceLog.id == log.id,),
        limit=1,
    )
    if not rows:
        raise NotFoundError("Отметка не найдена")
    return rows[0]


@router.post("/attendance/mark", response_model=AttendanceLogRow, status_code=status.HTTP_201_CREATED)
async def mark_attendance(
    data: AttendanceMarkRequest,
    user: User = Depends(require_permission_or_admin("can_approve_attendance")),
    db: AsyncSession = Depends(get_db),
):
    """Кассир отмечает приход/уход сотрудника.

    Смена подбирается по сотруднику (открытая = active без actual_end), а если
    её нет — создаётся на 12 часов вперёд: отдельного планировщика смен в
    десктопе нет, а без shift_id отметку записать некуда (NOT NULL).
    """
    from app.modules.hr.models import Employee, WorkShift

    branch_id = effective_branch_filter(user)
    target = await db.get(User, data.user_id)
    if target is None or target.company_id != user.company_id:
        raise NotFoundError("Сотрудник не найден в вашей компании")

    # HR-карточка опциональна: сотрудник, заведённый только через /auth/users
    # (кассир/повар/официант), не имеет Employee-записи. Отметка всё равно
    # должна проходить — она ссылается на user_id напрямую (см. AttendanceLog).
    emp_stmt = select(Employee).where(
        Employee.company_id == user.company_id,
        Employee.user_id == data.user_id,
    )
    if branch_id is not None:
        emp_stmt = emp_stmt.where(Employee.branch_id == branch_id)
    employee = (await db.execute(emp_stmt)).scalars().first()

    now = datetime.now(timezone.utc)
    shift = None
    if employee is not None:
        shift = (
            await db.execute(
                select(WorkShift)
                .where(
                    WorkShift.company_id == user.company_id,
                    WorkShift.employee_id == employee.id,
                    WorkShift.status == "active",
                    WorkShift.actual_end.is_(None),
                )
                .order_by(WorkShift.scheduled_start.desc())
            )
        ).scalars().first()

        if shift is None:
            shift = WorkShift(
                company_id=user.company_id,
                branch_id=employee.branch_id,
                employee_id=employee.id,
                scheduled_start=now,
                scheduled_end=now + timedelta(hours=12),
                status="active",
            )
            db.add(shift)
            await db.flush()

        if data.action == "check_in":
            shift.actual_start = shift.actual_start or now
            shift.status = "active"
        else:
            shift.actual_end = now
            shift.status = "completed"

    log = AttendanceLog(
        company_id=user.company_id,
        user_id=data.user_id,
        employee_id=employee.id if employee is not None else None,
        shift_id=shift.id if shift is not None else None,
        action=data.action,
        timestamp=now,
        method="manual",
        note=data.note,
        # Отметка кассира авторитетна — подтверждать её некому.
        status="approved",
        approved_by=user.id,
        approved_at=now,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    rows = await _attendance_rows(
        db, company_id=user.company_id, branch_id=None, extra=(AttendanceLog.id == log.id,), limit=1
    )
    if not rows:
        raise NotFoundError("Отметка не найдена")
    return rows[0]


async def _attendance_rows(
    db: AsyncSession,
    *,
    company_id: UUID,
    branch_id: UUID | None,
    extra: tuple = (),
    limit: int = 300,
) -> list[AttendanceLogRow]:
    """Отметки посещаемости с именем сотрудника — общий запрос для log/pending/approve."""
    from app.modules.hr.models import AttendanceLog, Employee

    # employee_id опционален (отметка может ссылаться только на user_id),
    # поэтому LEFT JOIN + coalesce: имя и филиал берём из HR-карточки, а если
    # её нет — из самого пользователя.
    stmt = (
        select(AttendanceLog, User.id, User.name)
        .outerjoin(Employee, Employee.id == AttendanceLog.employee_id)
        .join(User, User.id == func.coalesce(Employee.user_id, AttendanceLog.user_id))
        .where(AttendanceLog.company_id == company_id, *extra)
        .order_by(AttendanceLog.timestamp.desc())
        .limit(limit)
    )
    if branch_id is not None:
        stmt = stmt.where(func.coalesce(Employee.branch_id, User.branch_id) == branch_id)

    return [
        AttendanceLogRow(
            id=log.id,
            created_at=log.created_at,
            updated_at=log.updated_at,
            user_id=uid,
            employee_name=name or "—",
            action=log.action,
            timestamp=log.timestamp,
            method=log.method,
            note=log.note,
            status=log.status,
        )
        for log, uid, name in (await db.execute(stmt)).all()
    ]
