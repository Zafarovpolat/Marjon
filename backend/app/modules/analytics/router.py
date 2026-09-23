from __future__ import annotations
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.database.session import get_db
from app.shared.exceptions import ValidationError
from app.modules.auth.dependencies import (
    require_permission_or_admin, require_web_owner, user_can_view_past_periods,
)
from app.modules.auth.models import User
from app.modules.analytics.schemas import DashboardResponse, SalesReport, TopProduct, UserActivityRank, ZReportResponse
from app.modules.analytics.service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Z-отчёт доступен владельцу/админу компании либо сотруднику, которому владелец
# выдал permissions.can_view_z_report (тумблер «Z-отчёт» в карточке сотрудника).
# Без can_view_past_periods — только сегодняшний день (как в финансах).
require_z_report_access = require_permission_or_admin("can_view_z_report")


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(
    date: date | None = Query(None),
    user: User = Depends(require_web_owner),
    db: AsyncSession = Depends(get_db),
):
    return await AnalyticsService(db).dashboard(user.company_id, date)


@router.get("/sales", response_model=list[SalesReport])
async def sales_report(
    date_from: date = Query(...),
    date_to: date = Query(...),
    user: User = Depends(require_web_owner),
    db: AsyncSession = Depends(get_db),
):
    return await AnalyticsService(db).sales_report(user.company_id, date_from, date_to)


@router.get("/products/top", response_model=list[TopProduct])
async def top_products(
    limit: int = Query(20),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    user: User = Depends(require_web_owner),
    db: AsyncSession = Depends(get_db),
):
    return await AnalyticsService(db).top_products(user.company_id, limit, date_from, date_to)


@router.get("/z-report", response_model=ZReportResponse)
async def z_report(
    date: date | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    user: User = Depends(require_z_report_access),
    db: AsyncSession = Depends(get_db),
):
    if date is None and date_from is None:
        raise ValidationError("Укажите date или date_from")
    if not await user_can_view_past_periods(user, db):
        today = datetime.now(timezone.utc).date()
        date = date_from = date_to = today
    return await AnalyticsService(db).z_report(user.company_id, date, date_from, date_to)


@router.get("/users/top", response_model=list[UserActivityRank])
async def top_users_by_activity(
    limit: int = Query(20),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    user: User = Depends(require_web_owner),
    db: AsyncSession = Depends(get_db),
):
    return await AnalyticsService(db).user_activity_ranking(user.company_id, limit, date_from, date_to)
