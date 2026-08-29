from __future__ import annotations

import asyncio
from decimal import Decimal
import os
from pathlib import Path
import subprocess
import sys
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.engine import make_url

from app.infrastructure.database.session import get_db
from app.main import app
from app.modules.auth.models import User
from app.modules.auth.security import hash_password
from app.modules.companies.models import Company
from app.modules.finance.models import (
    FinanceTemplate,
    FinTransaction,
    PaymentType,
    TransactionCategory,
)
from app.modules.finance.idempotency import request_fingerprint
from app.modules.finance.schemas import TransactionCreate
from app.modules.organizations.models import Organization
from app.modules.rbac.permissions import seed_permissions
from app.shared.base_model import Base
from tests.conftest import register_company


BACKEND_ROOT = Path(__file__).resolve().parents[1]
BI05A_HEAD = "bi05aown20"
BI05A_BASE = "bi05bfin19"


def test_f_optional_template_keeps_pre_bi05a_idempotency_fingerprint_compatible():
    payload = TransactionCreate(amount=Decimal("10"), direction="income")
    pre_bi05a = payload.model_dump(mode="json")
    pre_bi05a.pop("finance_template_id")
    assert request_fingerprint(payload) == request_fingerprint(pre_bi05a)

    payload_with_template = payload.model_copy(
        update={"finance_template_id": uuid4()}
    )
    assert request_fingerprint(payload_with_template) != request_fingerprint(pre_bi05a)


def _control_url():
    raw = os.getenv("TEST_DATABASE_URL")
    if not raw:
        pytest.skip("TEST_DATABASE_URL is required for BI-05A PostgreSQL tests")
    url = make_url(raw)
    if url.get_backend_name() != "postgresql":
        pytest.skip("PostgreSQL is required for BI-05A tests")
    if not url.database or "test" not in url.database.lower():
        pytest.fail("TEST_DATABASE_URL must name an explicitly disposable test DB")
    return url


async def _connect(url):
    url = make_url(url)
    return await asyncpg.connect(
        user=url.username,
        password=url.password,
        host=url.host,
        port=url.port or 5432,
        database=url.database,
    )


async def _create_database(control_url, name: str) -> str:
    connection = await _connect(control_url)
    try:
        await connection.execute(f'CREATE DATABASE "{name}"')
    finally:
        await connection.close()
    return control_url.set(database=name).render_as_string(hide_password=False)


async def _drop_database(control_url, name: str) -> None:
    connection = await _connect(control_url)
    try:
        await connection.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    finally:
        await connection.close()


def _alembic(database_url: str, command: str, target: str, *, success: bool = True):
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", command, target],
        cwd=BACKEND_ROOT,
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if success:
        assert result.returncode == 0, result.stdout + result.stderr
    else:
        assert result.returncode != 0
    return result


@pytest.fixture(scope="module")
def finance_api_database_url():
    control = _control_url()
    name = f"marjon_bi05a_api_{uuid4().hex[:10]}"
    url = asyncio.run(_create_database(control, name))
    try:
        yield url
    finally:
        asyncio.run(_drop_database(control, name))


@pytest_asyncio.fixture
async def finance_api(finance_api_database_url):
    engine = create_async_engine(
        finance_api_database_url,
        connect_args={"prepared_statement_cache_size": 0},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        await seed_permissions(db)

    async def override_get_db() -> AsyncSession:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test/api/v1"
    ) as client:
        yield client, sessions
    app.dependency_overrides.clear()
    await engine.dispose()


async def _companies(client, suffix: str):
    a_headers, _ = await register_company(
        client, slug=f"bi05a-a-{suffix}", email=f"a-{suffix}@example.com"
    )
    b_headers, _ = await register_company(
        client, slug=f"bi05a-b-{suffix}", email=f"b-{suffix}@example.com"
    )
    a_id = (await client.get("/auth/me", headers=a_headers)).json()["company_id"]
    b_id = (await client.get("/auth/me", headers=b_headers)).json()["company_id"]
    return a_headers, b_headers, a_id, b_id


