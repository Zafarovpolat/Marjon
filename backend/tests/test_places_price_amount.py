from __future__ import annotations

from decimal import Decimal

from tests.conftest import register_company


def _amount(value):
    """price_amount may serialize as a JSON string or number depending on the
    Pydantic/Decimal serialization mode — compare numerically either way."""
    return None if value is None else Decimal(str(value))


async def _create_hall(client, headers, **payload):
    resp = await client.post("/halls", headers=headers, json={"name": "Зал", **payload})
    return resp


# ── create ────────────────────────────────────────────────────────────────

async def test_create_fixed_with_price_amount(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await _create_hall(client, headers, pricing_type="fixed", price_amount="100000")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["pricing_type"] == "fixed"
    assert _amount(body["price_amount"]) == Decimal("100000.00")


async def test_create_hourly_with_price_amount(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await _create_hall(client, headers, pricing_type="hourly", price_amount="1000000")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["pricing_type"] == "hourly"
    assert _amount(body["price_amount"]) == Decimal("1000000.00")


async def test_create_percent_keeps_percent_and_null_amount(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await _create_hall(client, headers, pricing_type="percent", percent=10)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["pricing_type"] == "percent"
    assert float(body["percent"]) == 10.0
    assert body["price_amount"] is None


async def test_create_without_pricing_has_null_amount(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await _create_hall(client, headers)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["pricing_type"] is None
    assert body["price_amount"] is None


async def test_create_negative_price_amount_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await _create_hall(client, headers, pricing_type="fixed", price_amount="-1")
    assert resp.status_code == 422, resp.text


async def test_create_zero_price_amount_allowed(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await _create_hall(client, headers, pricing_type="fixed", price_amount="0")
    assert resp.status_code == 201, resp.text
    assert _amount(resp.json()["price_amount"]) == Decimal("0")


async def test_create_decimal_precision_preserved(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await _create_hall(client, headers, pricing_type="hourly", price_amount="12500000.55")
    assert resp.status_code == 201, resp.text
    assert _amount(resp.json()["price_amount"]) == Decimal("12500000.55")


async def test_legacy_payload_without_price_amount_still_works(client):
    """Old clients send the amount only inside the free-text `condition`."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await _create_hall(
        client, headers, payment_type="цена за час", condition="Цена за час: 100 000 UZS"
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["pricing_type"] == "hourly"
    assert body["condition"] == "Цена за час: 100 000 UZS"
    assert body["price_amount"] is None  # never parsed out of condition


# ── read / list ───────────────────────────────────────────────────────────

async def test_price_amount_in_get_and_list(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await _create_hall(client, headers, pricing_type="fixed", price_amount="250000")
    hall_id = created.json()["id"]

    one = await client.get(f"/halls/{hall_id}", headers=headers)
    assert one.status_code == 200
    assert _amount(one.json()["price_amount"]) == Decimal("250000.00")

    listed = await client.get("/halls", headers=headers)
    assert listed.status_code == 200
    assert _amount(listed.json()[0]["price_amount"]) == Decimal("250000.00")


# ── update / explicit-null clearing ───────────────────────────────────────

async def test_patch_without_price_amount_preserves_it(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await _create_hall(client, headers, pricing_type="hourly", price_amount="100000")
    hall_id = created.json()["id"]

    resp = await client.patch(f"/halls/{hall_id}", headers=headers, json={"name": "Зал 2"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Зал 2"
    assert _amount(body["price_amount"]) == Decimal("100000.00")
    assert body["pricing_type"] == "hourly"


async def test_patch_explicit_null_clears_price_amount(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await _create_hall(client, headers, pricing_type="hourly", price_amount="100000")
    hall_id = created.json()["id"]

    resp = await client.patch(f"/halls/{hall_id}", headers=headers, json={"price_amount": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["price_amount"] is None


async def test_patch_explicit_null_clears_pricing_type(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await _create_hall(client, headers, pricing_type="fixed", price_amount="50000")
    hall_id = created.json()["id"]

    resp = await client.patch(
        f"/halls/{hall_id}", headers=headers, json={"pricing_type": None, "price_amount": None}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["pricing_type"] is None
    assert body["price_amount"] is None


async def test_patch_updates_price_amount(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await _create_hall(client, headers, pricing_type="fixed", price_amount="50000")
    hall_id = created.json()["id"]

    resp = await client.patch(f"/halls/{hall_id}", headers=headers, json={"price_amount": "75000"})
    assert resp.status_code == 200, resp.text
    assert _amount(resp.json()["price_amount"]) == Decimal("75000.00")


async def test_patch_negative_price_amount_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await _create_hall(client, headers, pricing_type="fixed", price_amount="50000")
    hall_id = created.json()["id"]

    resp = await client.patch(f"/halls/{hall_id}", headers=headers, json={"price_amount": "-5"})
    assert resp.status_code == 422, resp.text


async def test_patch_non_pricing_explicit_null_still_ignored(client):
    """Only the structured pricing fields honour explicit null; other nullable
    Hall fields keep the historical omit-null behaviour (no broad refactor)."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await _create_hall(client, headers, description="Главный зал")
    hall_id = created.json()["id"]

    resp = await client.patch(f"/halls/{hall_id}", headers=headers, json={"description": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["description"] == "Главный зал"


# ── tenant isolation ──────────────────────────────────────────────────────

async def test_foreign_tenant_cannot_update_price(client):
    a_headers, _ = await register_company(client, slug="alpha", email="owner@alpha.example.com")
    b_headers, _ = await register_company(client, slug="beta", email="owner@beta.example.com")
    created = await _create_hall(client, a_headers, pricing_type="fixed", price_amount="100000")
    hall_id = created.json()["id"]

    resp = await client.patch(f"/halls/{hall_id}", headers=b_headers, json={"price_amount": "1"})
    assert resp.status_code == 404, resp.text
