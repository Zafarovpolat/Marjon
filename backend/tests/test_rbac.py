from __future__ import annotations

from tests.conftest import register_company


async def _create_staff(client, owner_headers, *, email, role_slug, password="Passw0rd!"):
    resp = await client.post(
        "/auth/users",
        headers=owner_headers,
        json={"email": email, "password": password, "role_slug": role_slug},
    )
    return resp


async def _login(client, email, password="Passw0rd!"):
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_owner_gets_frozen_web_permission_set(client):
    owner_headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await client.get("/rbac/me/permissions", headers=owner_headers)
    assert resp.status_code == 200
    perms = resp.json()
    assert "finance:manage" in perms
    assert "companies:manage" in perms
    assert "analytics:reports" in perms
    assert "inventory:stock:write" in perms  # WH-01: склад разморожен для owner


async def test_unknown_role_slug_is_rejected(client):
    owner_headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    resp = await _create_staff(client, owner_headers, email="x@acme.example.com", role_slug="hacker_god")
    assert resp.status_code == 422


async def test_cashier_gets_restricted_permission_set(client):
    owner_headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await _create_staff(client, owner_headers, email="cashier@acme.example.com", role_slug="cashier")
    assert created.status_code == 201, created.text

    cashier_headers = await _login(client, "cashier@acme.example.com")
    resp = await client.get("/rbac/me/permissions", headers=cashier_headers)
    assert resp.status_code == 200
    perms = set(resp.json())
    assert "finance:manage" not in perms
    assert "inventory:stock:write" not in perms
    assert "pos:orders:create" in perms


async def test_cashier_cannot_write_finance_but_can_read(client):
    owner_headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    await _create_staff(client, owner_headers, email="cashier@acme.example.com", role_slug="cashier")
    cashier_headers = await _login(client, "cashier@acme.example.com")

    denied = await client.post(
        "/finance/payment-types", headers=cashier_headers, json={"name": "Cash", "type": "cash"}
    )
    assert denied.status_code == 403

    created = await client.post(
        "/finance/payment-types", headers=owner_headers, json={"name": "Cash", "type": "cash"}
    )
    assert created.status_code == 201

    read = await client.get("/finance/payment-types", headers=cashier_headers)
    assert read.status_code == 200


async def test_warehouse_role_can_manage_warehouse_but_cashier_cannot(client):
    owner_headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    await _create_staff(client, owner_headers, email="cashier@acme.example.com", role_slug="cashier")
    await _create_staff(client, owner_headers, email="wh@acme.example.com", role_slug="warehouse")
    cashier_headers = await _login(client, "cashier@acme.example.com")
    wh_headers = await _login(client, "wh@acme.example.com")

    denied = await client.post("/warehouse/list", headers=cashier_headers, json={"name": "Illegal"})
    assert denied.status_code == 403

    allowed = await client.post("/warehouse/list", headers=wh_headers, json={"name": "Main"})
    assert allowed.status_code == 201, allowed.text


async def test_owner_can_customize_operational_role_permissions(client):
    """Un-deferred (by explicit product decision): an owner may now grant or
    revoke individual permissions on an operational role (manager/cashier/
    waiter/kitchen/monoblock/courier/warehouse), capped at the owner's own
    permission ceiling. "owner"/"admin"/system roles stay frozen — see
    test_owner_cannot_customize_owner_or_admin_role_permissions."""
    owner_headers, _ = await register_company(client, slug="acme2", email="owner@acme2.example.com")
    await _create_staff(client, owner_headers, email="cashier@acme2.example.com", role_slug="cashier")
    cashier_headers = await _login(client, "cashier@acme2.example.com")

    roles = (await client.get("/rbac/roles", headers=owner_headers)).json()
    cashier_role = next(r for r in roles if r["slug"] == "cashier")

    catalog = (await client.get("/rbac/permissions", headers=owner_headers)).json()
    assert len(catalog) > 0
    # "finance:manage" is within the owner's own ceiling but NOT in cashier's
    # default set (cashier only has finance:read) — a real, meaningful grant.
    finance_manage = next(p for p in catalog if p["module"] == "finance" and p["action"] == "manage")

    before = (await client.get(
        f"/rbac/roles/{cashier_role['id']}/permissions", headers=owner_headers,
    )).json()
    assert not any(p["id"] == finance_manage["id"] for p in before)

    grant = await client.post(
        f"/rbac/roles/{cashier_role['id']}/permissions",
        headers=owner_headers,
        json={"permission_id": finance_manage["id"]},
    )
    assert grant.status_code == 204

    after = (await client.get(
        f"/rbac/roles/{cashier_role['id']}/permissions", headers=owner_headers,
    )).json()
    assert any(p["id"] == finance_manage["id"] for p in after)

    # Granting again is idempotent, not an error.
    regrant = await client.post(
        f"/rbac/roles/{cashier_role['id']}/permissions",
        headers=owner_headers,
        json={"permission_id": finance_manage["id"]},
    )
    assert regrant.status_code == 204

    revoke = await client.delete(
        f"/rbac/roles/{cashier_role['id']}/permissions/{finance_manage['id']}",
        headers=owner_headers,
    )
    assert revoke.status_code == 204

    after_revoke = (await client.get(
        f"/rbac/roles/{cashier_role['id']}/permissions", headers=owner_headers,
    )).json()
    assert not any(p["id"] == finance_manage["id"] for p in after_revoke)

    # Revoking again is idempotent, not an error.
    re_revoke = await client.delete(
        f"/rbac/roles/{cashier_role['id']}/permissions/{finance_manage['id']}",
        headers=owner_headers,
    )
    assert re_revoke.status_code == 204


