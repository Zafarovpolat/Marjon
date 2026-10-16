"""Split/move target table binding for the place service rate.

move_item() carries only the table NUMBER as text. _bind_table_by_number()
resolves it to a canonical Table (same tenant guarantees as _resolve_table)
so the target order picks up its hall's percent; ambiguous or missing
numbers stay unbound (rate 0%, as before) — money is never guessed.
"""
from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.companies.models import Company
from app.modules.pos.service import OrderService
from tests.conftest import register_company


async def _branch(client, headers, name="Main"):
    resp = await client.post("/companies/me/branches", headers=headers, json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _hall(client, headers, branch_id, name, percent=None):
    payload = {"name": name, "branch_id": branch_id}
    if percent is not None:
        payload["percent"] = percent
    resp = await client.post("/halls", headers=headers, json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _table(client, headers, hall_id, number):
    resp = await client.post(
        f"/halls/{hall_id}/tables", headers=headers, json={"number": number}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _company_id(db_engine) -> UUID:
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as session:
        return UUID(str((await session.execute(select(Company.id))).scalar_one()))


def _blank_order():
    return SimpleNamespace(table_id=None, table_number=None, hall_name_snapshot=None)


async def test_bind_single_candidate_sets_table_and_hall_rate(client, db_engine):
    headers, _ = await register_company(client, slug="bind1", email="bind1@example.com")
    branch_id = await _branch(client, headers)
    hall = await _hall(client, headers, branch_id, "Dvor", percent=20)
    table = await _table(client, headers, hall["id"], 7)
    company_id = await _company_id(db_engine)

    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as session:
        svc = OrderService(session)
        order = _blank_order()
        assert await svc._bind_table_by_number(company_id, UUID(branch_id), order, "7") is True
        assert str(order.table_id) == str(table["id"])
        assert order.table_number == "7"
        assert order.hall_name_snapshot == "Dvor"
        assert await svc._resolve_service_rate(company_id, order) == 0.2


async def test_bind_ambiguous_number_stays_unbound(client, db_engine):
    headers, _ = await register_company(client, slug="bind2", email="bind2@example.com")
    branch_id = await _branch(client, headers)
    hall_a = await _hall(client, headers, branch_id, "Dvor", percent=20)
    hall_b = await _hall(client, headers, branch_id, "Zal", percent=12)
    await _table(client, headers, hall_a["id"], 7)
    await _table(client, headers, hall_b["id"], 7)
    company_id = await _company_id(db_engine)

    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as session:
        svc = OrderService(session)
        order = _blank_order()
        assert await svc._bind_table_by_number(company_id, UUID(branch_id), order, "7") is False
        assert order.table_id is None


async def test_no_table_means_zero_rate(client, db_engine):
    headers, _ = await register_company(client, slug="bind3", email="bind3@example.com")
    company_id = await _company_id(db_engine)

    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as session:
        svc = OrderService(session)
        assert await svc._resolve_service_rate(company_id, _blank_order()) == 0.0
        assert await svc._bind_table_by_number(company_id, UUID(int=0), _blank_order(), "abc") is False
