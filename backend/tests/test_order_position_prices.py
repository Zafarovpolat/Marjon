from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from app.modules.admin_reports.service import AdminReportService
from app.modules.inventory.models import Product
from tests.test_cancelled_dishes_phase1 import _setup_company, _add_order, _add_item


@pytest.mark.asyncio
async def test_order_position_prices_are_historical_distinct_and_tenant_scoped(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="position-prices", email="prices@example.com")
    foreign = await _setup_company(client, db_engine, slug="foreign-prices", email="foreign-prices@example.com")
    ids = []
    for company, number, prices in [(ctx, "1", ["0", "10.50", "10.50"]), (ctx, "2", ["20.75"]), (foreign, "3", ["999"])]:
        oid = await _add_order(company["sessions"], company_id=company["company_id"], branch_id=company["branch_id"],
            waiter_id=company["owner_id"], order_number=number, status="completed", created_at=datetime(2026,10,20,8,tzinfo=timezone.utc))
        for price in prices:
            await _add_item(company["sessions"], order_id=oid, product_id=company["product_id"], price=price)
        ids.append(oid)
    async with ctx["sessions"]() as db:
        product = await db.get(Product, ctx["product_id"])
        product.price = Decimal("90000")
        await db.commit()
        service = AdminReportService(db, web_timezone="Asia/Tashkent")
        args = (ctx["company_id"], date(2026,10,20), date(2026,10,20))
        rows = await service.orders_report(*args, product_id=[ctx["product_id"]])
        by_id = {row.order_id: row.position_prices for row in rows}
        assert by_id == {ids[0]: [Decimal("0"), Decimal("10.50")], ids[1]: [Decimal("20.75")]}
        totals = {row.order_id: (row.position_quantity, row.position_amount) for row in rows}
        assert totals == {ids[0]: (Decimal("6"), Decimal("12")), ids[1]: (Decimal("2"), Decimal("31.50"))}
        assert all(row.position_prices is None for row in await service.orders_report(*args))
        assert await service.orders_report(*args, product_id=[foreign["product_id"]]) == []
    response = await client.get("/reports/orders", headers=ctx["headers"], params={
        "date_from": "2026-10-20", "date_to": "2026-10-20", "product_id": str(ctx["product_id"]), "web_timezone": "Asia/Tashkent",
    })
    assert response.status_code == 200, response.text
    assert sorted(len(row["position_prices"]) for row in response.json()) == [1, 2]


@pytest.mark.asyncio
async def test_same_price_lines_accumulate_to_four_positions_136000(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="four-sushi", email="four-sushi@example.com")
    oid = await _add_order(ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], order_number="4", status="completed", created_at=datetime(2026,10,20,8,tzinfo=timezone.utc))
    for _ in range(2):
        await _add_item(ctx["sessions"], order_id=oid, product_id=ctx["product_id"], price="34000", qty="2", discount="0")
    async with ctx["sessions"]() as db:
        rows = await AdminReportService(db).orders_report(ctx["company_id"], date(2026,10,20), date(2026,10,20), product_id=[ctx["product_id"]])
        assert len(rows) == 1
        assert rows[0].position_quantity == Decimal("4")
        assert rows[0].position_amount == Decimal("136000")
