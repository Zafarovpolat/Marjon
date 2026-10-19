from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4
import os

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from app.shared.base_model import Base

from app.modules.analytics.service import AnalyticsService
from app.modules.companies.models import Branch, Company
from app.modules.inventory.models import Ingredient, Product, StockItem, StockMovement, Warehouse
from app.modules.inventory.outgoing_report import outgoing_report
from app.modules.inventory.warehouse_models import ExpenseDocument
from app.modules.payments.models import Payment
from app.modules.pos.models import Order, OrderItem


STAMP = datetime(2026, 10, 17, 12, tzinfo=timezone.utc)


@pytest_asyncio.fixture
async def report_engine(db_engine):
    url = os.getenv("REPORT_TEST_DATABASE_URL")
    if not url:
        yield db_engine
        return
    if "test" not in url.rsplit("/", 1)[-1].lower():
        pytest.fail("An explicitly disposable test database is required")
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()


async def seed(db):
    company = Company(name="Test", slug=str(uuid4()), timezone="Asia/Tashkent")
    db.add(company); await db.flush()
    branch = Branch(company_id=company.id, name="Test")
    product = Product(company_id=company.id, name="Плов", price=100, product_type="dish", image_url="/media/plov.webp")
    warehouse = Warehouse(company_id=company.id, name="Главный склад", is_main=True)
    ingredient = Ingredient(company_id=company.id, name="Рис", unit="кг")
    db.add_all([branch, product, warehouse, ingredient]); await db.flush()
    return company, branch, product, warehouse, ingredient


async def add_order(db, company, branch, product, *, status="completed", payments=(("completed", 220),), cancelled=False, paid_at=STAMP):
    order = Order(company_id=company.id, branch_id=branch.id, order_number=str(uuid4())[:8],
                  status=status, subtotal=200, discount_amount=20, total_amount=220,
                  created_at=datetime(2026, 10, 15, 12, tzinfo=timezone.utc))
    db.add(order); await db.flush()
    db.add(OrderItem(order_id=order.id, product_id=product.id, name=product.name,
                     price=100, quantity=2, total=200, status="served"))
    if cancelled:
        db.add(OrderItem(order_id=order.id, product_id=product.id, name=product.name,
                         price=100, quantity=99, total=0, status="cancelled"))
    for status, amount in payments:
        db.add(Payment(company_id=company.id, order_id=order.id, amount=amount,
                       method="card", status=status, created_at=paid_at, updated_at=paid_at))
    await db.flush()
    return order


