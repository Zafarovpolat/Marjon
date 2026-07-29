#!/bin/sh
# Инициализация бэкенда в контейнере: ждём БД, аккуратно применяем миграции,
# при первом запуске наполняем демо-данными. Всё, что раньше приходилось делать
# руками (и на чём возникали ошибки), происходит здесь автоматически.
set -e

echo "[init] DATABASE_URL=${DATABASE_URL%%:*}://... (пароль скрыт)"

# ── 1. Ждём готовности базы ──────────────────────────────────────────────────
python - <<'PY'
import asyncio, os, sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

url = os.environ.get("DATABASE_URL", "")

async def wait():
    last = ""
    for attempt in range(1, 61):
        engine = create_async_engine(url)
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            print("[init] база готова")
            return
        except Exception as exc:
            last = f"{type(exc).__name__}: {exc}"
            if attempt % 5 == 1:
                print(f"[init] база ещё не готова ({type(exc).__name__}), попытка {attempt}/60")
            await asyncio.sleep(2)
        finally:
            await engine.dispose()
    print(f"[init] БД недоступна: {last}", file=sys.stderr)
    sys.exit(1)

asyncio.run(wait())
PY

# ── 2. Миграции ──────────────────────────────────────────────────────────────
# alembic upgrade head падает, если таблицы уже созданы через create_tables.py
# (нет отметки версии). Обрабатываем это, а не выводим трейсбек.
echo "[init] alembic upgrade head..."
if alembic upgrade head > /tmp/alembic.log 2>&1; then
    echo "[init] миграции применены"
else
    if grep -qi "already exists" /tmp/alembic.log; then
        echo "[init] таблицы уже есть -> alembic stamp head"
        alembic stamp head
    else
        echo "[init] alembic не смог, создаю схему из моделей (create_tables.py)"
        tail -n 15 /tmp/alembic.log
        python create_tables.py
        alembic stamp head || true
    fi
fi

# Идемпотентно добавляет новые колонки (permissions, pin_hash, takeaway и др.)
echo "[init] migrate_add_permissions.py..."
python migrate_add_permissions.py || echo "[init] предупреждение: migrate_add_permissions не завершился"

# ── 3. Демо-данные при первом запуске ────────────────────────────────────────
if [ "${SEED_ON_START:-1}" = "1" ]; then
    if python - <<'PY'
import asyncio, os, sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    engine = create_async_engine(os.environ["DATABASE_URL"])
    try:
        async with engine.connect() as conn:
            count = (await conn.execute(text("SELECT COUNT(*) FROM users"))).scalar() or 0
        sys.exit(0 if count == 0 else 1)   # 0 = нужно сидировать
    finally:
        await engine.dispose()

asyncio.run(main())
PY
    then
        echo "[init] база пустая — наполняю демо-данными (seed.py)"
        python seed.py || echo "[init] предупреждение: seed.py не завершился"
    else
        echo "[init] пользователи уже есть — сид пропускаю"
    fi
fi

# ── 4. Запуск ────────────────────────────────────────────────────────────────
echo "[init] запускаю uvicorn на 0.0.0.0:${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
