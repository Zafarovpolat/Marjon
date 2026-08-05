#!/usr/bin/env python3
"""Идемпотентная миграция: добавляет в orders колонку cancel_comment
(комментарий при отмене заказа).

Запускать один раз после обновления кода:  cd backend && python migrate_add_cancel_comment.py
Не разрушает данные. Если таблицы ещё нет — ничего не делает:
её создаст create_tables.py уже с новой колонкой.
"""
import asyncio
from sqlalchemy import text
from app.infrastructure.database.session import engine

TABLE = "orders"
COLUMNS = {
    "cancel_comment": {"sqlite": "TEXT", "postgresql": "TEXT"},
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
