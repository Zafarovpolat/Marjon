from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_dashboard_paid_top_outgoing import report_engine, seed
from app.modules.finance.models import FinTransaction, Counterparty
from app.modules.inventory.models import StockMovement
from app.modules.inventory.service import StockService
from app.modules.kafe_compat.router import _company_transactions_query
from app.shared.web_time import web_counterparty_transactions, web_date_conditions
from app.shared.pagination import PageParams

DAY = date(2026, 10, 18)
STAMP = [datetime(2026, 10, 17, 18, 59, 59, tzinfo=timezone.utc),
         datetime(2026, 10, 17, 19, tzinfo=timezone.utc),
         datetime(2026, 10, 18, 18, 59, 59, tzinfo=timezone.utc),
         datetime(2026, 10, 18, 19, tzinfo=timezone.utc)]

def test_web_day_is_half_open_tashkent_day():
    conditions = web_date_conditions(FinTransaction.date, DAY, DAY)
    assert conditions[0].right.value == STAMP[1]
    assert conditions[1].right.value == STAMP[3]


@pytest.mark.asyncio
async def test_finance_and_counterparty_web_day_and_legacy_unchanged(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, _, _, _, _ = await seed(db)
        counterparty = Counterparty(company_id=company.id, scope_kind="company", full_name="Timezone test")
        db.add(counterparty); await db.flush()
        txs = []
        for index, stamp in enumerate(STAMP):
            tx = FinTransaction(company_id=company.id, counterparty_id=counterparty.id,
                date=stamp, amount=(index + 1) * 10, direction="income")
            db.add(tx); txs.append(tx)
        other, _, _, _, _ = await seed(db)
        db.add(FinTransaction(company_id=other.id, date=STAMP[1], amount=99999, direction="income"))
        await db.flush()
        web = (await db.execute(_company_transactions_query(company.id, DAY, DAY, "income", "Asia/Tashkent"))).scalars().all()
        assert {row.id for row in web} == {txs[1].id, txs[2].id}
        legacy = (await db.execute(_company_transactions_query(company.id, DAY, DAY, "income"))).scalars().all()
        assert {row.id for row in legacy} == {txs[2].id, txs[3].id}
        rows, count = await web_counterparty_transactions(db, company.id, counterparty.id, PageParams(page=1, size=20), DAY, DAY)
        assert count == 2 and {row.id for row in rows} == {txs[1].id, txs[2].id}


@pytest.mark.asyncio
async def test_stock_web_end_of_day_preserves_legacy_utc_default(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, _, _, warehouse, ingredient = await seed(db)
        for stamp, kind, qty in [(STAMP[0], "purchase", 10), (STAMP[1], "expense", 2), (STAMP[3], "purchase", 100)]:
            db.add(StockMovement(company_id=company.id, warehouse_id=warehouse.id, ingredient_id=ingredient.id,
                created_at=stamp, movement_type=kind, quantity=qty, cost_price=10, total_cost=qty * 10, unit="кг"))
        await db.flush()
        service = StockService(db)
        web = await service.get_stock_as_of(company.id, date(2026, 10, 17), web_timezone="Asia/Tashkent")
        legacy = await service.get_stock_as_of(company.id, date(2026, 10, 17))
        assert web[0]["quantity"] == Decimal(10)
        assert legacy[0]["quantity"] == Decimal(8)
        next_day = await service.get_stock_as_of(company.id, DAY, web_timezone="Asia/Tashkent")
        assert next_day[0]["quantity"] == Decimal(8)


@pytest.mark.asyncio
async def test_web_finance_api_timezone_is_opt_in(client, db_engine):
    from tests.conftest import register_company
    from app.modules.companies.models import Company
    slug = f"web-time-{uuid4().hex[:8]}"
    headers, _ = await register_company(client, slug=slug, email=f"{uuid4().hex}@test.example")
    async with AsyncSession(db_engine, expire_on_commit=False) as db:
        cid = await db.scalar(select(Company.id).where(Company.slug == slug))
        for index, stamp in enumerate(STAMP):
            db.add(FinTransaction(company_id=cid, date=stamp, amount=(index + 1) * 10, direction="income"))
        await db.commit()
    params = {"date_from": DAY.isoformat(), "date_to": DAY.isoformat(), "web_timezone": "Asia/Tashkent"}
    response = await client.get("/finance/transactions", headers=headers, params=params)
    assert response.status_code == 200, response.text
    assert sum(Decimal(str(row["amount"])) for row in response.json()["items"]) == 50
    summary = await client.get("/finance/transactions/summary", headers=headers, params=params)
    assert summary.status_code == 200 and Decimal(summary.json()["income_amount"]) == 50
    legacy = await client.get("/finance/transactions", headers=headers, params={"date_from": DAY.isoformat(), "date_to": DAY.isoformat()})
    assert sum(Decimal(str(row["amount"])) for row in legacy.json()["items"]) == 70
    invalid = await client.get("/finance/transactions", headers=headers, params={**params, "web_timezone": "UTC"})
    assert invalid.status_code == 422
