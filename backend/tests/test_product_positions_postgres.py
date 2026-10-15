"""Real concurrency proof on a disposable database, never the dev database."""
import asyncio
from importlib import import_module
import os

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.modules.companies.models import Company
from app.modules.inventory.models import Product
from app.modules.inventory.schemas import ProductCreate, ProductUpdate
from app.modules.inventory.service import ProductService
from app.shared.base_model import Base


@pytest.fixture
async def isolated_pg():
    url = os.environ.get("PRODUCT_SORT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set PRODUCT_SORT_TEST_DATABASE_URL to disposable positional_sort_test DB")
    parsed = make_url(url)
    assert parsed.database == "positional_sort_test", "Refuse writes to any non-test database"
    assert parsed.host == "marjon-sort-v1-test-db", "Refuse non-disposable PostgreSQL host"
    engine = create_async_engine(url, pool_size=20, max_overflow=10)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
        await engine.dispose()


async def test_postgres_concurrent_inserts_moves_and_opposite_transfers(isolated_pg):
    sessions = async_sessionmaker(isolated_pg, expire_on_commit=False)
    async with sessions() as db:
        company = Company(slug="concurrent", name="Concurrent")
        other = Company(slug="untouched", name="Untouched")
        db.add_all([company, other])
        await db.commit()
        company_id, other_id = company.id, other.id
        await ProductService(db).create(other_id, ProductCreate(name="Foreign", price=100))

    async def create(index):
        async with sessions() as db:
            product = await ProductService(db).create(company_id, ProductCreate(name=f"Item {index}", price=100))
            return product.id

    async def invariant():
        async with sessions() as db:
            rows = list((await db.execute(select(Product).where(Product.company_id == company_id))).scalars())
            assert len(rows) == 12
            for active in (True, False):
                positions = sorted(p.sort_order for p in rows if p.is_active == active)
                assert positions == list(range(1, len(positions) + 1))
            foreign = (await db.execute(select(Product).where(Product.company_id == other_id))).scalar_one()
            assert (foreign.sort_order, foreign.is_active, foreign.name) == (1, True, "Foreign")

    ids = await asyncio.gather(*(create(i) for i in range(12)))
    await invariant()

    async def edit(product_id, **changes):
        async with sessions() as db:
            await ProductService(db).update(company_id, product_id, ProductUpdate(**changes))

    for _ in range(3):
        await asyncio.gather(*(edit(pid, sort_order=2 if i % 2 else 999) for i, pid in enumerate(ids)))
        await invariant()
    await asyncio.gather(*(edit(pid, is_active=False, sort_order=1) for pid in ids[:6]))
    await invariant()
    # Simultaneous transfers in both directions must not deadlock.
    await asyncio.gather(
        *(edit(pid, is_active=True) for pid in ids[:3]),
        *(edit(pid, is_active=False) for pid in ids[6:9]),
    )
    await invariant()


async def test_postgres_normalization_only_sort_and_idempotent(isolated_pg):
    sessions = async_sessionmaker(isolated_pg, expire_on_commit=False)
    async with sessions() as db:
        company = Company(slug="legacy", name="Legacy")
        db.add(company)
        await db.commit()
        for i, position in enumerate([1, 1, 0, 5, 999]):
            db.add(Product(company_id=company.id, name=f"Legacy {i}", price=100, sort_order=position))
        db.add(Product(company_id=company.id, name="Archived", price=100, sort_order=3, is_active=False))
        await db.commit()
    migration = import_module("migrations.versions.20261007_v31sort01_product_positional_sort")
    async with isolated_pg.begin() as connection:
        before = (await connection.execute(text("SELECT to_jsonb(p) - 'sort_order' FROM products p ORDER BY id"))).scalars().all()
        def normalize(sync_connection):
            with Operations.context(MigrationContext.configure(sync_connection)):
                migration.upgrade()
                migration.upgrade()
        await connection.run_sync(normalize)
        after = (await connection.execute(text("SELECT to_jsonb(p) - 'sort_order' FROM products p ORDER BY id"))).scalars().all()
        assert before == after
        for active in (True, False):
            positions = (await connection.execute(select(Product.sort_order).where(Product.is_active == active).order_by(Product.sort_order))).scalars().all()
            assert positions == list(range(1, len(positions) + 1))
