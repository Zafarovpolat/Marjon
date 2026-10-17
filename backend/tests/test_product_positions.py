from datetime import datetime, timezone
from importlib import import_module
from uuid import UUID, uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.inventory.models import Product
from app.modules.inventory.product_positions import ProductPositions
from app.modules.inventory.repository import ProductRepository
from app.modules.inventory.schemas import ProductCreate, ProductUpdate
from tests.conftest import register_company


@pytest.fixture
async def owner(client):
    headers, _ = await register_company(client, slug="positions", email="owner@positions.example.com")
    me = await client.get("/auth/me", headers=headers)
    assert me.status_code == 200
    return headers, UUID(me.json()["company_id"])


async def create(client, headers, name, position=999, active=True):
    response = await client.post("/inventory/products", headers=headers, json={
        "name": name, "price": 100, "sort_order": position, "is_active": active,
    })
    assert response.status_code == 201, response.text
    return response.json()


async def seed(client, headers, names="ABCDE", active=True):
    return [await create(client, headers, name, active=active) for name in names]


async def patch(client, headers, item, **changes):
    response = await client.patch(f"/inventory/products/{item['id']}", headers=headers, json=changes)
    assert response.status_code == 200, response.text
    return response.json()


async def sequence(client, headers, names, active=True):
    response = await client.get("/inventory/products?include_all=true", headers=headers)
    assert response.status_code == 200, response.text
    rows = [row for row in response.json() if row["is_active"] == active]
    assert [row["sort_order"] for row in rows] == list(range(1, len(rows) + 1))
    assert [row["name"] for row in rows] == list(names)
    return rows


async def test_create_first_and_default_one(client, owner):
    headers, _ = owner
    response = await client.post("/inventory/products", headers=headers, json={"name": "A", "price": 100})
    assert response.status_code == 201
    assert response.json()["sort_order"] == 1
    await sequence(client, headers, "A")


@pytest.mark.parametrize("position,expected", [(1, "XABCDE"), (3, "ABXCDE"), (999, "ABCDEX")])
async def test_create_position_shifts_or_clamps(client, owner, position, expected):
    headers, _ = owner
    await seed(client, headers)
    await create(client, headers, "X", position)
    await sequence(client, headers, expected)


@pytest.mark.parametrize("index,position,expected", [
    (4, 2, "AEBCD"), (1, 5, "ACDEB"), (2, 3, "ABCDE"), (0, 999, "BCDEA"),
])
async def test_move_up_down_same_or_clamp(client, owner, index, position, expected):
    headers, _ = owner
    items = await seed(client, headers)
    await patch(client, headers, items[index], sort_order=position)
    await sequence(client, headers, expected)


async def test_delete_archive_compacts_and_appends_and_is_idempotent(client, owner):
    headers, _ = owner
    items = await seed(client, headers)
    await seed(client, headers, "XY", active=False)
    for _ in range(2):
        response = await client.delete(f"/inventory/products/{items[1]['id']}", headers=headers)
        assert response.status_code == 204
        await sequence(client, headers, "ACDE")
        archived = await sequence(client, headers, "XYB", False)
        assert archived[-1]["is_available"] is False


async def test_generic_patch_and_full_drawer_state_transfer_ignore_old_sort(client, owner):
    headers, _ = owner
    items = await seed(client, headers)
    await seed(client, headers, "XY", active=False)
    await patch(client, headers, items[1], is_active=False, sort_order=2)
    await sequence(client, headers, "ACDE")
    await sequence(client, headers, "XYB", False)
    await patch(client, headers, items[1], is_active=True, sort_order=1)
    await sequence(client, headers, "ACDEB")
    await sequence(client, headers, "XY", False)


async def test_restore_middle_archive_compacts_and_appends(client, owner):
    headers, _ = owner
    await seed(client, headers, "AB")
    archived = await seed(client, headers, "XYZ", active=False)
    await patch(client, headers, archived[1], is_active=True)
    await sequence(client, headers, "ABY")
    await sequence(client, headers, "XZ", False)


@pytest.mark.parametrize("active", [True, False])
async def test_reorder_leaves_opposite_state_unchanged(client, owner, active):
    headers, _ = owner
    items = await seed(client, headers, "ABCDE", active=active)
    await seed(client, headers, "XYZ", active=not active)
    await patch(client, headers, items[4], sort_order=2)
    await sequence(client, headers, "AEBCD", active)
    await sequence(client, headers, "XYZ", not active)


async def test_company_isolation_and_cross_tenant_denial(client, owner):
    headers, _ = owner
    mine = await seed(client, headers)
    other, _ = await register_company(client, slug="other", email="owner@other.example.com")
    theirs = await seed(client, other, "XYZ")
    await patch(client, headers, mine[4], sort_order=2)
    await sequence(client, other, "XYZ")
    for method, body in [("patch", {"sort_order": 1}), ("delete", None)]:
        kwargs = {"json": body} if body else {}
        response = await getattr(client, method)(f"/inventory/products/{theirs[0]['id']}", headers=headers, **kwargs)
        assert response.status_code == 404
    await sequence(client, headers, "AEBCD")
    await sequence(client, other, "XYZ")


@pytest.mark.parametrize("value", [0, -1, 1.5, 2.0, True, "2", None])
async def test_api_rejects_invalid_positions_atomically(client, owner, value):
    headers, _ = owner
    items = await seed(client, headers, "AB")
    response = await client.post("/inventory/products", headers=headers, json={"name": "X", "price": 100, "sort_order": value})
    assert response.status_code == 422
    response = await client.patch(f"/inventory/products/{items[0]['id']}", headers=headers, json={"sort_order": value})
    assert response.status_code == 422
    await sequence(client, headers, "AB")


