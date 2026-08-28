from __future__ import annotations

import asyncio
from decimal import Decimal
import os
from pathlib import Path
import subprocess
import sys
from uuid import UUID, uuid4

import asyncpg
import pytest
from sqlalchemy import func, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.modules.auth.models import User
from app.modules.companies.models import Branch, Company
from app.modules.finance.idempotency import (
    FINGERPRINT_V1,
    FINGERPRINT_V2,
    OP_COMPANY_FINANCE_CREATE,
    OP_FINANCE_CREATE,
    OP_FINANCE_PAY,
    OP_PAYMENT_PROCESS,
    SCOPE_COMPANY,
    SCOPE_ORGANIZATION,
    legacy_v1_company_transaction_fingerprint,
    request_fingerprint_v2,
)
from app.modules.finance.money import canonical_money_amount
from app.modules.finance.models import (
    FinancialOperation,
    FinTransaction,
)
from app.modules.finance.schemas import PayItem, PayRequest, TransactionCreate
from app.modules.finance.service import TransactionService
from app.modules.organizations.models import Organization
from app.modules.payments.models import Payment
from app.modules.payments.schemas import PaymentCreate
from app.modules.payments.service import PaymentService
from app.modules.pos.models import Order
from app.shared.exceptions import ConflictError, ValidationError


BACKEND_ROOT = Path(__file__).resolve().parents[1]
# Current Alembic SOURCE head — reuse the single canonical reference from
# test_migrations.py instead of re-hardcoding it here (this constant went stale
# once the bi06tid01 → bi06hpa02 layers landed above bi05e1fp22).
from tests.test_migrations import EXPECTED_HEAD as CURRENT_HEAD  # noqa: E402
# Historical checkpoint this suite intentionally downgrades to — NOT the head.
BI05B_BASELINE = "bi02idx18"


def _control_url():
    raw_url = os.getenv("TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL tests")
    url = make_url(raw_url)
    if url.get_backend_name() != "postgresql":
        pytest.skip("PostgreSQL is required for finance concurrency tests")
    if not url.database or "test" not in url.database.lower():
        pytest.fail("TEST_DATABASE_URL must name an explicitly disposable test DB")
    return url


def _database_url(control_url, database_name: str) -> str:
    return control_url.set(database=database_name).render_as_string(
        hide_password=False
    )


async def _connect(database_url):
    url = make_url(database_url)
    return await asyncpg.connect(
        user=url.username,
        password=url.password,
        host=url.host,
        port=url.port or 5432,
        database=url.database,
    )


async def _create_database(control_url, database_name: str) -> None:
    connection = await _connect(control_url)
    try:
        await connection.execute(f'CREATE DATABASE "{database_name}"')
    finally:
        await connection.close()


async def _drop_database(control_url, database_name: str) -> None:
    connection = await _connect(control_url)
    try:
        await connection.execute(
            f'DROP DATABASE IF EXISTS "{database_name}" WITH (FORCE)'
        )
    finally:
        await connection.close()


def _run_alembic(database_url: str, command: str, target: str) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url
    env["MIGRATION_DATABASE_URL"] = database_url
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "alembic",
            "-c",
            "alembic.ini",
            command,
            target,
        ],
        cwd=BACKEND_ROOT,
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.fixture(scope="module")
def postgres_database_url():
    control_url = _control_url()
    database_name = f"marjon_bi05b_behavior_{uuid4().hex[:10]}"
    asyncio.run(_create_database(control_url, database_name))
    database_url = _database_url(control_url, database_name)
    try:
        _run_alembic(database_url, "upgrade", "head")
        yield database_url
    finally:
        asyncio.run(_drop_database(control_url, database_name))


