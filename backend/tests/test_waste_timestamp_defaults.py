"""Regression for deployed NOT NULL timestamp columns with no server defaults."""
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.dialects import sqlite
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.schema import CreateTable

from app.modules.inventory.warehouse_models import WasteDocument


@pytest.mark.asyncio
@pytest.mark.parametrize("automatic", [False, True])
async def test_waste_insert_supplies_dates_even_without_database_defaults(automatic):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    # Mirror the real database: columns are NOT NULL, but have no DEFAULT.
    ddl = str(CreateTable(WasteDocument.__table__).compile(dialect=sqlite.dialect()))
    ddl = ddl.replace(" DEFAULT CURRENT_TIMESTAMP", "")
    try:
        async with engine.begin() as connection:
            await connection.execute(text(ddl))
            columns = (await connection.execute(text("PRAGMA table_info(waste_documents)"))).mappings().all()
            stamps = [column for column in columns if column["name"] in ("created_at", "updated_at")]
            assert len(stamps) == 2
            assert all(column["notnull"] and column["dflt_value"] is None for column in stamps)
        async with AsyncSession(engine, expire_on_commit=False) as db:
            document = WasteDocument(company_id=uuid4(), number=1, name="Картошка",
                quantity=Decimal("0.2"), cost_price=Decimal("2300"), total_amount=Decimal("460"),
                is_automatic=automatic, status="draft")
            db.add(document)
            await db.commit()
            await db.refresh(document)
            assert document.created_at is not None
            assert document.updated_at is not None
            assert document.quantity == Decimal("0.2")
    finally:
        await engine.dispose()
