from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os
from pathlib import Path
import subprocess
import sys
from uuid import UUID, uuid4

import asyncpg
import pytest
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import func, select, update
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.modules.auth.models import User
from app.modules.companies.models import Branch, Company
from app.modules.finance.models import FinancialOperation
from app.modules.fiscal.models import FiscalOutbox, FiscalReceipt, FiscalSettings
from app.modules.fiscal.outbox import FiscalOutboxClaimService
from app.modules.fiscal.runtime import FiscalRuntime
from app.modules.fiscal.schemas import (
    FiscalReceiptCreate,
    FiscalSettingsResponse,
    FiscalSettingsUpdate,
)
from app.modules.fiscal.service import FiscalService
from app.modules.payments.models import Payment
from app.modules.payments.schemas import PaymentCreate
from app.modules.payments.service import PaymentService
from app.modules.pos.models import Order
from app.modules.subscriptions.models import Invoice, Plan, Subscription
from app.modules.subscriptions.schemas import SubscriptionCreate
from app.modules.subscriptions.service import SubscriptionService
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError


BACKEND_ROOT = Path(__file__).resolve().parents[1]
BI05C1_BASELINE = "bi05aown20"
BI05C1_HEAD = "bi05c1loc21"


class FakeResolver:
    available = True

    def __init__(self):
        self.references: list[tuple[UUID, str]] = []

    async def resolve(self, company_id: UUID, credential_ref: str) -> object:
        self.references.append((company_id, credential_ref))
        return object()


class FakeProvider:
    name = "ofd_uz"

    def __init__(self):
        self.calls = 0

    async def submit_receipt(self, **_kwargs):
        self.calls += 1
        raise AssertionError("BI-05C1 must not submit to a real provider")

    async def get_status(self, **_kwargs):
        self.calls += 1
        raise AssertionError("BI-05C1 must not query a real provider")


def _fake_runtime() -> tuple[FiscalRuntime, FakeResolver, FakeProvider]:
    resolver = FakeResolver()
    provider = FakeProvider()
    return FiscalRuntime(resolver=resolver, providers={provider.name: provider}), resolver, provider


def _control_url():
    raw_url = os.getenv("TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL tests")
    url = make_url(raw_url)
    if url.get_backend_name() != "postgresql":
        pytest.skip("PostgreSQL is required for BI-05C1 tests")
    if not url.database or "test" not in url.database.lower():
        pytest.fail("TEST_DATABASE_URL must name an explicitly disposable test DB")
    return url


def _database_url(control_url, database_name: str) -> str:
    return control_url.set(database=database_name).render_as_string(hide_password=False)


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
        await connection.execute(f'DROP DATABASE IF EXISTS "{database_name}" WITH (FORCE)')
    finally:
        await connection.close()


def _alembic(database_url: str, command: str, target: str) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url
    env["MIGRATION_DATABASE_URL"] = database_url
    return subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", command, target],
        cwd=BACKEND_ROOT,
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=180,
    )


def _run_alembic(database_url: str, command: str, target: str) -> None:
    result = _alembic(database_url, command, target)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.fixture(scope="module")
def postgres_database_url():
    control_url = _control_url()
    database_name = f"marjon_bi05c1_behavior_{uuid4().hex[:10]}"
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
        pool_size=12,
        max_overflow=8,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        return await scenario(sessions)
    finally:
        await engine.dispose()


