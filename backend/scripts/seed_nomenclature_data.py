#!/usr/bin/env python3
"""Тестовые данные для номенклатуры: категории и полуфабрикаты.

Usage: cd backend && python scripts/seed_nomenclature_data.py

Дополняет локальную БД данными, чтобы страницы «Сырьё» и «Полуфабрикаты»
работали end-to-end (заполнение состава, себестоимость, выпадающий список
категорий). Сырьё (ingredients + stock_items) обычно уже засеяно основным
seed'ом — здесь мы добавляем то, чего в dev.db нет по умолчанию:

  - категории полуфабрикатов (slug с префиксом "semi-" — SemiProductsPage
    отбирает их по slug.startsWith("semi"))
  - несколько полуфабрикатов с составом из уже существующих ингредиентов

Полуфабрикаты создаются ЧЕРЕЗ SemiProductService, а не прямым INSERT: сервис
сам пересчитывает cost_price по среднему cost_price ингредиентов на складе
(_recalc_cost), проверяет принадлежность к компании и корректно пишет состав.

Гарантии (как у seed_dev_data.py):
  - отказывается работать вне development (жёсткая проверка settings.debug)
  - идемпотентность — каждая сущность проверяется перед созданием, повторный
    запуск безопасен
"""
from __future__ import annotations

import asyncio
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.config import settings
from app.infrastructure.database.session import AsyncSessionLocal

# Полностью населяем реестр моделей SQLAlchemy до конфигурации мапперов —
# иначе строковые relationship (напр. Company → "User") не резолвятся.
# Список зеркалит migrations/env.py.
import app.modules.companies.models  # noqa: F401
import app.modules.auth.models  # noqa: F401
import app.modules.rbac.models  # noqa: F401
import app.modules.inventory.models  # noqa: F401
import app.modules.crm.models  # noqa: F401
import app.modules.pos.models  # noqa: F401
import app.modules.payments.models  # noqa: F401
import app.modules.kitchen.models  # noqa: F401
import app.modules.loyalty.models  # noqa: F401
import app.modules.delivery.models  # noqa: F401
import app.modules.hr.models  # noqa: F401
import app.modules.notifications.models  # noqa: F401
import app.modules.audit.models  # noqa: F401
import app.modules.fiscal.models  # noqa: F401
import app.modules.subscriptions.models  # noqa: F401
import app.modules.printers.models  # noqa: F401
import app.modules.halls.models  # noqa: F401
import app.modules.kafe_compat.models  # noqa: F401
import app.modules.handbook.models  # noqa: F401
import app.modules.organizations.models  # noqa: F401
import app.modules.departments.models  # noqa: F401
import app.modules.marketing.models  # noqa: F401
import app.modules.nomenclature.models  # noqa: F401
import app.modules.storage.models  # noqa: F401
import app.modules.finance.models  # noqa: F401
import app.modules.field_service.models  # noqa: F401
import app.modules.tasks.models  # noqa: F401
import app.modules.admin_settings.models  # noqa: F401
import app.modules.inventory.warehouse_models  # noqa: F401
import app.modules.inventory.semi_product_models  # noqa: F401

from app.modules.companies.models import Company
from app.modules.inventory.models import Category, Ingredient
from app.modules.inventory.semi_product_models import SemiProduct
from app.modules.inventory.semi_product_schemas import (
    SemiProductCreate,
    SemiProductIngredientIn,
)
from app.modules.inventory.semi_product_service import SemiProductService

# Компания, в которую логинится владелец. Предпочитаем канонические slug'и
# seed_dev_data.py, затем «marjon», затем самую раннюю созданную компанию —
# так скрипт работает и на свежей БД, и на текущей dev.db.
PREFERRED_SLUGS = ["marjon-dev-a", "marjon"]

# (name, slug, sort_order) — категории полуфабрикатов.
SEMI_CATEGORIES = [
    ("Тесто и заготовки", "semi-dough", 10),
    ("Соусы", "semi-sauces", 20),
    ("Заготовки кухни", "semi-kitchen", 30),
]