async def _with_database(database_url: str, scenario):
    engine = create_async_engine(
        database_url,
        connect_args={"prepared_statement_cache_size": 0},
        pool_size=10,
        max_overflow=5,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        return await scenario(sessions)
    finally:
        await engine.dispose()


async def _seed_tenants(sessions, *, with_order: bool = False):
    suffix = uuid4().hex
    async with sessions() as db:
        company_one = Company(slug=f"bi05b-one-{suffix}", name="BI05B One")
        company_two = Company(slug=f"bi05b-two-{suffix}", name="BI05B Two")
        branch_one = Branch(company=company_one, name="BI05B Branch One")
        branch_two = Branch(company=company_two, name="BI05B Branch Two")
        user_one = User(
            company=company_one,
            email=f"bi05b-one-{suffix}@example.test",
            password_hash="not-used",
        )
        user_two = User(
            company=company_two,
            email=f"bi05b-two-{suffix}@example.test",
            password_hash="not-used",
        )
        organization_one = Organization(name=f"BI05B Org One {suffix}")
        organization_two = Organization(name=f"BI05B Org Two {suffix}")
        db.add_all(
            [
                company_one,
                company_two,
                branch_one,
                branch_two,
                user_one,
                user_two,
                organization_one,
                organization_two,
            ]
        )
        await db.flush()
        order = None
        if with_order:
            order = Order(
                company_id=company_one.id,
                branch_id=branch_one.id,
                order_number=f"B{suffix[:10]}",
                status="ready",
                subtotal=Decimal("125.00"),
                total_amount=Decimal("125.00"),
            )
            db.add(order)
        await db.commit()
        return {
            "company_one": company_one.id,
            "company_two": company_two.id,
            "user_one": user_one.id,
            "user_two": user_two.id,
            "organization_one": organization_one.id,
            "organization_two": organization_two.id,
            "order": order.id if order else None,
        }


def test_a_finance_same_key_same_payload_replays(
    postgres_database_url,
) -> None:
    async def scenario(sessions):
        ids = await _seed_tenants(sessions)
        data = TransactionCreate(
            amount=Decimal("10.00"),
            direction="income",
            organization_id=ids["organization_one"],
        )
        async with sessions() as db:
            service = TransactionService(db)
            first = await service.create_transaction(
                data,
                ids["user_one"],
                "finance-replay",
                [ids["organization_one"]],
            )
            replay = await service.create_transaction(
                data,
                ids["user_one"],
                "finance-replay",
                [ids["organization_one"]],
            )
            assert replay.id == first.id

        async with sessions() as db:
            transaction_count = await db.scalar(
                select(func.count(FinTransaction.id)).where(
                    FinTransaction.idempotency_key == "finance-replay",
                    FinTransaction.organization_id == ids["organization_one"],
                )
            )
            organization = await db.get(
                Organization, ids["organization_one"]
            )
            assert transaction_count == 1
            assert Decimal(organization.cash_balance) == Decimal("10.00")

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_b_same_key_different_payload_returns_409(
    postgres_database_url,
) -> None:
    async def scenario(sessions):
        ids = await _seed_tenants(sessions)
        first = TransactionCreate(
            amount=Decimal("11.00"),
            direction="income",
            organization_id=ids["organization_one"],
        )
        changed = TransactionCreate(
            amount=Decimal("12.00"),
            direction="income",
            organization_id=ids["organization_one"],
        )
        async with sessions() as db:
            await TransactionService(db).create_transaction(
                first,
                ids["user_one"],
                "finance-mismatch",
                [ids["organization_one"]],
            )
        async with sessions() as db:
            with pytest.raises(ConflictError) as exc_info:
                await TransactionService(db).create_transaction(
                    changed,
                    ids["user_one"],
                    "finance-mismatch",
                    [ids["organization_one"]],
                )
            assert exc_info.value.status_code == 409

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_c_same_key_isolated_across_organization_tenants(
    postgres_database_url,
) -> None:
    async def scenario(sessions):
        ids = await _seed_tenants(sessions)
        results = []
        for organization_id in (
            ids["organization_one"],
            ids["organization_two"],
        ):
            async with sessions() as db:
                result = await TransactionService(db).create_transaction(
                    TransactionCreate(
                        amount=Decimal("7.00"),
                        direction="income",
                        organization_id=organization_id,
                    ),
                    ids["user_one"],
                    "cross-org-key",
                    [organization_id],
                )
                results.append(result.id)
        assert results[0] != results[1]
        async with sessions() as db:
            operation_count = await db.scalar(
                select(func.count(FinancialOperation.id)).where(
                    FinancialOperation.scope_kind == SCOPE_ORGANIZATION,
                    FinancialOperation.idempotency_key == "cross-org-key",
                )
            )
            assert operation_count == 2

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_d_same_key_isolated_across_operation_types(
    postgres_database_url,
) -> None:
    async def scenario(sessions):
        ids = await _seed_tenants(sessions)
        organization_id = ids["organization_one"]
        async with sessions() as db:
            service = TransactionService(db)
            created = await service.create_transaction(
                TransactionCreate(
                    amount=Decimal("2.00"),
                    direction="income",
                    organization_id=organization_id,
                ),
                ids["user_one"],
                "shared-operation-key",
                [organization_id],
            )
            paid = await service.pay(
                PayRequest(
                    direction="income",
                    organization_id=organization_id,
                    items=[PayItem(amount=Decimal("3.00"))],
                ),
                ids["user_one"],
                "shared-operation-key",
                [organization_id],
            )
            assert created.id != paid[0].id

        async with sessions() as db:
            operation_types = set(
                (
                    await db.execute(
                        select(FinancialOperation.operation_type).where(
                            FinancialOperation.scope_id == organization_id,
                            FinancialOperation.idempotency_key
                            == "shared-operation-key",
                        )
                    )
                ).scalars()
            )
            assert operation_types == {OP_FINANCE_CREATE, OP_FINANCE_PAY}

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_e_ten_concurrent_finance_requests_apply_one_effect(
    postgres_database_url,
) -> None:
    async def scenario(sessions):
        ids = await _seed_tenants(sessions)
        organization_id = ids["organization_one"]
        data = TransactionCreate(
            amount=Decimal("19.00"),
            direction="income",
            organization_id=organization_id,
        )

        async def invoke():
            async with sessions() as db:
                result = await TransactionService(db).create_transaction(
                    data,
                    ids["user_one"],
                    "finance-ten-way",
                    [organization_id],
                )
                return result.id

        result_ids = await asyncio.gather(*(invoke() for _ in range(10)))
        assert len(set(result_ids)) == 1
        async with sessions() as db:
            transaction_count = await db.scalar(
                select(func.count(FinTransaction.id)).where(
                    FinTransaction.organization_id == organization_id,
                    FinTransaction.idempotency_key == "finance-ten-way",
                )
            )
            operation_count = await db.scalar(
                select(func.count(FinancialOperation.id)).where(
                    FinancialOperation.scope_id == organization_id,
                    FinancialOperation.operation_type == OP_FINANCE_CREATE,
                    FinancialOperation.idempotency_key == "finance-ten-way",
                )
            )
            organization = await db.get(Organization, organization_id)
            assert transaction_count == 1
            assert operation_count == 1
            assert Decimal(organization.cash_balance) == Decimal("19.00")

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_f_ten_concurrent_payment_requests_create_one_payment(
    postgres_database_url,
    monkeypatch,
) -> None:
    async def no_side_effect(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        "app.modules.payments.service.kitchen_manager.broadcast",
        no_side_effect,
    )
    monkeypatch.setattr(
        "app.modules.payments.service.FiscalService.create", no_side_effect
    )
    monkeypatch.setattr(
        "app.modules.payments.service.AuditService.log", no_side_effect
    )

    async def scenario(sessions):
        ids = await _seed_tenants(sessions, with_order=True)
        data = PaymentCreate(
            order_id=ids["order"],
            amount=Decimal("125.00"),
            method="cash",
            cash_received=Decimal("130.00"),
        )

        async def invoke():
            async with sessions() as db:
                payment = await PaymentService(db).process(
                    ids["company_one"],
                    ids["user_one"],
                    data,
                    "payment-ten-way",
                )
                return payment.id

        payment_ids = await asyncio.gather(*(invoke() for _ in range(10)))
        assert len(set(payment_ids)) == 1
        async with sessions() as db:
            payment_count = await db.scalar(
                select(func.count(Payment.id)).where(
                    Payment.order_id == ids["order"]
                )
            )
            operation_count = await db.scalar(
                select(func.count(FinancialOperation.id)).where(
                    FinancialOperation.scope_kind == SCOPE_COMPANY,
                    FinancialOperation.scope_id == ids["company_one"],
                    FinancialOperation.operation_type == OP_PAYMENT_PROCESS,
                    FinancialOperation.idempotency_key == "payment-ten-way",
                )
            )
            order = await db.get(Order, ids["order"])
            assert payment_count == 1
            assert operation_count == 1
            assert order.status == "completed"

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_g_rollback_releases_reservation_for_retry(
    postgres_database_url,
) -> None:
    class FailingTransactionService(TransactionService):
        async def _apply_balance(self, *_args, **_kwargs):
            raise RuntimeError("forced rollback after idempotency reservation")

    async def scenario(sessions):
        ids = await _seed_tenants(sessions)
        organization_id = ids["organization_one"]
        data = TransactionCreate(
            amount=Decimal("23.00"),
            direction="income",
            organization_id=organization_id,
        )
        async with sessions() as db:
            with pytest.raises(RuntimeError, match="forced rollback"):
                await FailingTransactionService(db).create_transaction(
                    data,
                    ids["user_one"],
                    "rollback-key",
                    [organization_id],
                )

        async with sessions() as db:
            result = await TransactionService(db).create_transaction(
                data,
                ids["user_one"],
                "rollback-key",
                [organization_id],
            )
            assert result.id is not None

        async with sessions() as db:
            operation_count = await db.scalar(
                select(func.count(FinancialOperation.id)).where(
                    FinancialOperation.scope_id == organization_id,
                    FinancialOperation.idempotency_key == "rollback-key",
                )
            )
            transaction_count = await db.scalar(
                select(func.count(FinTransaction.id)).where(
                    FinTransaction.organization_id == organization_id,
                    FinTransaction.idempotency_key == "rollback-key",
                )
            )
            assert operation_count == 1
            assert transaction_count == 1

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_h_legacy_finance_key_survives_baseline_upgrade() -> None:
    control_url = _control_url()
    database_name = f"marjon_bi05b_legacy_{uuid4().hex[:10]}"
    asyncio.run(_create_database(control_url, database_name))
    database_url = _database_url(control_url, database_name)
    transaction_id = uuid4()
    try:
        _run_alembic(database_url, "upgrade", BI05B_BASELINE)

        async def insert_legacy_row():
            connection = await _connect(database_url)
            try:
                await connection.execute(
                    """
                    INSERT INTO fin_transactions(
                        id, date, amount, direction, idempotency_key,
                        created_at, updated_at
                    ) VALUES($1, now(), 5.00, 'income', 'legacy-key', now(), now())
                    """,
                    transaction_id,
                )
            finally:
                await connection.close()

        asyncio.run(insert_legacy_row())
        _run_alembic(database_url, "upgrade", "head")

        async def assert_preserved():
            connection = await _connect(database_url)
            try:
                assert await connection.fetchval(
                    "SELECT idempotency_key FROM fin_transactions WHERE id=$1",
                    transaction_id,
                ) == "legacy-key"
                assert await connection.fetchval(
                    "SELECT count(*) FROM financial_operations"
                ) == 0
            finally:
                await connection.close()

        asyncio.run(assert_preserved())
    finally:
        asyncio.run(_drop_database(control_url, database_name))


def test_i_company_scope_is_server_authoritative_and_isolated(
    postgres_database_url,
) -> None:
    async def scenario(sessions):
        ids = await _seed_tenants(sessions)
        payload = {"amount": 31, "direction": "expense", "comment": "app"}
        async with sessions() as db:
            first = await TransactionService(db).create_company_transaction(
                payload,
                ids["user_one"],
                ids["company_one"],
                "company-key",
            )
            replay = await TransactionService(db).create_company_transaction(
                payload,
                ids["user_one"],
                ids["company_one"],
                "company-key",
            )
            assert replay.id == first.id

        async with sessions() as db:
            other = await TransactionService(db).create_company_transaction(
                payload,
                ids["user_two"],
                ids["company_two"],
                "company-key",
            )
            assert other.id != first.id

        async with sessions() as db:
            rows = (
                await db.execute(
                    select(FinTransaction.company_id).where(
                        FinTransaction.id.in_([first.id, other.id])
                    )
                )
            ).scalars().all()
            assert set(rows) == {
                ids["company_one"],
                ids["company_two"],
            }
            operation_count = await db.scalar(
                select(func.count(FinancialOperation.id)).where(
                    FinancialOperation.scope_kind == SCOPE_COMPANY,
                    FinancialOperation.idempotency_key == "company-key",
                )
            )
            assert operation_count == 2

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_j_migration_zero_head_baseline_downgrade_cycle() -> None:
    control_url = _control_url()
    database_name = f"marjon_bi05b_cycle_{uuid4().hex[:10]}"
    asyncio.run(_create_database(control_url, database_name))
    database_url = _database_url(control_url, database_name)
    try:
        _run_alembic(database_url, "upgrade", "head")

        async def assert_head():
            connection = await _connect(database_url)
            try:
                assert await connection.fetchval(
                    "SELECT version_num FROM alembic_version"
                ) == CURRENT_HEAD
                assert await connection.fetchval(
                    "SELECT to_regclass('public.financial_operations') IS NOT NULL"
                ) is True
                assert await connection.fetchval(
                    """
                    SELECT count(*)
                    FROM pg_constraint
                    WHERE conname =
                        'uq_financial_operations_scope_operation_key'
                      AND contype = 'u'
                    """
                ) == 1
            finally:
                await connection.close()

        asyncio.run(assert_head())
        _run_alembic(database_url, "downgrade", BI05B_BASELINE)

        async def assert_baseline():
            connection = await _connect(database_url)
            try:
                assert await connection.fetchval(
                    "SELECT version_num FROM alembic_version"
                ) == BI05B_BASELINE
                assert await connection.fetchval(
                    "SELECT to_regclass('public.financial_operations') IS NULL"
                ) is True
                assert await connection.fetchval(
                    """
                    SELECT EXISTS(
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public'
                          AND table_name='fin_transactions'
                          AND column_name='idempotency_key'
                    )
                    """
                ) is True
            finally:
                await connection.close()

        asyncio.run(assert_baseline())
        _run_alembic(database_url, "upgrade", "head")
        asyncio.run(assert_head())
    finally:
        asyncio.run(_drop_database(control_url, database_name))


def test_k_bi05e1_decimal_v2_precision_replay_and_tenant_isolation(
    postgres_database_url,
) -> None:
    async def scenario(sessions):
        ids = await _seed_tenants(sessions)
        cases = (
            ("0.01", Decimal("0.01")),
            ("0.10", Decimal("0.10")),
            (Decimal("0.20"), Decimal("0.20")),
            (0.30, Decimal("0.30")),
            (10, Decimal("10.00")),
            ("99999999999999.99", Decimal("99999999999999.99")),
        )
        transaction_ids = []
        for index, (raw, expected) in enumerate(cases):
            async with sessions() as db:
                transaction = await TransactionService(
                    db
                ).create_company_transaction(
                    {"amount": raw, "direction": "income"},
                    ids["user_one"],
                    ids["company_one"],
                    f"decimal-v2-{index}",
                )
                assert transaction.amount == expected
                transaction_ids.append(transaction.id)

        async with sessions() as db:
            operations = (
                await db.execute(
                    select(FinancialOperation).where(
                        FinancialOperation.idempotency_key.like("decimal-v2-%")
                    )
                )
            ).scalars().all()
            assert len(operations) == len(cases)
            assert {row.fingerprint_version for row in operations} == {
                FINGERPRINT_V2
            }

        business_key = "decimal-business-equivalent"
        async with sessions() as db:
            first = await TransactionService(db).create_company_transaction(
                {"amount": 10, "direction": "income"},
                ids["user_one"],
                ids["company_one"],
                business_key,
            )
            replay = await TransactionService(db).create_company_transaction(
                {"amount": "10.00", "direction": "income"},
                ids["user_one"],
                ids["company_one"],
                business_key,
            )
            assert replay.id == first.id

        async with sessions() as db:
            with pytest.raises(ConflictError):
                await TransactionService(db).create_company_transaction(
                    {"amount": "10.01", "direction": "income"},
                    ids["user_one"],
                    ids["company_one"],
                    business_key,
                )
            await db.rollback()

        async with sessions() as db:
            independent = await TransactionService(
                db
            ).create_company_transaction(
                {"amount": "10.01", "direction": "income"},
                ids["user_two"],
                ids["company_two"],
                business_key,
            )
            assert independent.company_id == ids["company_two"]

        for invalid in ("NaN", "Infinity", "-Infinity"):
            async with sessions() as db:
                with pytest.raises(ValidationError, match="finite decimal"):
                    await TransactionService(db).create_company_transaction(
                        {"amount": invalid, "direction": "income"},
                        ids["user_one"],
                        ids["company_one"],
                    )

        assert canonical_money_amount("1.005") == Decimal("1.01")
        with pytest.raises(ValidationError, match="exceeds NUMERIC"):
            canonical_money_amount("100000000000000.00")
        assert request_fingerprint_v2(
            {"amount": Decimal("0.10")}
        ) == request_fingerprint_v2({"amount": Decimal("0.1")})
        assert request_fingerprint_v2(
            {"amount": Decimal("-10.00")}
        ) != request_fingerprint_v2({"amount": Decimal("10.00")})
        assert request_fingerprint_v2(
            {"amount": Decimal("-0.00")}
        ) == request_fingerprint_v2({"amount": Decimal("0.00")})

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_l_bi05e1_existing_v1_company_operation_replays_and_conflicts(
    postgres_database_url,
) -> None:
    async def scenario(sessions):
        ids = await _seed_tenants(sessions)
        key = "legacy-v1-company-key"
        payload = {"amount": "31.00", "direction": "expense", "comment": "old"}

        async with sessions() as db:
            transaction = FinTransaction(
                amount=Decimal("31.00"),
                direction="expense",
                comment="old",
                user_id=ids["user_one"],
                company_id=ids["company_one"],
                idempotency_key=key,
            )
            db.add(transaction)
            await db.flush()
            db.add(
                FinancialOperation(
                    scope_kind=SCOPE_COMPANY,
                    scope_id=ids["company_one"],
                    operation_type=OP_COMPANY_FINANCE_CREATE,
                    idempotency_key=key,
                    request_fingerprint=(
                        legacy_v1_company_transaction_fingerprint(payload)
                    ),
                    fingerprint_version=FINGERPRINT_V1,
                    status="completed",
                    result_metadata={"transaction_ids": [str(transaction.id)]},
                )
            )
            await db.commit()
            transaction_id = transaction.id

        async with sessions() as db:
            replay = await TransactionService(db).create_company_transaction(
                payload,
                ids["user_one"],
                ids["company_one"],
                key,
            )
            assert replay.id == transaction_id

        async with sessions() as db:
            with pytest.raises(ConflictError):
                await TransactionService(db).create_company_transaction(
                    {**payload, "amount": "31.01"},
                    ids["user_one"],
                    ids["company_one"],
                    key,
                )
            await db.rollback()

        async with sessions() as db:
            assert await db.scalar(
                select(func.count(FinancialOperation.id)).where(
                    FinancialOperation.idempotency_key == key,
                    FinancialOperation.fingerprint_version == FINGERPRINT_V1,
                )
            ) == 1

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_m_bi05e1_migration_marks_existing_v1_and_reupgrades() -> None:
    control_url = _control_url()
    database_name = f"marjon_bi05e1_migration_{uuid4().hex[:10]}"
    asyncio.run(_create_database(control_url, database_name))
    database_url = _database_url(control_url, database_name)
    operation_id = uuid4()
    new_operation_id = uuid4()
    try:
        _run_alembic(database_url, "upgrade", "bi05c1loc21")

        async def insert_v1_without_version():
            connection = await _connect(database_url)
            try:
                await connection.execute(
                    """
                    INSERT INTO financial_operations(
                        id, scope_kind, scope_id, operation_type,
                        idempotency_key, request_fingerprint, status,
                        created_at, updated_at
                    ) VALUES($1, 'company', $2, $3, 'pre-e1', $4,
                             'completed', now(), now())
                    """,
                    operation_id,
                    uuid4(),
                    OP_COMPANY_FINANCE_CREATE,
                    "0" * 64,
                )
            finally:
                await connection.close()

        asyncio.run(insert_v1_without_version())
        _run_alembic(database_url, "upgrade", "head")

        async def assert_v1_at_head():
            connection = await _connect(database_url)
            try:
                assert await connection.fetchval(
                    "SELECT version_num FROM alembic_version"
                ) == CURRENT_HEAD
                assert await connection.fetchval(
                    "SELECT fingerprint_version FROM financial_operations WHERE id=$1",
                    operation_id,
                ) == FINGERPRINT_V1
            finally:
                await connection.close()

        asyncio.run(assert_v1_at_head())

        async def assert_new_rows_default_to_v2():
            connection = await _connect(database_url)
            try:
                await connection.execute(
                    """
                    INSERT INTO financial_operations(
                        id, scope_kind, scope_id, operation_type,
                        idempotency_key, request_fingerprint, status,
                        created_at, updated_at
                    ) VALUES($1, 'company', $2, $3, 'post-e1', $4,
                             'completed', now(), now())
                    """,
                    new_operation_id,
                    uuid4(),
                    OP_COMPANY_FINANCE_CREATE,
                    "1" * 64,
                )
                assert await connection.fetchval(
                    "SELECT fingerprint_version FROM financial_operations WHERE id=$1",
                    new_operation_id,
                ) == FINGERPRINT_V2
                await connection.execute(
                    "DELETE FROM financial_operations WHERE id=$1",
                    new_operation_id,
                )
            finally:
                await connection.close()

        asyncio.run(assert_new_rows_default_to_v2())
        _run_alembic(database_url, "downgrade", "bi05c1loc21")
        _run_alembic(database_url, "upgrade", "head")
        asyncio.run(assert_v1_at_head())
    finally:
        asyncio.run(_drop_database(control_url, database_name))