async def test_owner_cannot_grant_a_permission_beyond_their_own_ceiling(client):
    owner_headers, _ = await register_company(client, slug="acme3", email="owner@acme3.example.com")
    roles = (await client.get("/rbac/roles", headers=owner_headers)).json()
    cashier_role = next(r for r in roles if r["slug"] == "cashier")
    catalog = (await client.get("/rbac/permissions", headers=owner_headers)).json()
    # "kitchen:orders:read" is NOT in DEFAULT_ROLE_PERMISSIONS["owner"] (kitchen
    # staff get it, not the web owner) — the owner cannot delegate a capability
    # they don't themselves have. (inventory:stock:write no longer qualifies as
    # an example here since WH-01 added it to the owner's own ceiling.)
    beyond_ceiling = next(
        p for p in catalog if p["module"] == "kitchen" and p["action"] == "orders:read"
    )
    resp = await client.post(
        f"/rbac/roles/{cashier_role['id']}/permissions",
        headers=owner_headers,
        json={"permission_id": beyond_ceiling["id"]},
    )
    assert resp.status_code == 403


async def test_owner_cannot_customize_owner_or_admin_role_permissions(client):
    owner_headers, _ = await register_company(client, slug="acme4", email="owner@acme4.example.com")
    roles = (await client.get("/rbac/roles", headers=owner_headers)).json()
    owner_role = next(r for r in roles if r["slug"] == "owner")
    catalog = (await client.get("/rbac/permissions", headers=owner_headers)).json()
    some_permission = catalog[0]

    grant = await client.post(
        f"/rbac/roles/{owner_role['id']}/permissions",
        headers=owner_headers,
        json={"permission_id": some_permission["id"]},
    )
    assert grant.status_code == 403

    revoke = await client.delete(
        f"/rbac/roles/{owner_role['id']}/permissions/{some_permission['id']}",
        headers=owner_headers,
    )
    assert revoke.status_code == 403


async def test_granted_permission_actually_unlocks_the_gated_endpoint(client):
    """End-to-end proof the new permission grant is not cosmetic: before the
    grant the gated route 403s, after it the same cashier token succeeds."""
    owner_headers, _ = await register_company(client, slug="acme5", email="owner@acme5.example.com")
    await _create_staff(client, owner_headers, email="cashier@acme5.example.com", role_slug="cashier")
    cashier_headers = await _login(client, "cashier@acme5.example.com")

    denied = await client.post(
        "/finance/payment-types", headers=cashier_headers, json={"name": "Card", "type": "card"}
    )
    assert denied.status_code == 403

    roles = (await client.get("/rbac/roles", headers=owner_headers)).json()
    cashier_role = next(r for r in roles if r["slug"] == "cashier")
    catalog = (await client.get("/rbac/permissions", headers=owner_headers)).json()
    finance_manage = next(p for p in catalog if p["module"] == "finance" and p["action"] == "manage")
    grant = await client.post(
        f"/rbac/roles/{cashier_role['id']}/permissions",
        headers=owner_headers,
        json={"permission_id": finance_manage["id"]},
    )
    assert grant.status_code == 204

    # Same cashier token, no re-login — permissions are checked fresh from
    # the DB per request (check_permission), not baked into the JWT.
    allowed = await client.post(
        "/finance/payment-types", headers=cashier_headers, json={"name": "Card", "type": "card"}
    )
    assert allowed.status_code in (200, 201)


async def test_role_permission_management_is_tenant_scoped(client):
    a_headers, _ = await register_company(client, slug="alpha", email="owner@alpha.example.com")
    b_headers, _ = await register_company(client, slug="beta", email="owner@beta.example.com")

    a_roles = (await client.get("/rbac/roles", headers=a_headers)).json()
    a_cashier_role = next(r for r in a_roles if r["slug"] == "cashier")
    catalog = (await client.get("/rbac/permissions", headers=b_headers)).json()
    some_permission = catalog[0]

    # Company B cannot mutate any role definition, including Company A's —
    # _get_scoped_role finds no row for company B's tenant and 404s (not a
    # blanket 403) so cross-tenant role ids don't even confirm existence.
    resp = await client.post(
        f"/rbac/roles/{a_cashier_role['id']}/permissions",
        headers=b_headers,
        json={"permission_id": some_permission["id"]},
    )
    assert resp.status_code == 404

    resp = await client.get(
        f"/rbac/roles/{a_cashier_role['id']}/permissions", headers=b_headers,
    )
    assert resp.status_code == 404
