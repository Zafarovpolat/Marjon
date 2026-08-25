from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.modules.admin_reports.service import AdminReportService
from app.modules.companies.models import Branch
from app.modules.finance.models import PaymentType
from app.modules.inventory.models import Product
from app.modules.payments.models import Payment
from app.modules.pos.models import Order, OrderItem
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
async def test_orders_report_maps_supported_read_only_filters(client, monkeypatch):
    headers, _ = await register_company(
        client,
        slug="order-filters",
        email="order-filters@example.com",
    )
    ids = {name: uuid4() for name in ("waiter", "cashier", "product")}
    captured = {}

    async def fake_report(self, company_id, date_from, date_to, **filters):
        captured.update(
            {"company_id": company_id, "date_from": date_from, "date_to": date_to, **filters}
        )
        return []

    monkeypatch.setattr(AdminReportService, "orders_report", fake_report)
    response = await client.get(
        "/reports/orders",
        headers=headers,
        params={
            "date_from": "2026-08-01",
            "date_to": "2026-08-25",
            "order_number": "A-42",
            "waiter_id": str(ids["waiter"]),
            "cashier_id": str(ids["cashier"]),
            "product_id": str(ids["product"]),
            "order_type": "dine_in",
            "order_status": "completed",
            "payment_method": "cash",
        },
    )

    assert response.status_code == 200, response.text
    assert captured["order_number"] == "A-42"
    assert captured["waiter_id"] == ids["waiter"]
    assert captured["cashier_id"] == ids["cashier"]
    assert captured["product_id"] == ids["product"]
    assert captured["order_type"] == "dine_in"
    assert captured["order_status"] == "completed"
    assert captured["payment_method"] == "cash"