@pytest.mark.asyncio
async def test_a_b_c_effective_dictionaries_are_tenant_scoped(finance_api):
    """Matrix A-C/J: effective list, immutable system rows, CRUD privacy and trees."""
    client, sessions = finance_api
    suffix = uuid4().hex[:8]
    a, b, _a_id, _b_id = await _companies(client, suffix)
    async with sessions() as db:
        system_payment = PaymentType(
            name="System Cash", type="cash", scope_kind="system"
        )
        system_category = TransactionCategory(
            name="System Income", kind="income", scope_kind="system"
        )
        system_template = FinanceTemplate(
            name="System Template", payload={"kind": "income"}, scope_kind="system"
        )
        db.add_all((system_payment, system_category, system_template))
        await db.commit()
        system_payment_id = str(system_payment.id)
        system_category_id = str(system_category.id)
        system_template_id = str(system_template.id)

    custom = await client.post(
        "/finance/payment-types", headers=a,
        json={"name": "A Card", "type": "card"},
    )
    assert custom.status_code == 201, custom.text
    custom_id = custom.json()["id"]
    assert custom.json()["scope_kind"] == "company"
    assert (await client.get(f"/finance/payment-types/{custom_id}", headers=b)).status_code == 404
    assert (await client.patch(
        f"/finance/payment-types/{custom_id}", headers=b, json={"name": "stolen"}
    )).status_code == 404

    copy = await client.post(
        "/finance/payment-types", headers=a,
        json={"name": "A Cash Override", "source_template_id": system_payment_id},
    )
    assert copy.status_code == 201, copy.text
    a_ids = {row["id"] for row in (await client.get("/finance/payment-types", headers=a)).json()["items"]}
    b_ids = {row["id"] for row in (await client.get("/finance/payment-types", headers=b)).json()["items"]}
    assert copy.json()["id"] in a_ids and system_payment_id not in a_ids
    assert system_payment_id in b_ids and copy.json()["id"] not in b_ids
    assert (await client.get(f"/finance/payment-types/{system_payment_id}", headers=a)).status_code == 200
    assert (await client.patch(
        f"/finance/payment-types/{system_payment_id}", headers=a, json={"name": "mutate"}
    )).status_code == 403
    assert (await client.delete(f"/finance/payment-types/{system_payment_id}", headers=a)).status_code == 403

    parent = await client.post(
        "/finance/transaction-categories", headers=a,
        json={"name": "A Parent", "kind": "income"},
    )
    assert parent.status_code == 201, parent.text
    child = await client.post(
        "/finance/transaction-categories", headers=a,
        json={"name": "A Child", "kind": "income", "parent_id": parent.json()["id"]},
    )
    assert child.status_code == 201, child.text
    foreign_parent = await client.post(
        "/finance/transaction-categories", headers=b,
        json={"name": "B Parent", "kind": "income"},
    )
    assert (await client.post(
        "/finance/transaction-categories", headers=a,
        json={"name": "Bad", "kind": "income", "parent_id": foreign_parent.json()["id"]},
    )).status_code == 404
    assert (await client.post(
        "/finance/transaction-categories", headers=a,
        json={"name": "Bad System Parent", "kind": "income", "parent_id": system_category_id},
    )).status_code == 404

    own_template = await client.post(
        "/finance/finance-templates", headers=a,
        json={"name": "A Template", "payload": {"a": 1}},
    )
    assert own_template.status_code == 201, own_template.text
    assert (await client.get(
        f"/finance/finance-templates/{own_template.json()['id']}", headers=b
    )).status_code == 404
    assert (await client.patch(
        f"/finance/finance-templates/{system_template_id}",
        headers=a, json={"name": "mutate"},
    )).status_code == 403


