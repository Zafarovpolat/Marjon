#!/usr/bin/env python3
"""Демо-техкарты: ингредиенты + связи блюдо→ингредиент.
Запускать после seed.py/seed_demo.py:  cd backend && python seed_recipes.py
Идемпотентно: не дублирует ингредиенты и рецепты.
"""
import asyncio
import random
from decimal import Decimal

from sqlalchemy import select

from app.infrastructure.database.session import AsyncSessionLocal
from app.modules.companies.models import Company
from app.modules.inventory.models import Product, Ingredient, ProductRecipe

INGREDIENTS = [
    ("Рис девзира", "г"), ("Баранина", "г"), ("Морковь", "г"), ("Лук репчатый", "г"),
    ("Масло хлопковое", "мл"), ("Зира", "г"), ("Соль", "г"), ("Мука", "г"),
    ("Помидоры", "г"), ("Зелень", "г"), ("Говядина", "г"), ("Картофель", "г"),
]


async def main():
    async with AsyncSessionLocal() as db:
        company = (await db.execute(select(Company).limit(1))).scalar_one_or_none()
        if not company:
            print("Нет компании — сначала запустите seed.py")
            return
        cid = company.id

        ings = []
        for name, unit in INGREDIENTS:
            ing = (await db.execute(
                select(Ingredient).where(Ingredient.company_id == cid, Ingredient.name == name)
            )).scalar_one_or_none()
            if not ing:
                ing = Ingredient(company_id=cid, name=name, unit=unit)
                db.add(ing)
                await db.flush()
            ings.append(ing)
        await db.commit()

        products = (await db.execute(
            select(Product).where(Product.company_id == cid).limit(8)
        )).scalars().all()

        made = 0
        for p in products:
            exists = (await db.execute(
                select(ProductRecipe).where(ProductRecipe.product_id == p.id)
            )).scalars().first()
            if exists:
                continue
            for ing in random.sample(ings, k=min(4, len(ings))):
                db.add(ProductRecipe(
                    company_id=cid, product_id=p.id, ingredient_id=ing.id,
                    quantity=Decimal(str(random.choice([30, 50, 80, 100, 120, 150, 200]))),
                    unit=ing.unit,
                ))
            made += 1
        await db.commit()
        print(f"Техкарты созданы для {made} блюд (ингредиентов: {len(ings)}).")


if __name__ == "__main__":
    asyncio.run(main())
