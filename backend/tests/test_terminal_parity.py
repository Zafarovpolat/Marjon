"""Endpoints the desktop/Staff terminals call: attendance confirmation, cashier
income/expense, recipe card, summary print."""
from __future__ import annotations

from tests.conftest import create_staff_headers, register_company


async def _company(client, slug="acme"):
    owner, _ = await register_company(client, slug=slug, email=f"owner@{slug}.example.com")
    cashier = await create_staff_headers(client, owner, email=f"cashier@{slug}.example.com", role_slug="cashier")
    cook = await create_staff_headers(client, owner, email=f"kitchen@{slug}.example.com", role_slug="kitchen")
    return owner, cashier, cook


async def _me(client, headers):
    return (await client.get("/auth/me", headers=headers)).json()


async def test_cashier_marks_attendance_and_journal_lists_it(client):
    _, cashier, cook = await _company(client)
    cook_me = await _me(client, cook)

    mark = await client.post(
        "/hr/attendance/mark", headers=cashier, json={"user_id": cook_me["id"], "action": "check_in"}
    )
    assert mark.status_code == 201, mark.text
    body = mark.json()
    assert body["status"] == "approved" and body["user_id"] == cook_me["id"]
    assert body["employee_name"] is None or isinstance(body["employee_name"], str)

    log = await client.get("/hr/attendance/log", headers=cashier)
    assert log.status_code == 200
    assert [row["id"] for row in log.json()] == [body["id"]]

    pending = await client.get("/hr/attendance/pending", headers=cashier)
    assert pending.status_code == 200 and pending.json() == []


async def test_attendance_approve_and_reject(client, db_engine):
    from datetime import datetime, timezone
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.modules.hr.models import AttendanceLog

    _, cashier, cook = await _company(client)
    cook_me = await _me(client, cook)

    async with AsyncSession(db_engine, expire_on_commit=False) as db:
        log = AttendanceLog(
            company_id=UUID(cook_me["company_id"]), user_id=UUID(cook_me["id"]), action="check_in",
            timestamp=datetime.now(timezone.utc), method="manual",
        )
        db.add(log)
        await db.commit()
        log_id = str(log.id)

    pending = await client.get("/hr/attendance/pending", headers=cashier)
    assert [row["id"] for row in pending.json()] == [log_id]

    approved = await client.post(f"/hr/attendance/{log_id}/approve", headers=cashier, json={"approve": True})
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    assert (await client.get("/hr/attendance/pending", headers=cashier)).json() == []

    unknown = await client.post(
        "/hr/attendance/00000000-0000-0000-0000-000000000000/approve", headers=cashier, json={"approve": False}
    )
    assert unknown.status_code == 404


async def test_attendance_is_tenant_scoped(client):
    _, cashier_a, cook_a = await _company(client, "acme")
    _, cashier_b, _ = await _company(client, "other")
    cook_a_me = await _me(client, cook_a)

    resp = await client.post(
        "/hr/attendance/mark", headers=cashier_b, json={"user_id": cook_a_me["id"], "action": "check_in"}
    )
    assert resp.status_code == 404


async def test_cashier_income_expense_round_trip(client):
    _, cashier, cook = await _company(client)

    created = await client.post(
        "/finance/income-expense", headers=cashier,
        json={"amount": "15000", "direction": "income", "comment": "cash drop"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["direction"] == "income"

    listing = await client.get("/finance/income-expense", headers=cashier, params={"direction": "income"})
    assert listing.status_code == 200
    assert [t["comment"] for t in listing.json()["items"]] == ["cash drop"]

    bad = await client.post("/finance/income-expense", headers=cashier, json={"amount": "1", "direction": "sideways"})
    assert bad.status_code in (400, 422)

    denied = await client.get("/finance/income-expense", headers=cook)
    assert denied.status_code == 403


async def test_income_expense_does_not_leak_across_companies(client):
    _, cashier_a, _ = await _company(client, "acme")
    _, cashier_b, _ = await _company(client, "other")
    await client.post("/finance/income-expense", headers=cashier_a, json={"amount": "500", "direction": "expense"})
    assert (await client.get("/finance/income-expense", headers=cashier_b)).json()["items"] == []


async def test_recipe_card_lists_ingredients(client):
    owner, cashier, _ = await _company(client)
    ing = await client.post("/inventory/ingredients", headers=owner, json={"name": "Рис", "unit": "kg"})
    assert ing.status_code == 201, ing.text
    product = await client.post(
        "/inventory/products", headers=owner,
        json={"name": "Плов", "price": "35000", "ingredients": [{"ingredient_id": ing.json()["id"], "quantity": "0.2"}]},
    )
    assert product.status_code == 201, product.text

    recipe = await client.get(f"/inventory/products/{product.json()['id']}/recipe", headers=cashier)
    assert recipe.status_code == 200, recipe.text
    body = recipe.json()
    assert body["product_name"] == "Плов"
    assert [(i["ingredient_name"], i["quantity"]) for i in body["items"]] == [("Рис", 0.2)]

    missing = await client.get("/inventory/products/00000000-0000-0000-0000-000000000000/recipe", headers=cashier)
    assert missing.status_code == 404


async def test_summary_print_uses_company_printer(client):
    owner, cashier, _ = await _company(client)
    branch = (await client.post("/companies/me/branches", headers=owner, json={"name": "Main"})).json()
    printer = (await client.post(
        "/printers", headers=owner,
        json={"branch_id": branch["id"], "name": "Receipt", "printer_type": "receipt",
              "connection_type": "network", "ip_address": "192.0.2.1", "port": 9100},
    )).json()

    resp = await client.post(
        "/printers/print/summary", headers=cashier,
        json={"printer_id": printer["id"], "title": "Итоги смены", "lines": ["Заказов: 3", "Сумма: 100 000"], "footer": "ИТОГО 100 000"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["printer_id"] == printer["id"]

    other_owner, _ = await register_company(client, slug="other", email="owner@other.example.com")
    foreign = await client.post(
        "/printers/print/summary", headers=other_owner,
        json={"printer_id": printer["id"], "title": "x", "lines": []},
    )
    assert foreign.status_code == 404
