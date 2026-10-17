from __future__ import annotations

import asyncio
from uuid import uuid4

import asyncpg

from tests.test_migrations import _run_alembic, migration_database_factory  # noqa: F401


PREDECESSOR_HEADS = ("wh01exp01", "c6d7ftrs10")


def test_existing_global_unit_and_legacy_product_reference_survive_upgrade(
    migration_database_factory,
) -> None:
    database_url = migration_database_factory("company_units_preserve")
    for head in PREDECESSOR_HEADS:
        _run_alembic(database_url, "upgrade", head)

    unit_id = uuid4()
    product_id = uuid4()

    async def seed_and_read():
        connection = await asyncpg.connect(database_url.replace("+asyncpg", ""))
        try:
            await connection.execute(
                """
                INSERT INTO nm_units
                    (id, name, short_name, sort, status, created_at, updated_at)
                VALUES ($1, 'Kilogram', 'kg', 7, true, now(), now())
                """,
                unit_id,
            )
            await connection.execute(
                """
                INSERT INTO nm_products
                    (id, name, price, unit_id, status, is_used, is_archived,
                     created_at, updated_at)
                VALUES ($1, 'Legacy product', 100, $2, true, false, false,
                        now(), now())
                """,
                product_id,
                unit_id,
            )
        finally:
            await connection.close()

    asyncio.run(seed_and_read())
    _run_alembic(database_url, "upgrade", "un02cmp01")

    async def verify():
        connection = await asyncpg.connect(database_url.replace("+asyncpg", ""))
        try:
            unit = await connection.fetchrow(
                """
                SELECT id, name, short_name, sort, status, company_id
                FROM nm_units WHERE id = $1
                """,
                unit_id,
            )
            product_unit_id = await connection.fetchval(
                "SELECT unit_id FROM nm_products WHERE id = $1", product_id
            )
            assert dict(unit) == {
                "id": unit_id,
                "name": "Kilogram",
                "short_name": "kg",
                "sort": 7,
                "status": True,
                "company_id": None,
            }
            assert product_unit_id == unit_id
        finally:
            await connection.close()

    asyncio.run(verify())