@pytest.mark.asyncio
async def test_d_e_counterparty_and_history_privacy_match_across_routes(finance_api):
    """Matrix D/E/J: CRM and finance agree; transaction/history never leak."""
    client, _sessions = finance_api
    suffix = uuid4().hex[:8]
    a, b, _a_id, _b_id = await _companies(client, suffix)
    created = await client.post(
        "/finance/counterparties", headers=a,
        json={"full_name": "A Secret Counterparty", "type": "client"},
    )
    assert created.status_code == 201, created.text
    counterparty_id = created.json()["id"]
    assert (await client.get(f"/finance/counterparties/{counterparty_id}", headers=b)).status_code == 404
    assert (await client.get(f"/crm/counterparties/{counterparty_id}", headers=b)).status_code == 404
    assert (await client.patch(
        f"/crm/counterparties/{counterparty_id}", headers=b, json={"name": "stolen"}
    )).status_code == 404
    assert counterparty_id not in {
        item["id"] for item in (await client.get("/crm/counterparties", headers=b)).json()["items"]
    }

    tx = await client.post(
        "/finance/transactions", headers=a,
        json={"amount": 10, "direction": "income", "counterparty_id": counterparty_id},
    )
    assert tx.status_code == 201, tx.text
    changed = await client.patch(
        f"/finance/transactions/{tx.json()['id']}", headers=a, json={"amount": 12}
    )
    assert changed.status_code == 200, changed.text
    a_history = (await client.get("/finance/finance-history", headers=a)).json()["items"]
    b_history = (await client.get("/finance/finance-history", headers=b)).json()["items"]
    assert any(item["ref_id"] == tx.json()["id"] for item in a_history)
    assert not any(item["ref_id"] == tx.json()["id"] for item in b_history)
    assert (await client.get(
        f"/finance/counterparties/{counterparty_id}/transactions", headers=b
    )).status_code == 404
    same_company = await client.get(
        f"/finance/counterparties/{counterparty_id}/transactions", headers=a
    )
    assert same_company.status_code == 200
    assert [item["id"] for item in same_company.json()["items"]] == [tx.json()["id"]]


@pytest.mark.asyncio
async def test_f_g_foreign_references_and_hall_payment_types_are_rejected(finance_api):
    """Matrix F/G: company transactions and halls accept only system/same-company refs."""
    client, sessions = finance_api
    suffix = uuid4().hex[:8]
    a, b, a_id, _b_id = await _companies(client, suffix)
    b_payment = (await client.post(
        "/settings/payment-methods", headers=b, json={"name": "B Only"}
    )).json()
    b_category = (await client.post(
        "/finance/transaction-categories", headers=b,
        json={"name": "B Category", "kind": "income"},
    )).json()
    b_counterparty = (await client.post(
        "/crm/counterparties", headers=b, json={"name": "B Counterparty"}
    )).json()
    b_template = (await client.post(
        "/finance/finance-templates", headers=b,
        json={"name": "B Template", "payload": {}},
    )).json()
    for field, value in (
        ("payment_type_id", b_payment["id"]),
        ("category_id", b_category["id"]),
        ("counterparty_id", b_counterparty["id"]),
        ("finance_template_id", b_template["id"]),
    ):
        response = await client.post(
            "/finance/transactions", headers=a,
            json={"amount": 1, "direction": "income", field: value},
        )
        assert response.status_code == 404, (field, response.text)

    async with sessions() as db:
        system_payment = PaymentType(name="System Hall", scope_kind="system")
        system_template = FinanceTemplate(
            name="System Transaction Template", payload={}, scope_kind="system"
        )
        organization = Organization(name="Org Payment Owner")
        db.add_all((system_payment, system_template, organization))
        await db.flush()
        organization_payment = PaymentType(
            name="Org Only", scope_kind="organization", organization_id=organization.id
        )
        db.add(organization_payment)
        await db.commit()
        system_id = str(system_payment.id)
        system_template_id = str(system_template.id)
        org_id = str(organization_payment.id)

    branch = await client.post("/settings/places", headers=a, json={"name": "A Branch"})
    assert branch.status_code == 201, branch.text
    branch_id = branch.json()["id"]

    assert (await client.post(
        "/halls", headers=a, json={"name": "System Hall", "branch_id": branch_id,
                                    "payment_type_id": system_id}
    )).status_code == 201
    assert (await client.post(
        "/halls", headers=a, json={"name": "Foreign Hall", "branch_id": branch_id,
                                    "payment_type_id": b_payment["id"]}
    )).status_code == 404
    assert (await client.post(
        "/halls", headers=a, json={"name": "Org Hall", "branch_id": branch_id,
                                    "payment_type_id": org_id}
    )).status_code == 404
    a_payment = (await client.post(
        "/settings/payment-methods", headers=a, json={"name": "A Only"}
    )).json()
    own_hall = await client.post(
        "/halls", headers=a, json={"name": "Own Hall", "branch_id": branch_id,
                                    "payment_type_id": a_payment["id"]}
    )
    assert own_hall.status_code == 201, own_hall.text
    assert own_hall.json()["company_id"] == a_id
    system_template_tx = await client.post(
        "/finance/transactions", headers=a,
        json={
            "amount": 1,
            "direction": "income",
            "finance_template_id": system_template_id,
        },
    )
    assert system_template_tx.status_code == 201, system_template_tx.text