async def _seed(sessions, *, enabled: bool = False, with_plan: bool = False):
    suffix = uuid4().hex
    async with sessions() as db:
        company_one = Company(id=uuid4(), slug=f"c1-one-{suffix}", name="C1 One")
        company_two = Company(id=uuid4(), slug=f"c1-two-{suffix}", name="C1 Two")
        branch_one = Branch(
            id=uuid4(), company=company_one, company_id=company_one.id, name="C1 Branch One"
        )
        branch_two = Branch(
            id=uuid4(), company=company_two, company_id=company_two.id, name="C1 Branch Two"
        )
        user_one = User(
            id=uuid4(),
            company=company_one,
            company_id=company_one.id,
            email=f"c1-one-{suffix}@example.test",
            password_hash="not-used",
        )
        db.add_all([company_one, company_two, branch_one, branch_two, user_one])
        await db.flush()

        order_one = Order(
            id=uuid4(),
            company_id=company_one.id,
            branch_id=branch_one.id,
            order_number=f"C1A{suffix[:8]}",
            status="ready",
            subtotal=Decimal("125.00"),
            total_amount=Decimal("125.00"),
        )
        order_two = Order(
            id=uuid4(),
            company_id=company_two.id,
            branch_id=branch_two.id,
            order_number=f"C1B{suffix[:8]}",
            status="ready",
            subtotal=Decimal("125.00"),
            total_amount=Decimal("125.00"),
        )
        db.add_all([order_one, order_two])
        plan = None
        if with_plan:
            plan = Plan(
                name=f"C1 Plan {suffix}",
                slug=f"c1-plan-{suffix}",
                price_monthly=Decimal("50.00"),
                price_yearly=Decimal("500.00"),
            )
            db.add(plan)
        await db.flush()
        if enabled:
            db.add(
                FiscalSettings(
                    company_id=company_one.id,
                    enabled=True,
                    provider="ofd_uz",
                    tin="123456789",
                    credential_ref=f"test://fiscal/{suffix}",
                )
            )
        await db.commit()
        return {
            "company_one": company_one.id,
            "company_two": company_two.id,
            "user_one": user_one.id,
            "order_one": order_one.id,
            "order_two": order_two.id,
            "plan": plan.id if plan else None,
        }


async def _payment_counts(db, order_id: UUID) -> tuple[int, int, int, int]:
    return (
        await db.scalar(select(func.count(Payment.id)).where(Payment.order_id == order_id)),
        await db.scalar(
            select(func.count(FiscalReceipt.id)).where(FiscalReceipt.order_id == order_id)
        ),
        await db.scalar(
            select(func.count(FiscalOutbox.id))
            .join(FiscalReceipt, FiscalOutbox.receipt_id == FiscalReceipt.id)
            .where(
                FiscalReceipt.order_id == order_id
            )
        ),
        await db.scalar(
            select(func.count(FinancialOperation.id)).where(
                FinancialOperation.idempotency_key.like("c1-failure-%")
            )
        ),
    )


