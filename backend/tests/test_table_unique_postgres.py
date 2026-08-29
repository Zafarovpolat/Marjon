"""Phase 5C-3 PostgreSQL proof for the partial unique table-number index.

Static/SQLite coverage cannot exercise `postgresql_where`, the duplicate
preflight, or the concurrency guarantee — those need a real PostgreSQL server,
so everything here runs against the disposable TEST_DATABASE_URL database.
"""
from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

import asyncpg
import pytest

from tests.test_migrations import (
    EXPECTED_HEAD,
    _column_exists,
    _connect,
    _current_revision,
    _database_url,
    _index_exists,
    _invoke_alembic,
    _run_alembic,
    _test_control_url,
    migration_database_factory,  # noqa: F401  (fixture re-export)
)

INDEX = "uq_tables_hall_number_active"
PREDECESSOR = "bi06hpa02"


async def _seed_hall(database_url: str, *, hall_count: int = 1) -> list[UUID]:
    """Insert a company + branch + halls directly (no ORM/API involved)."""
    connection = await _connect(_make_url(database_url))
    try:
        company_id, branch_id = uuid4(), uuid4()
        await connection.execute(
            """
            INSERT INTO companies(id, slug, name, timezone, currency, is_active,
                                  created_at, updated_at)
            VALUES($1, $2, 'P5C3', 'UTC', 'UZS', true, now(), now())
            """,
            company_id, f"p5c3-{uuid4().hex[:8]}",
        )
        await connection.execute(
            """
            INSERT INTO branches(id, company_id, name, is_active, created_at, updated_at)
            VALUES($1, $2, 'Основной филиал', true, now(), now())
            """,
            branch_id, company_id,
        )
        hall_ids = []
        for index in range(hall_count):
            hall_id = uuid4()
            await connection.execute(
                """
                INSERT INTO halls(id, company_id, branch_id, name, is_active,
                                  created_at, updated_at)
                VALUES($1, $2, $3, $4, true, now(), now())
                """,
                hall_id, company_id, branch_id, f"Зал {index + 1}",
            )
            hall_ids.append(hall_id)
        return hall_ids
    finally:
        await connection.close()


def _make_url(database_url: str):
    from sqlalchemy.engine import make_url

    return make_url(database_url)


async def _insert_table(
    database_url: str, hall_id: UUID, number: int, *, is_active: bool = True
) -> None:
    connection = await _connect(_make_url(database_url))
    try:
        await connection.execute(
            """
            INSERT INTO tables(id, hall_id, number, capacity, is_active,
                               created_at, updated_at)
            VALUES($1, $2, $3, 4, $4, now(), now())
            """,
            uuid4(), hall_id, number, is_active,
        )
    finally:
        await connection.close()


async def _active_rows(database_url: str, hall_id: UUID, number: int) -> int:
    connection = await _connect(_make_url(database_url))
    try:
        return await connection.fetchval(
            "SELECT count(*) FROM tables WHERE hall_id=$1 AND number=$2 AND is_active",
            hall_id, number,
        )
    finally:
        await connection.close()


async def _deactivate_extra_duplicates(database_url: str, hall_id: UUID, number: int) -> None:
    """Manual reconciliation the migration error asks the operator to perform."""
    connection = await _connect(_make_url(database_url))
    try:
        await connection.execute(
            """
            UPDATE tables SET is_active = false
            WHERE id IN (
                SELECT id FROM tables
                WHERE hall_id = $1 AND number = $2 AND is_active
                OFFSET 1
            )
            """,
            hall_id, number,
        )
    finally:
        await connection.close()


async def _insert_duplicate_expecting_rejection(
    database_url: str, hall_id: UUID, number: int
) -> str:
    """Bypass the service pre-check entirely: prove the DB is authoritative."""
    connection = await _connect(_make_url(database_url))
    try:
        with pytest.raises(asyncpg.exceptions.UniqueViolationError) as excinfo:
            await connection.execute(
                """
                INSERT INTO tables(id, hall_id, number, capacity, is_active,
                                   created_at, updated_at)
                VALUES($1, $2, $3, 4, true, now(), now())
                """,
                uuid4(), hall_id, number,
            )
        return excinfo.value.constraint_name or ""
    finally:
        await connection.close()


