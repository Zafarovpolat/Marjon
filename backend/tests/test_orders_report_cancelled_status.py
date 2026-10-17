"""orders_report: отмены скрыты по умолчанию, явный order_status=cancelled их отдаёт.

Колокольчик уведомлений забирает сегодняшние отмены именно явным фильтром —
дефолт отчёта (без отмен, для выручки) не меняется.
"""
from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.companies.models import Branch
from app.modules.pos.models import Order
from tests.conftest import register_company


async def _setup(client, db_engine, *, slug: str, email: str):
    headers, _ = await register_company(client, slug=slug, email=email)
    me = (await client.get("/auth/me", headers=headers)).json()
    company_id = UUID(me["company_id"])
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    branch_id = uuid4()
    async with sessions() as db:
        db.add(Branch(id=branch_id, company_id=company_id, name="Main"))
        await db.commit()
    return {"headers": headers, "company_id": company_id, "sessions": sessions, "branch_id": branch_id}


async def _order(sessions, *, company_id, branch_id, number, status):
    from decimal import Decimal

    oid = uuid4()
    async with sessions() as db:
        db.add(Order(
            id=oid, company_id=company_id, branch_id=branch_id,
            order_number=number, order_type="dine_in", status=status,
            subtotal=Decimal("100"), total_amount=Decimal("100"),
        ))
        await db.commit()
    return oid


async def _report_numbers(client, headers, **params):
    resp = await client.get("/reports/orders", headers=headers, params=params)
    assert resp.status_code == 200, resp.text
    return {row["order_number"] for row in resp.json()}


async def test_default_excludes_cancelled(client, db_engine):
    ctx = await _setup(client, db_engine, slug="cancel-def", email="cancel-def@example.com")
    await _order(ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"], number="LIVE-1", status="completed")
    await _order(ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"], number="GONE-1", status="cancelled")
    numbers = await _report_numbers(client, ctx["headers"])
    assert "LIVE-1" in numbers
    assert "GONE-1" not in numbers


async def test_explicit_cancelled_status_returns_them(client, db_engine):
    ctx = await _setup(client, db_engine, slug="cancel-exp", email="cancel-exp@example.com")
    await _order(ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"], number="LIVE-2", status="completed")
    await _order(ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"], number="GONE-2", status="cancelled")
    numbers = await _report_numbers(client, ctx["headers"], order_status="cancelled")
    assert "GONE-2" in numbers
    assert "LIVE-2" not in numbers