@pytest.mark.asyncio
async def test_paid_top_only_full_confirmed_not_cancelled_or_other_company(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        await add_order(db, company, branch, product, payments=(("completed", 100), ("completed", 120)), cancelled=True)
        for payments in [(("pending", 220),), (("failed", 220),), (("refunded", 220),), (("completed", 100),)]:
            await add_order(db, company, branch, product, payments=payments)
        await add_order(db, company, branch, product, status="new")
        await add_order(db, company, branch, product, status="cancelled")
        other, other_branch, other_product, _, _ = await seed(db)
        await add_order(db, other, other_branch, other_product)
        rows = await AnalyticsService(db).top_products(company.id, 5, date(2026, 10, 17), date(2026, 10, 17), True)
        assert len(rows) == 1
        assert rows[0].quantity_sold == 2  # neither cancelled qty nor payment-join duplicates
        assert rows[0].revenue == Decimal("180.00")  # 200 - 20, not 220 incl. tax/service
        assert rows[0].image_url == "/media/plov.webp"


@pytest.mark.asyncio
async def test_paid_top_uses_confirmation_day_and_half_open_company_timezone(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        await add_order(db, company, branch, product, paid_at=datetime(2026, 10, 16, 19, tzinfo=timezone.utc))
        await add_order(db, company, branch, product, paid_at=datetime(2026, 10, 17, 19, tzinfo=timezone.utc))
        rows = await AnalyticsService(db).top_products(company.id, 5, date(2026, 10, 17), date(2026, 10, 17), True)
        assert rows[0].quantity_sold == 2
        assert await AnalyticsService(db).top_products(company.id, 5, date(2026, 10, 15), date(2026, 10, 15), True) == []


@pytest.mark.asyncio
async def test_outgoing_uses_frozen_costs_excludes_inventory_other_types_and_tenants(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, _, _, warehouse, ingredient = await seed(db)
        shortage = ExpenseDocument(company_id=company.id, number=1, receiver="Инвентаризация", warehouse_id=warehouse.id, status="accepted")
        db.add(shortage); await db.flush()
        for kind, cost, ref, note in [("sale", 18000, None, "dish sale"), ("expense", 3000, None, "manual"),
                                      ("expense", 99999, shortage.id, ""), ("expense", 99999, None, "Инвентаризация legacy"),
                                      ("purchase", 99999, None, ""), ("waste", 99999, None, "")]:
            db.add(StockMovement(company_id=company.id, warehouse_id=warehouse.id, ingredient_id=ingredient.id,
                                 movement_type=kind, quantity=3, unit="кг", cost_price=cost / 3, total_cost=cost,
                                 ref_id=ref, note=note, created_at=STAMP))
        other, _, _, other_wh, other_ing = await seed(db)
        db.add(StockMovement(company_id=other.id, warehouse_id=other_wh.id, ingredient_id=other_ing.id,
                             movement_type="sale", quantity=1, unit="кг", total_cost=99999, created_at=STAMP))
        # No movement is created for a draft expense; it must not enter the report.
        db.add(ExpenseDocument(company_id=company.id, number=2, receiver="Кухня", status="draft", total_amount=99999))
        await db.flush()
        report = await outgoing_report(db, company.id, date(2026, 10, 17), date(2026, 10, 17))
        assert Decimal(report["total"]) == 21000
        assert sum(Decimal(r["raw"]) for r in report["rows"]) == 21000
        assert len(report["lines"]) == 2
        db.add(StockItem(company_id=company.id, warehouse_id=warehouse.id, ingredient_id=ingredient.id, quantity=100, cost_price=5))
        await db.flush()
        assert (await outgoing_report(db, company.id, date(2026, 10, 17), date(2026, 10, 17)))["total"] == report["total"]


@pytest.mark.asyncio
async def test_outgoing_local_date_bounds_and_empty_period(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, _, _, warehouse, ingredient = await seed(db)
        for stamp, cost in [(datetime(2026, 10, 16, 18, 59, 59, tzinfo=timezone.utc), 1),
                            (datetime(2026, 10, 16, 19, tzinfo=timezone.utc), 2),
                            (datetime(2026, 10, 17, 18, 59, 59, tzinfo=timezone.utc), 3),
                            (datetime(2026, 10, 17, 19, tzinfo=timezone.utc), 4)]:
            db.add(StockMovement(company_id=company.id, warehouse_id=warehouse.id, ingredient_id=ingredient.id,
                                 movement_type="sale", quantity=1, unit="кг", total_cost=cost, created_at=stamp))
        await db.flush()
        assert Decimal((await outgoing_report(db, company.id, date(2026, 10, 17), date(2026, 10, 17)))["total"]) == 5
        assert Decimal((await outgoing_report(db, company.id, date(2026, 10, 12), date(2026, 10, 15)))["total"]) == 0


@pytest.mark.asyncio
async def test_report_routes_require_auth_validate_range_and_return_empty_owner_data(client):
    from tests.conftest import register_company
    params = {"date_from": "2026-10-12", "date_to": "2026-10-17"}
    paths = ["/analytics/products/paid-top", "/inventory/stock/outgoing-report"]
    for path in paths:
        assert (await client.get(path, params=params)).status_code in (401, 403)
    headers, _ = await register_company(client, slug=f"paid-report-{uuid4().hex[:8]}", email=f"{uuid4().hex}@test.example")
    for path in paths:
        response = await client.get(path, params=params, headers=headers)
        assert response.status_code == 200, response.text
        invalid = await client.get(path, params={"date_from": "2026-10-18", "date_to": "2026-10-17"}, headers=headers)
        assert invalid.status_code == 422
