"""Order creation must enqueue the kitchen ticket, not silently skip printing."""
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from app.modules.printers.service import PrinterService
from tests.conftest import register_company


async def _context(client):
    headers, _ = await register_company(
        client, slug="kitchen-auto", email="owner@kitchen-auto.example.com",
    )
    response = await client.post(
        "/companies/me/branches", headers=headers, json={"name": "Main"},
    )
    assert response.status_code == 201, response.text
    branch_id = response.json()["id"]
    response = await client.post(
        "/inventory/products", headers=headers,
        json={"name": "Хот дог", "price": "14000"},
    )
    assert response.status_code == 201, response.text
    return headers, branch_id, response.json()["id"]


async def test_order_creation_enqueues_kitchen_ticket(client, monkeypatch):
    # The test DB is isolated. Never connect to a printer or broadcast to a POS.
    network_print = AsyncMock(side_effect=AssertionError("No physical printing in tests"))
    broadcast = AsyncMock()
    monkeypatch.setattr("app.modules.printers.service.print_raw", network_print)
    monkeypatch.setattr("app.modules.printers.service.printer_ws_manager.broadcast", broadcast)
    headers, branch_id, product_id = await _context(client)
    response = await client.post(
        "/printers", headers=headers,
        json={"branch_id": branch_id, "name": "Kitchen", "printer_type": "kitchen",
              "connection_type": "network", "ip_address": "192.168.123.50", "port": 9100},
    )
    assert response.status_code == 201, response.text
    printer_id = response.json()["id"]
    response = await client.post(
        "/pos/orders", headers=headers,
        json={"branch_id": branch_id, "order_type": "takeaway",
              "items": [{"product_id": product_id, "quantity": "3"}]},
    )
    assert response.status_code == 201, response.text
    order = response.json()
    pending = await client.get(f"/printers/{printer_id}/jobs/pending", headers=headers)
    assert pending.status_code == 200, pending.text
    jobs = pending.json()
    assert len(jobs) == 1, jobs
    assert jobs[0]["job_type"] == "kitchen"
    assert jobs[0]["ref_id"] == order["id"]
    assert jobs[0]["status"] == "pending"
    assert jobs[0]["payload"]
    network_print.assert_not_awaited()
    broadcast.assert_awaited_once()
    assert broadcast.await_args.args[1] == UUID(branch_id)
    message = broadcast.await_args.args[2]
    assert message["job_id"] == jobs[0]["id"]
    assert message["ip_address"] == "192.168.123.50"


async def test_kitchen_failure_is_logged_without_losing_order(client, monkeypatch, caplog):
    headers, branch_id, product_id = await _context(client)
    auto_print = AsyncMock(side_effect=RuntimeError("Kitchen render failed"))
    monkeypatch.setattr(PrinterService, "auto_print_kitchen", auto_print)
    with caplog.at_level("WARNING", logger="app.modules.pos.service"):
        response = await client.post(
            "/pos/orders", headers=headers,
            json={"branch_id": branch_id, "order_type": "takeaway",
                  "items": [{"product_id": product_id, "quantity": "1"}]},
        )
    assert response.status_code == 201, response.text
    order = response.json()
    auto_print.assert_awaited_once_with(UUID(order["company_id"]), UUID(order["id"]))
    records = [r for r in caplog.records if "auto_print_kitchen failed" in r.message]
    assert len(records) == 1
    assert records[0].exc_info is not None
    assert "Kitchen render failed" in caplog.text
    assert (await client.get(f"/pos/orders/{order['id']}", headers=headers)).status_code == 200


@pytest.mark.parametrize("kind", ["receipt", "kitchen"])
async def test_auto_print_stays_in_order_branch(client, monkeypatch, kind):
    network_print = AsyncMock(side_effect=AssertionError("No physical printing in tests"))
    monkeypatch.setattr("app.modules.printers.service.print_raw", network_print)
    monkeypatch.setattr("app.modules.printers.service.printer_ws_manager.broadcast", AsyncMock())
    headers, branch_id, product_id = await _context(client)
    other = await client.post(
        "/companies/me/branches", headers=headers, json={"name": "Other"},
    )
    assert other.status_code == 201, other.text
    printers = []
    for target_branch in (branch_id, other.json()["id"]):
        response = await client.post(
            "/printers", headers=headers,
            json={"branch_id": target_branch, "name": kind, "printer_type": kind,
                  "connection_type": "network", "ip_address": "192.168.123.50"},
        )
        assert response.status_code == 201, response.text
        printers.append(response.json()["id"])
    response = await client.post(
        "/pos/orders", headers=headers,
        json={"branch_id": branch_id, "order_type": "takeaway",
              "items": [{"product_id": product_id, "quantity": "1"}]},
    )
    assert response.status_code == 201, response.text
    order_id = response.json()["id"]
    response = await client.post(f"/printers/print/orders/{order_id}/{kind}", headers=headers)
    assert response.status_code == 200, response.text
    assert len(response.json()) == 1
    assert response.json()[0]["printer_id"] == printers[0]
    pending = await client.get(f"/printers/{printers[1]}/jobs/pending", headers=headers)
    assert pending.status_code == 200 and pending.json() == []
    network_print.assert_not_awaited()


async def test_websocket_delivery_stays_in_printer_branch(monkeypatch):
    from uuid import uuid4
    from app.config import settings
    from app.modules.printers.ws_manager import PrinterWSManager

    monkeypatch.setattr(settings, "redis_url", "")
    manager = PrinterWSManager()
    company_id, branch_id, other_branch_id = uuid4(), uuid4(), uuid4()
    target, other = AsyncMock(), AsyncMock()
    manager._connections[manager._key(company_id, branch_id)] = {target}
    manager._connections[manager._key(company_id, other_branch_id)] = {other}
    await manager.broadcast(company_id, branch_id, {"event": "print_job"})
    target.send_text.assert_awaited_once()
    other.send_text.assert_not_awaited()
