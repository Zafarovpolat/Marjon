#!/usr/bin/env python3
"""
Есть ли в базе NULL там, где модели требуют NOT NULL.

Зачем. `alembic check` на чистом Postgres показал 266 колонок, которые модели
считают обязательными, а миграции создали допускающими NULL: флаг `nullable=False`
при написании миграций руками просто забывали. Приложение всегда пишет значения
само, поэтому вреда сейчас нет — но и гарантии на уровне базы нет тоже.

Привести схему в порядок = выполнить ALTER ... SET NOT NULL для этих колонок.
Опасность в том, что такой ALTER падает, если хоть одна строка содержит NULL, и
миграция остаётся применённой наполовину. На боевой базе это дорого.

Скрипт отвечает на вопрос заранее и НИЧЕГО НЕ МЕНЯЕТ: только считает строки.
Если он показал ноль — миграцию можно готовить спокойно. Если нашёл NULL, видно
конкретные таблицы и колонки, и сначала надо разобраться с данными.

    cd backend
    DATABASE_URL=postgresql+asyncpg://... python scripts/check_nulls.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect, text                      # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine    # noqa: E402

import app.main  # noqa: F401,E402  — импорт регистрирует все модели на Base
from app.shared.base_model import Base                    # noqa: E402


async def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("не задан DATABASE_URL")
        return 2

    # Колонки, которые МОДЕЛЬ считает обязательными.
    required: list[tuple[str, str]] = []
    for table in Base.metadata.sorted_tables:
        for col in table.columns:
            if not col.nullable and not col.primary_key:
                required.append((table.name, col.name))

    engine = create_async_engine(url)
    problems: list[tuple[str, str, int]] = []
    skipped = 0

    async with engine.connect() as conn:
        existing = await conn.run_sync(lambda c: set(inspect(c).get_table_names()))

        for table, column in required:
            if table not in existing:
                skipped += 1
                continue
            cols = await conn.run_sync(
                lambda c, t=table: {x["name"] for x in inspect(c).get_columns(t)}
            )
            if column not in cols:
                skipped += 1
                continue
            # Идентификаторы подставляем в текст запроса, а не параметром:
            # имена таблиц и колонок нельзя биндить. Источник — метаданные
            # моделей, а не пользовательский ввод, так что подстановка безопасна.
            n = (await conn.execute(
                text(f'SELECT count(*) FROM "{table}" WHERE "{column}" IS NULL')
            )).scalar_one()
            if n:
                problems.append((table, column, n))

    await engine.dispose()

    print(f"проверено колонок : {len(required) - skipped}")
    if skipped:
        print(f"пропущено (нет в базе): {skipped}")

    if not problems:
        print("\nNULL не найдено ни в одной колонке.")
        print("Миграцию с SET NOT NULL можно готовить: падать ей не на чем.")
        return 0

    print(f"\nНАЙДЕНЫ NULL в {len(problems)} колонках — ALTER ... SET NOT NULL упадёт:")
    for table, column, n in sorted(problems, key=lambda x: -x[2]):
        print(f"  {table}.{column}: {n} строк")
    print("\nСначала разберитесь с данными: проставьте значения или удалите битые строки.")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
