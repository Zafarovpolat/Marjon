"""Seed a demo menu for local development through the public API.

Creates a hall with tables, dish categories, ingredients and dishes for the
tenant of the given owner account, so the cashier floor, the web menu and the
desktop app are not empty on a fresh local database.

Idempotent: existing halls/categories/products are detected by name and skipped.

Usage:
    python scripts/seed_demo_menu.py
    python scripts/seed_demo_menu.py --email owner@dev.marjon.local --password owner123
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

DEFAULT_BASE = "http://localhost:8000/api/v1"

CATEGORIES = [
    {"name": "Салаты", "slug": "salads", "sort_order": 1},
    {"name": "Супы", "slug": "soups", "sort_order": 2},
    {"name": "Горячие блюда", "slug": "hot-dishes", "sort_order": 3},
    {"name": "Гарниры", "slug": "sides", "sort_order": 4},
    {"name": "Напитки", "slug": "drinks", "sort_order": 5},
]

INGREDIENTS = [
    {"name": "Помидор", "unit": "кг", "category": "Овощи", "avg_quantity": 20, "deficit_threshold": 5},
    {"name": "Огурец", "unit": "кг", "category": "Овощи", "avg_quantity": 15, "deficit_threshold": 4},
    {"name": "Куриное филе", "unit": "кг", "category": "Мясо", "avg_quantity": 30, "deficit_threshold": 8},
    {"name": "Говядина", "unit": "кг", "category": "Мясо", "avg_quantity": 25, "deficit_threshold": 6},
    {"name": "Картофель", "unit": "кг", "category": "Овощи", "avg_quantity": 40, "deficit_threshold": 10},
    {"name": "Морковь", "unit": "кг", "category": "Овощи", "avg_quantity": 12, "deficit_threshold": 3},
    {"name": "Рис", "unit": "кг", "category": "Крупы", "avg_quantity": 20, "deficit_threshold": 5},
    {"name": "Сливки 20%", "unit": "л", "category": "Молочное", "avg_quantity": 10, "deficit_threshold": 3},
    {"name": "Сыр пармезан", "unit": "кг", "category": "Молочное", "avg_quantity": 5, "deficit_threshold": 1},
    {"name": "Масло оливковое", "unit": "л", "category": "Масла", "avg_quantity": 8, "deficit_threshold": 2},
    {"name": "Соль", "unit": "кг", "category": "Специи", "avg_quantity": 5, "deficit_threshold": 1},
]

# name -> (category slug, price, [(ingredient name, grams), ...])
DISHES = [
    ("Салат «Летний»", "salads", 28000, [("Помидор", 120), ("Огурец", 100), ("Масло оливковое", 15)]),
    ("Салат «Цезарь»", "salads", 42000, [("Куриное филе", 120), ("Сыр пармезан", 20), ("Помидор", 40)]),
    ("Суп «Томатный»", "soups", 26000, [("Помидор", 200), ("Сливки 20%", 50), ("Соль", 3)]),
    ("Суп «Куриный с лапшой»", "soups", 30000, [("Куриное филе", 150), ("Морковь", 40)]),
    ("Стейк из говядины", "hot-dishes", 95000, [("Говядина", 250), ("Масло оливковое", 10), ("Соль", 2)]),
    ("Куриное филе на гриле", "hot-dishes", 58000, [("Куриное филе", 220), ("Масло оливковое", 8)]),
    ("Картофель по-деревенски", "sides", 22000, [("Картофель", 200), ("Масло оливковое", 12), ("Соль", 2)]),
    ("Рис отварной", "sides", 14000, [("Рис", 180), ("Соль", 2)]),
    ("Чай чёрный", "drinks", 8000, []),
    ("Кофе американо", "drinks", 14000, []),
    ("Лимонад домашний", "drinks", 18000, []),
]


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.token: str | None = None

    def call(self, path: str, data=None, method: str | None = None):
        req = urllib.request.Request(
            f"{self.base}{path}", method=method or ("POST" if data is not None else "GET")
        )
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        body = json.dumps(data).encode() if data is not None else None
        try:
            with urllib.request.urlopen(req, body) as resp:
                raw = resp.read().decode()
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode()
            raise SystemExit(f"HTTP {exc.code} on {method or 'GET'} {path}: {detail[:500]}")

    def login(self, email: str, password: str) -> None:
        status, payload = self.call("/auth/login", {"email": email, "password": password})
        if status != 200:
            raise SystemExit(f"login failed: {status}")
        self.token = payload["access_token"]


def as_items(payload):
    """List endpoints may return a bare list or a paginated envelope."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("items", "results", "data"):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--email", default="owner@dev.marjon.local")
    parser.add_argument("--password", default="owner123")
    parser.add_argument("--hall", default="Основной зал")
    parser.add_argument("--tables", type=int, default=8)
    args = parser.parse_args()

    api = Api(args.base)
    api.login(args.email, args.password)

    _, branches = api.call("/companies/me/branches")
    branch_list = as_items(branches)
    branch_id = branch_list[0]["id"] if branch_list else None
    print(f"branch: {branch_list[0].get('name') if branch_list else '—'} ({branch_id})")

    # --- hall + tables -----------------------------------------------------
    _, halls = api.call("/halls")
    hall = next((h for h in as_items(halls) if h.get("name") == args.hall), None)
    if hall:
        print(f"hall exists: {args.hall}")
    else:
        _, hall = api.call("/halls", {"name": args.hall, "branch_id": branch_id})
        print(f"hall created: {args.hall} ({hall['id']})")

    _, tables = api.call(f"/halls/{hall['id']}/tables")
    existing_numbers = {t.get("number") for t in as_items(tables)}
    created_tables = 0
    for number in range(1, args.tables + 1):
        if number in existing_numbers:
            continue
        api.call(f"/halls/{hall['id']}/tables", {"number": number, "capacity": 4})
        created_tables += 1
    print(f"tables: {len(existing_numbers) + created_tables} total, {created_tables} new")

    # --- categories --------------------------------------------------------
    _, categories = api.call("/inventory/categories")
    by_slug = {c.get("slug"): c for c in as_items(categories)}
    for cat in CATEGORIES:
        if cat["slug"] in by_slug:
            continue
        _, created = api.call(
            "/inventory/categories",
            {**cat, "is_active": True, "show_in_menu": True},
        )
        by_slug[cat["slug"]] = created
    print(f"categories: {len(by_slug)}")

    # --- ingredients -------------------------------------------------------
    _, ingredients = api.call("/inventory/ingredients")
    ing_by_name = {i.get("name"): i for i in as_items(ingredients)}
    for ing in INGREDIENTS:
        if ing["name"] in ing_by_name:
            continue
        _, created = api.call("/inventory/ingredients", ing)
        ing_by_name[ing["name"]] = created
    print(f"ingredients: {len(ing_by_name)}")

    # --- dishes ------------------------------------------------------------
    _, products = api.call("/inventory/products")
    products_by_name = {p.get("name"): p for p in as_items(products)}
    created_dishes = 0
    repaired_recipes = 0
    skipped_ingredients: set[str] = set()
    for name, slug, price, recipe in DISHES:
        lines = []
        wanted: set[str] = set()
        for ing_name, grams in recipe:
            ing = ing_by_name.get(ing_name)
            if not ing:
                skipped_ingredients.add(ing_name)
                continue
            lines.append({"ingredient_id": ing["id"], "quantity": grams})
            wanted.add(ing_name)
        category = by_slug.get(slug)

        existing = products_by_name.get(name)
        if existing:
            # A dish may exist with a partial recipe (e.g. an ingredient was
            # added to the list later) — top it up instead of skipping.
            if not lines:
                continue
            _, current = api.call(f"/inventory/products/{existing['id']}/recipe")
            have = {line.get("ingredient_name") for line in as_items(current)}
            if wanted <= have:
                continue
            api.call(f"/inventory/products/{existing['id']}", {"ingredients": lines}, method="PATCH")
            repaired_recipes += 1
            continue

        api.call(
            "/inventory/products",
            {
                "name": name,
                "category_id": category["id"] if category else None,
                "product_type": "dish",
                "price": price,
                "unit": "шт",
                "is_active": True,
                "ingredients": lines,
            },
        )
        created_dishes += 1
    print(
        f"dishes: {created_dishes} created, {repaired_recipes} recipes repaired, "
        f"{len(products_by_name)} already existed"
    )
    if skipped_ingredients:
        print(f"note: ingredients missing for recipes: {sorted(skipped_ingredients)}")

    _, products = api.call("/inventory/products")
    print(f"total products in menu: {len(as_items(products))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