@pytest.mark.skipif(
    not __import__("os").getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL is required for PostgreSQL table-uniqueness tests",
)
def test_preflight_fails_on_existing_active_duplicates_without_repairing(
    migration_database_factory,  # noqa: F811
) -> None:
    database_url = migration_database_factory("dupes")
    _run_alembic(database_url, "upgrade", PREDECESSOR)
    hall_id = asyncio.run(_seed_hall(database_url))[0]
    asyncio.run(_insert_table(database_url, hall_id, 5))
    asyncio.run(_insert_table(database_url, hall_id, 5))
    assert asyncio.run(_active_rows(database_url, hall_id, 5)) == 2

    result = _invoke_alembic(database_url, "upgrade", EXPECTED_HEAD)
    assert result.returncode != 0
    output = result.stdout + result.stderr
    assert "table-number preflight failed" in output
    assert "groups=1" in output
    assert "number=5" in output

    # non-destructive: rows untouched, index absent, revision still predecessor
    assert asyncio.run(_active_rows(database_url, hall_id, 5)) == 2
    assert not asyncio.run(_index_exists(database_url, INDEX))
    assert asyncio.run(_current_revision(database_url)) == PREDECESSOR

    # manual reconciliation (as the migration error instructs), then it applies
    asyncio.run(_deactivate_extra_duplicates(database_url, hall_id, 5))
    _run_alembic(database_url, "upgrade", EXPECTED_HEAD)
    assert asyncio.run(_current_revision(database_url)) == EXPECTED_HEAD
    assert asyncio.run(_index_exists(database_url, INDEX))


@pytest.mark.skipif(
    not __import__("os").getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL is required for PostgreSQL table-uniqueness tests",
)
def test_partial_index_semantics_on_postgresql(
    migration_database_factory,  # noqa: F811
) -> None:
    database_url = migration_database_factory("semantics")
    _run_alembic(database_url, "upgrade", EXPECTED_HEAD)
    assert asyncio.run(_index_exists(database_url, INDEX))
    zal, bar = asyncio.run(_seed_hall(database_url, hall_count=2))

    # same hall + same ACTIVE number → DB rejects (final authority)
    asyncio.run(_insert_table(database_url, zal, 5))
    constraint = asyncio.run(
        _insert_duplicate_expecting_rejection(database_url, zal, 5)
    )
    assert constraint == INDEX

    # same number in a different hall → allowed
    asyncio.run(_insert_table(database_url, bar, 5))
    assert asyncio.run(_active_rows(database_url, bar, 5)) == 1

    # inactive duplicates of a taken number → allowed (predicate is active-only)
    asyncio.run(_insert_table(database_url, zal, 5, is_active=False))
    asyncio.run(_insert_table(database_url, zal, 5, is_active=False))
    assert asyncio.run(_active_rows(database_url, zal, 5)) == 1


@pytest.mark.skipif(
    not __import__("os").getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL is required for PostgreSQL table-uniqueness tests",
)
def test_downgrade_removes_only_the_partial_index(
    migration_database_factory,  # noqa: F811
) -> None:
    database_url = migration_database_factory("cycle")
    _run_alembic(database_url, "upgrade", EXPECTED_HEAD)
    assert asyncio.run(_index_exists(database_url, INDEX))

    _run_alembic(database_url, "downgrade", PREDECESSOR)
    assert asyncio.run(_current_revision(database_url)) == PREDECESSOR
    assert not asyncio.run(_index_exists(database_url, INDEX))
    # lower layers survive
    assert asyncio.run(_column_exists(database_url, "halls", "price_amount"))
    assert asyncio.run(_column_exists(database_url, "orders", "table_id"))

    _run_alembic(database_url, "upgrade", EXPECTED_HEAD)
    assert asyncio.run(_current_revision(database_url)) == EXPECTED_HEAD
    assert asyncio.run(_index_exists(database_url, INDEX))
