from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_dashboard_paid_top_outgoing import report_engine, seed, add_order
from app.modules.analytics.owner_financials import allocate_money, owner_financials
from app.modules.inventory.models import Category, Product
from app.modules.pos.models import OrderItem

DAY = date(2026, 10, 17)


async def cost(db, order, unit_cost):
    await db.execute(update(OrderItem).where(OrderItem.order_id == order.id, OrderItem.status != "cancelled")
                     .values(cost_price_snapshot=unit_cost))


@pytest.mark.asyncio
async def test_income_minus_historical_cost_for_same_paid_orders_no_payment_join_duplicates(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        paid = await add_order(db, company, branch, product, payments=(("completed", 100), ("completed", 120)), cancelled=True)
        await cost(db, paid, 20)
        for payments in [(("pending", 220),), (("failed", 220),), (("refunded", 220),), (("completed", 100),)]:
            await add_order(db, company, branch, product, payments=payments)
        await add_order(db, company, branch, product, status="new")
        await add_order(db, company, branch, product, status="cancelled")
        other, ob, op, _, _ = await seed(db)
        await cost(db, await add_order(db, other, ob, op), 1)
        result = await owner_financials(db, company.id, DAY, DAY)
        assert Decimal(result["income_total"]) == 220
        assert Decimal(result["cogs_total"]) == 40
        assert Decimal(result["today_revenue"]) == 180
        assert result["today_orders"] == 1
        assert result["average_check_rows"] == [{"id": "0", "place": "В зале", "orders_count": 1,
                                                  "income": "220.00", "avg_check": "220.00"}]
        assert len(result["order_rows"]) == result["today_orders"]
        assert result["order_rows"][0]["id"] == str(paid.id)
        assert result["order_rows"][0]["status"] == "completed"
        assert result["order_rows"][0]["date_label"] == "15.10 17:00"
        assert sum(Decimal(row["amount"]) for row in result["order_rows"]) == Decimal(result["orders_total"]) == 220
        assert sum(Decimal(row["amount"]) for row in result["payment_methods"]) == 220
        assert len(result["sales"]) == 24
        assert sum(Decimal(row["revenue"]) for row in result["sales"]) == 180
        assert Decimal(result["sales"][17]["income"]) == 220  # 12 UTC = 17:00 Tashkent
        product.cost_price = Decimal("99999")
        await db.flush()
        assert (await owner_financials(db, company.id, DAY, DAY))["cogs_total"] == result["cogs_total"]


@pytest.mark.asyncio
async def test_unknown_historical_cost_does_not_turn_into_zero_or_current_catalog_cost(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        product.cost_price = 25
        await add_order(db, company, branch, product)
        result = await owner_financials(db, company.id, DAY, DAY)
        assert Decimal(result["income_total"]) == 220
        assert result["cogs_total"] is None
        assert result["today_revenue"] is None
        assert result["missing_cost_items"] == 1
        assert result["sales"][17]["revenue"] is None
        assert result["product_rows"][0]["revenue"] is None
        assert result["product_rows"][0]["income"] == "220.00"


@pytest.mark.asyncio
async def test_negative_result_and_explicit_zero_cost_are_valid(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        order = await add_order(db, company, branch, product)
        await cost(db, order, 200)
        assert Decimal((await owner_financials(db, company.id, DAY, DAY))["today_revenue"]) == -180
        await cost(db, order, 0)
        result = await owner_financials(db, company.id, DAY, DAY)
        assert result["missing_cost_items"] == 0
        assert Decimal(result["today_revenue"]) == 220


def test_allocation_conserves_cents_and_is_deterministic():
    assert allocate_money(Decimal("0.01"), [Decimal(1)] * 3) == [Decimal("0.01"), 0, 0]
    assert sum(allocate_money(Decimal("220.01"), [Decimal(1), Decimal(2), Decimal(3)])) == Decimal("220.01")
    assert allocate_money(Decimal("0.02"), [ZERO := Decimal(0), ZERO, ZERO]) == [Decimal("0.01"), Decimal("0.01"), 0]


@pytest.mark.asyncio
async def test_product_detail_reconciles_discounts_additions_split_payments_and_rounding(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        category = Category(company_id=company.id, name="Плов", slug="plov")
        db.add(category); await db.flush()
        product.category_id = category.id
        second = Product(company_id=company.id, name="Салат", price=100)
        db.add(second); await db.flush()
        order = await add_order(db, company, branch, product,
                                payments=(("completed", 100), ("completed", Decimal("120.01"))), cancelled=True)
        await db.execute(update(OrderItem).where(OrderItem.order_id == order.id, OrderItem.status != "cancelled")
                         .values(quantity=Decimal("0.333"), total=100, cost_price_snapshot=1))
        db.add(OrderItem(order_id=order.id, product_id=second.id, name=second.name,
                         price=100, quantity=Decimal("0.333"), total=100,
                         cost_price_snapshot=1, status="served"))
        await db.flush()
        result = await owner_financials(db, company.id, DAY, DAY)
        rows = result["product_rows"]
        assert len(rows) == 2
        assert {r["category"] for r in rows} == {"Плов", "Без категории"}
        assert all(Decimal(r["quantity"]) == Decimal("0.333") for r in rows)
        for key, total in [("income", "income_total"), ("cogs", "cogs_total"), ("revenue", "today_revenue")]:
            assert sum(Decimal(r[key]) for r in rows) == Decimal(result[total])
        assert Decimal(result["cogs_total"]) == Decimal("0.67")
        assert Decimal(result["income_total"]) == Decimal("220.01")
        product.name = "Переименован"
        product.cost_price = 999
        await db.flush()
        assert (await owner_financials(db, company.id, DAY, DAY))["product_rows"] == rows


@pytest.mark.asyncio
async def test_zero_price_positions_and_orders_without_items_do_not_lose_income(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        order = await add_order(db, company, branch, product)
        await db.execute(update(OrderItem).where(OrderItem.order_id == order.id).values(total=0, cost_price_snapshot=0))
        result = await owner_financials(db, company.id, DAY, DAY)
        assert result["product_rows"][0]["income"] == result["income_total"]
        from sqlalchemy import delete
        await db.execute(delete(OrderItem).where(OrderItem.order_id == order.id))
        result = await owner_financials(db, company.id, DAY, DAY)
        assert result["product_rows"][0]["income"] == result["income_total"]
        assert result["product_rows"][0]["revenue"] is None


@pytest.mark.asyncio
async def test_confirmation_dates_full_period_and_local_midnight_boundaries(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        for stamp in [datetime(2026, 10, 16, 19, tzinfo=timezone.utc), datetime(2026, 10, 17, 19, tzinfo=timezone.utc)]:
            await cost(db, await add_order(db, company, branch, product, paid_at=stamp), 20)
        result = await owner_financials(db, company.id, DAY, DAY)
        assert Decimal(result["income_total"]) == 220
        assert Decimal(result["sales"][0]["revenue"]) == 180
        both = await owner_financials(db, company.id, DAY, date(2026, 10, 18))
        assert Decimal(both["income_total"]) == 440
        assert Decimal(both["today_revenue"]) == 360
        assert len(both["sales"]) == 2
        empty = await owner_financials(db, company.id, date(2026, 10, 12), date(2026, 10, 14))
        assert Decimal(empty["today_revenue"]) == 0
        assert empty["missing_cost_items"] == 0
        assert empty["order_rows"] == []
        assert Decimal(empty["orders_total"]) == 0
        assert empty["average_check_rows"] == []
        assert Decimal(empty["avg_check"]) == 0


@pytest.mark.asyncio
async def test_web_1718_order_and_graph_share_tashkent_time_without_double_shift(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        stamp = datetime(2026, 10, 17, 12, 18, 2, tzinfo=timezone.utc)
        order = await add_order(db, company, branch, product, paid_at=stamp)
        order.created_at = stamp
        await cost(db, order, 20)
        await db.flush()
        result = await owner_financials(db, company.id, DAY, DAY)
        assert result["order_rows"][0]["date_label"] == "17.10 17:18"
        nonempty = [row for row in result["sales"] if row["orders_count"]]
        assert len(nonempty) == 1
        assert nonempty[0]["chart_label"] == "17:00"
        assert Decimal(nonempty[0]["income"]) == 220
        assert Decimal(nonempty[0]["revenue"]) == 180
        assert result["sales"][12]["orders_count"] == 0
        assert result["sales"][22]["orders_count"] == 0


@pytest.mark.asyncio
async def test_web_chart_uses_payment_hour_and_payment_local_day_not_creation(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        order = await add_order(db, company, branch, product,
                                paid_at=datetime(2026, 10, 17, 19, 5, tzinfo=timezone.utc))
        order.created_at = datetime(2026, 10, 17, 12, 18, 2, tzinfo=timezone.utc)
        await cost(db, order, 20)
        await db.flush()
        before = await owner_financials(db, company.id, DAY, DAY)
        assert before["today_orders"] == 0
        after = await owner_financials(db, company.id, date(2026, 10, 18), date(2026, 10, 18))
        assert after["today_orders"] == 1
        assert after["order_rows"][0]["date_label"] == "17.10 17:18"
        assert after["sales"][0]["chart_label"] == "00:00"
        assert after["sales"][0]["orders_count"] == 1
        assert sum(row["orders_count"] for row in after["sales"]) == 1


@pytest.mark.asyncio
async def test_average_by_place_uses_weighted_total_and_confirmed_income_not_cost(report_engine):
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        for table, amount in [("2", 100), ("2", 100), ("2", 100), ("5", 200), ("5", 200)]:
            order = await add_order(db, company, branch, product, payments=(("completed", amount),))
            order.total_amount = amount
            order.table_number = table
        await db.flush()
        result = await owner_financials(db, company.id, DAY, DAY)
        rows = {row["place"]: row for row in result["average_check_rows"]}
        assert rows["Стол 2"]["orders_count"] == 3
        assert Decimal(rows["Стол 2"]["income"]) == 300
        assert Decimal(rows["Стол 2"]["avg_check"]) == 100
        assert rows["Стол 5"]["orders_count"] == 2
        assert Decimal(rows["Стол 5"]["avg_check"]) == 200
        assert Decimal(result["avg_check"]) == 140  # NOT (100 + 200) / 2
        assert sum(row["orders_count"] for row in rows.values()) == result["today_orders"] == 5
        assert sum(Decimal(row["income"]) for row in rows.values()) == Decimal(result["income_total"]) == 700
        assert result["cogs_total"] is None  # Unknown COGS does not affect average check.


@pytest.mark.asyncio
async def test_average_places_do_not_merge_other_halls_branches_or_tableless_channels(report_engine):
    from app.modules.companies.models import Branch
    async with AsyncSession(report_engine, expire_on_commit=False) as db:
        company, branch, product, _, _ = await seed(db)
        other_branch = Branch(company_id=company.id, name="Второй филиал")
        db.add(other_branch); await db.flush()
        for selected_branch, hall, table, kind in [(branch, "Зал A", "1", "dine_in"),
                (branch, "Зал B", "1", "dine_in"), (other_branch, "Зал A", "1", "dine_in"),
                (branch, None, None, "takeaway"), (branch, None, None, "delivery")]:
            order = await add_order(db, company, selected_branch, product)
            order.hall_name_snapshot = hall
            order.table_number = table
            order.order_type = kind
        await db.flush()
        result = await owner_financials(db, company.id, DAY, DAY)
        rows = result["average_check_rows"]
        assert len(rows) == 5
        assert len({row["place"] for row in rows}) == 5
        assert any("С собой" in row["place"] for row in rows)
        assert any("Доставка" in row["place"] for row in rows)
        assert sum(row["orders_count"] for row in rows) == result["today_orders"]
        assert sum(Decimal(row["income"]) for row in rows) == Decimal(result["income_total"])


@pytest.mark.asyncio
async def test_owner_financials_api_access_and_range(client):
    from tests.conftest import register_company
    params = {"date_from": "2026-10-12", "date_to": "2026-10-17"}
    path = "/analytics/owner-financials"
    assert (await client.get(path, params=params)).status_code in (401, 403)
    headers, _ = await register_company(client, slug=f"finance-scheme-{uuid4().hex[:8]}", email=f"{uuid4().hex}@test.example")
    response = await client.get(path, params=params, headers=headers)
    assert response.status_code == 200, response.text
    assert Decimal(response.json()["income_total"]) == 0
    assert Decimal(response.json()["today_revenue"]) == 0
    invalid = await client.get(path, params={"date_from": "2026-10-18", "date_to": "2026-10-17"}, headers=headers)
    assert invalid.status_code == 422
