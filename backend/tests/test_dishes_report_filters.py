from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.admin_reports.schemas import DishReportFiltersResponse, ReportFilterOption
from app.modules.admin_reports.service import AdminReportService
from app.modules.auth.models import User
from app.modules.companies.models import Branch
from app.modules.finance.models import PaymentType
from app.modules.inventory.models import Category, Product
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
async def test_dishes_report_maps_supported_read_only_filters(client, monkeypatch):
    headers, _ = await register_company(client, slug="dish-filters", email="dish-filters@example.com")
    ids = {name: uuid4() for name in ("author", "product", "category")}
    captured = {}

    async def fake_report(self, company_id, date_from, date_to, **filters):
        captured.update({"company_id": company_id, "date_from": date_from, "date_to": date_to, **filters})
        return []

    monkeypatch.setattr(AdminReportService, "dishes_report", fake_report)
    response = await client.get(
        "/reports/dishes",
        headers=headers,
        params={
            "date_from": "2026-08-01",
            "date_to": "2026-08-25",
            "query": "Плов",
            "author_id": str(ids["author"]),
            "product_id": str(ids["product"]),
            "order_type": "dine_in",
            "order_status": "completed",
            "category_id": str(ids["category"]),
            "payment_method": "cash",
        },
    )

    assert response.status_code == 200
    assert captured["search"] == "Плов"
    assert captured["author_id"] == ids["author"]
    assert captured["product_id"] == ids["product"]
    assert captured["order_type"] == "dine_in"
    assert captured["order_status"] == "completed"
    assert captured["category_id"] == ids["category"]
    assert captured["payment_method"] == "cash"


