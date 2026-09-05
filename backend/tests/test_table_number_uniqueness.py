from __future__ import annotations

from tests.conftest import register_company

DUPLICATE_DETAIL = "Стол с таким номером уже существует в этом месте"


async def _hall(client, headers, name):
    resp = await client.post("/halls", headers=headers, json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _table(client, headers, hall_id, number, capacity=4):
    return await client.post(
        f"/halls/{hall_id}/tables", headers=headers,
        json={"number": number, "capacity": capacity},
    )


async def _owner(client, slug="acme"):
    headers, _ = await register_company(
        client, slug=slug, email=f"owner@{slug}.example.com"
    )
    return headers


# ── create ────────────────────────────────────────────────────────────────

async def test_duplicate_active_number_same_hall_conflicts(client):
    headers = await _owner(client)
    hall = await _hall(client, headers, "Зал")
    assert (await _table(client, headers, hall, 5)).status_code == 201
    dup = await _table(client, headers, hall, 5)
    assert dup.status_code == 409, dup.text
    assert dup.json()["detail"] == DUPLICATE_DETAIL


async def test_same_number_in_different_halls_allowed(client):
    headers = await _owner(client)
    zal = await _hall(client, headers, "Зал")
    bar = await _hall(client, headers, "Бар")
    assert (await _table(client, headers, zal, 5)).status_code == 201
    assert (await _table(client, headers, bar, 5)).status_code == 201


async def test_number_reusable_after_soft_deactivate(client):
    headers = await _owner(client)
    hall = await _hall(client, headers, "Зал")
    created = await _table(client, headers, hall, 5)
    table_id = created.json()["id"]

    deleted = await client.delete(f"/halls/{hall}/tables/{table_id}", headers=headers)
    assert deleted.status_code == 204

    again = await _table(client, headers, hall, 5)
    assert again.status_code == 201, again.text
    assert again.json()["id"] != table_id


async def test_multiple_inactive_duplicates_allowed(client):
    """Uniqueness covers ACTIVE rows only — archived history may repeat."""
    headers = await _owner(client)
    hall = await _hall(client, headers, "Зал")
    for _ in range(3):
        created = await _table(client, headers, hall, 5)
        assert created.status_code == 201, created.text
        await client.delete(
            f"/halls/{hall}/tables/{created.json()['id']}", headers=headers
        )
    # three inactive #5 archived, and a fresh active #5 is still allowed
    final = await _table(client, headers, hall, 5)
    assert final.status_code == 201, final.text
    listed = await client.get(f"/halls/{hall}/tables", headers=headers)
    assert [t["number"] for t in listed.json()] == [5]


# ── update ────────────────────────────────────────────────────────────────

async def test_update_into_duplicate_number_conflicts(client):
    headers = await _owner(client)
    hall = await _hall(client, headers, "Зал")
    await _table(client, headers, hall, 5)
    six = await _table(client, headers, hall, 6)
    six_id = six.json()["id"]

    resp = await client.patch(
        f"/halls/{hall}/tables/{six_id}", headers=headers, json={"number": 5}
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == DUPLICATE_DETAIL


async def test_self_update_same_number_succeeds(client):
    headers = await _owner(client)
    hall = await _hall(client, headers, "Зал")
    created = await _table(client, headers, hall, 5)
    table_id = created.json()["id"]

    resp = await client.patch(
        f"/halls/{hall}/tables/{table_id}", headers=headers,
        json={"number": 5, "capacity": 8},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["number"] == 5
    assert resp.json()["capacity"] == 8


async def test_update_number_into_free_slot_succeeds(client):
    headers = await _owner(client)
    hall = await _hall(client, headers, "Зал")
    created = await _table(client, headers, hall, 5)
    table_id = created.json()["id"]

    resp = await client.patch(
        f"/halls/{hall}/tables/{table_id}", headers=headers, json={"number": 7}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["number"] == 7


async def test_reactivating_into_taken_number_conflicts(client):
    """Existing is_active PATCH must never yield two active #5 in a hall."""
    headers = await _owner(client)
    hall = await _hall(client, headers, "Зал")
    first = await _table(client, headers, hall, 5)
    first_id = first.json()["id"]
    await client.delete(f"/halls/{hall}/tables/{first_id}", headers=headers)
    assert (await _table(client, headers, hall, 5)).status_code == 201

    resp = await client.patch(
        f"/halls/{hall}/tables/{first_id}", headers=headers, json={"is_active": True}
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == DUPLICATE_DETAIL


# ── tenant isolation ──────────────────────────────────────────────────────

async def test_foreign_tenant_cannot_create_table(client):
    a_headers = await _owner(client, slug="alpha")
    b_headers = await _owner(client, slug="beta")
    hall = await _hall(client, a_headers, "Зал")

    resp = await _table(client, b_headers, hall, 5)
    assert resp.status_code == 404, resp.text
