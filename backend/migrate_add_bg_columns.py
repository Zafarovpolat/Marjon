#!/usr/bin/env python3
"""Идемпотентная миграция: добавляет в adm_image_backgrounds колонки
company_id / sort_order / is_active (привязка фона десктопа к организации).

Запускать один раз после обновления кода:  cd backend && python migrate_add_bg_columns.py
Не разрушает данные (в отличие от пересоздания таблицы). Если таблицы ещё нет —
ничего не делает: её создаст create_tables.py уже с новыми колонками.
"""
import asyncio
from sqlalchemy import text
from app.infrastructure.database.session import engine

TABLE = "adm_image_backgrounds"
# ddl по диалектам: SQLite и PostgreSQL
COLUMNS = {
    "company_id": {"sqlite": "CHAR(32)", "postgresql": "UUID"},
    "sort_order": {"sqlite": "INTEGER DEFAULT 0", "postgresql": "INTEGER DEFAULT 0"},
    "is_active":  {"sqlite": "BOOLEAN DEFAULT 0", "postgresql": "BOOLEAN DEFAULT FALSE"},
}


async def existing_columns(conn, dialect):
    """Возвращает (множество колонок, существует_ли_таблица)."""
    if dialect == "sqlite":
        rows = (await conn.exec_driver_sql(f"PRAGMA table_info({TABLE})")).fetchall()
        return {r[1] for r in rows}, bool(rows)
    # PostgreSQL
    rows = (await conn.exec_driver_sql(
        f"SELECT column_name FROM information_schema.columns WHERE table_name = '{TABLE}'"
    )).fetchall()
    return {r[0] for r in rows}, bool(rows)


async def main():
    dialect = engine.dialect.name  # 'sqlite' | 'postgresql'
    async with engine.begin() as conn:
        cols, table_exists = await existing_columns(conn, dialect)
        if not table_exists:
            print(f"Таблицы {TABLE} нет — пропускаю (её создаст create_tables.py).")
            return
        added = []
        for col, ddl_by_dialect in COLUMNS.items():
            if col in cols:
                continue
            ddl = ddl_by_dialect.get(dialect, ddl_by_dialect["sqlite"])
            await conn.exec_driver_sql(f"ALTER TABLE {TABLE} ADD COLUMN {col} {ddl}")
            added.append(col)
        print(f"Готово. Добавлены колонки: {added or 'нет (уже все на месте)'}")


if __name__ == "__main__":
    asyncio.run(main())
