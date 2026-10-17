"""Sales KPI extensions: only disposable in-memory SQLite fixtures, never dev DB."""
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest

from app.modules.admin_reports.service import AdminReportService
from app.modules.finance.models import FinTransaction
from app.modules.inventory.models import Product
from app.modules.pos.models import Order, OrderItem
from tests.test_cancelled_dishes_phase1 import _setup_company


DAY = date(2026, 9, 1)
STAMP = datetime(2026, 9, 1, 12, tzinfo=timezone.utc)
OUTSIDE = datetime(2026, 8, 1, 12, tzinfo=timezone.utc)


async def context(client, db_engine, suffix):
    return await _setup_company(client, db_engine, slug=f"sale-{suffix}", email=f"sale-{suffix}@example.com")


async def seed_orders(ctx, *, count=205, cancelled=False, stamp=STAMP, qty="1"):
    async with ctx["sessions"]() as db:
        orders = [Order(
            id=uuid4(), company_id=ctx["company_id"], branch_id=ctx["branch_id"],
            waiter_id=ctx["owner_id"], order_number=f"SALE-{uuid4().hex}",
            status="cancelled" if cancelled else "completed", order_type="dine_in",
            created_at=stamp, cancelled_at=stamp if cancelled else None,
            subtotal=Decimal("20"), total_amount=Decimal("999"),
        ) for _ in range(count)]
        db.add_all(orders)
        await db.flush()
        for order in orders:
            for name in ["Plov", "Old Plov"]:
                db.add(OrderItem(order_id=order.id, product_id=ctx["product_id"], name=name,
                                 price=Decimal("10"), quantity=Decimal(qty), total=Decimal("10"),
                                 status="cancelled" if cancelled else "pending", cancelled_at=stamp if cancelled else None))
        await db.commit()


@pytest.mark.asyncio
async def test_empty_aggregates_and_auth(client, db_engine):
    ctx = await context(client, db_engine, "empty")
    params = {"date_from": str(DAY), "date_to": str(DAY)}
    for path, field in [("/finance/transactions/summary", "income_amount"), ("/reports/cancelled/summary", "quantity")]:
        assert (await client.get(path, params=params)).status_code == 401
        result = await client.get(path, params=params, headers=ctx["headers"])
        assert result.status_code == 200, result.text
        assert Decimal(result.json()[field]) == 0
    report = await client.get("/reports/dishes", params=params, headers=ctx["headers"])
    assert report.status_code == 200, report.text
    assert report.json()["totals"]["orders_count"] == 0


@pytest.mark.asyncio
async def test_orders_gt200_exact_sales_scope_and_historical_semantics(client, db_engine):
    ctx = await context(client, db_engine, "orders")
    foreign = await context(client, db_engine, "foreign")
    await seed_orders(ctx)
    await seed_orders(ctx, count=1, cancelled=True)
    await seed_orders(ctx, count=1, stamp=OUTSIDE)
    await seed_orders(foreign, count=1)
    async with ctx["sessions"]() as db:
        # Master price/availability cannot change historical revenue or count.
        product = await db.get(Product, ctx["product_id"])
        product.price = Decimal("99999")
        product.is_active = False
        product.is_available = False
        await db.commit()
        service = AdminReportService(db)
        data = await service.dishes_report(ctx["company_id"], DAY, DAY)
        assert data.totals.orders_count == 205  # not 410 items, not latest 200
        assert data.totals.amount == Decimal("4100")  # item totals, not Order.total
        assert all(row.price == Decimal("10") for row in data.rows)
        selected = await service.dishes_report(ctx["company_id"], DAY, DAY, search="Old", category_id=[ctx["category_id"]])
        assert selected.totals.orders_count == 205
        assert selected.totals.amount == Decimal("2050")
        for filters in [{"search": "missing"}, {"category_id": [foreign["category_id"]]}]:
            assert (await service.dishes_report(ctx["company_id"], DAY, DAY, **filters)).totals.orders_count == 0
    result = await client.get("/reports/dishes", headers=ctx["headers"], params={"date_from": str(DAY), "date_to": str(DAY)})
    assert result.json()["totals"]["orders_count"] == 205


