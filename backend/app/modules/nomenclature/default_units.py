"""Единицы измерения, с которыми стартует каждая компания.

Зачем это здесь
---------------
Раньше справочник единиц был пустым: владелец заходил в «Настройки →
Единицы измерения» и заводил Кг/Гр/Лт/Пр/Шт руками. На стенде это уже
привело к тому, что у всех пяти единиц ``sort = 0`` — в таблице колонка
«Порядок» показывала нули, а порядок строк задавался именем, а не
владельцем.

Правило
-------
``sort`` начинается с **1**, а не с 0: 0 читается как «не задано» и
сортируется так же, как «первая», из-за чего порядок выглядит случайным.
Порядок по умолчанию: Килограмм → Порция → Штука → Грамм → Литр.

Модуль — единственный источник правды: его использует и регистрация
компании (``AuthService.register``), и создание компании из HQ-админки
(``CompanyService.create``), и миграция, которая выравнивает уже
существующие справочники.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.nomenclature.models import Unit


#: Порядок важен: индекс в кортеже = ``sort``. Не сортируйте по алфавиту.
DEFAULT_UNITS: tuple[dict[str, object], ...] = (
    {"name": "Килограмм", "short_name": "Кг", "sort": 1},
    {"name": "Порция", "short_name": "Пр", "sort": 2},
    {"name": "Штука", "short_name": "Шт", "sort": 3},
    {"name": "Грамм", "short_name": "Гр", "sort": 4},
    {"name": "Литр", "short_name": "Лт", "sort": 5},
)


async def seed_default_units(
    db: AsyncSession, company_id: UUID
) -> list[Unit]:
    """Создать недостающие единицы по умолчанию для компании.

    Идемпотентно: сравнивает по имени без учёта регистра, поэтому повторный
    вызов (или компания, где владелец уже завёл «Килограмм») ничего не
    дублирует. Коммит не делает — это забота вызывающего кода, чтобы
    регистрация оставалась одной транзакцией.
    """
    rows = await db.execute(
        select(Unit.name).where(Unit.company_id == company_id)
    )
    existing = {str(name).strip().casefold() for name in rows.scalars()}

    created: list[Unit] = []
    for spec in DEFAULT_UNITS:
        if str(spec["name"]).casefold() in existing:
            continue
        unit = Unit(
            company_id=company_id,
            name=str(spec["name"]),
            short_name=str(spec["short_name"]),
            sort=int(spec["sort"]),  # type: ignore[arg-type]
            status=True,
        )
        db.add(unit)
        created.append(unit)

    if created:
        await db.flush()
    return created