@pytest.mark.asyncio
async def test_orders_filters_are_tenant_safe_and_do_not_duplicate_orders(reports_api):
    client, sessions = reports_api
    suffix = uuid4().hex[:8]
    a_headers, _ = await register_company(
        client,
        slug=f"orders-a-{suffix}",
        email=f"orders-a-{suffix}@example.com",
    )
    b_headers, _ = await register_company(
        client,
        slug=f"orders-b-{suffix}",
        email=f"orders-b-{suffix}@example.com",
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

    ids = {
        name: uuid4()
        for name in (
            "branch_a",
            "branch_b",
            "product_a",
            "product_other",
            "product_b",
            "order_target",
            "order_other",
            "order_malformed",
            "order_b",
        )
    }
    async with sessions() as db:
        db.add_all(
            [
                Branch(id=ids["branch_a"], company_id=company_a, name="Branch A"),
                Branch(id=ids["branch_b"], company_id=company_b, name="Branch B"),
                Product(
                    id=ids["product_a"], company_id=company_a, name="Target Dish",
                    price=Decimal("100"), is_active=True, is_available=True,
                ),
                Product(
                    id=ids["product_other"], company_id=company_a, name="Other Dish",
                    price=Decimal("50"), is_active=True, is_available=True,
                ),
                Product(
                    id=ids["product_b"], company_id=company_b, name="Foreign Secret Dish",
                    price=Decimal("900"), is_active=True, is_available=True,
                ),
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
            ]
        )
        await db.commit()

    metadata = await client.get("/reports/orders/filters", headers=a_headers)
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
    assert options["products"] == [
        {"value": str(ids["product_other"]), "label": "Other Dish"},
        {"value": str(ids["product_a"]), "label": "Target Dish"},
    ]
    assert [row["value"] for row in options["order_types"]] == [
        "dine_in", "takeaway", "delivery", "qr",
    ]
    assert [row["value"] for row in options["order_statuses"]] == [
        "new", "accepted", "cooking", "ready", "completed",
    ]
    assert options["payment_methods"] == [
        {"value": "cash", "label": "Tenant Cash"},
        {"value": "card", "label": "System Card"},
    ]
    assert waiter_b["id"] not in metadata.text
    assert cashier_b["id"] not in metadata.text
    assert "Foreign Secret" not in metadata.text

    async with sessions() as db:
        db.add_all(
            [
                Order(
                    id=ids["order_target"], company_id=company_a, branch_id=ids["branch_a"],
                    waiter_id=UUID(waiter_a["id"]), order_number="TARGET-42",
                    order_type="dine_in", status="completed",
                    subtotal=Decimal("200"), total_amount=Decimal("200"),
                ),
                Order(
                    id=ids["order_other"], company_id=company_a, branch_id=ids["branch_a"],
                    waiter_id=UUID(waiter_other["id"]), order_number="OTHER-7",
                    order_type="takeaway", status="ready",
                    subtotal=Decimal("50"), total_amount=Decimal("50"),
                ),
                Order(
                    id=ids["order_malformed"], company_id=company_a, branch_id=ids["branch_a"],
                    waiter_id=UUID(waiter_other["id"]), order_number="MALFORMED",
                    order_type="delivery", status="completed",
                    subtotal=Decimal("900"), total_amount=Decimal("900"),
                ),
                Order(
                    id=ids["order_b"], company_id=company_b, branch_id=ids["branch_b"],
                    waiter_id=UUID(waiter_b["id"]), order_number="FOREIGN-SECRET",
                    order_type="dine_in", status="completed",
                    subtotal=Decimal("900"), total_amount=Decimal("900"),
                ),
            ]
        )
        await db.flush()
        db.add_all(
            [
                OrderItem(
                    order_id=ids["order_target"], product_id=ids["product_a"],
                    name="Target Dish", price=Decimal("100"), quantity=Decimal("1"),
                    total=Decimal("100"),
                ),
                OrderItem(
                    order_id=ids["order_target"], product_id=ids["product_other"],
                    name="Second Dish", price=Decimal("100"), quantity=Decimal("1"),
                    total=Decimal("100"),
                ),
                OrderItem(
                    order_id=ids["order_other"], product_id=ids["product_other"],
                    name="Other Dish", price=Decimal("50"), quantity=Decimal("1"),
                    total=Decimal("50"),
                ),
                OrderItem(
                    order_id=ids["order_malformed"], product_id=ids["product_b"],
                    name="Malformed Foreign Dish", price=Decimal("900"), quantity=Decimal("1"),
                    total=Decimal("900"),
                ),
                OrderItem(
                    order_id=ids["order_b"], product_id=ids["product_b"],
                    name="Foreign Secret Dish", price=Decimal("900"), quantity=Decimal("1"),
                    total=Decimal("900"),
                ),
                Payment(
                    company_id=company_a, order_id=ids["order_target"],
                    amount=Decimal("100"), method="cash", status="completed",
                    cashier_id=UUID(cashier_a["id"]),
                ),
                Payment(
                    company_id=company_a, order_id=ids["order_target"],
                    amount=Decimal("100"), method="cash", status="completed",
                    cashier_id=UUID(cashier_a["id"]),
                ),
                Payment(
                    company_id=company_a, order_id=ids["order_other"],
                    amount=Decimal("50"), method="card", status="completed",
                    cashier_id=UUID(cashier_other["id"]),
                ),
                Payment(
                    company_id=company_b, order_id=ids["order_b"],
                    amount=Decimal("900"), method="cash", status="completed",
                    cashier_id=UUID(cashier_b["id"]),
                ),
            ]
        )
        await db.commit()

    async def order_numbers(**params):
        response = await client.get("/reports/orders", headers=a_headers, params=params)
        assert response.status_code == 200, response.text
        return response.json()

    unfiltered = await order_numbers()
    assert [row["order_number"] for row in unfiltered].count("TARGET-42") == 1
    assert {row["order_number"] for row in unfiltered} == {
        "TARGET-42", "OTHER-7", "MALFORMED",
    }
    assert next(row for row in unfiltered if row["order_number"] == "TARGET-42")["items_count"] == 2
    assert [row["order_number"] for row in await order_numbers(order_number="TARGET")] == ["TARGET-42"]
    assert [row["order_number"] for row in await order_numbers(waiter_id=waiter_a["id"])] == ["TARGET-42"]
    assert [row["order_number"] for row in await order_numbers(cashier_id=cashier_a["id"])] == ["TARGET-42"]
    assert [row["order_number"] for row in await order_numbers(product_id=str(ids["product_a"]))] == ["TARGET-42"]
    assert [row["order_number"] for row in await order_numbers(order_type="takeaway")] == ["OTHER-7"]
    assert [row["order_number"] for row in await order_numbers(order_status="ready")] == ["OTHER-7"]
    assert [row["order_number"] for row in await order_numbers(payment_method="cash")] == ["TARGET-42"]
    assert await order_numbers(product_id=str(ids["product_b"])) == []
    assert await order_numbers(waiter_id=waiter_b["id"]) == []
    assert await order_numbers(cashier_id=cashier_b["id"]) == []
