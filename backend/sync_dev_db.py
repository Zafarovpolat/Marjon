"""Аддитивная синхронизация схемы локальной dev.db с текущими моделями.

Зачем: dev.db создаётся через create_tables.py/seed.py и не мигрируется,
поэтому отстаёт от моделей → SQLite падает с "no such column" → HTTP 500
(а браузер показывает это как «CORS: No Access-Control-Allow-Origin»,
потому что Starlette не вешает CORS-заголовки на необработанный 500).

Что делает (ТОЛЬКО НЕРАЗРУШАЮЩИЕ операции):
  1) create_all(checkfirst=True) — создаёт отсутствующие таблицы целиком.
  2) Для существующих таблиц добавляет недостающие колонки через
     ALTER TABLE ... ADD COLUMN. Колонки добавляются как NULLABLE без
     ограничений (UNIQUE/NOT NULL опускаются), чтобы ALTER не падал на
     существующих строках; новые строки ORM заполняет корректно.
Никогда не удаляет и не меняет существующие колонки/данные.
"""
import asyncio
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.dialects import sqlite as sqlite_dialect
from app.shared.base_model import Base
from app.infrastructure.database.session import engine

# Импортируем все модели, чтобы Base.metadata знала о них (список из create_tables.py)
import app.modules.companies.models
import app.modules.auth.models
import app.modules.rbac.models
import app.modules.inventory.models
import app.modules.crm.models
import app.modules.pos.models
import app.modules.payments.models
import app.modules.kitchen.models
import app.modules.loyalty.models
import app.modules.delivery.models
import app.modules.hr.models
import app.modules.notifications.models
import app.modules.audit.models
import app.modules.fiscal.models
import app.modules.subscriptions.models
import app.modules.printers.models
import app.modules.halls.models
import app.modules.inventory.warehouse_models
import app.modules.inventory.semi_product_models
import app.modules.kafe_compat.models
import app.modules.handbook.models
import app.modules.organizations.models
import app.modules.departments.models
import app.modules.marketing.models
import app.modules.nomenclature.models
import app.modules.storage.models
import app.modules.finance.models
import app.modules.field_service.models
import app.modules.tasks.models
import app.modules.admin_settings.models

_DIALECT = sqlite_dialect.dialect()


def _sync(conn):
    # 1) Отсутствующие таблицы — создать целиком (не трогает существующие).
    Base.metadata.create_all(conn, checkfirst=True)

    insp = sa_inspect(conn)
    existing_tables = set(insp.get_table_names())
    added = []
    skipped = []

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # только что создана create_all — уже полная
        db_cols = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in db_cols:
                continue
            # Тип модели → тип SQLite; без ограничений (nullable, без UNIQUE/NOT NULL).
            col_type = col.type.compile(dialect=_DIALECT)
            ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}'
            try:
                conn.exec_driver_sql(ddl)
                added.append(f"{table.name}.{col.name} ({col_type})")
            except Exception as exc:  # noqa: BLE001 — печатаем и продолжаем
                skipped.append(f"{table.name}.{col.name}: {exc}")

    return added, skipped


async def main():
    async with engine.begin() as conn:
        added, skipped = await conn.run_sync(_sync)
    print(f"ADDED {len(added)} column(s):")
    for a in added:
        print("  +", a)
    if skipped:
        print(f"SKIPPED {len(skipped)} column(s):")
        for s in skipped:
            print("  !", s)
    print("SCHEMA SYNC DONE")


if __name__ == "__main__":
    asyncio.run(main())
