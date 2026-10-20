from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.modules.admin_reports.cancellation_acknowledgements import list_receipts
from app.modules.auth.models import User
from app.modules.notifications.models import Notification
from app.modules.pos.models import Order
from tests.test_cancelled_dishes_phase1 import _setup_company, _add_order, _add_item


@pytest.mark.asyncio
async def test_receipt_is_persistent_idempotent_private_and_does_not_change_order(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="ack", email="ack@example.com")
    foreign = await _setup_company(client, db_engine, slug="ack-foreign", email="ack-foreign@example.com")
    oid = await _add_order(ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], order_number="22", status="cancelled", cancelled_at=datetime.now(timezone.utc))
    await _add_item(ctx["sessions"], order_id=oid, product_id=ctx["product_id"])
    url = f"/reports/cancelled/{oid}/acknowledge"
    assert (await client.post(url, headers=foreign["headers"])).status_code == 404
    assert (await client.post(url)).status_code == 401
    for _ in range(2):
        result = await client.post(url, headers=ctx["headers"])
        assert result.status_code == 200, result.text
        assert result.json()["order_id"] == str(oid)
        assert result.json()["acknowledged_at"]
    rows = (await client.get("/reports/cancelled/acknowledgements", headers=ctx["headers"])).json()
    assert len(rows) == 1 and rows[0]["order_id"] == str(oid)
    assert (await client.get("/reports/cancelled/acknowledgements", headers=foreign["headers"])).json() == []
    async with ctx["sessions"]() as db:
        other = User(id=uuid4(), company_id=ctx["company_id"], email="other-ack@example.com", password_hash="test")
        db.add(other)
        await db.flush()
        assert await list_receipts(db, other) == []
        assert (await db.get(Order, oid)).status == "cancelled"
        assert (await db.execute(select(func.count(Notification.id)))).scalar_one() == 1
        receipt = (await db.execute(select(Notification))).scalar_one()
        assert receipt.read_at is not None and receipt.status == "read"


@pytest.mark.asyncio
async def test_rejects_order_without_cancellations(client, db_engine):
    ctx = await _setup_company(client, db_engine, slug="ack-active", email="ack-active@example.com")
    oid = await _add_order(ctx["sessions"], company_id=ctx["company_id"], branch_id=ctx["branch_id"],
        waiter_id=ctx["owner_id"], order_number="23")
    assert (await client.post(f"/reports/cancelled/{oid}/acknowledge", headers=ctx["headers"])).status_code == 404
