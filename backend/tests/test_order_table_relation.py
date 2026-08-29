"""Phase 1 — canonical Order → Table → Hall relation foundation.

Exercises the full app stack over the in-memory SQLite fixture:
  * POST /pos/orders now accepts an optional table_id and, when present,
    validates tenant + branch ownership + active state through the Hall join,
    snapshots table_number from the canonical Table, and treats table_id as
    authoritative over any client-sent number.
  * Hall/Table deletion is soft (is_active=false) so historical Order.table_id
    links are never destroyed.
The Tables Report, its metadata, and the frontend are intentionally untouched
in this phase.
"""
from __future__ import annotations

from uuid import uuid4

from tests.conftest import register_company


async def _branch(client, headers, name="Main"):
    resp = await client.post("/companies/me/branches", headers=headers, json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _hall(client, headers, branch_id, name="Zal"):
    resp = await client.post("/halls", headers=headers, json={"name": name, "branch_id": branch_id})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _table(client, headers, hall_id, number=7):
    resp = await client.post(
        f"/halls/{hall_id}/tables", headers=headers, json={"number": number}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seat(client, headers, *, number=7, branch_name="Main"):
    """Create branch → hall → table and return (branch_id, hall_id, table)."""
    branch_id = await _branch(client, headers, branch_name)
    hall_id = await _hall(client, headers, branch_id)
    table = await _table(client, headers, hall_id, number)
    return branch_id, hall_id, table


async def _create_order(client, headers, **body):
    body.setdefault("items", [])
    return await client.post("/pos/orders", headers=headers, json=body)


async def _update_order(client, headers, order_id, **body):
    return await client.patch(f"/pos/orders/{order_id}", headers=headers, json=body)


# ── A/B: accepted + server snapshot ──────────────────────────────────────────


async def test_same_company_active_table_id_accepted_and_snapshots_number(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id, _hall_id, table = await _seat(client, headers, number=7)

    resp = await _create_order(
        client, headers, branch_id=branch_id, order_type="dine_in", table_id=table["id"]
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["table_id"] == table["id"]
    # Server owns the snapshot — derived from canonical Table.number.
    assert body["table_number"] == "7"


# ── C: foreign-company table rejected ────────────────────────────────────────


async def test_foreign_company_table_id_rejected(client):
    a_headers, _ = await register_company(client, slug="alpha", email="owner@alpha.example.com")
    b_headers, _ = await register_company(client, slug="beta", email="owner@beta.example.com")
    a_branch = await _branch(client, a_headers)
    _b_branch, _b_hall, b_table = await _seat(client, b_headers, number=3)

    resp = await _create_order(
        client, a_headers, branch_id=a_branch, order_type="dine_in", table_id=b_table["id"]
    )
    assert resp.status_code == 404, resp.text


# ── D: nonexistent table rejected ────────────────────────────────────────────


async def test_nonexistent_table_id_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id = await _branch(client, headers)

    resp = await _create_order(
        client, headers, branch_id=branch_id, order_type="dine_in", table_id=str(uuid4())
    )
    assert resp.status_code == 404, resp.text


# ── E: inactive table rejected for new order ─────────────────────────────────


async def test_inactive_table_rejected_for_new_order(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id, hall_id, table = await _seat(client, headers, number=5)

    deleted = await client.delete(f"/halls/{hall_id}/tables/{table['id']}", headers=headers)
    assert deleted.status_code == 204, deleted.text

    resp = await _create_order(
        client, headers, branch_id=branch_id, order_type="dine_in", table_id=table["id"]
    )
    assert resp.status_code == 404, resp.text


# ── F: inactive hall rejected for new order ──────────────────────────────────


async def test_inactive_hall_rejected_for_new_order(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id, hall_id, table = await _seat(client, headers, number=9)

    deleted = await client.delete(f"/halls/{hall_id}", headers=headers)
    assert deleted.status_code == 204, deleted.text

    resp = await _create_order(
        client, headers, branch_id=branch_id, order_type="dine_in", table_id=table["id"]
    )
    assert resp.status_code == 404, resp.text


# ── G: legacy table_number-only still works ──────────────────────────────────


async def test_legacy_table_number_only_create_still_works(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id = await _branch(client, headers)

    resp = await _create_order(
        client, headers, branch_id=branch_id, order_type="dine_in", table_number="12A"
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["table_number"] == "12A"
    assert body["table_id"] is None


# ── H: non-table order with table_id null ────────────────────────────────────


async def test_non_table_order_with_null_table_id_still_works(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id = await _branch(client, headers)

    resp = await _create_order(client, headers, branch_id=branch_id, order_type="takeaway")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["table_id"] is None


# ── I: table_id authoritative over a conflicting table_number ────────────────


async def test_table_id_wins_over_conflicting_table_number(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id, _hall_id, table = await _seat(client, headers, number=7)

    resp = await _create_order(
        client,
        headers,
        branch_id=branch_id,
        order_type="dine_in",
        table_id=table["id"],
        table_number="999",  # deliberately wrong — must be ignored
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["table_id"] == table["id"]
    assert body["table_number"] == "7"


# ── Branch compatibility: table from another branch rejected ─────────────────


async def test_table_from_other_branch_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_one, hall_one, table_one = await _seat(client, headers, number=4, branch_name="One")
    branch_two = await _branch(client, headers, name="Two")

    # Order is placed in branch_two but references branch_one's table.
    resp = await _create_order(
        client, headers, branch_id=branch_two, order_type="dine_in", table_id=table_one["id"]
    )
    assert resp.status_code == 404, resp.text


# ── Delete safety: soft-delete preserves historical Order.table_id ───────────


async def test_table_delete_is_soft_and_preserves_order_link(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id, hall_id, table = await _seat(client, headers, number=7)

    order = await _create_order(
        client, headers, branch_id=branch_id, order_type="dine_in", table_id=table["id"]
    )
    assert order.status_code == 201, order.text
    order_id = order.json()["id"]

    deleted = await client.delete(f"/halls/{hall_id}/tables/{table['id']}", headers=headers)
    assert deleted.status_code == 204, deleted.text

    # Historical order keeps its canonical seating link after the soft-delete.
    refetched = await client.get(f"/pos/orders/{order_id}", headers=headers)
    assert refetched.status_code == 200, refetched.text
    assert refetched.json()["table_id"] == table["id"]

    # And the table drops out of the active table listing.
    listing = await client.get(f"/halls/{hall_id}/tables", headers=headers)
    assert listing.status_code == 200
    assert all(row["id"] != table["id"] for row in listing.json())


async def test_hall_delete_is_soft_and_preserves_order_link(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id, hall_id, table = await _seat(client, headers, number=7)

    order = await _create_order(
        client, headers, branch_id=branch_id, order_type="dine_in", table_id=table["id"]
    )
    assert order.status_code == 201, order.text
    order_id = order.json()["id"]

    deleted = await client.delete(f"/halls/{hall_id}", headers=headers)
    assert deleted.status_code == 204, deleted.text

    # Hall disappears from the active places directory (soft-delete), but the
    # order's table_id linkage survives.
    halls = await client.get("/halls", headers=headers)
    assert halls.status_code == 200
    assert all(row["id"] != hall_id for row in halls.json())

    refetched = await client.get(f"/pos/orders/{order_id}", headers=headers)
    assert refetched.status_code == 200
    assert refetched.json()["table_id"] == table["id"]


# ── UPDATE-path snapshot invariant ───────────────────────────────────────────
# While table_id is set, table_number is a server-owned snapshot and must not
# drift. A table_number-only PATCH on such an order is rejected (409); relation
# changes must be explicit via table_id.


async def _seated_order_with_two_tables(client, headers):
    """Return (order_id, t5, t7) — an order on active Table #5, plus a spare #7."""
    branch_id = await _branch(client, headers)
    hall_id = await _hall(client, headers, branch_id)
    t5 = await _table(client, headers, hall_id, number=5)
    t7 = await _table(client, headers, hall_id, number=7)
    order = await _create_order(
        client, headers, branch_id=branch_id, order_type="dine_in", table_id=t5["id"]
    )
    assert order.status_code == 201, order.text
    assert order.json()["table_number"] == "5"
    return order.json()["id"], t5, t7


async def test_update_changes_table_id_resnapshots_number(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    order_id, _t5, t7 = await _seated_order_with_two_tables(client, headers)

    resp = await _update_order(client, headers, order_id, table_id=t7["id"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["table_id"] == t7["id"]
    assert body["table_number"] == "7"


async def test_update_new_table_id_with_conflicting_number_table_id_wins(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    order_id, _t5, t7 = await _seated_order_with_two_tables(client, headers)

    resp = await _update_order(
        client, headers, order_id, table_id=t7["id"], table_number="999"
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["table_id"] == t7["id"]
    assert body["table_number"] == "7"


async def test_update_explicit_clear_table_id(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    order_id, _t5, _t7 = await _seated_order_with_two_tables(client, headers)

    resp = await _update_order(client, headers, order_id, table_id=None)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["table_id"] is None
    # Retained snapshot remains unless a new number is explicitly supplied.
    assert body["table_number"] == "5"


async def test_update_clear_table_id_with_new_number(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    order_id, _t5, _t7 = await _seated_order_with_two_tables(client, headers)

    resp = await _update_order(client, headers, order_id, table_id=None, table_number="12")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["table_id"] is None
    assert body["table_number"] == "12"


async def test_update_unrelated_field_preserves_relation(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    order_id, t5, _t7 = await _seated_order_with_two_tables(client, headers)

    resp = await _update_order(client, headers, order_id, persons_count=4)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["persons_count"] == 4
    assert body["table_id"] == t5["id"]
    assert body["table_number"] == "5"


async def test_update_table_number_only_on_table_id_order_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    order_id, t5, _t7 = await _seated_order_with_two_tables(client, headers)

    resp = await _update_order(client, headers, order_id, table_number="12")
    assert resp.status_code == 409, resp.text

    # Nothing was mutated: relation and snapshot are both unchanged.
    refetched = await client.get(f"/pos/orders/{order_id}", headers=headers)
    assert refetched.status_code == 200
    body = refetched.json()
    assert body["table_id"] == t5["id"]
    assert body["table_number"] == "5"


async def test_legacy_order_table_number_only_update_still_works(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    branch_id = await _branch(client, headers)
    created = await _create_order(
        client, headers, branch_id=branch_id, order_type="dine_in", table_number="5"
    )
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    assert created.json()["table_id"] is None

    resp = await _update_order(client, headers, order_id, table_number="12")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["table_id"] is None
    assert body["table_number"] == "12"
