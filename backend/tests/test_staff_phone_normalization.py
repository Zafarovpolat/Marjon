"""The web staff form (StaffRolePage.jsx's normalizePhone) sends bare digits
with no leading "+" (e.g. "998901112233"). Before this fix, create_company_user
and update_company_user stored that value verbatim, while login() normalizes
whatever the employee types into the canonical "+998…" form before the
User.phone equality lookup — so a stored "998901112233" never matched a typed
"+998901112233" (or a typed "998901112233", normalized the same way), and the
employee could never log in with the number the owner just gave them.
"""
from __future__ import annotations

from tests.conftest import register_company


async def test_create_company_user_normalizes_phone_without_plus(client):
    owner_headers, _ = await register_company(client, slug="phonenorm", email="owner@phonenorm.example.com")
    created = await client.post(
        "/auth/users", headers=owner_headers,
        json={"password": "Passw0rd1", "role_slug": "cashier", "phone": "998901112233"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["phone"] == "+998901112233"


async def test_created_employee_can_log_in_with_the_number_the_owner_was_given(client):
    """End-to-end: the exact bug report — phone stored without "+" meant the
    employee's own correctly-typed number could never log in."""
    owner_headers, _ = await register_company(client, slug="phonelogin", email="owner@phonelogin.example.com")
    created = await client.post(
        "/auth/users", headers=owner_headers,
        json={"password": "Passw0rd1", "role_slug": "cashier", "phone": "998901112244"},
    )
    assert created.status_code == 201, created.text

    login = await client.post(
        "/auth/login", json={"phone": "+998901112244", "password": "Passw0rd1"},
    )
    assert login.status_code == 200, login.text

    # Also works if the employee types it without "+" — login() normalizes
    # either direction, so both must match what's actually stored.
    login_bare = await client.post(
        "/auth/login", json={"phone": "998901112244", "password": "Passw0rd1"},
    )
    assert login_bare.status_code == 200, login_bare.text


async def test_update_company_user_normalizes_phone_without_plus(client):
    owner_headers, _ = await register_company(client, slug="phoneupdate", email="owner@phoneupdate.example.com")
    created = await client.post(
        "/auth/users", headers=owner_headers,
        json={"password": "Passw0rd1", "role_slug": "cashier"},
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]

    updated = await client.patch(
        f"/auth/users/{user_id}", headers=owner_headers,
        json={"phone": "998901112255"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["phone"] == "+998901112255"


async def test_update_company_user_explicit_empty_phone_clears_without_normalizing(client):
    owner_headers, _ = await register_company(client, slug="phoneclear", email="owner@phoneclear.example.com")
    created = await client.post(
        "/auth/users", headers=owner_headers,
        json={"password": "Passw0rd1", "role_slug": "cashier", "phone": "998901112266"},
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]

    cleared = await client.patch(
        f"/auth/users/{user_id}", headers=owner_headers,
        json={"phone": ""},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["phone"] in (None, "")
