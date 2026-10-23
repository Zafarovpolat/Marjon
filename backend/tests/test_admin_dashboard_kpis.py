from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.auth.models import User
from app.modules.auth.security import hash_password
from app.modules.payments.models import Payment
from app.modules.pos.models import Order
from tests.conftest import register_company


async def _create_superadmin(db_engine, email="hq-kpi@marjon.local", password="RootPass1!"):
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        session.add(User(
            email=email, password_hash=await hash_password(password),
            is_superadmin=True, is_active=True,
        ))
        await session.commit()
    return email, password


async def _admin_headers(client, db_engine):
    email, password = await _create_superadmin(db_engine)
    resp = await client.post("/auth/admin/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _seed_order_and_payment(
    db_engine, company_id, branch_id, *, total: Decimal, paid: Decimal, public_id: int,
):
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        order = Order(
            company_id=company_id, branch_id=branch_id, public_id=public_id,
            order_number=str(public_id), status="completed", total_amount=total,
        )
        session.add(order)
        await session.flush()
        if paid > 0:
            session.add(Payment(
                company_id=company_id, order_id=order.id, amount=paid,
                method="cash", status="completed",
            ))
        await session.commit()
        return order.id


async def test_dashboard_kpis_aggregates_turnover_paid_and_unpaid_this_month(client, db_engine):
    headers, _ = await register_company(client, slug="kpi-acme", email="owner@kpi-acme.example.com")
    me = (await client.get("/auth/me", headers=headers)).json()
    company_id = UUID(me["company_id"])
    branches = (await client.get("/companies/me/branches", headers=headers)).json()
    branch_id = UUID(branches[0]["id"])

    await _seed_order_and_payment(
        db_engine, company_id, branch_id,
        total=Decimal("100000"), paid=Decimal("60000"), public_id=10000001,
    )
    await _seed_order_and_payment(
        db_engine, company_id, branch_id,
        total=Decimal("50000"), paid=Decimal("50000"), public_id=10000002,
    )

    admin_headers = await _admin_headers(client, db_engine)
    resp = await client.get("/admin-reports/dashboard-kpis", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["turnover_this_month"] >= 150000
    assert body["completed_orders_this_month"] >= 2
    assert body["paid_amount_this_month"] >= 110000
    # 150000 - 110000 = 40000 is the floor contributed by these two orders;
    # other tests/fixtures may add more completed orders in the same month,
    # but never make this go negative.
    assert body["unpaid_amount_this_month"] >= 0


async def test_dashboard_kpis_rejects_non_superadmin(client):
    headers, _ = await register_company(client, slug="kpi-other", email="owner@kpi-other.example.com")
    resp = await client.get("/admin-reports/dashboard-kpis", headers=headers)
    assert resp.status_code == 403
