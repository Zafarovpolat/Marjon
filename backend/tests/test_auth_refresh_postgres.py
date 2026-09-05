from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.modules.auth.service as auth_service_module
from app.infrastructure.database.session import get_db
from app.main import app
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.security import create_refresh_token, hash_refresh_token
from app.modules.auth.service import AuthService
from app.modules.rbac.permissions import seed_permissions
from app.shared.base_model import Base


async def _connect(url, database: str | None = None):
    return await asyncpg.connect(
        user=url.username,
        password=url.password,
        host=url.host,
        port=url.port or 5432,
        database=database or url.database,
    )


@pytest.fixture
def postgres_auth_database_url():
    raw_url = os.getenv("TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL auth concurrency tests")

    control_url = make_url(raw_url)
    if control_url.get_backend_name() != "postgresql":
        pytest.skip("PostgreSQL is required for auth concurrency tests")
    if not control_url.database or "test" not in control_url.database.lower():
        pytest.fail("TEST_DATABASE_URL must name an explicitly disposable test DB")

    database = f"marjon_auth_test_{uuid4().hex[:12]}"

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
async def postgres_auth_client(postgres_auth_database_url):
    engine = create_async_engine(
        postgres_auth_database_url,
        connect_args={"prepared_statement_cache_size": 0},
    )
    async with engine.begin() as connection:
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


async def _create_active_refresh_token(session_factory, iteration: str):
    raw_token = create_refresh_token()
    async with session_factory() as session:
        user = User(
            email=f"auth-review-{iteration}-{uuid4().hex}@example.com",
            password_hash="unused-by-refresh-tests",
            is_active=True,
        )
        session.add(user)
        await session.flush()
        user_id = user.id
        session.add(RefreshToken(
            user_id=user_id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        ))
        await session.commit()
    return user_id, raw_token


async def test_same_refresh_token_has_exactly_one_winner_under_postgresql_concurrency(
    postgres_auth_client,
):
    client, session_factory = postgres_auth_client
    for iteration in range(10):
        user_id, original_refresh = await _create_active_refresh_token(
            session_factory, f"race-{iteration}"
        )

        first, second = await asyncio.gather(
            client.post("/auth/refresh", json={"refresh_token": original_refresh}),
            client.post("/auth/refresh", json={"refresh_token": original_refresh}),
        )

        assert sorted((first.status_code, second.status_code)) == [200, 401]
        winner = first if first.status_code == 200 else second
        successor_refresh = winner.json()["refresh_token"]
        assert successor_refresh != original_refresh

        async with session_factory() as session:
            original_row = await session.scalar(
                select(RefreshToken).where(
                    RefreshToken.token_hash == hash_refresh_token(original_refresh)
                )
            )
            successor_row = await session.scalar(
                select(RefreshToken).where(
                    RefreshToken.token_hash == hash_refresh_token(successor_refresh)
                )
            )
            active_count = await session.scalar(
                select(func.count()).select_from(RefreshToken).where(
                    RefreshToken.user_id == user_id,
                    RefreshToken.revoked_at.is_(None),
                )
            )

        assert original_row is not None
        assert original_row.revoked_at is not None
        assert successor_row is not None
        assert successor_row.revoked_at is None
        assert active_count == 1


async def test_postgresql_rotation_error_rolls_back_after_row_lock(
    postgres_auth_client, monkeypatch
):
    _, session_factory = postgres_auth_client
    user_id, original_refresh = await _create_active_refresh_token(
        session_factory, "rollback"
    )
    original_factory = auth_service_module.create_refresh_token
    monkeypatch.setattr(
        auth_service_module,
        "create_refresh_token",
        lambda auth_scope="app": original_refresh,
    )

    async with session_factory() as session:
        with pytest.raises(IntegrityError):
            await AuthService(session).refresh(original_refresh)

    async with session_factory() as session:
        original_row = await session.scalar(
            select(RefreshToken).where(
                RefreshToken.token_hash == hash_refresh_token(original_refresh)
            )
        )
        total_count = await session.scalar(
            select(func.count()).select_from(RefreshToken).where(
                RefreshToken.user_id == user_id
            )
        )
        active_count = await session.scalar(
            select(func.count()).select_from(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
            )
        )

    assert original_row is not None
    assert original_row.revoked_at is None
    assert total_count == 1
    assert active_count == 1

    monkeypatch.setattr(auth_service_module, "create_refresh_token", original_factory)
    async with session_factory() as session:
        _, successor_refresh = await AuthService(session).refresh(original_refresh)
    assert successor_refresh != original_refresh