# (name, slug, sort_order) — категории сырья. Живут в той же таблице categories,
# отбираются по slug-префиксу "raw" (CategoriesPage type="raw").
RAW_CATEGORIES = [
    ("Бакалея", "raw-grocery", 10),
    ("Молочные продукты", "raw-dairy", 20),
    ("Мясо и птица", "raw-meat", 30),
    ("Овощи и зелень", "raw-vegetables", 40),
]

# Рецепты полуфабрикатов. Ингредиенты не хардкодим по именам (в dev.db они
# могут быть любыми) — берём первые N активных ингредиентов компании по
# индексам. (name, unit, category_slug, [(ingredient_index, quantity), ...]).
SEMI_PRODUCTS = [
    ("Тесто дрожжевое", "кг", "semi-dough", [(0, "1.0"), (1, "0.5"), (2, "0.3")]),
    ("Соус томатный", "л", "semi-sauces", [(3, "0.4"), (4, "0.2")]),
    ("Бульон куриный", "л", "semi-kitchen", [(5, "0.5"), (6, "0.1")]),
    ("Фарш мясной", "кг", "semi-kitchen", [(7, "0.8"), (8, "0.2")]),
]


async def _resolve_company(db) -> Company | None:
    for slug in PREFERRED_SLUGS:
        found = (await db.execute(select(Company).where(Company.slug == slug))).scalar_one_or_none()
        if found:
            return found
    # Fallback: самая ранняя созданная компания.
    return (
        await db.execute(select(Company).order_by(Company.created_at).limit(1))
    ).scalar_one_or_none()


async def _get_or_create_categories(db, company_id, specs) -> dict[str, Category]:
    by_slug: dict[str, Category] = {}
    for name, slug, sort_order in specs:
        existing = (
            await db.execute(
                select(Category).where(
                    Category.company_id == company_id, Category.slug == slug
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            existing = Category(
                company_id=company_id,
                name=name,
                slug=slug,
                sort_order=sort_order,
                is_active=True,
            )
            db.add(existing)
            await db.flush()
        by_slug[slug] = existing
    await db.commit()
    return by_slug


async def main() -> None:
    if not settings.debug:
        print("ОТКАЗ: сид тестовых данных запускается только в development (settings.debug=True).")
        sys.exit(1)

    async with AsyncSessionLocal() as db:
        company = await _resolve_company(db)
        if company is None:
            print("ОТКАЗ: в БД нет ни одной компании. Сначала запусти seed_dev_data.py.")
            sys.exit(1)
        print(f"Компания: {company.name} (slug={company.slug})")

        categories = await _get_or_create_categories(db, company.id, SEMI_CATEGORIES)
        print(f"Категории полуфабрикатов: {len(categories)} (semi-*)")

        raw_categories = await _get_or_create_categories(db, company.id, RAW_CATEGORIES)
        print(f"Категории сырья: {len(raw_categories)} (raw-*)")

        ingredients = list(
            (
                await db.execute(
                    select(Ingredient)
                    .where(Ingredient.company_id == company.id, Ingredient.is_active.is_(True))
                    .order_by(Ingredient.name)
                )
            ).scalars().all()
        )
        if not ingredients:
            print("ОТКАЗ: у компании нет активных ингредиентов — сначала запусти seed_dev_data.py.")
            sys.exit(1)

        service = SemiProductService(db)
        created = 0
        for name, unit, cat_slug, lines in SEMI_PRODUCTS:
            exists = (
                await db.execute(
                    select(SemiProduct).where(
                        SemiProduct.company_id == company.id, SemiProduct.name == name
                    )
                )
            ).scalar_one_or_none()
            if exists is not None:
                continue
            # Индексы состава берём по модулю — устойчиво к любому числу ингредиентов.
            composition = [
                SemiProductIngredientIn(
                    ingredient_id=ingredients[idx % len(ingredients)].id,
                    quantity=Decimal(qty),
                )
                for idx, qty in lines
            ]
            payload = SemiProductCreate(
                name=name,
                unit=unit,
                category_id=categories[cat_slug].id,
                is_active=True,
                ingredients=composition,
            )
            sp = await service.create(company.id, payload)
            created += 1
            print(f"  + {name}: состав {len(composition)}, себестоимость {sp.cost_price}")

        print(f"Полуфабрикаты: создано {created}, всего в рецептах {len(SEMI_PRODUCTS)}.")


if __name__ == "__main__":
    asyncio.run(main())
