#!/usr/bin/env python3
"""Идемпотентная миграция: права/принтер/филиал у сотрудника + спец-пароль отмены.

Добавляет колонки:
  users: branch_id, printer_ip, nfc_id, permissions
  companies: cancel_password

Запускать один раз:  cd backend && python migrate_add_permissions.py
Данные не теряются (ALTER TABLE ADD COLUMN). Если таблицы нет — пропускает.
"""
import asyncio
from app.infrastructure.database.session import engine

# {table: {column: {dialect: ddl}}}
PLAN = {
    "users": {
        "branch_id":   {"sqlite": "CHAR(32)", "postgresql": "UUID"},
        "printer_ip":  {"sqlite": "VARCHAR(45)", "postgresql": "VARCHAR(45)"},
        "nfc_id":      {"sqlite": "VARCHAR(64)", "postgresql": "VARCHAR(64)"},
        "permissions": {"sqlite": "TEXT", "postgresql": "JSON"},
    },
    "companies": {
        "cancel_password": {"sqlite": "VARCHAR(64)", "postgresql": "VARCHAR(64)"},
    },
}


async def existing_columns(conn, dialect, table):
    if dialect == "sqlite":
        rows = (await conn.exec_driver_sql(f"PRAGMA table_info({table})")).fetchall()
        return {r[1] for r in rows}, bool(rows)
    rows = (await conn.exec_driver_sql(
        f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}'"
    )).fetchall()
    return {r[0] for r in rows}, bool(rows)


async def main():
    dialect = engine.dialect.name
    added = []
    async with engine.begin() as conn:
        for table, cols in PLAN.items():
            existing, table_exists = await existing_columns(conn, dialect, table)
            if not table_exists:
                print(f"Таблицы {table} нет — пропускаю (создаст create_tables.py).")
                continue
            for col, ddl_by_dialect in cols.items():
                if col in existing:
                    continue
                ddl = ddl_by_dialect.get(dialect, ddl_by_dialect["sqlite"])
                await conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
                added.append(f"{table}.{col}")
    print(f"Готово. Добавлены колонки: {added or 'нет (уже все на месте)'}")


if __name__ == "__main__":
    asyncio.run(main())
