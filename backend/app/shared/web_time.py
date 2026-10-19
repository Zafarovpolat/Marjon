"""Opt-in OWNER web calendar. Legacy/desktop requests remain unchanged."""
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

WEB_TIMEZONE = "Asia/Tashkent"


def web_date_conditions(column, date_from=None, date_to=None):
    tz = ZoneInfo(WEB_TIMEZONE)
    conditions = []
    if date_from:
        conditions.append(column >= datetime.combine(date_from, time.min, tzinfo=tz).astimezone(timezone.utc))
    if date_to:
        conditions.append(column < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc))
    return conditions


async def web_counterparty_transactions(db, company_id, counterparty_id, params, date_from, date_to):
    from sqlalchemy import select, func
    from app.modules.finance.models import FinTransaction
    query = select(FinTransaction).where(FinTransaction.company_id == company_id,
        FinTransaction.counterparty_id == counterparty_id, FinTransaction.deleted_at.is_(None),
        *web_date_conditions(FinTransaction.date, date_from, date_to))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.order_by(FinTransaction.date.desc()).offset(params.offset).limit(params.size))).scalars().all()
    return rows, total