@pytest.mark.asyncio
async def test_dishes_filter_metadata_reports_unsupported_cook_dimension(client, monkeypatch):
    headers, _ = await register_company(client, slug="dish-options", email="dish-options@example.com")

    async def fake_filters(self, company_id):
        return DishReportFiltersResponse(
            authors=[ReportFilterOption(value=str(uuid4()), label="Автор")],
            cooks=[],
            products=[],
            categories=[],
            order_types=[ReportFilterOption(value="dine_in", label="На месте")],
            order_statuses=[ReportFilterOption(value="completed", label="Завершён")],
            payment_methods=[ReportFilterOption(value="cash", label="Наличные")],
            cook_filter_supported=False,
        )

    monkeypatch.setattr(AdminReportService, "dishes_report_filters", fake_filters)
    response = await client.get("/reports/dishes/filters", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["cook_filter_supported"] is False
    assert payload["cooks"] == []
    assert payload["order_types"] == [{"value": "dine_in", "label": "На месте"}]


@pytest.mark.asyncio
async def test_dishes_filters_preserve_tenant_scope_and_payment_aggregation(client, db_engine):
    suffix = uuid4().hex[:8]
    a_email = f"dish-a-{suffix}@example.com"
    b_email = f"dish-b-{suffix}@example.com"
    a_headers, _ = await register_company(client, slug=f"dish-a-{suffix}", email=a_email)
    b_headers, _ = await register_company(client, slug=f"dish-b-{suffix}", email=b_email)
    a_identity = (await client.get("/auth/me", headers=a_headers)).json()
    b_identity = (await client.get("/auth/me", headers=b_headers)).json()
    company_a = UUID(a_identity["company_id"])
    company_b = UUID(b_identity["company_id"])
    waiter_a_email = f"dish-waiter-a-{suffix}@example.com"
    waiter_b_email = f"dish-waiter-b-{suffix}@example.com"
    user_a = UUID((await _create_staff(
        client, a_headers, email=waiter_a_email, role_slug="waiter"
    ))["id"])
    user_b = UUID((await _create_staff(
        client, b_headers, email=waiter_b_email, role_slug="waiter"
    ))["id"])

    ids = {name: uuid4() for name in (
        "branch_a", "branch_b", "category_a", "category_b",
        "product_a", "product_a_other", "product_b",
        "order_a", "order_a_other", "order_a_foreign_product", "order_b",
    )}
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        db.add_all([
            Branch(id=ids["branch_a"], company_id=company_a, name="Branch A"),
            Branch(id=ids["branch_b"], company_id=company_b, name="Branch B Secret"),
            Category(
                id=ids["category_a"], company_id=company_a,
                name="Category A", slug=f"category-a-{suffix}",
            ),
            Category(
                id=ids["category_b"], company_id=company_b,
                name="Category B Secret", slug=f"category-b-{suffix}",
            ),
        ])
        await db.flush()
        db.add_all([
            Product(
                id=ids["product_a"], company_id=company_a,
                category_id=ids["category_a"], name="Plov A",
                price=Decimal("100"), cost_price=Decimal("40"),
            ),
            Product(
                id=ids["product_a_other"], company_id=company_a,
                category_id=ids["category_a"], name="Soup A",
                price=Decimal("50"), cost_price=Decimal("20"),
            ),
            Product(
                id=ids["product_b"], company_id=company_b,
                category_id=ids["category_b"], name="Company B Secret",
                price=Decimal("900"), cost_price=Decimal("10"),
            ),
        ])
        await db.flush()
        db.add_all([
            Order(
                id=ids["order_a"], company_id=company_a, branch_id=ids["branch_a"],
                waiter_id=user_a, order_number="A-FILTERED", order_type="dine_in",
                status="completed", subtotal=Decimal("200"), total_amount=Decimal("200"),
            ),
            Order(
                id=ids["order_a_other"], company_id=company_a, branch_id=ids["branch_a"],
                waiter_id=user_a, order_number="A-OTHER", order_type="takeaway",
                status="completed", subtotal=Decimal("50"), total_amount=Decimal("50"),
            ),
            Order(
                id=ids["order_a_foreign_product"], company_id=company_a,
                branch_id=ids["branch_a"], waiter_id=user_b,
                order_number="A-FOREIGN-PRODUCT", order_type="dine_in",
                status="completed", subtotal=Decimal("700"), total_amount=Decimal("700"),
            ),
            Order(
                id=ids["order_b"], company_id=company_b, branch_id=ids["branch_b"],
                waiter_id=user_b, order_number="B-SECRET", order_type="delivery",
                status="completed", subtotal=Decimal("900"), total_amount=Decimal("900"),
            ),
        ])
        await db.flush()
        db.add_all([
            OrderItem(
                order_id=ids["order_a"], product_id=ids["product_a"], name="Plov A",
                price=Decimal("100"), quantity=Decimal("2"), total=Decimal("200"),
            ),
            OrderItem(
                order_id=ids["order_a_other"], product_id=ids["product_a_other"], name="Soup A",
                price=Decimal("50"), quantity=Decimal("1"), total=Decimal("50"),
            ),
            OrderItem(
                order_id=ids["order_a_foreign_product"], product_id=ids["product_b"],
                name="Company B Secret via malformed relation",
                price=Decimal("700"), quantity=Decimal("1"), total=Decimal("700"),
            ),
            OrderItem(
                order_id=ids["order_b"], product_id=ids["product_b"], name="Company B Secret",
                price=Decimal("900"), quantity=Decimal("1"), total=Decimal("900"),
            ),
            Payment(
                company_id=company_a, order_id=ids["order_a"],
                amount=Decimal("100"), method="cash", status="completed",
            ),
            Payment(
                company_id=company_a, order_id=ids["order_a"],
                amount=Decimal("100"), method="cash", status="completed",
            ),
            Payment(
                company_id=company_a, order_id=ids["order_a_other"],
                amount=Decimal("50"), method="card", status="completed",
            ),
            Payment(
                company_id=company_b, order_id=ids["order_b"],
                amount=Decimal("900"), method="payme", status="completed",
            ),
            PaymentType(
                company_id=company_a, scope_kind="company",
                name="Cash A", type="cash", sort=10, status=True,
            ),
            PaymentType(
                company_id=company_a, scope_kind="company",
                name="Card A", type="card", sort=20, status=True,
            ),
            PaymentType(
                company_id=company_b, scope_kind="company",
                name="Company B Payment Secret", type="payme", sort=10, status=True,
            ),
        ])
        await db.commit()

    unfiltered = await client.get("/reports/dishes", headers=a_headers)
    assert unfiltered.status_code == 200, unfiltered.text
    assert {row["product_id"] for row in unfiltered.json()} == {
        str(ids["product_a"]), str(ids["product_a_other"]),
    }
    assert "Company B Secret" not in unfiltered.text

    filtered = await client.get(
        "/reports/dishes",
        headers=a_headers,
        params={
            "query": "Plov",
            "author_id": str(user_a),
            "product_id": str(ids["product_a"]),
            "order_type": "dine_in",
            "order_status": "completed",
            "category_id": str(ids["category_a"]),
            "payment_method": "cash",
        },
    )
    assert filtered.status_code == 200, filtered.text
    assert len(filtered.json()) == 1
    assert Decimal(filtered.json()[0]["quantity"]) == Decimal("2")
    assert Decimal(filtered.json()[0]["amount"]) == Decimal("200")

    foreign_product = await client.get(
        "/reports/dishes",
        headers=a_headers,
        params={"product_id": str(ids["product_b"])},
    )
    assert foreign_product.status_code == 200
    assert foreign_product.json() == []

    metadata = await client.get("/reports/dishes/filters", headers=a_headers)
    assert metadata.status_code == 200, metadata.text
    options = metadata.json()
    assert options["cook_filter_supported"] is False
    assert options["cooks"] == []
    assert {row["value"] for row in options["products"]} == {
        str(ids["product_a"]), str(ids["product_a_other"]),
    }
    assert {row["value"] for row in options["categories"]} == {str(ids["category_a"])}
    assert {row["value"] for row in options["authors"]} == {str(user_a)}
    assert {row["value"] for row in options["payment_methods"]} == {"cash", "card"}
    assert "Company B Secret" not in metadata.text
    assert b_email not in metadata.text
    assert waiter_b_email not in metadata.text


async def _assert_reference_metadata_is_available_without_history(client, sessions):
    suffix = uuid4().hex[:8]
    a_headers, _ = await register_company(
        client,
        slug=f"reference-meta-a-{suffix}",
        email=f"reference-meta-owner-a-{suffix}@example.com",
    )
    b_headers, _ = await register_company(
        client,
        slug=f"reference-meta-b-{suffix}",
        email=f"reference-meta-owner-b-{suffix}@example.com",
    )
    company_a = UUID((await client.get("/auth/me", headers=a_headers)).json()["company_id"])
    company_b = UUID((await client.get("/auth/me", headers=b_headers)).json()["company_id"])
    ids = {name: uuid4() for name in (
        "category_a", "category_a_inactive", "category_b",
        "product_a", "product_a_unavailable", "product_b",
    )}

    async with sessions() as db:
        db.add_all([
            Category(
                id=ids["category_a"], company_id=company_a,
                name="Zero History Category A", slug=f"zero-history-a-{suffix}",
                is_active=True,
            ),
            Category(
                id=ids["category_a_inactive"], company_id=company_a,
                name="Inactive Category A", slug=f"inactive-a-{suffix}",
                is_active=False,
            ),
            Category(
                id=ids["category_b"], company_id=company_b,
                name="Foreign Category Secret", slug=f"foreign-b-{suffix}",
                is_active=True,
            ),
        ])
        await db.flush()
        db.add_all([
            Product(
                id=ids["product_a"], company_id=company_a,
                category_id=ids["category_a"], name="Zero History Product A",
                price=Decimal("100"), is_active=True, is_available=True,
            ),
            Product(
                id=ids["product_a_unavailable"], company_id=company_a,
                category_id=ids["category_a"], name="Unavailable Product A",
                price=Decimal("100"), is_active=True, is_available=False,
            ),
            Product(
                id=ids["product_b"], company_id=company_b,
                category_id=ids["category_b"], name="Foreign Product Secret",
                price=Decimal("100"), is_active=True, is_available=True,
            ),
            PaymentType(
                company_id=company_a, scope_kind="company",
                name="Tenant Cash", type="cash", sort=10, status=True,
            ),
            PaymentType(
                company_id=company_a, scope_kind="company",
                name="Inactive Payment", type="inactive", sort=20, status=False,
            ),
            PaymentType(
                company_id=company_b, scope_kind="company",
                name="Foreign Payment Secret", type="foreign", sort=10, status=True,
            ),
            PaymentType(
                scope_kind="system",
                name="System Card", type="card", sort=20, status=True,
            ),
        ])
        await db.commit()

    metadata = await client.get("/reports/dishes/filters", headers=a_headers)
    assert metadata.status_code == 200, metadata.text
    options = metadata.json()
    assert options["products"] == [
        {"value": str(ids["product_a"]), "label": "Zero History Product A"}
    ]
    assert options["categories"] == [
        {"value": str(ids["category_a"]), "label": "Zero History Category A"}
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
    assert options["cooks"] == []
    assert options["cook_filter_supported"] is False
    assert "Inactive Category A" not in metadata.text
    assert "Unavailable Product A" not in metadata.text
    assert "Inactive Payment" not in metadata.text
    assert "Foreign Category Secret" not in metadata.text
    assert "Foreign Product Secret" not in metadata.text
    assert "Foreign Payment Secret" not in metadata.text


@pytest.mark.asyncio
async def test_reference_metadata_is_available_without_history(client, db_engine):
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    await _assert_reference_metadata_is_available_without_history(client, sessions)


@pytest.mark.asyncio
async def test_reference_metadata_is_available_without_history_postgres(reports_api):
    client, sessions = reports_api
    await _assert_reference_metadata_is_available_without_history(client, sessions)


async def _assert_waiter_metadata_uses_current_company_roles(client, sessions):
    suffix = uuid4().hex[:8]
    a_headers, _ = await register_company(
        client,
        slug=f"waiter-meta-a-{suffix}",
        email=f"waiter-meta-owner-a-{suffix}@example.com",
    )
    b_headers, _ = await register_company(
        client,
        slug=f"waiter-meta-b-{suffix}",
        email=f"waiter-meta-owner-b-{suffix}@example.com",
    )
    a_identity = (await client.get("/auth/me", headers=a_headers)).json()
    company_a = UUID(a_identity["company_id"])

    waiter_a_email = f"zero-order-waiter-a-{suffix}@example.com"
    cashier_a_email = f"cashier-only-a-{suffix}@example.com"
    waiter_b_email = f"foreign-waiter-b-{suffix}@example.com"
    waiter_a = await _create_staff(
        client, a_headers, email=waiter_a_email, role_slug="waiter"
    )
    cashier_a = await _create_staff(
        client, a_headers, email=cashier_a_email, role_slug="cashier"
    )
    waiter_b = await _create_staff(
        client, b_headers, email=waiter_b_email, role_slug="waiter"
    )

    metadata_before_orders = await client.get(
        "/reports/dishes/filters", headers=a_headers
    )
    assert metadata_before_orders.status_code == 200, metadata_before_orders.text
    authors = metadata_before_orders.json()["authors"]
    assert authors == [{"value": waiter_a["id"], "label": waiter_a_email}]
    assert cashier_a["id"] not in metadata_before_orders.text
    assert cashier_a_email not in metadata_before_orders.text
    assert waiter_b["id"] not in metadata_before_orders.text
    assert waiter_b_email not in metadata_before_orders.text

    ids = {name: uuid4() for name in ("branch", "category", "product", "order")}
    async with sessions() as db:
        db.add_all([
            Branch(id=ids["branch"], company_id=company_a, name="Waiter Metadata Branch"),
            Category(
                id=ids["category"], company_id=company_a,
                name="Waiter Metadata Category", slug=f"waiter-meta-{suffix}",
            ),
        ])
        await db.flush()
        db.add(Product(
            id=ids["product"], company_id=company_a,
            category_id=ids["category"], name="Waiter Metadata Dish",
            price=Decimal("75"), cost_price=Decimal("25"),
        ))
        await db.flush()
        db.add(Order(
            id=ids["order"], company_id=company_a, branch_id=ids["branch"],
            waiter_id=UUID(waiter_a["id"]), order_number="WAITER-METADATA",
            order_type="dine_in", status="completed",
            subtotal=Decimal("75"), total_amount=Decimal("75"),
        ))
        await db.flush()
        db.add(OrderItem(
            order_id=ids["order"], product_id=ids["product"],
            name="Waiter Metadata Dish", price=Decimal("75"),
            quantity=Decimal("1"), total=Decimal("75"),
        ))
        await db.commit()

    filtered = await client.get(
        "/reports/dishes",
        headers=a_headers,
        params={"author_id": waiter_a["id"]},
    )
    assert filtered.status_code == 200, filtered.text
    assert [row["product_id"] for row in filtered.json()] == [str(ids["product"])]


@pytest.mark.asyncio
async def test_waiter_with_zero_orders_is_available_in_dishes_metadata(client, db_engine):
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    await _assert_waiter_metadata_uses_current_company_roles(client, sessions)


@pytest.mark.asyncio
async def test_waiter_with_zero_orders_is_available_in_dishes_metadata_postgres(
    reports_api,
):
    client, sessions = reports_api
    await _assert_waiter_metadata_uses_current_company_roles(client, sessions)


async def _assert_each_supported_dishes_predicate_independently_constrains_results(
    client,
    sessions,
):
    suffix = uuid4().hex[:8]
    headers, _ = await register_company(
        client,
        slug=f"predicate-{suffix}",
        email=f"predicate-owner-{suffix}@example.com",
    )
    identity = (await client.get("/auth/me", headers=headers)).json()
    company_id = UUID(identity["company_id"])
    owner_id = UUID(identity["id"])
    other_waiter_id = uuid4()
    ids = {name: uuid4() for name in (
        "branch", "target_category", "other_category",
        "target_product", "other_product", "target_order", "other_order",
    )}

    async with sessions() as db:
        db.add_all([
            User(
                id=other_waiter_id,
                company_id=company_id,
                email=f"predicate-waiter-{suffix}@example.com",
                password_hash="unused-in-test",
            ),
            Branch(id=ids["branch"], company_id=company_id, name="Predicate Branch"),
            Category(
                id=ids["target_category"], company_id=company_id,
                name="Target Category", slug=f"target-{suffix}",
            ),
            Category(
                id=ids["other_category"], company_id=company_id,
                name="Other Category", slug=f"other-{suffix}",
            ),
        ])
        await db.flush()
        db.add_all([
            Product(
                id=ids["target_product"], company_id=company_id,
                category_id=ids["target_category"], name="Target Plov",
                price=Decimal("100"), cost_price=Decimal("40"),
            ),
            Product(
                id=ids["other_product"], company_id=company_id,
                category_id=ids["other_category"], name="Other Soup",
                price=Decimal("50"), cost_price=Decimal("20"),
            ),
        ])
        await db.flush()
        db.add_all([
            Order(
                id=ids["target_order"], company_id=company_id, branch_id=ids["branch"],
                waiter_id=owner_id, order_number="PREDICATE-TARGET",
                order_type="dine_in", status="completed",
                subtotal=Decimal("200"), total_amount=Decimal("200"),
            ),
            Order(
                id=ids["other_order"], company_id=company_id, branch_id=ids["branch"],
                waiter_id=other_waiter_id, order_number="PREDICATE-OTHER",
                order_type="takeaway", status="ready",
                subtotal=Decimal("50"), total_amount=Decimal("50"),
            ),
        ])
        await db.flush()
        db.add_all([
            OrderItem(
                order_id=ids["target_order"], product_id=ids["target_product"],
                name="Target Plov", price=Decimal("100"),
                quantity=Decimal("2"), total=Decimal("200"),
            ),
            OrderItem(
                order_id=ids["other_order"], product_id=ids["other_product"],
                name="Other Soup", price=Decimal("50"),
                quantity=Decimal("1"), total=Decimal("50"),
            ),
            Payment(
                company_id=company_id, order_id=ids["target_order"],
                amount=Decimal("100"), method="cash", status="completed",
            ),
            Payment(
                company_id=company_id, order_id=ids["target_order"],
                amount=Decimal("100"), method="cash", status="completed",
            ),
            Payment(
                company_id=company_id, order_id=ids["other_order"],
                amount=Decimal("50"), method="card", status="completed",
            ),
        ])
        await db.commit()

    baseline = await client.get("/reports/dishes", headers=headers)
    assert baseline.status_code == 200, baseline.text
    assert {row["product_id"] for row in baseline.json()} == {
        str(ids["target_product"]), str(ids["other_product"]),
    }

    cases = (
        ("query", "Target"),
        ("author_id", str(owner_id)),
        ("product_id", str(ids["target_product"])),
        ("order_type", "dine_in"),
        ("order_status", "completed"),
        ("category_id", str(ids["target_category"])),
        ("payment_method", "cash"),
    )
    for parameter, value in cases:
        response = await client.get(
            "/reports/dishes",
            headers=headers,
            params={parameter: value},
        )
        assert response.status_code == 200, (parameter, response.text)
        assert [row["product_id"] for row in response.json()] == [
            str(ids["target_product"])
        ], parameter
        if parameter == "payment_method":
            assert Decimal(response.json()[0]["quantity"]) == Decimal("2")
            assert Decimal(response.json()[0]["amount"]) == Decimal("200")


@pytest.mark.asyncio
async def test_each_supported_dishes_predicate_independently_constrains_results(client, db_engine):
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    await _assert_each_supported_dishes_predicate_independently_constrains_results(
        client,
        sessions,
    )


@pytest.mark.asyncio
async def test_each_supported_dishes_predicate_independently_constrains_results_postgres(
    reports_api,
):
    client, sessions = reports_api
    await _assert_each_supported_dishes_predicate_independently_constrains_results(
        client,
        sessions,
    )
