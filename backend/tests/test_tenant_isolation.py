from __future__ import annotations

import asyncio
import os
from datetime import date
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.infrastructure.database.session import get_db
from app.main import app
from app.modules.organizations.models import OfflineJob, Organization
from app.modules.organizations.schemas import OfflineJobCreate, OfflineJobResponse
from app.modules.rbac.permissions import seed_permissions
from app.shared.admin_crud import (
    CRUDService,
    OrgScopeConfigurationError,
    crud_router,
)
from app.shared.base_model import Base
from app.shared.exceptions import NotFoundError
from app.shared.pagination import PageParams
from tests.conftest import create_staff_headers, register_company


async def _create_product(client, headers, name="Plov", price="50000"):
    resp = await client.post(
        "/inventory/products",
        headers=headers,
        json={"name": name, "price": price},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_postgresql_products_are_scoped_per_company(postgres_tenant_client):
    client, _ = postgres_tenant_client
    a_headers, _ = await register_company(client, slug="alpha", email="owner@alpha.example.com")
    b_headers, _ = await register_company(client, slug="beta", email="owner@beta.example.com")

    await _create_product(client, a_headers, name="Alpha Plov")
    await _create_product(client, b_headers, name="Beta Lagman")

    a_list = await client.get("/inventory/products", headers=a_headers)
    b_list = await client.get("/inventory/products", headers=b_headers)
    a_names = {p["name"] for p in a_list.json()}
    b_names = {p["name"] for p in b_list.json()}

    assert a_names == {"Alpha Plov"}
    assert b_names == {"Beta Lagman"}


async def test_postgresql_cannot_read_other_companys_product_by_id(
    postgres_tenant_client,
):
    client, _ = postgres_tenant_client
    a_headers, _ = await register_company(client, slug="alpha", email="owner@alpha.example.com")
    b_headers, _ = await register_company(client, slug="beta", email="owner@beta.example.com")

    product = await _create_product(client, a_headers, name="Secret Dish")
    pid = product["id"]

    # Company B must not be able to fetch company A's product.
    resp = await client.get(f"/inventory/products/{pid}", headers=b_headers)
    assert resp.status_code == 404


async def test_postgresql_cannot_update_other_companys_product(
    postgres_tenant_client,
):
    client, _ = postgres_tenant_client
    a_headers, _ = await register_company(client, slug="alpha", email="owner@alpha.example.com")
    b_headers, _ = await register_company(client, slug="beta", email="owner@beta.example.com")

    product = await _create_product(client, a_headers, name="Priced Dish", price="10000")
    pid = product["id"]

    resp = await client.patch(
        f"/inventory/products/{pid}",
        headers=b_headers,
        json={"price": "1"},
    )
    assert resp.status_code == 404

    # Confirm company A's product is unchanged.
    check = await client.get(f"/inventory/products/{pid}", headers=a_headers)
    assert check.json()["price"] == "10000.00"


async def _connect(url, database: str | None = None):
    return await asyncpg.connect(
        user=url.username,
        password=url.password,
        host=url.host,
        port=url.port or 5432,
        database=database or url.database,
    )


@pytest.fixture(scope="module")
def postgres_tenant_database_url():
    raw_url = os.getenv("TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL tenant isolation tests")

    control_url = make_url(raw_url)
    if control_url.get_backend_name() != "postgresql":
        pytest.skip("PostgreSQL is required for tenant isolation tests")
    if not control_url.database or "test" not in control_url.database.lower():
        pytest.fail("TEST_DATABASE_URL must name an explicitly disposable test DB")

    database = f"marjon_tenant_test_{uuid4().hex[:12]}"

    async def create_database() -> None:
        connection = await _connect(control_url)
        try:
            await connection.execute(f'CREATE DATABASE "{database}"')
        finally:
            await connection.close()

    async def drop_database() -> None:
        connection = await _connect(control_url)
        try:
            await connection.execute(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = $1 AND pid <> pg_backend_pid()
                """,
                database,
            )
            await connection.execute(f'DROP DATABASE IF EXISTS "{database}"')
        finally:
            await connection.close()

    asyncio.run(create_database())
    database_url = control_url.set(database=database).render_as_string(hide_password=False)
    try:
        yield database_url
    finally:
        asyncio.run(drop_database())


@pytest_asyncio.fixture
async def postgres_tenant_client(postgres_tenant_database_url):
    engine = create_async_engine(
        postgres_tenant_database_url,
        connect_args={"prepared_statement_cache_size": 0},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        await seed_permissions(session)

    async def override_get_db() -> AsyncSession:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client:
        yield client, session_factory
    app.dependency_overrides.clear()
    await engine.dispose()


def _scoped_offline_crud_app(session_factory, org_scope, org_field="organization_id"):
    async def override_get_db() -> AsyncSession:
        async with session_factory() as session:
            yield session

    async def allow_test_user():
        return None

    async def scoped_organizations():
        return org_scope

    test_app = FastAPI()
    test_app.include_router(
        crud_router(
            prefix="/offline-jobs",
            tags=["offline-jobs-test"],
            model=OfflineJob,
            create_schema=OfflineJobCreate,
            update_schema=OfflineJobCreate,
            response_schema=OfflineJobResponse,
            org_field=org_field,
            scope_dep=scoped_organizations,
            user_dep=allow_test_user,
        )
    )
    test_app.dependency_overrides[get_db] = override_get_db
    return test_app


async def _seed_scoped_offline_jobs(session_factory):
    async with session_factory() as session:
        organization_a = Organization(name="Scoped A")
        organization_b = Organization(name="Scoped B")
        session.add_all((organization_a, organization_b))
        await session.flush()
        job_a = OfflineJob(
            type="original-a",
            organization_id=organization_a.id,
            payload={"owner": "A"},
        )
        job_b = OfflineJob(
            type="original-b",
            organization_id=organization_b.id,
            payload={"owner": "B"},
        )
        session.add_all((job_a, job_b))
        await session.commit()
        return organization_a.id, organization_b.id, job_a.id, job_b.id


async def _register_tenant_pair(client, suffix: str):
    a_headers, _ = await register_company(
        client,
        slug=f"tenant-a-{suffix}",
        email=f"owner-a-{suffix}@example.com",
    )
    b_headers, _ = await register_company(
        client,
        slug=f"tenant-b-{suffix}",
        email=f"owner-b-{suffix}@example.com",
    )
    a_user = (await client.get("/auth/me", headers=a_headers)).json()
    b_user = (await client.get("/auth/me", headers=b_headers)).json()
    a_branch_response = await client.post(
        "/companies/me/branches", headers=a_headers, json={"name": "Alpha branch"}
    )
    b_branch_response = await client.post(
        "/companies/me/branches", headers=b_headers, json={"name": "Beta branch"}
    )
    assert a_branch_response.status_code == b_branch_response.status_code == 201
    a_branch = a_branch_response.json()
    b_branch = b_branch_response.json()
    return a_headers, b_headers, a_user, b_user, a_branch, b_branch


async def test_postgresql_product_crud_idor_and_query_filters_do_not_cross_tenants(
    postgres_tenant_client,
):
    client, _ = postgres_tenant_client
    a_headers, b_headers, *_ = await _register_tenant_pair(client, "crud")
    a_product = await _create_product(client, a_headers, name="Alpha private", price="100")
    b_product = await _create_product(client, b_headers, name="Beta secret", price="200")

    listed = await client.get(
        f"/inventory/products?company_id={b_product['company_id']}", headers=a_headers
    )
    assert listed.status_code == 200
    assert {item["id"] for item in listed.json()} == {a_product["id"]}

    searched = await client.get("/inventory/products?search=Beta", headers=a_headers)
    assert searched.status_code == 200
    assert all(item["id"] != b_product["id"] for item in searched.json())

    injected_company = await client.post(
        "/inventory/products",
        headers=a_headers,
        json={
            "name": "Server-scoped product",
            "price": "300",
            "company_id": b_product["company_id"],
        },
    )
    assert injected_company.status_code == 201
    assert injected_company.json()["company_id"] == a_product["company_id"]

    assert (await client.get(f"/inventory/products/{b_product['id']}", headers=a_headers)).status_code == 404
    assert (
        await client.patch(
            f"/inventory/products/{b_product['id']}",
            headers=a_headers,
            json={"price": "1", "company_id": a_product["company_id"]},
        )
    ).status_code == 404
    assert (
        await client.delete(f"/inventory/products/{b_product['id']}", headers=a_headers)
    ).status_code == 404

    unchanged = await client.get(f"/inventory/products/{b_product['id']}", headers=b_headers)
    assert unchanged.status_code == 200
    assert unchanged.json()["price"] == "200.00"
    assert unchanged.json()["is_active"] is True


async def test_postgresql_rejects_cross_tenant_inventory_relations(postgres_tenant_client):
    client, _ = postgres_tenant_client
    a_headers, b_headers, *_, b_branch = await _register_tenant_pair(client, "inventory")
    stock_headers = await create_staff_headers(
        client,
        a_headers,
        email="warehouse-a-inventory@example.com",
        role_slug="warehouse",
    )

    category = await client.post(
        "/inventory/categories",
        headers=b_headers,
        json={"name": "Beta category", "slug": "beta-category"},
    )
    ingredient = await client.post(
        "/inventory/ingredients", headers=b_headers, json={"name": "Beta ingredient"}
    )
    assert category.status_code == ingredient.status_code == 201

    product = await client.post(
        "/inventory/products",
        headers=a_headers,
        json={
            "name": "Invalid product",
            "price": "100",
            "category_id": category.json()["id"],
            "ingredients": [{"ingredient_id": ingredient.json()["id"], "quantity": "1"}],
        },
    )
    assert product.status_code == 404

    semi_product = await client.post(
        "/inventory/semi-products",
        headers=a_headers,
        json={
            "name": "Invalid semi-product",
            "category_id": category.json()["id"],
            "ingredients": [{"ingredient_id": ingredient.json()["id"], "quantity": "1"}],
        },
    )
    assert semi_product.status_code == 404

    warehouse = await client.post(
        "/warehouse/list",
        headers=stock_headers,
        json={"name": "Invalid warehouse", "branch_id": b_branch["id"]},
    )
    assert warehouse.status_code == 404

    movement = await client.post(
        "/inventory/stock/movements",
        headers=stock_headers,
        json={
            "warehouse_id": str(uuid4()),
            "ingredient_id": ingredient.json()["id"],
            "movement_type": "purchase",
            "quantity": "1",
            "unit": "kg",
        },
    )
    assert movement.status_code == 404


async def test_postgresql_rejects_cross_tenant_semi_product_ingredient(
    postgres_tenant_client,
):
    client, _ = postgres_tenant_client
    a_headers, b_headers, *_ = await _register_tenant_pair(client, "semi")
    ingredient = await client.post(
        "/inventory/ingredients", headers=b_headers, json={"name": "Beta semi ingredient"}
    )
    assert ingredient.status_code == 201

    semi_product = await client.post(
        "/inventory/semi-products",
        headers=a_headers,
        json={
            "name": "Invalid semi-product composition",
            "ingredients": [{"ingredient_id": ingredient.json()["id"], "quantity": "1"}],
        },
    )
    assert semi_product.status_code == 404


async def test_postgresql_rejects_cross_tenant_branch_and_employee_relations(
    postgres_tenant_client,
):
    client, _ = postgres_tenant_client
    a_headers, b_headers, _, b_user, _, b_branch = await _register_tenant_pair(client, "branch")

    b_employee = await client.post(
        "/hr/employees",
        headers=b_headers,
        json={
            "user_id": b_user["id"],
            "branch_id": b_branch["id"],
            "position": "Beta-only role",
            "hire_date": str(date.today()),
        },
    )
    assert b_employee.status_code == 201, b_employee.text

    patched = await client.patch(
        f"/hr/employees/{b_employee.json()['id']}",
        headers=a_headers,
        json={"position": "Leaked"},
    )
    assert patched.status_code == 404
    unchanged = await client.get("/hr/employees", headers=b_headers)
    assert unchanged.status_code == 200
    assert unchanged.json()[0]["position"] == "Beta-only role"

    foreign_employee = await client.post(
        "/hr/employees",
        headers=a_headers,
        json={
            "user_id": b_user["id"],
            "branch_id": b_branch["id"],
            "position": "Invalid",
            "hire_date": str(date.today()),
        },
    )
    assert foreign_employee.status_code == 404

    for path, payload in (
        ("/halls", {"name": "Invalid hall", "branch_id": b_branch["id"]}),
        ("/pos/terminals", {"name": "Invalid terminal", "branch_id": b_branch["id"]}),
        ("/kitchen/stations", {"name": "Invalid station", "branch_id": b_branch["id"]}),
        ("/delivery/zones", {"name": "Invalid zone", "branch_id": b_branch["id"]}),
    ):
        response = await client.post(path, headers=a_headers, json=payload)
        assert response.status_code == 404, (path, response.text)


async def test_postgresql_app_cannot_submit_hq_offline_job_for_an_organization(
    postgres_tenant_client,
):
    client, session_factory = postgres_tenant_client
    a_headers, *_ = await _register_tenant_pair(client, "offline")
    async with session_factory() as session:
        organization = Organization(name="HQ tenant", tin=uuid4().hex[:12])
        session.add(organization)
        await session.commit()
        organization_id = organization.id

    response = await client.post(
        "/offline-jobs/submit",
        headers=a_headers,
        json={"type": "sync", "organization_id": str(organization_id), "payload": {}},
    )
    assert response.status_code == 403
    assert (await client.get("/organizations", headers=a_headers)).status_code == 403
    assert (await client.get("/ratings", headers=a_headers)).status_code == 403


async def test_postgresql_search_relations_and_rbac_assignment_stay_in_tenant(
    postgres_tenant_client,
):
    client, _ = postgres_tenant_client
    a_headers, b_headers, _, b_user, _, b_branch = await _register_tenant_pair(
        client, "relations"
    )
    b_customer = await client.post(
        "/crm/customers",
        headers=b_headers,
        json={"phone": "+998900000002", "name": "Beta Hidden Customer"},
    )
    assert b_customer.status_code == 201

    search = await client.get("/crm/customers?q=Beta%20Hidden", headers=a_headers)
    assert search.status_code == 200
    assert search.json() == []

    assert (
        await client.get(
            f"/loyalty/accounts/{b_customer.json()['id']}", headers=a_headers
        )
    ).status_code == 404
    assert (
        await client.post(
            "/notifications",
            headers=a_headers,
            json={
                "user_id": b_user["id"],
                "title": "Invalid",
                "body": "Cross-tenant",
                "notification_type": "security",
            },
        )
    ).status_code == 404
    assert (
        await client.post(
            "/pos/orders",
            headers=a_headers,
            json={"branch_id": b_branch["id"], "items": []},
        )
    ).status_code == 404

    b_roles = (await client.get("/rbac/roles", headers=b_headers)).json()
    b_role = next(role for role in b_roles if role["company_id"] == b_user["company_id"])
    assignment = await client.post(
        "/rbac/user-roles",
        headers=a_headers,
        json={
            "user_id": b_user["id"],
            "role_id": b_role["id"],
            "branch_id": b_branch["id"],
        },
    )
    assert assignment.status_code == 404


async def test_postgresql_shared_admin_crud_applies_org_scope_to_every_crud_path(
    postgres_tenant_client,
):
    _, session_factory = postgres_tenant_client
    async with session_factory() as session:
        organization_a = Organization(name="Scoped A")
        organization_b = Organization(name="Scoped B")
        session.add_all((organization_a, organization_b))
        await session.commit()

        service = CRUDService(Organization, session)
        items, total = await service.list(
            PageParams(page=1, size=20),
            org_scope=[organization_a.id],
            org_field="id",
        )
        assert total == 1
        assert [item.id for item in items] == [organization_a.id]

        with pytest.raises(NotFoundError):
            await service.get(
                organization_b.id,
                org_scope=[organization_a.id],
                org_field="id",
            )
        with pytest.raises(NotFoundError):
            await service.update(
                organization_b.id,
                {"name": "Leaked"},
                org_scope=[organization_a.id],
                org_field="id",
            )
        with pytest.raises(NotFoundError):
            await service.delete(
                organization_b.id,
                org_scope=[organization_a.id],
                org_field="id",
            )

        unchanged = await service.get(
            organization_b.id,
            org_scope=[organization_b.id],
            org_field="id",
        )
        assert unchanged.name == "Scoped B"

        global_items, global_total = await service.list(
            PageParams(page=1, size=20),
            org_scope=None,
            org_field=None,
        )
        assert global_total == 2
        assert {item.id for item in global_items} == {
            organization_a.id,
            organization_b.id,
        }


async def test_postgresql_generic_crud_router_enforces_allow_list_on_every_path(
    postgres_tenant_client,
):
    _, session_factory = postgres_tenant_client
    organization_a_id, organization_b_id, job_a_id, job_b_id = (
        await _seed_scoped_offline_jobs(session_factory)
    )
    scoped_app = _scoped_offline_crud_app(session_factory, [organization_a_id])
    transport = ASGITransport(app=scoped_app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        listed = await client.get("/offline-jobs")
        assert listed.status_code == 200
        assert listed.json()["total"] == 1
        assert {item["id"] for item in listed.json()["items"]} == {str(job_a_id)}

        assert (await client.get(f"/offline-jobs/{job_a_id}")).status_code == 200
        assert (await client.get(f"/offline-jobs/{job_b_id}")).status_code == 404

        denied_create = await client.post(
            "/offline-jobs",
            json={
                "type": "escaped-create",
                "organization_id": str(organization_b_id),
                "payload": {"leaked": True},
            },
        )
        assert denied_create.status_code == 404

        allowed_create = await client.post(
            "/offline-jobs",
            json={
                "type": "allowed-create",
                "organization_id": str(organization_a_id),
                "payload": {"owner": "A"},
            },
        )
        assert allowed_create.status_code == 201
        created_a_id = allowed_create.json()["id"]

        allowed_patch = await client.patch(
            f"/offline-jobs/{job_a_id}",
            json={
                "type": "allowed-patch",
                "organization_id": str(organization_a_id),
                "payload": {"patched": True},
            },
        )
        assert allowed_patch.status_code == 200
        assert allowed_patch.json()["type"] == "allowed-patch"

        denied_patch = await client.patch(
            f"/offline-jobs/{job_a_id}",
            json={
                "type": "escaped-patch",
                "organization_id": str(organization_b_id),
                "payload": {"leaked": True},
            },
        )
        assert denied_patch.status_code == 404

        allowed_put = await client.put(
            f"/offline-jobs/{job_a_id}",
            json={
                "type": "allowed-put",
                "organization_id": str(organization_a_id),
                "payload": {"put": True},
            },
        )
        assert allowed_put.status_code == 200
        assert allowed_put.json()["type"] == "allowed-put"

        denied_put = await client.put(
            f"/offline-jobs/{job_b_id}",
            json={
                "type": "escaped-put",
                "organization_id": str(organization_a_id),
                "payload": {"leaked": True},
            },
        )
        assert denied_put.status_code == 404
        assert (await client.delete(f"/offline-jobs/{job_b_id}")).status_code == 404
        assert (await client.delete(f"/offline-jobs/{created_a_id}")).status_code == 204

    async with session_factory() as session:
        unchanged_b = await session.get(OfflineJob, job_b_id)
        assert unchanged_b is not None
        assert unchanged_b.type == "original-b"
        assert unchanged_b.organization_id == organization_b_id
        assert unchanged_b.payload == {"owner": "B"}
        jobs_for_b = list(
            (
                await session.execute(
                    select(OfflineJob).where(
                        OfflineJob.organization_id == organization_b_id
                    )
                )
            ).scalars()
        )
        assert [job.id for job in jobs_for_b] == [job_b_id]


async def test_postgresql_generic_crud_router_empty_scope_denies_every_path(
    postgres_tenant_client,
):
    _, session_factory = postgres_tenant_client
    organization_a_id, _, job_a_id, _ = await _seed_scoped_offline_jobs(
        session_factory
    )
    scoped_app = _scoped_offline_crud_app(session_factory, [])
    transport = ASGITransport(app=scoped_app)
    mutation_payload = {
        "type": "must-not-change",
        "organization_id": str(organization_a_id),
        "payload": {"leaked": True},
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        listed = await client.get("/offline-jobs")
        assert listed.status_code == 200
        assert listed.json()["total"] == 0
        assert listed.json()["items"] == []
        assert (await client.get(f"/offline-jobs/{job_a_id}")).status_code == 404
        assert (
            await client.post("/offline-jobs", json=mutation_payload)
        ).status_code == 404
        assert (
            await client.patch(f"/offline-jobs/{job_a_id}", json=mutation_payload)
        ).status_code == 404
        assert (
            await client.put(f"/offline-jobs/{job_a_id}", json=mutation_payload)
        ).status_code == 404
        assert (await client.delete(f"/offline-jobs/{job_a_id}")).status_code == 404

    async with session_factory() as session:
        unchanged_a = await session.get(OfflineJob, job_a_id)
        assert unchanged_a is not None
        assert unchanged_a.type == "original-a"
        assert unchanged_a.payload == {"owner": "A"}
        jobs_for_a = list(
            (
                await session.execute(
                    select(OfflineJob).where(
                        OfflineJob.organization_id == organization_a_id
                    )
                )
            ).scalars()
        )
        assert [job.id for job in jobs_for_a] == [job_a_id]


@pytest.mark.parametrize(
    ("org_field", "use_empty_scope"),
    ((None, False), ("", True), ("organization_typo", False)),
)
async def test_postgresql_generic_crud_router_invalid_org_field_fails_closed(
    postgres_tenant_client,
    org_field,
    use_empty_scope,
):
    _, session_factory = postgres_tenant_client
    organization_a_id, _, job_a_id, _ = await _seed_scoped_offline_jobs(
        session_factory
    )
    org_scope = [] if use_empty_scope else [organization_a_id]
    scoped_app = _scoped_offline_crud_app(
        session_factory, org_scope, org_field=org_field
    )
    transport = ASGITransport(app=scoped_app, raise_app_exceptions=True)
    mutation_payload = {
        "type": "must-not-change",
        "organization_id": str(organization_a_id),
        "payload": {"leaked": True},
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with pytest.raises(OrgScopeConfigurationError):
            await client.get("/offline-jobs")
        with pytest.raises(OrgScopeConfigurationError):
            await client.get(f"/offline-jobs/{job_a_id}")
        with pytest.raises(OrgScopeConfigurationError):
            await client.post("/offline-jobs", json=mutation_payload)
        with pytest.raises(OrgScopeConfigurationError):
            await client.patch(f"/offline-jobs/{job_a_id}", json=mutation_payload)
        with pytest.raises(OrgScopeConfigurationError):
            await client.put(f"/offline-jobs/{job_a_id}", json=mutation_payload)
        with pytest.raises(OrgScopeConfigurationError):
            await client.delete(f"/offline-jobs/{job_a_id}")

    async with session_factory() as session:
        unchanged_a = await session.get(OfflineJob, job_a_id)
        assert unchanged_a is not None
        assert unchanged_a.type == "original-a"
        assert unchanged_a.payload == {"owner": "A"}
        jobs_for_a = list(
            (
                await session.execute(
                    select(OfflineJob).where(
                        OfflineJob.organization_id == organization_a_id
                    )
                )
            ).scalars()
        )
        assert [job.id for job in jobs_for_a] == [job_a_id]
