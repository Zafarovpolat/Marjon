"""Phase 2 — Tables Report canonical Place (Hall) filter.

Postgres-backed (Order.table_id relation + halls). Proves:
  * /reports/tables/filters exposes real active-Hall metadata (not order history)
  * hall_id filters the report through Order.table_id → Table.hall_id (never by
    table_number), excluding legacy NULL-table_id rows
  * same table number in two halls stays two distinct rows
  * tenant safety (foreign hall → 404) and no revenue/order cardinality inflation
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.modules.companies.models import Branch
from app.modules.finance.models import PaymentType
from app.modules.halls.models import Hall, Table
from app.modules.payments.models import Payment
from app.modules.pos.models import Order
from tests.conftest import register_company
from tests.test_reports_tenant_scope_postgres import reports_api, reports_database_url


async def _company(client, suffix, letter):
    headers, _ = await register_company(
        client, slug=f"place-{letter}-{suffix}", email=f"place-{letter}-{suffix}@example.com"
    )
    company_id = UUID((await client.get("/auth/me", headers=headers)).json()["company_id"])
    return headers, company_id


async def _create_staff(client, headers, *, email, role_slug):
    resp = await client.post(
        "/auth/users", headers=headers,
        json={"email": email, "password": "Passw0rd!", "role_slug": role_slug},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _table_rows(client, headers, **params):
    resp = await client.get("/reports/tables", headers=headers, params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _completed_order(**kwargs):
    return Order(order_type="dine_in", status="completed", **kwargs)


# placeholder-phase2-tests


@pytest.mark.asyncio
async def test_place_metadata_lists_active_company_halls_only(reports_api):
    client, sessions = reports_api
    suffix = uuid4().hex[:8]
    a_headers, company_a = await _company(client, suffix, "a")
    b_headers, company_b = await _company(client, suffix, "b")
    async with sessions() as db:
        ba, bb = uuid4(), uuid4()
        db.add_all([
            Branch(id=ba, company_id=company_a, name="A branch"),
            Branch(id=bb, company_id=company_b, name="B branch"),
        ])
        await db.flush()
        db.add_all([
            # "Балкон" is active but has zero orders — must still appear.
            Hall(company_id=company_a, branch_id=ba, name="Балкон", is_active=True),
            Hall(company_id=company_a, branch_id=ba, name="Бар", is_active=True),
            Hall(company_id=company_a, branch_id=ba, name="Зал", is_active=True),
            Hall(company_id=company_a, branch_id=ba, name="Архив", is_active=False),
            Hall(company_id=company_b, branch_id=bb, name="Чужой Зал", is_active=True),
        ])
        await db.commit()

    meta = await client.get("/reports/tables/filters", headers=a_headers)
    assert meta.status_code == 200, meta.text
    body = meta.json()
    assert body["place_filter_supported"] is True
    assert {p["label"] for p in body["places"]} == {"Балкон", "Бар", "Зал"}
    # Inactive and foreign halls are never offered.
    assert "Архив" not in meta.text
    assert "Чужой" not in meta.text


@pytest.mark.asyncio
async def test_same_table_number_across_halls_are_distinct_rows(reports_api):
    client, sessions = reports_api
    suffix = uuid4().hex[:8]
    headers, company = await _company(client, suffix, "a")
    async with sessions() as db:
        branch = uuid4()
        db.add(Branch(id=branch, company_id=company, name="Main"))
        await db.flush()
        zal = Hall(company_id=company, branch_id=branch, name="Зал", is_active=True)
        bar = Hall(company_id=company, branch_id=branch, name="Бар", is_active=True)
        db.add_all([zal, bar])
        await db.flush()
        t_zal = Table(hall_id=zal.id, number=5, is_active=True)
        t_bar = Table(hall_id=bar.id, number=5, is_active=True)
        db.add_all([t_zal, t_bar])
        await db.flush()
        db.add_all([
            _completed_order(
                company_id=company, branch_id=branch, order_number="Z-1",
                table_id=t_zal.id, table_number="5",
                subtotal=Decimal("100"), total_amount=Decimal("100"),
            ),
            _completed_order(
                company_id=company, branch_id=branch, order_number="B-1",
                table_id=t_bar.id, table_number="5",
                subtotal=Decimal("200"), total_amount=Decimal("200"),
            ),
        ])
        await db.commit()
        zal_id, bar_id, t_zal_id, t_bar_id = zal.id, bar.id, t_zal.id, t_bar.id

    rows = await _table_rows(client, headers)
    assert len(rows) == 2, rows
    by_hall = {r["hall_id"]: r for r in rows}
    assert set(by_hall) == {str(zal_id), str(bar_id)}
    assert by_hall[str(zal_id)]["table_id"] == str(t_zal_id)
    assert by_hall[str(zal_id)]["revenue"] == "100.00"
    assert by_hall[str(bar_id)]["table_id"] == str(t_bar_id)
    assert by_hall[str(bar_id)]["revenue"] == "200.00"

    zal_rows = await _table_rows(client, headers, hall_id=str(zal_id))
    assert len(zal_rows) == 1 and zal_rows[0]["table_id"] == str(t_zal_id)
    bar_rows = await _table_rows(client, headers, hall_id=str(bar_id))
    assert len(bar_rows) == 1 and bar_rows[0]["table_id"] == str(t_bar_id)


@pytest.mark.asyncio
async def test_legacy_null_table_id_excluded_only_when_hall_filter_active(reports_api):
    client, sessions = reports_api
    suffix = uuid4().hex[:8]
    headers, company = await _company(client, suffix, "a")
    async with sessions() as db:
        branch = uuid4()
        db.add(Branch(id=branch, company_id=company, name="Main"))
        await db.flush()
        zal = Hall(company_id=company, branch_id=branch, name="Зал", is_active=True)
        db.add(zal)
        await db.flush()
        t_zal = Table(hall_id=zal.id, number=5, is_active=True)
        db.add(t_zal)
        await db.flush()
        db.add_all([
            _completed_order(
                company_id=company, branch_id=branch, order_number="CANON-1",
                table_id=t_zal.id, table_number="5",
                subtotal=Decimal("100"), total_amount=Decimal("100"),
            ),
            # Legacy order: number "5" but NO canonical table_id.
            _completed_order(
                company_id=company, branch_id=branch, order_number="LEGACY-1",
                table_id=None, table_number="5",
                subtotal=Decimal("50"), total_amount=Decimal("50"),
            ),
        ])
        await db.commit()
        zal_id, t_zal_id = zal.id, t_zal.id

    unfiltered = await _table_rows(client, headers)
    # Two identity classes: canonical Table #5 and legacy "5" — never merged.
    assert len(unfiltered) == 2, unfiltered
    canonical = [r for r in unfiltered if r["table_id"] == str(t_zal_id)]
    legacy = [r for r in unfiltered if r["table_id"] is None]
    assert len(canonical) == 1 and canonical[0]["hall_id"] == str(zal_id)
    assert len(legacy) == 1 and legacy[0]["hall_id"] is None and legacy[0]["revenue"] == "50.00"

    filtered = await _table_rows(client, headers, hall_id=str(zal_id))
    assert len(filtered) == 1
    assert filtered[0]["table_id"] == str(t_zal_id)
    assert all(r["table_id"] is not None for r in filtered)


@pytest.mark.asyncio
async def test_foreign_hall_id_returns_404(reports_api):
    client, sessions = reports_api
    suffix = uuid4().hex[:8]
    a_headers, _company_a = await _company(client, suffix, "a")
    _b_headers, company_b = await _company(client, suffix, "b")
    async with sessions() as db:
        bb = uuid4()
        db.add(Branch(id=bb, company_id=company_b, name="B branch"))
        await db.flush()
        foreign_hall = Hall(company_id=company_b, branch_id=bb, name="Чужой", is_active=True)
        db.add(foreign_hall)
        await db.commit()
        foreign_hall_id = foreign_hall.id

    resp = await client.get(
        "/reports/tables", headers=a_headers, params={"hall_id": str(foreign_hall_id)}
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_hall_filter_combinations_and_cardinality(reports_api):
    client, sessions = reports_api
    suffix = uuid4().hex[:8]
    headers, company = await _company(client, suffix, "a")
    waiter = await _create_staff(
        client, headers, email=f"waiter-{suffix}@example.com", role_slug="waiter"
    )
    cashier = await _create_staff(
        client, headers, email=f"cashier-{suffix}@example.com", role_slug="cashier"
    )
    async with sessions() as db:
        branch = uuid4()
        db.add(Branch(id=branch, company_id=company, name="Main"))
        db.add(PaymentType(
            company_id=company, scope_kind="company", name="Cash",
            type="cash", sort=10, status=True,
        ))
        await db.flush()
        zal = Hall(company_id=company, branch_id=branch, name="Зал", is_active=True)
        bar = Hall(company_id=company, branch_id=branch, name="Бар", is_active=True)
        db.add_all([zal, bar])
        await db.flush()
        t_zal = Table(hall_id=zal.id, number=5, is_active=True)
        t_bar = Table(hall_id=bar.id, number=9, is_active=True)
        db.add_all([t_zal, t_bar])
        await db.flush()
        o_zal = _completed_order(
            company_id=company, branch_id=branch, order_number="Z-1",
            waiter_id=UUID(waiter["id"]), table_id=t_zal.id, table_number="5",
            subtotal=Decimal("100"), total_amount=Decimal("100"),
        )
        o_bar = _completed_order(
            company_id=company, branch_id=branch, order_number="B-1",
            waiter_id=UUID(waiter["id"]), table_id=t_bar.id, table_number="9",
            subtotal=Decimal("200"), total_amount=Decimal("200"),
        )
        db.add_all([o_zal, o_bar])
        await db.flush()
        # Two payments on the same order — must NOT double its revenue/count.
        db.add_all([
            Payment(company_id=company, order_id=o_zal.id, amount=Decimal("50"),
                    method="cash", status="completed", cashier_id=UUID(cashier["id"])),
            Payment(company_id=company, order_id=o_zal.id, amount=Decimal("50"),
                    method="cash", status="completed", cashier_id=UUID(cashier["id"])),
        ])
        await db.commit()
        zal_id, bar_id, t_zal_id, t_bar_id = zal.id, bar.id, t_zal.id, t_bar.id

    # hall + waiter — cardinality: 2 payments do not inflate revenue/count.
    rows = await _table_rows(client, headers, hall_id=str(zal_id), waiter_id=waiter["id"])
    assert len(rows) == 1
    assert rows[0]["table_id"] == str(t_zal_id)
    assert rows[0]["orders_count"] == 1
    assert rows[0]["revenue"] == "100.00"

    # hall + cashier
    rows = await _table_rows(client, headers, hall_id=str(zal_id), cashier_id=cashier["id"])
    assert len(rows) == 1 and rows[0]["orders_count"] == 1 and rows[0]["revenue"] == "100.00"

    # hall + payment_method
    rows = await _table_rows(client, headers, hall_id=str(zal_id), payment_method="cash")
    assert len(rows) == 1 and rows[0]["revenue"] == "100.00"

    # hall + table_number — "5 in Зал" matches; "9" is not in Зал.
    rows = await _table_rows(client, headers, hall_id=str(zal_id), table_number="5")
    assert len(rows) == 1 and rows[0]["table_id"] == str(t_zal_id)
    assert await _table_rows(client, headers, hall_id=str(zal_id), table_number="9") == []

    # Other hall isolates its own table.
    rows = await _table_rows(client, headers, hall_id=str(bar_id), waiter_id=waiter["id"])
    assert len(rows) == 1 and rows[0]["table_id"] == str(t_bar_id) and rows[0]["revenue"] == "200.00"