@pytest.mark.asyncio
async def test_cancelled_quantity_gt200_scope_event_date_and_legacy_fallback(client, db_engine):
    ctx = await context(client, db_engine, "cancel")
    foreign = await context(client, db_engine, "cancel-foreign")
    await seed_orders(ctx, cancelled=True, qty="1.125")
    await seed_orders(ctx, count=1, cancelled=True, stamp=OUTSIDE)
    await seed_orders(foreign, count=1, cancelled=True)
    async with ctx["sessions"]() as db:
        # An item cancellation on a live order, and a legacy whole-order
        # cancellation with NULL event time: same rules as the detail report.
        live = Order(id=uuid4(), company_id=ctx["company_id"], branch_id=ctx["branch_id"], waiter_id=ctx["owner_id"], order_number="LIVE", status="completed", created_at=OUTSIDE)
        legacy = Order(id=uuid4(), company_id=ctx["company_id"], branch_id=ctx["branch_id"], waiter_id=ctx["owner_id"], order_number="LEGACY", status="cancelled", created_at=STAMP)
        db.add_all([live, legacy])
        await db.flush()
        db.add_all([
            OrderItem(order_id=live.id, product_id=ctx["product_id"], name="Plov", quantity=Decimal("2"), price=Decimal("10"), total=0, status="cancelled", cancelled_at=STAMP),
            OrderItem(order_id=legacy.id, product_id=ctx["product_id"], name="Plov", quantity=Decimal("3"), price=Decimal("10"), total=0, status="pending"),
        ])
        await db.commit()
        service = AdminReportService(db)
        detail = await service.cancelled_items(ctx["company_id"], DAY, DAY)
        summary = await service.cancelled_items(ctx["company_id"], DAY, DAY, summary_only=True)
        assert summary == sum(row.quantity for row in detail) == Decimal("466.250")
        assert len(detail) == 412  # quantity is NOT the number of item rows/orders
    result = await client.get("/reports/cancelled/summary", headers=ctx["headers"], params={"date_from": str(DAY), "date_to": str(DAY)})
    assert result.status_code == 200, result.text
    assert Decimal(result.json()["quantity"]) == Decimal("466.250")


@pytest.mark.asyncio
async def test_finance_income_gt200_direction_company_deleted_and_date(client, db_engine):
    ctx = await context(client, db_engine, "income")
    foreign = await context(client, db_engine, "income-foreign")
    async with ctx["sessions"]() as db:
        db.add_all([FinTransaction(company_id=ctx["company_id"], direction="income", amount=Decimal("10.25"), date=STAMP) for _ in range(205)])
        db.add_all([
            FinTransaction(company_id=ctx["company_id"], direction="expense", amount=Decimal("999"), date=STAMP),
            FinTransaction(company_id=ctx["company_id"], direction="income", amount=Decimal("999"), date=OUTSIDE),
            FinTransaction(company_id=ctx["company_id"], direction="income", amount=Decimal("999"), date=STAMP, deleted_at=STAMP),
            FinTransaction(company_id=foreign["company_id"], direction="income", amount=Decimal("999"), date=STAMP),
        ])
        await db.commit()
    params = {"date_from": str(DAY), "date_to": str(DAY)}
    summary = await client.get("/finance/transactions/summary", headers=ctx["headers"], params=params)
    assert summary.status_code == 200, summary.text
    assert Decimal(summary.json()["income_amount"]) == Decimal("2101.25")
    original = await client.get("/finance/transactions", headers=ctx["headers"], params={**params, "direction": "income"})
    assert original.json()["count"] == 205
    assert sum(Decimal(str(row["amount"])) for row in original.json()["items"]) == Decimal("2101.25")
