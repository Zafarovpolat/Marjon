"""Create all tables in the database."""
import asyncio
from app.shared.base_model import Base
from app.infrastructure.database.session import engine

# Регистрирует ВСЕ модели в Base.metadata (см. docstring модуля). Отдельные
# app.modules.*.models здесь не импортируем: новая FK в чужом модуле иначе
# роняет конфигурацию мапперов с NoReferencedTableError.
import app.infrastructure.database.models_registry  # noqa: F401


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("ALL TABLES CREATED OK")


if __name__ == "__main__":
    asyncio.run(main())
