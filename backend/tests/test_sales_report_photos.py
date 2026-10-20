from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
import pytest
from tests.test_dashboard_paid_top_outgoing import report_engine, seed, add_order
from app.modules.admin_reports.service import AdminReportService


@pytest.mark.asyncio
async def test_sales_photo_comes_from_current_tenant_catalog_without_changing_aggregates(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        await add_order(db, company, branch, product)
        other, other_branch, other_product, _, _ = await seed(db)
        other_product.image_url = "/media/other-company.webp"
        await add_order(db, other, other_branch, other_product)
        await db.flush()
        svc = AdminReportService(db, web_timezone="Asia/Tashkent")
        data = await svc.dishes_report(company.id, date(2026, 10, 15), date(2026, 10, 15))
        assert len(data.rows) == 1
        assert data.rows[0].image_url == "/media/plov.webp"
        assert data.rows[0].quantity == 2
        totals = data.totals.model_dump()
        product.image_url = None
        await db.flush()
        no_photo = await svc.dishes_report(company.id, date(2026, 10, 15), date(2026, 10, 15))
        assert no_photo.rows[0].image_url is None
        assert no_photo.totals.model_dump() == totals
