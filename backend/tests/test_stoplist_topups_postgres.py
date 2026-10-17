"""STOP-LIST V3 на настоящем PostgreSQL: репетиция миграции + конкуренция.

Только disposable TEST_DATABASE_URL (проектная конвенция harness):
имя БД обязано содержать "test", базы создаются/удаляются фикстурой.
Shared marjon_authoritative НЕ трогаем ни чтением записи, ни миграциями.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.infrastructure.database.session import get_db
from app.main import app
from tests.test_cancelled_dishes_phase1 import _setup_company

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _control_url():
    raw = os.getenv("TEST_DATABASE_URL")
    if not raw:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL stop-list tests")
    url = make_url(raw)
    if url.get_backend_name() != "postgresql":
        pytest.skip("PostgreSQL is required for stop-list PG tests")
    if not url.database or "test" not in url.database.lower():
        pytest.fail("TEST_DATABASE_URL must name an explicitly disposable test DB")
    return url


async def _connect(url, database=None):
    return await asyncpg.connect(
        user=url.username,
        password=url.password,
        host=url.host,
        port=url.port or 5432,
        database=database or url.database,
    )


@pytest_asyncio.fixture
async def pg_factory():
    control = _control_url()
    created = []

    async def create(label):
        name = f"marjon_stoplist_pg_{uuid4().hex[:8]}_{label}"
        conn = await _connect(control)
        try:
            await conn.execute(f'CREATE DATABASE "{name}"')
        finally:
            await conn.close()
        created.append(name)
        return control.set(database=name).render_as_string(hide_password=False)

    try:
        yield create
    finally:
        if created:
            conn = await _connect(control)
            try:
                for name in created:
                    await conn.execute(
                        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                        "WHERE datname = $1 AND pid <> pg_backend_pid()",
                        name,
                    )
                    await conn.execute(f'DROP DATABASE IF EXISTS "{name}"')
            finally:
                await conn.close()


def _alembic(database_url, *arguments):
    env = os.environ.copy()
    env.update({
        "DATABASE_URL": database_url,
        "MIGRATION_DATABASE_URL": database_url,
        "DEBUG": "true",
        "PYTHONDONTWRITEBYTECODE": "1",
    })
    return subprocess.run(
        [sys.executable, "-m", "alembic", *arguments],
        cwd=str(BACKEND_ROOT),
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=300,
    )


@pytest_asyncio.fixture
async def pg_app(pg_factory):
    """Заправленное приложение на disposable PG + HTTP-клиент.

    Схема — create_all по текущим моделям (миграционная цепочка отстав от
    моделей по чужим модулям: users.branch_id, branches.login отсутствуют
    в миграциях — предсуществующий дрейф вне скоупа V3; репетиция самих
    V3-миграций — отдельный тест выше). Поведение топ-апов от схемы
    не зависит: те же модели, те же запросы, настоящий Postgres.
    """
    from app.modules.rbac.permissions import seed_permissions
    from app.shared.base_model import Base

    database_url = await pg_factory("app")
    engine = create_async_engine(
        database_url,
        connect_args={"prepared_statement_cache_size": 0},
        pool_size=10,
        max_overflow=5,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await seed_permissions(session)

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with LifespanManager(app):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client:
                yield client, engine
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


async def _topup(client, headers, pid, amount, key=None):
    key = key or str(uuid4())
    response = await client.post(
        f"/inventory/products/{pid}/topups",
        headers=headers,
        json={"amount": str(amount), "idempotency_key": key},
    )
    return response, key


@pytest.mark.asyncio
async def test_pg_migration_v31_to_head_preserves_integers(pg_factory):
    """Репетиция: v31 + integer-строка (1212/5) → head → точный NUMERIC."""
    database_url = await pg_factory("migrate")
    url = make_url(database_url)

    done = _alembic(database_url, "upgrade", "v31sort01")
    assert done.returncode == 0, done.stderr[-3000:]

    conn = await _connect(url)
    try:
        await conn.execute(
            "INSERT INTO companies(id, slug, name) VALUES($1, $2, $3)",
            "11111111-1111-1111-1111-111111111111", "v3seed", "V3 Seed",
        )
        await conn.execute(
            "INSERT INTO branches(id, company_id, name) VALUES($1, $2, $3)",
            "22222222-2222-2222-2222-222222222222",
            "11111111-1111-1111-1111-111111111111", "Main",
        )
        await conn.execute(
            "INSERT INTO categories(id, company_id, name, slug) VALUES($1, $2, $3, $4)",
            "33333333-3333-3333-3333-333333333333",
            "11111111-1111-1111-1111-111111111111", "Cat", "cat",
        )
        await conn.execute(
            "INSERT INTO products(id, company_id, category_id, name, price, daily_limit, sold_count)"
            " VALUES($1, $2, $3, $4, $5, $6, $7)",
            "44444444-4444-4444-4444-444444444444",
            "11111111-1111-1111-1111-111111111111",
            "33333333-3333-3333-3333-333333333333", "Plov", 100, 1212, 5,
        )
        # Вторая строка — как авто-стоп до миграции: unavailable + sold >= limit.
        await conn.execute(
            "INSERT INTO products(id, company_id, category_id, name, price, daily_limit, sold_count,"
            " is_available) VALUES($1, $2, $3, $4, $5, $6, $7, $8)",
            "55555555-5555-5555-5555-555555555555",
            "11111111-1111-1111-1111-111111111111",
            "33333333-3333-3333-3333-333333333333", "Lagman", 100, 50, 50, False,
        )
        # Третья строка — ручной стоп без лимита (как архивные стопы shared DB).
        await conn.execute(
            "INSERT INTO products(id, company_id, category_id, name, price, is_available)"
            " VALUES($1, $2, $3, $4, $5, $6)",
            "66666666-6666-6666-6666-666666666666",
            "11111111-1111-1111-1111-111111111111",
            "33333333-3333-3333-3333-333333333333", "Mastava", 100, False,
        )
    finally:
        await conn.close()

    done = _alembic(database_url, "upgrade", "head")
    assert done.returncode == 0, done.stderr[-3000:]

    conn = await _connect(url)
    try:
        version = await conn.fetchval("SELECT version_num FROM alembic_version")
        assert version == "v35hist01", version
        dtype = await conn.fetchrow(
            "SELECT data_type, numeric_precision, numeric_scale "
            "FROM information_schema.columns "
            "WHERE table_name = 'products' AND column_name = 'daily_limit'"
        )
        assert (dtype["data_type"], dtype["numeric_precision"], dtype["numeric_scale"]) == ("numeric", 12, 3)
        checkpoint = await conn.fetchrow(
            "SELECT data_type, is_nullable FROM information_schema.columns "
            "WHERE table_name = 'products' AND column_name = 'history_reset_seq'"
        )
        assert checkpoint["data_type"] == "integer" and checkpoint["is_nullable"] == "YES"
        row = await conn.fetchrow(
            "SELECT daily_limit, sold_count FROM products WHERE id = $1",
            "44444444-4444-4444-4444-444444444444",
        )
        assert row["daily_limit"] == Decimal("1212")
        assert row["sold_count"] == Decimal("5")
        # V3.3: никакого backfill-угадывания — даже исчерпанная
        # unavailable-строка остаётся FALSE (ambiguous = manual).
        # Ручной стоп без лимита — тоже FALSE и по-прежнему stopped.
        states = await conn.fetch(
            "SELECT id, is_available, daily_limit, sold_count, limit_auto_stopped"
            " FROM products ORDER BY name"
        )
        by_id = {str(r["id"]): r for r in states}
        assert len(by_id) == 3
        assert by_id["44444444-4444-4444-4444-444444444444"]["is_available"] is True
        assert by_id["44444444-4444-4444-4444-444444444444"]["limit_auto_stopped"] is False
        assert by_id["55555555-5555-5555-5555-555555555555"]["is_available"] is False
        assert by_id["55555555-5555-5555-5555-555555555555"]["limit_auto_stopped"] is False
        assert by_id["55555555-5555-5555-5555-555555555555"]["daily_limit"] == Decimal("50")
        assert by_id["66666666-6666-6666-6666-666666666666"]["is_available"] is False
        assert by_id["66666666-6666-6666-6666-666666666666"]["limit_auto_stopped"] is False
        assert by_id["66666666-6666-6666-6666-666666666666"]["daily_limit"] is None
        assert await conn.fetchval(
            "SELECT to_regclass('public.product_limit_topups')"
        ) == "product_limit_topups"
        uniques = await conn.fetch(
            "SELECT conname FROM pg_constraint WHERE conrelid = 'product_limit_topups'::regclass"
            " AND contype = 'u'"
        )
        names = {r["conname"] for r in uniques}
        assert names == {"uq_topup_company_idempotency", "uq_topup_product_seq"}, names
        indexes = await conn.fetch(
            "SELECT indexname FROM pg_indexes WHERE tablename = 'product_limit_topups'"
        )
        assert "ix_topup_company_product" in {r["indexname"] for r in indexes}
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_pg_concurrent_topups_exact_and_idempotent(pg_app):
    client, engine = pg_app
    ctx = await _setup_company(
        client, engine, slug=f"pg-a-{uuid4().hex[:6]}", email=f"pg-a-{uuid4().hex[:6]}@example.com"
    )
    pid = ctx["product_id"]
    results = await asyncio.gather(*[_topup(client, ctx["headers"], pid, "25") for _ in range(5)])
    assert all(r.status_code == 201 for r, _ in results), [r.text for r, _ in results]
    key = str(uuid4())
    first, _ = await _topup(client, ctx["headers"], pid, "10", key)
    replay, _ = await _topup(client, ctx["headers"], pid, "10", key)
    assert first.status_code == 201 and replay.status_code == 200, (first.text, replay.text)
    assert replay.json()["duplicate"] is True
    async with ctx["sessions"]() as db:
        from app.modules.inventory.models import Product

        product = await db.get(Product, pid)
        # 5×25 + 10 = 135 ровно: гонки и повтор ничего не потеряли/удвоили.
        assert product.daily_limit == Decimal("135")


@pytest.mark.asyncio
async def test_pg_mixed_sale_and_topup_race(pg_app):
    """Настоящий PG-рейс: продажа 30 и топ-ап 25 одновременно поверх 100."""
    client, engine = pg_app
    ctx = await _setup_company(
        client, engine, slug=f"pg-b-{uuid4().hex[:6]}", email=f"pg-b-{uuid4().hex[:6]}@example.com"
    )
    pid = ctx["product_id"]
    response, _ = await _topup(client, ctx["headers"], pid, "100")
    assert response.status_code == 201, response.text
    sale = client.post("/pos/orders", headers=ctx["headers"], json={
        "branch_id": str(ctx["branch_id"]),
        "items": [{"product_id": str(pid), "quantity": "30"}],
    })
    top = _topup(client, ctx["headers"], pid, "25")
    sale_response, (top_response, _) = await asyncio.gather(sale, top)
    assert sale_response.status_code == 201, sale_response.text
    assert top_response.status_code == 201, top_response.text
    async with ctx["sessions"]() as db:
        from app.modules.inventory.models import Product

        product = await db.get(Product, pid)
        assert product.daily_limit == Decimal("125")
        assert product.sold_count == Decimal("30")


@pytest.mark.asyncio
async def test_pg_decimal_exactness_and_manual_stop(pg_app):
    client, engine = pg_app
    ctx = await _setup_company(
        client, engine, slug=f"pg-c-{uuid4().hex[:6]}", email=f"pg-c-{uuid4().hex[:6]}@example.com"
    )
    pid = ctx["product_id"]
    for amount, expected in (("0.5", "0.5"), ("0.5", "1.0"), ("0.75", "1.75")):
        response, _ = await _topup(client, ctx["headers"], pid, amount)
        assert response.status_code == 201, response.text
        assert Decimal(str(response.json()["product"]["daily_limit"])) == Decimal(expected)
    response = await client.patch(
        f"/inventory/products/{pid}/availability", headers=ctx["headers"], json={"is_available": False}
    )
    assert response.status_code == 200, response.text
    response, _ = await _topup(client, ctx["headers"], pid, "5")
    assert response.status_code == 201, response.text
    async with ctx["sessions"]() as db:
        from app.modules.inventory.models import Product

        assert (await db.get(Product, pid)).is_available is False


async def _pg_flag(sessions, pid):
    from app.modules.inventory.models import Product

    async with sessions() as db:
        product = await db.get(Product, pid)
        return product.is_available, product.limit_auto_stopped


@pytest.mark.asyncio
async def test_pg_auto_stop_flag_and_topup_unlock(pg_app):
    client, engine = pg_app
    ctx = await _setup_company(
        client, engine, slug=f"pg-d-{uuid4().hex[:6]}", email=f"pg-d-{uuid4().hex[:6]}@example.com"
    )
    pid = ctx["product_id"]
    response, _ = await _topup(client, ctx["headers"], pid, "2.0")
    assert response.status_code == 201, response.text
    sale = await client.post("/pos/orders", headers=ctx["headers"], json={
        "branch_id": str(ctx["branch_id"]),
        "items": [{"product_id": str(pid), "quantity": "2.0"}],
    })
    assert sale.status_code == 201, sale.text
    assert await _pg_flag(ctx["sessions"], pid) == (False, True)
    response, _ = await _topup(client, ctx["headers"], pid, "1.0")
    assert response.status_code == 201, response.text
    assert await _pg_flag(ctx["sessions"], pid) == (True, False)


@pytest.mark.asyncio
async def test_pg_manual_stop_while_exhausted_blocks_topup_unlock(pg_app):
    client, engine = pg_app
    ctx = await _setup_company(
        client, engine, slug=f"pg-e-{uuid4().hex[:6]}", email=f"pg-e-{uuid4().hex[:6]}@example.com"
    )
    pid = ctx["product_id"]
    response, _ = await _topup(client, ctx["headers"], pid, "2.0")
    assert response.status_code == 201, response.text
    sale = await client.post("/pos/orders", headers=ctx["headers"], json={
        "branch_id": str(ctx["branch_id"]),
        "items": [{"product_id": str(pid), "quantity": "2.0"}],
    })
    assert sale.status_code == 201, sale.text
    response = await client.patch(
        f"/inventory/products/{pid}/availability", headers=ctx["headers"], json={"is_available": False}
    )
    assert response.status_code == 200, response.text
    assert await _pg_flag(ctx["sessions"], pid) == (False, False)
    response, _ = await _topup(client, ctx["headers"], pid, "10")
    assert response.status_code == 201, response.text
    assert await _pg_flag(ctx["sessions"], pid) == (False, False)
    denied = await client.post("/pos/orders", headers=ctx["headers"], json={
        "branch_id": str(ctx["branch_id"]),
        "items": [{"product_id": str(pid), "quantity": "1"}],
    })
    assert denied.status_code == 422, denied.text


@pytest.mark.asyncio
async def test_pg_first_topup_ignores_pre_quota_sales(pg_app):
    client, engine = pg_app
    ctx = await _setup_company(
        client, engine, slug=f"pg-f-{uuid4().hex[:6]}", email=f"pg-f-{uuid4().hex[:6]}@example.com"
    )
    pid = ctx["product_id"]
    response = await client.patch(
        f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": 100}
    )
    assert response.status_code == 200, response.text
    sale = await client.post("/pos/orders", headers=ctx["headers"], json={
        "branch_id": str(ctx["branch_id"]),
        "items": [{"product_id": str(pid), "quantity": "40"}],
    })
    assert sale.status_code == 201, sale.text
    response = await client.patch(
        f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": None}
    )
    assert response.status_code == 200, response.text
    response, _ = await _topup(client, ctx["headers"], pid, "200")
    assert response.status_code == 201, response.text
    body = response.json()["product"]
    assert Decimal(str(body["daily_limit"])) - Decimal(str(body["sold_count"])) == Decimal("200")


@pytest.mark.asyncio
async def test_pg_concurrent_sale_and_zero_safe(pg_app):
    client, engine = pg_app
    ctx = await _setup_company(
        client, engine, slug=f"pg-g-{uuid4().hex[:6]}", email=f"pg-g-{uuid4().hex[:6]}@example.com"
    )
    pid = ctx["product_id"]
    response, _ = await _topup(client, ctx["headers"], pid, "100")
    assert response.status_code == 201, response.text
    sale = client.post("/pos/orders", headers=ctx["headers"], json={
        "branch_id": str(ctx["branch_id"]),
        "items": [{"product_id": str(pid), "quantity": "30"}],
    })
    zero = client.post(f"/inventory/products/{pid}/allowance-zero", headers=ctx["headers"])
    sale_response, zero_response = await asyncio.gather(sale, zero)
    assert zero_response.status_code == 200, zero_response.text
    # Оба исхода когерентны: либо продажа прошла до нуля (sold 30, limit 0),
    # либо отклонена нулём — но остаток всегда ровно 0 и оверселла нет.
    async with ctx["sessions"]() as db:
        from app.modules.inventory.models import Product

        product = await db.get(Product, pid)
        assert product.daily_limit == Decimal("0")
        assert product.sold_count in (Decimal("0"), Decimal("30"))
        if sale_response.status_code == 201:
            assert product.sold_count == Decimal("30")
        else:
            assert sale_response.status_code == 422
            assert product.sold_count == Decimal("0")


@pytest.mark.asyncio
async def test_pg_concurrent_topup_and_zero_safe(pg_app):
    client, engine = pg_app
    ctx = await _setup_company(
        client, engine, slug=f"pg-h-{uuid4().hex[:6]}", email=f"pg-h-{uuid4().hex[:6]}@example.com"
    )
    pid = ctx["product_id"]
    top = _topup(client, ctx["headers"], pid, "60")
    zero = client.post(f"/inventory/products/{pid}/allowance-zero", headers=ctx["headers"])
    (top_response, _), zero_response = await asyncio.gather(top, zero)
    assert top_response.status_code == 201, top_response.text
    assert zero_response.status_code == 200, zero_response.text
    async with ctx["sessions"]() as db:
        from app.modules.inventory.models import Product

        product = await db.get(Product, pid)
        # Порядок сериализован: либо 60 затем 0, либо 0 затем 60. Оба точны.
        assert (product.daily_limit, product.sold_count) in (
            (Decimal("0"), Decimal("0")),
            (Decimal("60"), Decimal("0")),
        )


@pytest.mark.asyncio
async def test_pg_history_reset_filters_visible_window(pg_app):
    client, engine = pg_app
    ctx = await _setup_company(
        client, engine, slug=f"pg-i-{uuid4().hex[:6]}", email=f"pg-i-{uuid4().hex[:6]}@example.com"
    )
    pid = ctx["product_id"]
    for amount in ("200", "55", "25"):
        response, _ = await _topup(client, ctx["headers"], pid, amount)
        assert response.status_code == 201, response.text
    response = await client.post(f"/inventory/products/{pid}/history-reset", headers=ctx["headers"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["recent_topups"] == []
    assert body["history_reset_seq"] == 3
    assert Decimal(str(body["daily_limit"])) == Decimal("280")
    response, _ = await _topup(client, ctx["headers"], pid, "40")
    assert [Decimal(str(t["amount"])) for t in response.json()["product"]["recent_topups"]] == [Decimal("40")]
