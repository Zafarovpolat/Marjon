from __future__ import annotations

from tests.conftest import register_company


async def test_existing_frontend_payload_still_works(client):
    """SettingsProfilePage always sends name/phone/address/inn/currency,
    including blank strings for fields the company hasn't set yet."""
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await client.patch(
        "/companies/me", headers=headers,
        json={"name": "Acme Cafe", "phone": "", "address": "", "inn": "", "currency": "UZS"},
    )
    assert resp.status_code == 200, resp.text


async def test_vat_rate_and_service_fee_actually_save(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await client.patch(
        "/companies/me", headers=headers,
        json={"vat_rate": 12, "service_fee": 10},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["vat_rate"] == 12.0
    assert body["service_fee"] == 10.0

    get_resp = await client.get("/companies/me", headers=headers)
    assert get_resp.json()["vat_rate"] == 12.0


async def test_unknown_field_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await client.patch("/companies/me", headers=headers, json={"made_up_field": "x"})
    assert resp.status_code == 422


async def test_invalid_phone_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await client.patch("/companies/me", headers=headers, json={"phone": "not-a-phone"})
    assert resp.status_code == 422


async def test_invalid_inn_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await client.patch("/companies/me", headers=headers, json={"inn": "abc"})
    assert resp.status_code == 422


async def test_invalid_currency_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await client.patch("/companies/me", headers=headers, json={"currency": "dollars"})
    assert resp.status_code == 422


async def test_currency_normalized_to_uppercase(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await client.patch("/companies/me", headers=headers, json={"currency": "usd"})
    assert resp.status_code == 200
    assert resp.json()["currency"] == "USD"


async def test_vat_rate_out_of_range_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await client.patch("/companies/me", headers=headers, json={"vat_rate": 150})
    assert resp.status_code == 422


async def test_company_update_requires_company_admin(client):
    owner_headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    staff = await client.post(
        "/auth/users", headers=owner_headers,
        json={"email": "cashier@acme.example.com", "password": "Passw0rd!", "role_slug": "cashier"},
    )
    login = await client.post(
        "/auth/login", json={"email": "cashier@acme.example.com", "password": "Passw0rd!"}
    )
    cashier_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = await client.patch("/companies/me", headers=cashier_headers, json={"name": "Hacked"})
    assert resp.status_code == 403


async def test_order_types_roundtrip_and_validation(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await client.patch(
        "/companies/me", headers=headers,
        json={"order_types": {"dine_in": True, "takeaway": False, "delivery": True}},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["order_types"] == {"dine_in": True, "takeaway": False, "delivery": True}
    get_resp = await client.get("/companies/me", headers=headers)
    assert get_resp.json()["order_types"] == {"dine_in": True, "takeaway": False, "delivery": True}
    bad = await client.patch(
        "/companies/me", headers=headers,
        json={"order_types": {"dine_in": True, "qr": True}},
    )
    assert bad.status_code == 422


async def test_show_support_button_defaults_true_and_persists_both_states(client):
    headers, _ = await register_company(client, slug="supbtn", email="owner@supbtn.example.com")
    get_resp = await client.get("/companies/me", headers=headers)
    assert get_resp.json()["show_support_button"] is True

    resp = await client.patch("/companies/me", headers=headers, json={"show_support_button": False})
    assert resp.status_code == 200, resp.text
    assert resp.json()["show_support_button"] is False
    assert (await client.get("/companies/me", headers=headers)).json()["show_support_button"] is False

    resp = await client.patch("/companies/me", headers=headers, json={"show_support_button": True})
    assert resp.json()["show_support_button"] is True
    assert (await client.get("/companies/me", headers=headers)).json()["show_support_button"] is True


async def test_show_support_button_is_company_isolated(client):
    headers_a, _ = await register_company(client, slug="supbtn-a", email="owner@supbtn-a.example.com")
    headers_b, _ = await register_company(client, slug="supbtn-b", email="owner@supbtn-b.example.com")
    await client.patch("/companies/me", headers=headers_a, json={"show_support_button": False})
    assert (await client.get("/companies/me", headers=headers_a)).json()["show_support_button"] is False
    assert (await client.get("/companies/me", headers=headers_b)).json()["show_support_button"] is True
