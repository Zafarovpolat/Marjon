from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.auth.models import User
from app.modules.auth.security import create_access_token, hash_password
from app.modules.rbac.models import Permission, Role, RolePermission, UserRole
from app.modules.rbac.permissions import backfill_role_permissions
from tests.conftest import register_company


async def _superadmin(db_engine, *, email="root@bi06.example.com", company_id=None):
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        user = User(
            company_id=company_id,
            email=email,
            password_hash=hash_password("RootPass1!"),
            is_active=True,
            is_superadmin=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


async def _login(client, email, password="Passw0rd!"):
    response = await client.post(
        "/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _owner_id(client, headers):
    response = await client.get("/auth/me", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["id"]


async def test_hq_and_app_sessions_are_bidirectionally_isolated(client, db_engine):
    owner_headers, _ = await register_company(
        client, slug="bi06-owner", email="owner@bi06.example.com"
    )
    owner_company_id = (await client.get("/auth/me", headers=owner_headers)).json()[
        "company_id"
    ]
    root = await _superadmin(db_engine, company_id=UUID(owner_company_id))

    regular_login = await client.post(
        "/auth/login", json={"email": root.email, "password": "RootPass1!"}
    )
    app_super_headers = {
        "Authorization": f"Bearer {regular_login.json()['access_token']}"
    }
    assert (await client.get("/organizations", headers=app_super_headers)).status_code == 403
    assert (await client.post("/companies", headers=app_super_headers, json={"name": "X", "slug": "x"})).status_code == 403
    assert (await client.get("/inventory/products", headers=app_super_headers)).status_code == 403

    hq_login = await client.post(
        "/auth/admin/login", json={"email": root.email, "password": "RootPass1!"}
    )
    hq_headers = {"Authorization": f"Bearer {hq_login.json()['access_token']}"}
    assert (await client.get("/organizations", headers=hq_headers)).status_code == 200
    assert (await client.get("/companies/me", headers=hq_headers)).status_code == 403
    assert (await client.get("/analytics/dashboard", headers=hq_headers)).status_code == 403
    for path in (
        "/inventory/products",
        "/finance/payment-types",
        "/pos/orders",
        "/settings/organization",
        "/warehouse/list",
    ):
        assert (await client.get(path, headers=hq_headers)).status_code == 403, path

    assert (await client.get("/organizations", headers=owner_headers)).status_code == 403


async def test_hq_guard_requires_both_scope_and_current_server_flag(client, db_engine):
    root = await _superadmin(db_engine, email="root-flag@bi06.example.com")
    forged_scope_token = create_access_token(root.id, None, auth_scope="hq_admin")

    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        stored = await db.get(User, root.id)
        stored.is_superadmin = False
        await db.commit()

    headers = {"Authorization": f"Bearer {forged_scope_token}"}
    assert (await client.get("/organizations", headers=headers)).status_code == 403


async def test_owner_cannot_capture_same_company_superadmin(client, db_engine):
    owner_headers, _ = await register_company(
        client, slug="bi06-capture", email="owner-capture@bi06.example.com"
    )
    company_id = UUID((await client.get(
        "/auth/me", headers=owner_headers
    )).json()["company_id"])
    root = await _superadmin(
        db_engine, email="root-capture@bi06.example.com", company_id=company_id
    )

    for path in ("/auth/users", "/auth/staff-users"):
        response = await client.get(path, headers=owner_headers)
        assert response.status_code == 200
        assert all(row["id"] != str(root.id) for row in response.json())

    cashier = await client.post(
        "/auth/users",
        headers=owner_headers,
        json={
            "email": "cashier-capture@bi06.example.com",
            "password": "Passw0rd!",
            "role_slug": "cashier",
        },
    )
    roles = (await client.get("/rbac/roles", headers=owner_headers)).json()
    cashier_role = next(role for role in roles if role["slug"] == "cashier")
    for target_id, expected in ((str(root.id), 404), (cashier.json()["id"], 403)):
        assert (await client.post(
            "/rbac/user-roles",
            headers=owner_headers,
            json={"user_id": target_id, "role_id": cashier_role["id"]},
        )).status_code == expected

    assert (await client.patch(
        f"/auth/users/{root.id}",
        headers=owner_headers,
        json={"password": "Captured1!"},
    )).status_code == 404
    assert (await client.patch(
        f"/auth/users/{root.id}/pin", headers=owner_headers, json={"pin": "1234"}
    )).status_code == 404
    assert (await client.delete(
        f"/auth/users/{root.id}", headers=owner_headers
    )).status_code == 404
    assert (await client.post(
        "/auth/admin/login",
        json={"email": root.email, "password": "Captured1!"},
    )).status_code == 401


async def test_owner_has_explicit_web_capabilities_without_deferred_inventory(client):
    headers, _ = await register_company(
        client, slug="bi06-capabilities", email="owner-cap@bi06.example.com"
    )
    response = await client.get("/rbac/me/permissions", headers=headers)
    assert response.status_code == 200
    capabilities = set(response.json())
    assert {
        "companies:manage",
        "companies:branches:manage",
        "rbac:users:manage",
        "finance:manage",
        "finance:read",
        "analytics:dashboard",
        "analytics:reports",
    } <= capabilities
    assert "inventory:stock:read" not in capabilities
    assert "inventory:stock:write" not in capabilities
    assert (await client.post("/warehouse/list", headers=headers, json={"name": "Deferred"})).status_code == 403


async def test_owner_role_and_permission_definition_endpoints_fail_closed(client):
    headers, _ = await register_company(
        client, slug="bi06-role-def", email="owner-role@bi06.example.com"
    )
    roles = (await client.get("/rbac/roles", headers=headers)).json()
    owner_role = next(role for role in roles if role["slug"] == "owner")

    assert (await client.post(
        "/rbac/roles", headers=headers, json={"name": "My Admin", "slug": "manager"}
    )).status_code == 403
    assert (await client.get("/rbac/permissions", headers=headers)).status_code == 403
    assert (await client.post(
        f"/rbac/roles/{owner_role['id']}/permissions",
        headers=headers,
        json={"permission_id": owner_role["id"]},
    )).status_code == 403
    assert (await client.delete(
        f"/rbac/roles/{owner_role['id']}/permissions/{owner_role['id']}",
        headers=headers,
    )).status_code == 403


async def test_owner_cannot_create_owner_or_inject_hq_fields(client):
    headers, _ = await register_company(
        client, slug="bi06-ceiling", email="owner-ceiling@bi06.example.com"
    )
    base = {"email": "candidate@bi06.example.com", "password": "Passw0rd!"}
    assert (await client.post(
        "/auth/users", headers=headers, json={**base, "role_slug": "owner"}
    )).status_code == 403
    assert (await client.post(
        "/auth/users", headers=headers, json={**base, "role_slug": "admin"}
    )).status_code == 403
    assert (await client.post(
        "/auth/users", headers=headers, json={**base, "role_slug": "superadmin"}
    )).status_code == 422
    assert (await client.post(
        "/auth/users", headers=headers, json={**base, "role_slug": "hq_admin"}
    )).status_code == 422
    assert (await client.post(
        "/auth/users",
        headers=headers,
        json={**base, "role_slug": "cashier", "is_superadmin": True},
    )).status_code == 422
    assert (await client.post(
        "/auth/users",
        headers=headers,
        json={**base, "role_slug": "cashier", "auth_scope": "hq_admin"},
    )).status_code == 422


async def test_owner_cannot_self_escalate_or_replace_own_role(client):
    headers, _ = await register_company(
        client, slug="bi06-self", email="owner-self@bi06.example.com"
    )
    owner_id = UUID(await _owner_id(client, headers))
    assert (await client.patch(
        f"/auth/users/{owner_id}", headers=headers, json={"role_slug": "manager"}
    )).status_code == 403
    assert (await client.patch(
        f"/auth/users/{owner_id}", headers=headers, json={"name": "Replacement Owner"}
    )).status_code == 403
    assert (await client.delete(
        f"/auth/users/{owner_id}", headers=headers
    )).status_code == 403
    assert (await client.patch(
        f"/auth/users/{owner_id}/pin", headers=headers, json={"pin": "1234"}
    )).status_code == 403

    roles = (await client.get("/rbac/roles", headers=headers)).json()
    cashier_role = next(
        (role for role in roles if role["slug"] == "cashier"), None
    )
    if cashier_role is None:
        created = await client.post(
            "/auth/users",
            headers=headers,
            json={
                "email": "cashier-self@bi06.example.com",
                "password": "Passw0rd!",
                "role_slug": "cashier",
            },
        )
        assert created.status_code == 201
        roles = (await client.get("/rbac/roles", headers=headers)).json()
        cashier_role = next(role for role in roles if role["slug"] == "cashier")
    assert (await client.post(
        "/rbac/user-roles",
        headers=headers,
        json={"user_id": str(owner_id), "role_id": cashier_role["id"]},
    )).status_code == 403


async def test_cross_company_role_user_and_branch_assignments_are_hidden(client):
    a_headers, _ = await register_company(
        client, slug="bi06-alpha", email="owner-alpha@bi06.example.com"
    )
    b_headers, _ = await register_company(
        client, slug="bi06-beta", email="owner-beta@bi06.example.com"
    )
    b_staff = await client.post(
        "/auth/users",
        headers=b_headers,
        json={
            "email": "staff-beta@bi06.example.com",
            "password": "Passw0rd!",
            "role_slug": "cashier",
        },
    )
    assert b_staff.status_code == 201
    b_branch = await client.post(
        "/companies/me/branches", headers=b_headers, json={"name": "Beta"}
    )
    assert b_branch.status_code == 201
    b_roles = (await client.get("/rbac/roles", headers=b_headers)).json()
    b_cashier = next(role for role in b_roles if role["slug"] == "cashier")

    response = await client.post(
        "/rbac/user-roles",
        headers=a_headers,
        json={
            "user_id": b_staff.json()["id"],
            "role_id": b_cashier["id"],
            "branch_id": b_branch.json()["id"],
        },
    )
    assert response.status_code == 404


async def test_system_and_ambiguous_roles_are_not_visible_or_assignable(client, db_engine):
    headers, _ = await register_company(
        client, slug="bi06-system", email="owner-system@bi06.example.com"
    )
    owner_id = UUID(await _owner_id(client, headers))
    target = await client.post(
        "/auth/users",
        headers=headers,
        json={
            "email": "target-system@bi06.example.com",
            "password": "Passw0rd!",
            "role_slug": "cashier",
        },
    )
    assert target.status_code == 201
    target_id = target.json()["id"]
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        system = Role(
            company_id=None,
            name="HQ Root",
            slug="hq_admin",
            is_system=True,
        )
        ambiguous = Role(
            company_id=(await db.get(User, owner_id)).company_id,
            name="Legacy ambiguous",
            slug="legacy_ambiguous",
            is_system=False,
        )
        db.add_all([system, ambiguous])
        await db.commit()
        await db.refresh(system)
        await db.refresh(ambiguous)

    roles = (await client.get("/rbac/roles", headers=headers)).json()
    assert all(role["id"] != str(system.id) for role in roles)
    assert all(role["id"] != str(ambiguous.id) for role in roles)
    assert (await client.post(
        "/rbac/user-roles",
        headers=headers,
        json={"user_id": target_id, "role_id": str(system.id)},
    )).status_code == 404
    assert (await client.post(
        "/rbac/user-roles",
        headers=headers,
        json={"user_id": target_id, "role_id": str(ambiguous.id)},
    )).status_code == 404
    assert (await client.post(
        "/rbac/user-roles",
        headers=headers,
        json={"user_id": target_id, "role_id": str(next(
            role["id"] for role in roles if role["slug"] == "cashier"
        ))},
    )).status_code == 403

    async with sessions() as db:
        permission = (await db.execute(
            select(Permission).where(
                Permission.module == "finance", Permission.action == "manage"
            )
        )).scalar_one()
        db.add_all([
            UserRole(user_id=owner_id, role_id=ambiguous.id),
            RolePermission(role_id=ambiguous.id, permission_id=permission.id),
        ])
        await db.commit()

    assert (await client.get(
        "/rbac/me/permissions", headers=headers
    )).status_code == 403
    assert (await client.patch(
        "/companies/me", headers=headers, json={"name": "Ambiguous Escalation"}
    )).status_code == 403


async def test_owner_can_use_representative_own_company_web_paths(client):
    headers, _ = await register_company(
        client, slug="bi06-positive", email="owner-positive@bi06.example.com"
    )
    branch = await client.post(
        "/companies/me/branches", headers=headers, json={"name": "Main"}
    )
    assert branch.status_code == 201
    created_user = await client.post(
        "/auth/users",
        headers=headers,
        json={
            "email": "cashier-positive@bi06.example.com",
            "password": "Passw0rd!",
            "role_slug": "cashier",
        },
    )
    assert created_user.status_code == 201
    renamed = await client.patch(
        f"/auth/users/{created_user.json()['id']}",
        headers=headers,
        json={"role_name": "Cashier Name"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Cashier Name"
    assert (await client.get("/companies/me", headers=headers)).status_code == 200
    assert (await client.get("/companies/me/branches", headers=headers)).status_code == 200
    assert (await client.get("/auth/users", headers=headers)).status_code == 200
    assert (await client.get("/inventory/products", headers=headers)).status_code == 200
    assert (await client.get("/analytics/dashboard", headers=headers)).status_code == 200
    assert (await client.get("/reports/orders", headers=headers)).status_code == 200
    assert (await client.get("/finance/payment-types", headers=headers)).status_code == 200


async def test_manager_assignment_remains_but_web_owner_admin_is_deferred(client):
    owner_headers, _ = await register_company(
        client, slug="bi06-deferred", email="owner-deferred@bi06.example.com"
    )
    created = await client.post(
        "/auth/users",
        headers=owner_headers,
        json={
            "email": "manager-deferred@bi06.example.com",
            "password": "Passw0rd!",
            "role_slug": "manager",
        },
    )
    assert created.status_code == 201
    manager_headers = await _login(client, "manager-deferred@bi06.example.com")
    assert (await client.get("/auth/me", headers=manager_headers)).status_code == 200
    assert (await client.patch(
        "/companies/me", headers=manager_headers, json={"name": "Escalated"}
    )).status_code == 403
    assert (await client.post(
        "/auth/users",
        headers=manager_headers,
        json={
            "email": "created-by-manager@bi06.example.com",
            "password": "Passw0rd!",
            "role_slug": "cashier",
        },
    )).status_code == 403


async def test_operational_roles_cannot_call_frozen_owner_web_routes(client):
    owner_headers, _ = await register_company(
        client, slug="bi06-owner-routes", email="owner-routes@bi06.example.com"
    )
    created = await client.post(
        "/auth/users",
        headers=owner_headers,
        json={
            "email": "cashier-routes@bi06.example.com",
            "password": "Passw0rd!",
            "role_slug": "cashier",
        },
    )
    assert created.status_code == 201
    cashier_headers = await _login(client, "cashier-routes@bi06.example.com")

    denied_calls = (
        ("get", "/finance/transactions", None),
        ("post", "/finance/transactions", {"amount": 100, "direction": "income"}),
        ("get", "/analytics/dashboard", None),
        ("get", "/audit", None),
        ("get", "/hr/employees", None),
        ("get", "/reports/orders", None),
        ("get", "/auth/staff-users", None),
        ("get", "/finance/finance-history", None),
        ("get", "/subscriptions/current", None),
        ("get", "/fiscal/settings", None),
        ("put", "/fiscal/settings", {"enabled": False}),
    )
    for method, path, payload in denied_calls:
        kwargs = {"headers": cashier_headers}
        if payload is not None:
            kwargs["json"] = payload
        response = await getattr(client, method)(path, **kwargs)
        assert response.status_code == 403, (method, path, response.text)

    # The same owner routes stay usable for the frozen Web identity.
    assert (await client.get(
        "/finance/transactions", headers=owner_headers
    )).status_code == 200
    assert (await client.get(
        "/analytics/dashboard", headers=owner_headers
    )).status_code == 200


async def test_legacy_admin_is_preserved_but_fails_closed(client, db_engine):
    owner_headers, _ = await register_company(
        client, slug="bi06-legacy-admin", email="owner-legacy@bi06.example.com"
    )
    company_id = UUID((await client.get(
        "/auth/me", headers=owner_headers
    )).json()["company_id"])
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        legacy_user = User(
            company_id=company_id,
            email="legacy-admin@bi06.example.com",
            password_hash=hash_password("LegacyPass1!"),
            is_active=True,
        )
        legacy_role = Role(
            company_id=company_id,
            name="Legacy Admin",
            slug="admin",
            is_system=False,
        )
        db.add_all([legacy_user, legacy_role])
        await db.flush()
        permissions = list((await db.execute(select(Permission))).scalars().all())
        db.add(UserRole(user_id=legacy_user.id, role_id=legacy_role.id))
        db.add_all([
            RolePermission(role_id=legacy_role.id, permission_id=permission.id)
            for permission in permissions
        ])
        await db.commit()
        legacy_user_id = legacy_user.id
        legacy_role_id = legacy_role.id

    legacy_headers = await _login(
        client, "legacy-admin@bi06.example.com", "LegacyPass1!"
    )
    assert (await client.get(
        "/companies/me", headers=legacy_headers
    )).status_code == 403
    assert (await client.get(
        "/rbac/me/permissions", headers=legacy_headers
    )).status_code == 403

    async with sessions() as db:
        await backfill_role_permissions(db)
        assert await db.get(User, legacy_user_id) is not None
        assert await db.get(Role, legacy_role_id) is not None
        links = list((await db.execute(
            select(RolePermission).where(RolePermission.role_id == legacy_role_id)
        )).scalars().all())
        assert links == []


async def test_owner_permission_ceiling_ignores_stale_legacy_links(client, db_engine):
    owner_headers, _ = await register_company(
        client, slug="bi06-stale-owner", email="owner-stale@bi06.example.com"
    )
    owner_id = UUID(await _owner_id(client, owner_headers))
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        owner_role = (await db.execute(
            select(Role)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == owner_id)
        )).scalar_one()
        stock_write = (await db.execute(select(Permission).where(
            Permission.module == "inventory",
            Permission.action == "stock:write",
        ))).scalar_one()
        db.add(RolePermission(
            role_id=owner_role.id, permission_id=stock_write.id
        ))
        await db.commit()

    permissions = await client.get(
        "/rbac/me/permissions", headers=owner_headers
    )
    assert permissions.status_code == 200
    assert "inventory:stock:write" not in permissions.json()
    assert (await client.post(
        "/warehouse/list", headers=owner_headers, json={"name": "Still deferred"}
    )).status_code == 403
