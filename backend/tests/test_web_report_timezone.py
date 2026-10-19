from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_dashboard_paid_top_outgoing import report_engine, seed, add_order
from app.modules.admin_reports.service import AdminReportService
from app.modules.companies.models import Branch, Company
from app.modules.inventory.models import Product
from app.modules.pos.models import Order, OrderItem

DAY = date(2026, 10, 18)
STAMPS = [datetime(2026, 10, 17, 18, 59, 59, tzinfo=timezone.utc),
          datetime(2026, 10, 17, 19, tzinfo=timezone.utc),
          datetime(2026, 10, 18, 18, 59, 59, tzinfo=timezone.utc),
          datetime(2026, 10, 18, 19, tzinfo=timezone.utc)]


@pytest.mark.asyncio
async def test_web_orders_day_is_half_open_and_legacy_is_unchanged(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        orders = []
        for stamp in STAMPS:
            order = await add_order(db, company, branch, product)
            order.created_at = stamp
            orders.append(order)
        other, ob, op, _, _ = await seed(db)
        foreign = await add_order(db, other, ob, op)
        foreign.created_at = STAMPS[1]
        await db.flush()
        web = AdminReportService(db, web_timezone="Asia/Tashkent")
        legacy = AdminReportService(db)
        rows = await web.orders_report(company.id, DAY, DAY)
        assert {row.order_id for row in rows} == {orders[1].id, orders[2].id}
        old = await legacy.orders_report(company.id, DAY, DAY)
        assert {row.order_id for row in old} == {orders[2].id, orders[3].id}
        previous = await web.orders_report(company.id, date(2026, 10, 17), date(2026, 10, 17))
        assert {row.order_id for row in previous} == {orders[0].id}
        # Every order-based report uses this common predicate.
        query = select(Order).where(Order.company_id == company.id)
        lower = (await db.execute(web._order_date_filter(query, DAY, None))).scalars().all()
        upper = (await db.execute(web._order_date_filter(query, None, DAY))).scalars().all()
        assert len(lower) == len(upper) == 3


@pytest.mark.asyncio
async def test_cancelled_web_uses_cancellation_day_and_summary_same_bounds(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        items = []
        for stamp in STAMPS:
            order = await add_order(db, company, branch, product)
            item = await db.scalar(select(OrderItem).where(OrderItem.order_id == order.id))
            item.status = "cancelled"
            item.cancelled_at = stamp
            items.append(item)
        await db.flush()
        web = AdminReportService(db, web_timezone="Asia/Tashkent")
        rows = await web.cancelled_items(company.id, DAY, DAY)
        assert {row.order_item_id for row in rows} == {items[1].id, items[2].id}
        assert await web.cancelled_items(company.id, DAY, DAY, summary_only=True) == Decimal(4)
        old = await AdminReportService(db).cancelled_items(company.id, DAY, DAY)
        assert {row.order_item_id for row in old} == {items[2].id, items[3].id}


@pytest.mark.asyncio
async def test_web_report_http_opt_in_and_timezone_validation(client, db_engine):
    from tests.conftest import register_company
    slug = f"report-time-{uuid4().hex[:8]}"
    headers, _ = await register_company(client, slug=slug, email=f"{uuid4().hex}@test.example")
    async with AsyncSession(db_engine, expire_on_commit=False) as db:
        company = await db.scalar(select(Company).where(Company.slug == slug))
        company.timezone = "UTC"  # Reproduce the actual local company's configuration.
        branch = Branch(company_id=company.id, name="Test")
        product = Product(company_id=company.id, name="Test", price=100)
        db.add_all([branch, product]); await db.flush()
        order = await add_order(db, company, branch, product,
                                paid_at=datetime(2026, 10, 17, 19, 15, tzinfo=timezone.utc))
        order.created_at = datetime(2026, 10, 17, 19, 15, tzinfo=timezone.utc)
        order.order_number = "LOCAL0015"
        await db.commit()
    params = {"date_from": "2026-10-18", "date_to": "2026-10-18"}
    web = await client.get("/reports/orders", params={**params, "web_timezone": "Asia/Tashkent"}, headers=headers)
    assert web.status_code == 200, web.text
    assert [row["order_number"] for row in web.json()] == ["LOCAL0015"]
    legacy = await client.get("/reports/orders", params=params, headers=headers)
    assert legacy.status_code == 200 and legacy.json() == []
    for endpoint in ["owner-financials", "products/paid-top"]:
        local = await client.get(f"/analytics/{endpoint}", params={**params, "web_timezone": "Asia/Tashkent"}, headers=headers)
        assert local.status_code == 200, local.text
        old = await client.get(f"/analytics/{endpoint}", params=params, headers=headers)
        assert old.status_code == 200, old.text
        if endpoint == "owner-financials":
            assert local.json()["today_orders"] == 1
            assert local.json()["sales"][0]["orders_count"] == 1
            assert old.json()["today_orders"] == 0
        else:
            assert len(local.json()) == 1 and old.json() == []
        invalid = await client.get(f"/analytics/{endpoint}", params={**params, "web_timezone": "UTC"}, headers=headers)
        assert invalid.status_code == 422
    for endpoint in ["orders", "tables", "waiters", "dishes", "cancelled", "cancelled/summary"]:
        good = await client.get(f"/reports/{endpoint}", params={**params, "web_timezone": "Asia/Tashkent"}, headers=headers)
        assert good.status_code == 200, (endpoint, good.text)
        bad = await client.get(f"/reports/{endpoint}", params={**params, "web_timezone": "UTC"}, headers=headers)
        assert bad.status_code == 422, endpoint


@pytest.mark.asyncio
async def test_restricted_web_today_uses_tashkent_without_changing_legacy(monkeypatch):
    from app.modules.admin_reports import router as routes
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            instant = datetime(2026, 10, 17, 19, 15, tzinfo=timezone.utc)
            return instant.astimezone(tz) if tz else instant.replace(tzinfo=None)
    async def denied(*args):
        return False
    monkeypatch.setattr(routes, "datetime", Frozen)
    monkeypatch.setattr(routes, "user_can_view_past_periods", denied)
    assert await routes._clamp_period(None, None, None, None, web_timezone="Asia/Tashkent") == (DAY, DAY)
    old_day = date(2026, 10, 17)
    assert await routes._clamp_period(None, None, None, None) == (old_day, old_day)


@pytest.mark.asyncio
async def test_web_1718_graph_ignores_company_utc_but_legacy_keeps_it(report_engine):
    from app.modules.analytics.owner_financials import owner_financials
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        company.timezone = "UTC"
        stamp = datetime(2026, 10, 17, 12, 18, 2, tzinfo=timezone.utc)
        order = await add_order(db, company, branch, product, paid_at=stamp)
        order.created_at = stamp
        await db.flush()
        day = date(2026, 10, 17)
        web = await owner_financials(db, company.id, day, day, web_timezone="Asia/Tashkent")
        old = await owner_financials(db, company.id, day, day)
        assert web["order_rows"][0]["date_label"] == "17.10 17:18"
        assert web["sales"][17]["orders_count"] == 1
        assert web["sales"][12]["orders_count"] == 0
        assert old["sales"][12]["orders_count"] == 1
        assert old["order_rows"][0]["date_label"] == "17.10 12:18"