async def test_unrelated_update_and_repeated_moves_preserve_invariant(client, owner):
    headers, _ = owner
    items = await seed(client, headers)
    for index, position in [(4, 2), (1, 999), (0, 4), (3, 1), (4, 5)] * 3:
        await patch(client, headers, items[index], sort_order=position)
        response = await client.get("/inventory/products?include_all=true", headers=headers)
        assert [p["sort_order"] for p in response.json()] == [1, 2, 3, 4, 5]
    before = (await client.get("/inventory/products?include_all=true", headers=headers)).json()
    await patch(client, headers, items[0], is_auto=True, is_set=True)
    after = (await client.get("/inventory/products?include_all=true", headers=headers)).json()
    assert [(p["id"], p["sort_order"]) for p in before] == [(p["id"], p["sort_order"]) for p in after]


async def test_transaction_rollback_restores_all_shifted_rows(db_engine, client, owner):
    headers, company_id = owner
    await seed(client, headers)
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        positions = ProductPositions(db, company_id)
        await positions.lock()
        await positions.insert(True, "dish", 2)
        await db.rollback()
    await sequence(client, headers, "ABCDE")


async def test_normalization_deterministic_scoped_idempotent_only_sort_changes(db_engine, client, owner):
    headers, company_id = owner
    await seed(client, headers)
    await seed(client, headers, "XYZ", active=False)
    other, _ = await register_company(client, slug="other", email="owner@other.example.com")
    await seed(client, other, "KL")
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        products = list((await db.execute(select(Product))).scalars())
        # Isolated legacy fixture: duplicates, gaps and zero with creation ties.
        for i, p in enumerate(products):
            p.sort_order = [1, 1, 0, 5, 999][i % 5]
            p.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        await db.commit()
        products = list((await db.execute(select(Product).execution_options(populate_existing=True))).scalars())
        before = [{c.name: getattr(p, c.name) for c in Product.__table__.columns} for p in products]
    migration = import_module("migrations.versions.20261007_v31sort01_product_positional_sort")
    async with db_engine.begin() as connection:
        def normalize(sync_connection):
            with Operations.context(MigrationContext.configure(sync_connection)):
                migration.upgrade()
                migration.upgrade()
        await connection.run_sync(normalize)
    async with sessions() as db:
        rows = list((await db.execute(select(Product))).scalars())
        for row in rows:
            original = next(p for p in before if p["id"] == row.id)
            assert {c.name: getattr(row, c.name) for c in Product.__table__.columns if c.name != "sort_order"} == {
                key: value for key, value in original.items() if key != "sort_order"
            }
        for company, active in {(p["company_id"], p["is_active"]) for p in before}:
            expected = sorted([p for p in before if p["company_id"] == company and p["is_active"] == active],
                              key=lambda p: (p["sort_order"], p["created_at"], p["id"]))
            actual = sorted([p for p in rows if p.company_id == company and p.is_active == active], key=lambda p: p.sort_order)
            assert [p.id for p in actual] == [p["id"] for p in expected]
            assert [p.sort_order for p in actual] == list(range(1, len(actual) + 1))


async def test_repository_legacy_ties_are_deterministic(db_engine, client, owner):
    headers, company_id = owner
    await seed(client, headers)
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        products = list((await db.execute(select(Product))).scalars())
        for p in products:
            p.sort_order = 1
            p.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        await db.commit()
        expected = sorted([p.id for p in products])
        repo = ProductRepository(db)
        assert [p.id for p in await repo.get_all(company_id)] == expected
        assert [p.id for p in await repo.get_available(company_id)] == expected


async def create_as(client, headers, name, ptype="dish", position=999, active=True):
    response = await client.post("/inventory/products", headers=headers, json={
        "name": name, "price": 100, "sort_order": position,
        "is_active": active, "product_type": ptype,
    })
    assert response.status_code == 201, response.text
    return response.json()


async def type_sequence(client, headers, ptype, names, active=True):
    response = await client.get("/inventory/products?include_all=true", headers=headers)
    assert response.status_code == 200, response.text
    rows = [row for row in response.json()
            if row["is_active"] == active and row["product_type"] == ptype]
    assert [row["sort_order"] for row in rows] == list(range(1, len(rows) + 1))
    assert [row["name"] for row in rows] == list(names)
    return rows


async def test_dish_and_sale_sequences_are_independent(client, owner):
    headers, _ = owner
    await create_as(client, headers, "A")
    await create_as(client, headers, "X", ptype="sale")
    await create_as(client, headers, "B")
    await create_as(client, headers, "Y", ptype="sale")
    await type_sequence(client, headers, "dish", "AB")
    await type_sequence(client, headers, "sale", "XY")


async def test_move_within_type_leaves_other_type_untouched(client, owner):
    headers, _ = owner
    dishes = [await create_as(client, headers, name) for name in "ABC"]
    await create_as(client, headers, "X", ptype="sale")
    await create_as(client, headers, "Y", ptype="sale")
    await patch(client, headers, dishes[2], sort_order=1)
    await type_sequence(client, headers, "dish", "CAB")
    await type_sequence(client, headers, "sale", "XY")


async def test_type_change_moves_between_scopes(client, owner):
    headers, _ = owner
    dishes = [await create_as(client, headers, name) for name in "ABC"]
    await create_as(client, headers, "X", ptype="sale")
    await patch(client, headers, dishes[1], product_type="sale")
    await type_sequence(client, headers, "dish", "AC")
    await type_sequence(client, headers, "sale", "XB")
