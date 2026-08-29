from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.modules.admin_reports.service import AdminReportService
from app.modules.companies.models import Branch
from app.modules.finance.models import PaymentType
from app.modules.payments.models import Payment
from app.modules.pos.models import Order
from tests.conftest import register_company
from tests.test_reports_tenant_scope_postgres import reports_api, reports_database_url


async def _create_staff(client, owner_headers, *, email: str, role_slug: str):
    response = await client.post(
        "/auth/users",
        headers=owner_headers,
        json={"email": email, "password": "Passw0rd!", "role_slug": role_slug},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_tables_report_maps_supported_read_only_filters(client, monkeypatch):
    headers, _ = await register_company(
        client,
        slug="table-filters",
        email="table-filters@example.com",
    )
    waiter_id = uuid4()
    cashier_id = uuid4()
    captured = {}

    async def fake_report(self, company_id, date_from, date_to, **filters):
        captured.update(
            {"company_id": company_id, "date_from": date_from, "date_to": date_to, **filters}
        )
        return []

    monkeypatch.setattr(AdminReportService, "tables_report", fake_report)
    response = await client.get(
        "/reports/tables",
        headers=headers,
        params={
            "date_from": "2026-08-01",
            "date_to": "2026-08-25",
            "table_number": "12A",
            "waiter_id": str(waiter_id),
            "payment_method": "cash",
            "cashier_id": str(cashier_id),
        },
    )

    assert response.status_code == 200, response.text
    assert captured["table_number"] == "12A"
    assert captured["waiter_id"] == waiter_id
    assert captured["payment_method"] == "cash"
    assert captured["cashier_id"] == cashier_id


@pytest.mark.asyncio
async def test_tables_report_zero_orders_returns_empty_http_response(reports_api):
    client, sessions = reports_api
    suffix = uuid4().hex[:8]
    owner_headers, _ = await register_company(
        client,
        slug=f"tables-zero-{suffix}",
        email=f"tables-zero-{suffix}@example.com",
    )
    profile = await client.get("/auth/me", headers=owner_headers)
    assert profile.status_code == 200, profile.text
    company_id = UUID(profile.json()["company_id"])

    async with sessions() as db:
        order_count = await db.scalar(
            select(func.count()).select_from(Order).where(Order.company_id == company_id)
        )
    assert order_count == 0

    response = await client.get(
        "/reports/tables",
        headers=owner_headers,
        params={"date_from": "2026-08-01", "date_to": "2026-08-25"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == []


@pytest.mark.asyncio
async def test_tables_filters_are_tenant_safe_zero_history_and_do_not_multiply_rows(reports_api):
    client, sessions = reports_api
    suffix = uuid4().hex[:8]
    a_headers, _ = await register_company(
        client,
        slug=f"tables-a-{suffix}",
        email=f"tables-a-{suffix}@example.com",
    )
    b_headers, _ = await register_company(
        client,
        slug=f"tables-b-{suffix}",
        email=f"tables-b-{suffix}@example.com",
    )
    company_a = UUID((await client.get("/auth/me", headers=a_headers)).json()["company_id"])
    company_b = UUID((await client.get("/auth/me", headers=b_headers)).json()["company_id"])

    waiter_a = await _create_staff(
        client, a_headers, email=f"waiter-a-{suffix}@example.com", role_slug="waiter"
    )
    waiter_other = await _create_staff(
        client, a_headers, email=f"waiter-other-{suffix}@example.com", role_slug="waiter"
    )
    cashier_a = await _create_staff(
        client, a_headers, email=f"cashier-a-{suffix}@example.com", role_slug="cashier"
    )
    cashier_other = await _create_staff(
        client, a_headers, email=f"cashier-other-{suffix}@example.com", role_slug="cashier"
    )
    waiter_b = await _create_staff(
        client, b_headers, email=f"waiter-b-{suffix}@example.com", role_slug="waiter"
    )
    cashier_b = await _create_staff(
        client, b_headers, email=f"cashier-b-{suffix}@example.com", role_slug="cashier"
    )

    ids = {name: uuid4() for name in (
        "branch_a", "branch_b", "order_target", "order_same_table", "order_other", "order_b",
    )}
    async with sessions() as db:
        db.add_all([
            Branch(id=ids["branch_a"], company_id=company_a, name="Branch A"),
            Branch(id=ids["branch_b"], company_id=company_b, name="Branch B"),
            PaymentType(
                company_id=company_a, scope_kind="company", name="Tenant Cash",
                type="cash", sort=10, status=True,
            ),
            PaymentType(
                company_id=company_b, scope_kind="company", name="Foreign Secret Pay",
                type="foreign", sort=10, status=True,
            ),
            PaymentType(
                scope_kind="system", name="System Card", type="card", sort=20, status=True,
            ),
        ])
        await db.commit()

    metadata = await client.get("/reports/tables/filters", headers=a_headers)
    assert metadata.status_code == 200, metadata.text
    options = metadata.json()
    assert options["waiters"] == [
        {"value": waiter_a["id"], "label": waiter_a["email"]},
        {"value": waiter_other["id"], "label": waiter_other["email"]},
    ]
    assert options["cashiers"] == [
        {"value": cashier_a["id"], "label": cashier_a["email"]},
        {"value": cashier_other["id"], "label": cashier_other["email"]},
    ]
    assert options["payment_methods"] == [
        {"value": "cash", "label": "Tenant Cash"},
        {"value": "card", "label": "System Card"},
    ]
    assert options["places"] == []
    assert options["place_filter_supported"] is True
    assert waiter_b["id"] not in metadata.text
    assert cashier_b["id"] not in metadata.text
    assert "Foreign Secret" not in metadata.text

    async with sessions() as db:
        db.add_all([
            Order(
                id=ids["order_target"], company_id=company_a, branch_id=ids["branch_a"],
                waiter_id=UUID(waiter_a["id"]), order_number="TARGET-1",
                order_type="dine_in", status="completed", table_number="12A",
                subtotal=Decimal("200"), total_amount=Decimal("200"),
            ),
            Order(
                id=ids["order_same_table"], company_id=company_a, branch_id=ids["branch_a"],
                waiter_id=UUID(waiter_other["id"]), order_number="TARGET-2",
                order_type="dine_in", status="completed", table_number="12A",
                subtotal=Decimal("50"), total_amount=Decimal("50"),
            ),
            Order(
                id=ids["order_other"], company_id=company_a, branch_id=ids["branch_a"],
                waiter_id=UUID(waiter_other["id"]), order_number="OTHER-1",
                order_type="dine_in", status="completed", table_number="7",
                subtotal=Decimal("75"), total_amount=Decimal("75"),
            ),
            Order(
                id=ids["order_b"], company_id=company_b, branch_id=ids["branch_b"],
                waiter_id=UUID(waiter_b["id"]), order_number="FOREIGN-1",
                order_type="dine_in", status="completed", table_number="12A",
                subtotal=Decimal("900"), total_amount=Decimal("900"),
            ),
        ])
        await db.flush()
        db.add_all([
            Payment(
                company_id=company_a, order_id=ids["order_target"], amount=Decimal("100"),
                method="cash", status="completed", cashier_id=UUID(cashier_a["id"]),
            ),
            Payment(
                company_id=company_a, order_id=ids["order_target"], amount=Decimal("100"),
                method="cash", status="completed", cashier_id=UUID(cashier_a["id"]),
            ),
            Payment(
                company_id=company_a, order_id=ids["order_same_table"], amount=Decimal("50"),
                method="card", status="completed", cashier_id=UUID(cashier_other["id"]),
            ),
            Payment(
                company_id=company_b, order_id=ids["order_b"], amount=Decimal("900"),
                method="cash", status="completed", cashier_id=UUID(cashier_b["id"]),
            ),
        ])
        await db.commit()

    async def table_rows(**params):
        response = await client.get("/reports/tables", headers=a_headers, params=params)
        assert response.status_code == 200, response.text
        return response.json()

    unfiltered = await table_rows()
    # Legacy orders (table_number only, no canonical table_id) → canonical identity
    # fields are null but present (additive Phase 2 contract).
    assert unfiltered == [
        {"table_number": "12A", "orders_count": 2, "revenue": "250.00", "avg_check": "125.00",
         "table_id": None, "hall_id": None, "hall_name": None},
        {"table_number": "7", "orders_count": 1, "revenue": "75.00", "avg_check": "75.00",
         "table_id": None, "hall_id": None, "hall_name": None},
    ]
    assert [row["table_number"] for row in await table_rows(table_number="12")] == ["12A"]
    assert (await table_rows(waiter_id=waiter_a["id"]))[0]["orders_count"] == 1
    assert (await table_rows(payment_method="cash"))[0]["orders_count"] == 1
    assert (await table_rows(cashier_id=cashier_a["id"]))[0]["orders_count"] == 1
    assert await table_rows(waiter_id=waiter_b["id"]) == []
    assert await table_rows(cashier_id=cashier_b["id"]) == []