@pytest.mark.parametrize(
    "failure_point",
    ["after_payment", "after_order", "after_receipt", "after_outbox", "before_commit"],
)
def test_a_d_local_payment_failure_points_rollback_everything(
    postgres_database_url,
    failure_point,
) -> None:
    async def scenario(sessions):
        ids = await _seed(sessions, enabled=True)
        runtime, _resolver, provider = _fake_runtime()

        async def inject(point: str) -> None:
            if point == failure_point:
                raise RuntimeError(f"forced failure at {point}")

        async with sessions() as db:
            with pytest.raises(RuntimeError, match="forced failure"):
                await PaymentService(db, runtime, inject).process(
                    ids["company_one"],
                    ids["user_one"],
                    PaymentCreate(
                        order_id=ids["order_one"],
                        amount=Decimal("125.00"),
                        method="cash",
                        cash_received=Decimal("130.00"),
                    ),
                    f"c1-failure-{failure_point}-{uuid4().hex}",
                )

        async with sessions() as db:
            payment_count, receipt_count, outbox_count, _ = await _payment_counts(
                db, ids["order_one"]
            )
            order = await db.get(Order, ids["order_one"])
            operation_count = await db.scalar(
                select(func.count(FinancialOperation.id)).where(
                    FinancialOperation.idempotency_key.like(
                        f"c1-failure-{failure_point}-%"
                    )
                )
            )
            assert (payment_count, receipt_count, outbox_count, operation_count) == (0, 0, 0, 0)
            assert order.status == "ready"
            assert provider.calls == 0

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_e_g_disabled_enabled_and_unready_contracts(
    postgres_database_url,
    monkeypatch,
) -> None:
    async def no_side_effect(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.modules.payments.service.kitchen_manager.broadcast", no_side_effect)
    monkeypatch.setattr("app.modules.payments.service.AuditService.log", no_side_effect)

    async def scenario(sessions):
        disabled = await _seed(sessions)
        async with sessions() as db:
            await PaymentService(db).process(
                disabled["company_one"],
                disabled["user_one"],
                PaymentCreate(
                    order_id=disabled["order_one"],
                    amount=Decimal("125.00"),
                    method="cash",
                ),
                f"c1-disabled-{uuid4().hex}",
            )
        async with sessions() as db:
            assert (await _payment_counts(db, disabled["order_one"]))[:3] == (1, 0, 0)

        enabled = await _seed(sessions, enabled=True)
        runtime, resolver, provider = _fake_runtime()
        async with sessions() as db:
            await PaymentService(db, runtime).process(
                enabled["company_one"],
                enabled["user_one"],
                PaymentCreate(
                    order_id=enabled["order_one"],
                    amount=Decimal("125.00"),
                    method="cash",
                ),
                f"c1-enabled-{uuid4().hex}",
            )
        async with sessions() as db:
            assert (await _payment_counts(db, enabled["order_one"]))[:3] == (1, 1, 1)
        assert resolver.references and provider.calls == 0

        unready = await _seed(sessions, enabled=True)
        async with sessions() as db:
            with pytest.raises(ValidationError, match="is unavailable"):
                await PaymentService(db).process(
                    unready["company_one"],
                    unready["user_one"],
                    PaymentCreate(
                        order_id=unready["order_one"],
                        amount=Decimal("125.00"),
                        method="cash",
                    ),
                    f"c1-unready-{uuid4().hex}",
                )
        async with sessions() as db:
            assert (await _payment_counts(db, unready["order_one"]))[:3] == (0, 0, 0)
            assert (await db.get(Order, unready["order_one"])).status == "ready"

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_h_j_application_and_database_relation_guards(postgres_database_url) -> None:
    async def scenario(sessions):
        ids = await _seed(sessions, enabled=True)
        runtime, _resolver, provider = _fake_runtime()
        payment_id = uuid4()
        async with sessions() as db:
            source_order = await db.get(Order, ids["order_one"])
            same_company_order = Order(
                id=uuid4(),
                company_id=ids["company_one"],
                branch_id=source_order.branch_id,
                order_number=f"C1M{uuid4().hex[:8]}",
                status="ready",
                subtotal=Decimal("125.00"),
                total_amount=Decimal("125.00"),
            )
            payment = Payment(
                id=payment_id,
                company_id=ids["company_one"],
                order_id=ids["order_one"],
                amount=Decimal("125.00"),
                method="cash",
                status="completed",
            )
            db.add_all([same_company_order, payment])
            await db.commit()
            same_company_order_id = same_company_order.id

        connection = await _connect(postgres_database_url)
        try:
            with pytest.raises(asyncpg.ForeignKeyViolationError):
                await connection.execute(
                    """
                    INSERT INTO payments(
                        id, company_id, order_id, amount, method, status,
                        provider_data, created_at, updated_at
                    ) VALUES($1, $2, $3, 1, 'cash', 'completed', '{}'::json, now(), now())
                    """,
                    uuid4(),
                    ids["company_one"],
                    ids["order_two"],
                )
            with pytest.raises(asyncpg.ForeignKeyViolationError):
                await connection.execute(
                    """
                    INSERT INTO fiscal_receipts(
                        id, company_id, order_id, payment_id, status, provider,
                        created_at, updated_at
                    ) VALUES($1, $2, $3, $4, 'pending', 'ofd_uz', now(), now())
                    """,
                    uuid4(),
                    ids["company_one"],
                    same_company_order_id,
                    payment_id,
                )
        finally:
            await connection.close()

        async with sessions() as db:
            service = FiscalService(db, runtime)
            with pytest.raises(NotFoundError, match="Payment not found for this order"):
                await service.create(
                    ids["company_one"],
                    FiscalReceiptCreate(
                        order_id=same_company_order_id,
                        payment_id=payment_id,
                        provider="ofd_uz",
                    ),
                )
            receipt = await service.create(
                ids["company_one"],
                FiscalReceiptCreate(
                    order_id=ids["order_one"],
                    payment_id=payment_id,
                    provider="ofd_uz",
                ),
            )
            assert receipt.status == "pending"
            with pytest.raises(ConflictError, match="already exists"):
                await service.create(
                    ids["company_one"],
                    FiscalReceiptCreate(
                        order_id=ids["order_one"],
                        payment_id=payment_id,
                        provider="ofd_uz",
                    ),
                )

        connection = await _connect(postgres_database_url)
        try:
            with pytest.raises(asyncpg.UniqueViolationError):
                await connection.execute(
                    """
                    INSERT INTO fiscal_receipts(
                        id, company_id, order_id, payment_id, status, provider,
                        created_at, updated_at
                    ) VALUES($1, $2, $3, $4, 'pending', 'ofd_uz', now(), now())
                    """,
                    uuid4(),
                    ids["company_one"],
                    ids["order_one"],
                    payment_id,
                )
        finally:
            await connection.close()
        assert provider.calls == 0

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_k_n_outbox_uniqueness_claim_and_stale_recovery(
    postgres_database_url,
    monkeypatch,
) -> None:
    async def no_side_effect(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.modules.payments.service.kitchen_manager.broadcast", no_side_effect)
    monkeypatch.setattr("app.modules.payments.service.AuditService.log", no_side_effect)

    async def scenario(sessions):
        async with sessions() as db:
            await db.execute(update(FiscalOutbox).values(status="completed", locked_at=None, locked_by=None))
            await db.commit()

        ids = await _seed(sessions, enabled=True)
        runtime, _resolver, provider = _fake_runtime()
        async with sessions() as db:
            payment = await PaymentService(db, runtime).process(
                ids["company_one"],
                ids["user_one"],
                PaymentCreate(
                    order_id=ids["order_one"],
                    amount=Decimal("125.00"),
                    method="cash",
                ),
                f"c1-outbox-{uuid4().hex}",
            )
        async with sessions() as db:
            order = await db.get(Order, ids["order_one"])
            payment = await db.get(Payment, payment.id)
            payment_id = payment.id
            plan = await FiscalService(db, runtime).prepare_company(ids["company_one"])
            with pytest.raises(ConflictError, match="already exists"):
                await FiscalService(db, runtime).schedule_payment(
                    company_id=ids["company_one"],
                    order=order,
                    payment=payment,
                    plan=plan,
                )
            await db.rollback()
            event_id = await db.scalar(
                select(FiscalOutbox.id)
                .join(FiscalReceipt, FiscalOutbox.receipt_id == FiscalReceipt.id)
                .where(FiscalReceipt.payment_id == payment_id)
            )
            assert await db.scalar(
                select(func.count(FiscalOutbox.id)).where(FiscalOutbox.id == event_id)
            ) == 1

        async def claim(worker: int):
            async with sessions() as db:
                event = await FiscalOutboxClaimService(db).claim_one(
                    worker_id=f"worker-{worker}"
                )
                return event.id if event else None

        claims = await asyncio.gather(*(claim(worker) for worker in range(10)))
        assert [claim_id for claim_id in claims if claim_id is not None] == [event_id]

        stale_time = datetime.now(timezone.utc) - timedelta(minutes=10)
        async with sessions() as db:
            event = await db.get(FiscalOutbox, event_id)
            event.locked_at = stale_time
            event.locked_by = "crashed-worker"
            await db.commit()
        async with sessions() as db:
            reclaimed = await FiscalOutboxClaimService(db).claim_one(
                worker_id="recovery-worker",
                now=datetime.now(timezone.utc),
                lease_timeout=timedelta(minutes=5),
            )
            assert reclaimed.id == event_id
            assert reclaimed.locked_by == "recovery-worker"

        column_names = {column.name for column in FiscalOutbox.__table__.columns}
        assert column_names.isdisjoint(
            {"credential_ref", "api_key", "password", "token", "secret"}
        )
        assert provider.calls == 0

    asyncio.run(_with_database(postgres_database_url, scenario))


@pytest.mark.parametrize("failure_point", ["after_subscription", "after_invoice"])
def test_p_r_subscription_invoice_atomicity(
    postgres_database_url,
    failure_point,
) -> None:
    async def scenario(sessions):
        ids = await _seed(sessions, with_plan=True)

        async def inject(point: str) -> None:
            if point == failure_point:
                raise RuntimeError(f"forced billing failure at {point}")

        async with sessions() as db:
            with pytest.raises(RuntimeError, match="forced billing failure"):
                await SubscriptionService(db, inject).subscribe(
                    ids["company_one"],
                    SubscriptionCreate(plan_id=ids["plan"], billing_cycle="monthly"),
                )
        async with sessions() as db:
            assert await db.scalar(
                select(func.count(Subscription.id)).where(
                    Subscription.company_id == ids["company_one"]
                )
            ) == 0
            assert await db.scalar(
                select(func.count(Invoice.id)).where(Invoice.company_id == ids["company_one"])
            ) == 0

        async with sessions() as db:
            subscription = await SubscriptionService(db).subscribe(
                ids["company_one"],
                SubscriptionCreate(plan_id=ids["plan"], billing_cycle="monthly"),
            )
            assert subscription.id is not None
        async with sessions() as db:
            assert await db.scalar(
                select(func.count(Subscription.id)).where(
                    Subscription.company_id == ids["company_one"]
                )
            ) == 1
            assert await db.scalar(
                select(func.count(Invoice.id)).where(Invoice.company_id == ids["company_one"])
            ) == 1

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_s_x_settings_are_tenant_authoritative_and_fail_closed(
    postgres_database_url,
) -> None:
    async def scenario(sessions):
        ids = await _seed(sessions)
        runtime, _resolver, provider = _fake_runtime()
        payload = FiscalSettingsUpdate.model_validate(
            {
                "enabled": False,
                "company_id": str(ids["company_two"]),
            }
        )
        async with sessions() as db:
            saved = await FiscalService(db, runtime).save_settings(
                ids["company_one"], payload
            )
            assert saved.company_id == ids["company_one"]
        async with sessions() as db:
            assert await FiscalService(db).get_settings(ids["company_two"]) is None

        async with sessions() as db:
            with pytest.raises(ValidationError, match="require provider"):
                await FiscalService(db, runtime).save_settings(
                    ids["company_two"],
                    FiscalSettingsUpdate(enabled=True),
                )
            await db.rollback()

        valid_enabled = FiscalSettingsUpdate(
            enabled=True,
            provider="ofd_uz",
            tin="123456789",
            credential_ref="test://fiscal/company-two",
        )
        async with sessions() as db:
            with pytest.raises(ValidationError, match="is unavailable"):
                await FiscalService(db).save_settings(
                    ids["company_two"], valid_enabled
                )
        async with sessions() as db:
            assert await FiscalService(db).get_settings(ids["company_two"]) is None

        with pytest.raises(PydanticValidationError):
            FiscalSettingsUpdate(
                enabled=False,
                credential_ref="secret://raw-api_token-value",
            )
        schema_properties = set(FiscalSettingsResponse.model_json_schema()["properties"])
        assert schema_properties.isdisjoint(
            {"api_key", "password", "token", "secret", "credential"}
        )
        assert provider.calls == 0

    asyncio.run(_with_database(postgres_database_url, scenario))


def test_migration_fresh_existing_downgrade_reupgrade() -> None:
    control_url = _control_url()
    names = [
        f"marjon_bi05c1_fresh_{uuid4().hex[:10]}",
        f"marjon_bi05c1_existing_{uuid4().hex[:10]}",
    ]
    for name in names:
        asyncio.run(_create_database(control_url, name))
    fresh_url = _database_url(control_url, names[0])
    existing_url = _database_url(control_url, names[1])
    try:
        _run_alembic(fresh_url, "upgrade", "head")
        _run_alembic(existing_url, "upgrade", BI05C1_BASELINE)
        _run_alembic(existing_url, "upgrade", "head")

        async def assert_head(database_url):
            connection = await _connect(database_url)
            try:
                assert await connection.fetchval("SELECT version_num FROM alembic_version") == BI05C1_HEAD
                assert await connection.fetchval(
                    "SELECT to_regclass('public.fiscal_settings') IS NOT NULL"
                ) is True
                assert await connection.fetchval(
                    "SELECT to_regclass('public.fiscal_outbox') IS NOT NULL"
                ) is True
            finally:
                await connection.close()

        asyncio.run(assert_head(fresh_url))
        asyncio.run(assert_head(existing_url))
        _run_alembic(existing_url, "downgrade", BI05C1_BASELINE)
        _run_alembic(existing_url, "upgrade", "head")
        asyncio.run(assert_head(existing_url))
    finally:
        for name in names:
            asyncio.run(_drop_database(control_url, name))


def test_migration_legacy_preflight_fails_transactionally() -> None:
    control_url = _control_url()
    database_name = f"marjon_bi05c1_preflight_{uuid4().hex[:10]}"
    asyncio.run(_create_database(control_url, database_name))
    database_url = _database_url(control_url, database_name)
    try:
        _run_alembic(database_url, "upgrade", BI05C1_BASELINE)

        async def seed_invalid_legacy():
            connection = await _connect(database_url)
            try:
                company_a, company_b = uuid4(), uuid4()
                branch_a = uuid4()
                order_a = uuid4()
                valid_payment = uuid4()
                await connection.execute(
                    """
                    INSERT INTO companies(id, slug, name, timezone, currency, is_active, created_at, updated_at)
                    VALUES($1, $2, 'A', 'UTC', 'UZS', true, now(), now()),
                          ($3, $4, 'B', 'UTC', 'UZS', true, now(), now())
                    """,
                    company_a,
                    f"c1-preflight-a-{uuid4().hex}",
                    company_b,
                    f"c1-preflight-b-{uuid4().hex}",
                )
                await connection.execute(
                    """
                    INSERT INTO branches(id, company_id, name, is_active, created_at, updated_at)
                    VALUES($1, $2, 'A', true, now(), now())
                    """,
                    branch_a,
                    company_a,
                )
                await connection.execute(
                    """
                    INSERT INTO orders(id, company_id, branch_id, order_number, created_at, updated_at)
                    VALUES($1, $2, $3, 'LEGACY-C1', now(), now())
                    """,
                    order_a,
                    company_a,
                    branch_a,
                )
                await connection.execute(
                    """
                    INSERT INTO payments(id, company_id, order_id, amount, method, created_at, updated_at)
                    VALUES($1, $2, $3, 1, 'cash', now(), now()),
                          ($4, $5, $3, 1, 'cash', now(), now())
                    """,
                    valid_payment,
                    company_a,
                    order_a,
                    uuid4(),
                    company_b,
                )
                for _ in range(2):
                    await connection.execute(
                        """
                        INSERT INTO fiscal_receipts(
                            id, company_id, order_id, payment_id, created_at, updated_at
                        ) VALUES($1, $2, $3, $4, now(), now())
                        """,
                        uuid4(),
                        company_a,
                        order_a,
                        valid_payment,
                    )
            finally:
                await connection.close()

        asyncio.run(seed_invalid_legacy())
        result = _alembic(database_url, "upgrade", "head")
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert "legacy integrity preflight failed" in output
        assert "payment_company_mismatches=1" in output
        assert "duplicate_receipt_groups=1" in output

        async def assert_rollback():
            connection = await _connect(database_url)
            try:
                assert await connection.fetchval("SELECT version_num FROM alembic_version") == BI05C1_BASELINE
                assert await connection.fetchval(
                    "SELECT to_regclass('public.fiscal_settings') IS NULL"
                ) is True
                assert await connection.fetchval(
                    "SELECT to_regclass('public.fiscal_outbox') IS NULL"
                ) is True
            finally:
                await connection.close()

        asyncio.run(assert_rollback())
    finally:
        asyncio.run(_drop_database(control_url, database_name))
