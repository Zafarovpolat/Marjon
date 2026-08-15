from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.infrastructure.database.session import get_db
from app.main import app
from app.modules.companies.models import Branch
from app.modules.pos.models import Order
from app.modules.rbac.permissions import seed_permissions
from app.shared.base_model import Base
from tests.conftest import register_company

# Regression coverage for the /analytics/sales PostgreSQL GROUP BY failure:
# sales_report rebuilt date(timezone(str(tz), created_at)) separately for
# SELECT / GROUP BY / ORDER BY, so SQLAlchemy emitted a distinct bind param
# for the timezone literal in each clause. PostgreSQL then rejected the query
# ("column orders.created_at must appear in the GROUP BY clause"). SQLite does
# not enforce this, so these cases MUST run on real PostgreSQL to be meaningful.


def _control_url():
    raw = os.getenv("TEST_DATABASE_URL")
    if not raw:
        pytest.skip("TEST_DATABASE_URL is required for analytics sales PostgreSQL tests")
    url = make_url(raw)
    if url.get_backend_name() != "postgresql":
        pytest.skip("PostgreSQL is required for analytics sales tests")
    if not url.database or "test" not in url.database.lower():
        pytest.fail("TEST_DATABASE_URL must name an explicitly disposable test DB")
    return url


async def _connect(url):
    url = make_url(url)
    return await asyncpg.connect(
        user=url.username, password=url.password,
        host=url.host, port=url.port or 5432, database=url.database,
    )


async def _create_database(control_url, name):
    conn = await _connect(control_url)
    try:
        await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()
    return control_url.set(database=name).render_as_string(hide_password=False)


async def _drop_database(control_url, name):
    conn = await _connect(control_url)
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    finally:
        await conn.close()


@pytest.fixture(scope="module")
def sales_database_url():
    control = _control_url()
    name = f"marjon_sales_fix_{uuid4().hex[:10]}"
    url = asyncio.run(_create_database(control, name))
    try:
        yield url
    finally:
        asyncio.run(_drop_database(control, name))


@pytest_asyncio.fixture
async def sales_api(sales_database_url):
    engine = create_async_engine(
        sales_database_url, connect_args={"prepared_statement_cache_size": 0}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        await seed_permissions(db)

    async def override_get_db() -> AsyncSession:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test/api/v1"
    ) as client:
        yield client, sessions
    app.dependency_overrides.clear()
    await engine.dispose()


async def _company(client):
    suffix = uuid4().hex[:8]
    headers, _ = await register_company(
        client, slug=f"sales-{suffix}", email=f"o-{suffix}@example.com"
    )
    company_id = UUID((await client.get("/auth/me", headers=headers)).json()["company_id"])
    return headers, company_id


async def _add_orders(sessions, company_id, rows):
    """rows: iterable of (created_at_utc, status, total_amount)."""
    async with sessions() as db:
        branch = Branch(company_id=company_id, name="Main")
        db.add(branch)
        await db.flush()
        for i, (created, status, total) in enumerate(rows):
            db.add(Order(
                company_id=company_id, branch_id=branch.id,
                order_number=f"S-{uuid4().hex[:8]}-{i}", status=status,
                subtotal=Decimal(str(total)), total_amount=Decimal(str(total)),
                created_at=created, updated_at=created,
            ))
        await db.commit()


@pytest.mark.asyncio
async def test_sales_empty_company_returns_200_empty(sales_api):
    client, _ = sales_api
    headers, _ = await _company(client)
    resp = await client.get(
        "/analytics/sales",
        params={"date_from": "2026-08-14", "date_to": "2026-08-16"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


@pytest.mark.asyncio
async def test_sales_groups_by_day_excluding_cancelled(sales_api):
    client, sessions = sales_api
    headers, company_id = await _company(client)
    d1 = datetime(2026, 8, 14, 12, 0, tzinfo=timezone.utc)
    d2 = datetime(2026, 8, 15, 9, 30, tzinfo=timezone.utc)
    await _add_orders(sessions, company_id, [
        (d1, "completed", 100000),
        (d1, "completed", 50000),
        (d2, "completed", 20000),
        (d2, "cancelled", 999999),  # excluded from totals
    ])
    resp = await client.get(
        "/analytics/sales",
        params={"date_from": "2026-08-14", "date_to": "2026-08-15"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    by_date = {r["date"]: r for r in resp.json()}
    assert set(by_date) == {"2026-08-14", "2026-08-15"}
    assert by_date["2026-08-14"]["orders_count"] == 2
    assert Decimal(by_date["2026-08-14"]["revenue"]) == Decimal("150000")
    assert by_date["2026-08-15"]["orders_count"] == 1
    assert Decimal(by_date["2026-08-15"]["revenue"]) == Decimal("20000")


@pytest.mark.asyncio
async def test_sales_tenant_isolation(sales_api):
    client, sessions = sales_api
    a_headers, a_id = await _company(client)
    b_headers, _b_id = await _company(client)
    d1 = datetime(2026, 8, 15, 10, 0, tzinfo=timezone.utc)
    await _add_orders(sessions, a_id, [(d1, "completed", 77000)])
    a = await client.get(
        "/analytics/sales",
        params={"date_from": "2026-08-15", "date_to": "2026-08-15"}, headers=a_headers,
    )
    b = await client.get(
        "/analytics/sales",
        params={"date_from": "2026-08-15", "date_to": "2026-08-15"}, headers=b_headers,
    )
    assert a.status_code == 200 and b.status_code == 200, (a.text, b.text)
    assert len(a.json()) == 1 and Decimal(a.json()[0]["revenue"]) == Decimal("77000")
    assert b.json() == []
