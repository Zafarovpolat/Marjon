from decimal import Decimal
from unittest.mock import patch
from uuid import UUID

from app.modules.admin_reports.item_attribution import allocate_amount
from app.modules.admin_reports.service import AdminReportService
from app.modules.printers.formatter import EscPosFormatter
from app.modules.printers.receipt_raster import _RasterCanvas, render_customer_receipt_raster
from app.modules.printers.service import PrinterService
from tests.conftest import create_staff_headers
from tests.test_receipt_parity_integration import _setup, session_factory


async def test_cashier_and_waiter_share_receipt_but_only_earn_on_their_own_items(client, session_factory):
    ctx = await _setup(client)
    headers = await create_staff_headers(client, ctx["owner_headers"], email="mixed-cashier@example.com", role_slug="cashier")
    cashier = (await client.get("/auth/me", headers=headers)).json()
    await client.patch(f"/auth/users/{cashier['id']}", headers=ctx["owner_headers"], json={"name": "Азиз"})
    original = (await client.get(f"/pos/orders/{ctx['order_id']}", headers=ctx["owner_headers"])).json()
    response = await client.post(f"/pos/orders/{ctx['order_id']}/items", headers=headers, json={
        "product_id": original["items"][0]["product_id"], "quantity": "1",
    })
    assert response.status_code == 201, response.text
    expected = [{"label": "Кассир", "name": "Азиз"}, {"label": "Официант", "name": "Алишер"}]
    assert response.json()["receipt_staff"] == expected
    assert response.json()["waiter_id"] == original["waiter_id"]
    assert response.json()["items"][-1]["added_by"] == cashier["id"]
    async with session_factory() as db:
        svc = PrinterService(db)
        order = await svc._get_order(ctx["company_id"], ctx["order_id"])
        receipt = await svc._build_receipt_data(ctx["company_id"], order)
        assert receipt.receipt_staff == expected
        text = EscPosFormatter(80).format_receipt(receipt).decode("cp866")
        assert "Кассир:" in text and "Азиз" in text and "Официант:" in text and "Алишер" in text
        assert text.index("Кассир:") < text.index("Официант:")
        with patch.object(_RasterCanvas, "text_row", autospec=True) as rows:
            render_customer_receipt_raster(receipt, {}, 80)
        assert any(call.args[1:3] == ("Кассир:", "Азиз") for call in rows.call_args_list)
        assert any(call.args[1:3] == ("Официант:", "Алишер") for call in rows.call_args_list)

        # Freeze a discount, tax and service to exercise allocation of money,
        # not just raw dish prices. No real payment or print job is sent.
        order.status = "completed"
        order.total_amount = Decimal("101.01")
        order.service_fee = Decimal("10.02")
        await db.flush()
        report = await AdminReportService(db).waiters_report(ctx["company_id"], None, None,
            service_percent=Decimal("10"), include_takeaway_delivery=True, include_service=True)
        by_id = {row.waiter_id: row for row in report.rows}
        waiter, cashier_row = by_id[UUID(original["waiter_id"])], by_id[UUID(cashier["id"])]
        assert waiter.takeaway_delivery_total == Decimal("60.66")
        assert cashier_row.takeaway_delivery_total == Decimal("30.33")
        assert waiter.service_total == Decimal("6.68")
        assert cashier_row.service_total == Decimal("3.34")
        assert waiter.waiter_service_total == Decimal("6.73")
        assert cashier_row.waiter_service_total == Decimal("3.37")
        assert waiter.orders_count == cashier_row.orders_count == report.totals.orders_count == 1
        assert waiter.dishes_count == 2 and cashier_row.dishes_count == 1
        selected = await AdminReportService(db).waiters_report(ctx["company_id"], None, None,
            waiter_id=UUID(cashier["id"]), service_percent=Decimal("10"),
            include_takeaway_delivery=True, include_service=True)
        assert len(selected.rows) == 1
        assert selected.rows[0].waiter_service_total == cashier_row.waiter_service_total

        cashier_item = next(item for item in order.items if item.added_by == UUID(cashier["id"]))
        cashier_item.status = "cancelled"
        await db.flush()
        receipt = await svc._build_receipt_data(ctx["company_id"], order)
        assert receipt.receipt_staff == [{"label": "Официант", "name": "Алишер"}]
        report = await AdminReportService(db).waiters_report(ctx["company_id"], None, None)
        assert len(report.rows) == 1
        assert report.rows[0].waiter_id == UUID(original["waiter_id"])


def test_allocation_keeps_every_cent_and_does_not_award_zero_weight_items():
    assert allocate_amount(Decimal("0.01"), [1, 1, 1]) == [Decimal("0.01"), Decimal("0"), Decimal("0")]
    assert allocate_amount(Decimal("1.00"), [0, 1]) == [0, 1]
    assert sum(allocate_amount(Decimal("101.01"), [2, 1])) == Decimal("101.01")
