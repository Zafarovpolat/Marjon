from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_dashboard_paid_top_outgoing import report_engine, seed
from app.modules.inventory.models import StockMovement
from app.modules.inventory.outgoing_report import outgoing_report


@pytest.mark.asyncio
async def test_staff_journal_dates_roll_over_once_without_changing_duration():
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from uuid import uuid4
    from app.modules.admin_reports.service import AdminReportService
    stamp = datetime(2026, 10, 19, 19, 30, tzinfo=timezone.utc)
    end = datetime(2026, 10, 19, 20, 30, tzinfo=timezone.utc)
    row = SimpleNamespace(created_at=stamp, revoked_at=end, device_id="test", name="User", email="test@example.com",
        phone="", avatar_url="", actual_start=stamp, actual_end=end, status="completed", user_name="User", position="Cashier")
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [row])))
    web = AdminReportService(db, web_timezone="Asia/Tashkent")
    login = (await web.login_history(uuid4()))[0]
    attendance = (await web.attendance_history(uuid4()))[0]
    assert (login.date, login.login, login.logout) == ("20.10.2026", "00:30", "01:30")
    assert (attendance.date, attendance.start, attendance.end, attendance.hours) == ("20.10.2026", "00:30", "01:30", "1 ч 0 мин")
    old = (await AdminReportService(db).login_history(uuid4()))[0]
    assert (old.date, old.login) == ("19.10.2026", "19:30")


@pytest.mark.asyncio
async def test_web_outgoing_fixed_plus_five_preserves_legacy_company_timezone(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, _, _, warehouse, ingredient = await seed(db)
        company.timezone = "UTC"
        for stamp, cost in [("2026-10-19T18:59:59", 1), ("2026-10-19T19:00:00", 2),
                            ("2026-10-20T18:59:59", 3), ("2026-10-20T19:00:00", 4)]:
            db.add(StockMovement(company_id=company.id, warehouse_id=warehouse.id, ingredient_id=ingredient.id,
                movement_type="sale", quantity=1, unit="кг", total_cost=cost,
                created_at=datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc)))
        await db.flush()
        day = date(2026, 10, 20)
        web = await outgoing_report(db, company.id, day, day, web_timezone="Asia/Tashkent")
        legacy = await outgoing_report(db, company.id, day, day)
        assert Decimal(web["total"]) == 5
        assert Decimal(legacy["total"]) == 7
        assert len(web["lines"]) == 2