@pytest.mark.asyncio
async def test_c_e_f_hq_organization_dictionary_reference_and_history_scope(finance_api):
    """Matrix C/E/F/J: HQ dictionaries, references and history use one organization."""
    client, sessions = finance_api
    email = f"hq-{uuid4().hex[:8]}@example.com"
    password = "RootPass1!"
    async with sessions() as db:
        first = Organization(name=f"Org A {uuid4().hex[:6]}")
        second = Organization(name=f"Org B {uuid4().hex[:6]}")
        system_template = FinanceTemplate(
            name="HQ System Template", payload={}, scope_kind="system"
        )
        company_id = uuid4()
        company = Company(
            id=company_id,
            slug=f"hq-list-company-{uuid4().hex[:8]}",
            name="HQ list company",
        )
        company_transaction = FinTransaction(
            amount=1, direction="income", company_id=company_id
        )
        global_transaction = FinTransaction(amount=1, direction="income")
        db.add_all((
            first,
            second,
            system_template,
            company,
            company_transaction,
            global_transaction,
            User(
                email=email,
                password_hash=hash_password(password),
                is_superadmin=True,
                is_active=True,
            ),
        ))
        await db.flush()
        first_id, second_id = str(first.id), str(second.id)
        system_template_id = str(system_template.id)
        company_transaction_id = str(company_transaction.id)
        global_transaction_id = str(global_transaction.id)
        await db.commit()

    login = await client.post(
        "/auth/admin/login", json={"email": email, "password": password}
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    def path(resource: str, organization_id: str) -> str:
        return f"/hq/finance/{resource}?organization_id={organization_id}"

    template = await client.post(
        path("finance-templates", first_id), headers=headers,
        json={"name": "Org A Template", "payload": {"owner": "A"}},
    )
    assert template.status_code == 201, template.text
    template_b = await client.post(
        path("finance-templates", second_id), headers=headers,
        json={"name": "Org B Template", "payload": {"owner": "B"}},
    )
    assert template_b.status_code == 201, template_b.text
    second_templates = await client.get(path("finance-templates", second_id), headers=headers)
    assert template.json()["id"] not in {item["id"] for item in second_templates.json()["items"]}
    assert (await client.patch(
        f"/hq/finance/finance-templates/{system_template_id}?organization_id={first_id}",
        headers=headers, json={"name": "mutate"},
    )).status_code == 403

    payment_a = await client.post(
        path("payment-types", first_id), headers=headers, json={"name": "Org A Cash"}
    )
    payment_b = await client.post(
        path("payment-types", second_id), headers=headers, json={"name": "Org B Cash"}
    )
    category_a = await client.post(
        path("transaction-categories", first_id), headers=headers,
        json={"name": "Org A Income", "kind": "income"},
    )
    counterparty_a = await client.post(
        path("counterparties", first_id), headers=headers,
        json={"full_name": "Org A Counterparty"},
    )
    for response in (payment_a, payment_b, category_a, counterparty_a):
        assert response.status_code == 201, response.text

    foreign_tx = await client.post(
        "/hq/finance/transactions", headers=headers,
        json={
            "amount": 10,
            "direction": "income",
            "organization_id": first_id,
            "payment_type_id": payment_b.json()["id"],
        },
    )
    assert foreign_tx.status_code == 404
    foreign_template_tx = await client.post(
        "/hq/finance/transactions", headers=headers,
        json={
            "amount": 10,
            "direction": "income",
            "organization_id": first_id,
            "finance_template_id": template_b.json()["id"],
        },
    )
    assert foreign_template_tx.status_code == 404
    tx = await client.post(
        "/hq/finance/transactions", headers=headers,
        json={
            "amount": 10,
            "direction": "income",
            "organization_id": first_id,
            "payment_type_id": payment_a.json()["id"],
            "category_id": category_a.json()["id"],
            "counterparty_id": counterparty_a.json()["id"],
            "finance_template_id": template.json()["id"],
        },
    )
    assert tx.status_code == 201, tx.text
    changed = await client.patch(
        f"/hq/finance/transactions/{tx.json()['id']}",
        headers=headers,
        json={"amount": 12},
    )
    assert changed.status_code == 200, changed.text
    hq_transactions = await client.get("/hq/finance/transactions", headers=headers)
    hq_transaction_ids = {item["id"] for item in hq_transactions.json()["items"]}
    assert tx.json()["id"] in hq_transaction_ids
    assert company_transaction_id not in hq_transaction_ids
    assert global_transaction_id not in hq_transaction_ids
    first_history = await client.get(path("finance-history", first_id), headers=headers)
    second_history = await client.get(path("finance-history", second_id), headers=headers)
    assert any(item["ref_id"] == tx.json()["id"] for item in first_history.json()["items"])
    assert not any(item["ref_id"] == tx.json()["id"] for item in second_history.json()["items"])


async def _seed_legacy_fixture(database_url: str, *, ambiguous_balance: bool) -> dict:
    ids = {name: uuid4() for name in (
        "company_a", "company_b", "payment_multi", "payment_single", "payment_mixed",
        "category_root", "category_child", "counterparty", "template",
        "tx_a", "tx_b", "tx_single", "tx_mixed_owner", "tx_unknown", "history",
    )}
    connection = await _connect(database_url)
    try:
        await connection.executemany(
            """INSERT INTO companies(id, slug, name, timezone, currency, is_active)
               VALUES($1,$2,$3,'UTC','UZS',true)""",
            [
                (ids["company_a"], f"legacy-a-{uuid4().hex[:6]}", "Legacy A"),
                (ids["company_b"], f"legacy-b-{uuid4().hex[:6]}", "Legacy B"),
            ],
        )
        await connection.executemany(
            "INSERT INTO fin_payment_types(id,sort,name,type,status) VALUES($1,0,$2,'cash',true)",
            [
                (ids["payment_multi"], "Shared"),
                (ids["payment_single"], "Single"),
                (ids["payment_mixed"], "Mixed known and unknown"),
            ],
        )
        await connection.execute(
            "INSERT INTO fin_transaction_categories(id,name,kind,status) VALUES($1,'Root','income',true)",
            ids["category_root"],
        )
        await connection.execute(
            """INSERT INTO fin_transaction_categories(id,name,kind,parent_id,status)
               VALUES($1,'Child','income',$2,true)""",
            ids["category_child"], ids["category_root"],
        )
        await connection.execute(
            """INSERT INTO fin_counterparties(id,full_name,balance,type)
               VALUES($1,'Shared Counterparty',$2,'client')""",
            ids["counterparty"], 75 if ambiguous_balance else 0,
        )
        await connection.execute(
            "INSERT INTO fin_templates(id,name,payload) VALUES($1,'Unowned','{}'::jsonb)",
            ids["template"],
        )
        await connection.executemany(
            """INSERT INTO fin_transactions
               (id,amount,direction,payment_type_id,counterparty_id,category_id,company_id)
               VALUES($1,10,'income',$2,$3,$4,$5)""",
            [
                (ids["tx_a"], ids["payment_multi"], ids["counterparty"], ids["category_child"], ids["company_a"]),
                (ids["tx_b"], ids["payment_multi"], ids["counterparty"], ids["category_child"], ids["company_b"]),
                (ids["tx_single"], ids["payment_single"], None, None, ids["company_a"]),
                (ids["tx_mixed_owner"], ids["payment_mixed"], None, None, ids["company_a"]),
            ],
        )
        await connection.execute(
            """INSERT INTO fin_transactions(id,amount,direction,payment_type_id)
               VALUES($1,10,'income',$2)""",
            ids["tx_unknown"], ids["payment_mixed"],
        )
        await connection.execute(
            "INSERT INTO fin_history(id,status,ref_id,company_id) VALUES($1,'updated',$2,$3)",
            ids["history"], ids["tx_a"], ids["company_b"],
        )
    finally:
        await connection.close()
    return ids


def test_h_i_legacy_clone_remap_downgrade_and_reupgrade():
    """Matrix H/I: deterministic legacy reconciliation, tree remap and reversible upgrade."""
    control = _control_url()
    name = f"marjon_bi05a_legacy_{uuid4().hex[:10]}"
    database_url = asyncio.run(_create_database(control, name))
    try:
        _alembic(database_url, "upgrade", BI05A_BASE)
        ids = asyncio.run(_seed_legacy_fixture(database_url, ambiguous_balance=False))
        _alembic(database_url, "upgrade", BI05A_HEAD)

        async def verify() -> None:
            connection = await _connect(database_url)
            try:
                assert await connection.fetchval(
                    "SELECT scope_kind FROM fin_payment_types WHERE id=$1", ids["payment_multi"]
                ) == "legacy"
                assert await connection.fetchval(
                    "SELECT scope_kind FROM fin_payment_types WHERE id=$1", ids["payment_single"]
                ) == "company"
                assert await connection.fetchval(
                    "SELECT scope_kind FROM fin_payment_types WHERE id=$1", ids["payment_mixed"]
                ) == "legacy"
                assert await connection.fetchval(
                    "SELECT payment_type_id FROM fin_transactions WHERE id=$1", ids["tx_unknown"]
                ) == ids["payment_mixed"]
                assert await connection.fetchval(
                    "SELECT payment_type_id FROM fin_transactions WHERE id=$1", ids["tx_mixed_owner"]
                ) != ids["payment_mixed"]
                payment_refs = await connection.fetch(
                    "SELECT company_id,payment_type_id FROM fin_transactions WHERE id=ANY($1::uuid[]) ORDER BY company_id",
                    [ids["tx_a"], ids["tx_b"]],
                )
                assert len({row["payment_type_id"] for row in payment_refs}) == 2
                assert ids["payment_multi"] not in {row["payment_type_id"] for row in payment_refs}
                category_refs = await connection.fetch(
                    """SELECT t.company_id,t.category_id,c.parent_id,p.scope_kind AS parent_scope,
                              p.company_id AS parent_company
                       FROM fin_transactions t JOIN fin_transaction_categories c ON c.id=t.category_id
                       JOIN fin_transaction_categories p ON p.id=c.parent_id
                       WHERE t.id=ANY($1::uuid[])""",
                    [ids["tx_a"], ids["tx_b"]],
                )
                assert len(category_refs) == 2
                assert all(row["parent_scope"] == "company" for row in category_refs)
                assert all(row["parent_company"] == row["company_id"] for row in category_refs)
                assert await connection.fetchval(
                    "SELECT scope_kind FROM fin_templates WHERE id=$1", ids["template"]
                ) == "legacy"
                history = await connection.fetchrow(
                    "SELECT scope_kind,company_id,organization_id FROM fin_history WHERE id=$1",
                    ids["history"],
                )
                assert history["scope_kind"] == "company"
                assert history["company_id"] == ids["company_a"]
                assert history["organization_id"] is None
                assert await connection.fetchval(
                    """SELECT count(*) FROM finance_ownership_mappings
                       WHERE entity_type='counterparty' AND resolution='cloned'"""
                ) == 2
            finally:
                await connection.close()

        asyncio.run(verify())
        _alembic(database_url, "downgrade", BI05A_BASE)
        _alembic(database_url, "upgrade", BI05A_HEAD)
        asyncio.run(verify())

        async def verify_db_guards() -> None:
            connection = await _connect(database_url)
            try:
                payment_a = await connection.fetchval(
                    """SELECT resolved_id FROM finance_ownership_mappings
                       WHERE entity_type='payment_type' AND legacy_id=$1
                         AND target_scope_id=$2""",
                    ids["payment_multi"], ids["company_a"],
                )
                payment_b = await connection.fetchval(
                    """SELECT resolved_id FROM finance_ownership_mappings
                       WHERE entity_type='payment_type' AND legacy_id=$1
                         AND target_scope_id=$2""",
                    ids["payment_multi"], ids["company_b"],
                )
                category_b = await connection.fetchval(
                    """SELECT resolved_id FROM finance_ownership_mappings
                       WHERE entity_type='transaction_category' AND legacy_id=$1
                         AND target_scope_id=$2""",
                    ids["category_root"], ids["company_b"],
                )

                transaction = connection.transaction()
                await transaction.start()
                with pytest.raises(asyncpg.RaiseError):
                    await connection.execute(
                        """INSERT INTO fin_transactions(id,amount,direction,company_id,payment_type_id)
                           VALUES($1,1,'income',$2,$3)""",
                        uuid4(), ids["company_a"], payment_b,
                    )
                await transaction.rollback()

                transaction = connection.transaction()
                await transaction.start()
                with pytest.raises(asyncpg.RaiseError):
                    await connection.execute(
                        """INSERT INTO fin_transaction_categories
                           (id,name,kind,status,scope_kind,company_id,parent_id)
                           VALUES($1,'Cross parent','income',true,'company',$2,$3)""",
                        uuid4(), ids["company_a"], category_b,
                    )
                await transaction.rollback()

                transaction = connection.transaction()
                await transaction.start()
                with pytest.raises(asyncpg.RaiseError):
                    await connection.execute(
                        """INSERT INTO fin_payment_types
                           (id,sort,name,status,scope_kind,company_id,source_template_id)
                           VALUES($1,0,'Bad source',true,'company',$2,$3)""",
                        uuid4(), ids["company_a"], payment_a,
                    )
                await transaction.rollback()

                transaction = connection.transaction()
                await transaction.start()
                history_id = uuid4()
                await connection.execute(
                    """INSERT INTO fin_history
                       (id,status,ref_id,scope_kind,company_id)
                       VALUES($1,'updated',$2,'company',$3)""",
                    history_id, ids["tx_a"], ids["company_b"],
                )
                inherited = await connection.fetchrow(
                    "SELECT scope_kind,company_id FROM fin_history WHERE id=$1", history_id
                )
                assert inherited["scope_kind"] == "company"
                assert inherited["company_id"] == ids["company_a"]
                await transaction.rollback()
            finally:
                await connection.close()

        asyncio.run(verify_db_guards())
    finally:
        asyncio.run(_drop_database(control, name))


def test_h_ambiguous_counterparty_balance_fails_closed_transactionally():
    """Matrix H: a multi-owner monetary balance is never copied, split, or zeroed."""
    control = _control_url()
    name = f"marjon_bi05a_ambiguous_{uuid4().hex[:10]}"
    database_url = asyncio.run(_create_database(control, name))
    try:
        _alembic(database_url, "upgrade", BI05A_BASE)
        ids = asyncio.run(_seed_legacy_fixture(database_url, ambiguous_balance=True))
        result = _alembic(database_url, "upgrade", BI05A_HEAD, success=False)
        assert "reconciliation required" in result.stderr

        async def verify_rollback() -> None:
            connection = await _connect(database_url)
            try:
                assert await connection.fetchval("SELECT version_num FROM alembic_version") == BI05A_BASE
                assert not await connection.fetchval(
                    """SELECT EXISTS(SELECT 1 FROM information_schema.columns
                       WHERE table_name='fin_counterparties' AND column_name='scope_kind')"""
                )
                assert await connection.fetchval(
                    "SELECT balance FROM fin_counterparties WHERE id=$1", ids["counterparty"]
                ) == 75
            finally:
                await connection.close()

        asyncio.run(verify_rollback())
    finally:
        asyncio.run(_drop_database(control, name))
