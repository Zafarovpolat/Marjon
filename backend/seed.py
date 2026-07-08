import asyncio
import httpx

BASE_URL = "http://localhost:8000/api/v1"

# ─── 1. Данные компании ──────────────────────────────────────────────────────
COMPANY = {
    "company_name": "Marjon Demo",
    "company_slug": "marjon-demo",
    "email": "admin@marjon.uz",
    "password": "Admin1234!",
}

# ─── 2. Категории блюд ──────────────────────────────────────────────────────
CATEGORIES = [
    {"name": "Первые блюда", "slug": "first-dishes", "sort_order": 1},
    {"name": "Вторые блюда", "slug": "second-dishes", "sort_order": 2},
    {"name": "Напитки", "slug": "drinks", "sort_order": 3},
    {"name": "Десерты", "slug": "desserts", "sort_order": 4},
    {"name": "Закуски", "slug": "appetizers", "sort_order": 5},
]

# ─── 3. Блюда ───────────────────────────────────────────────────────────────
PRODUCTS = [
    {"name": "Мастава", "price": 25000, "cost_price": 12000, "unit": "порция", "category": "Первые блюда", "sort_order": 1},
    {"name": "Лагман", "price": 30000, "cost_price": 15000, "unit": "порция", "category": "Первые блюда", "sort_order": 2},
    {"name": "Шурпа", "price": 28000, "cost_price": 13000, "unit": "порция", "category": "Первые блюда", "sort_order": 3},
    {"name": "Плов Узбекский", "price": 45000, "cost_price": 20000, "unit": "порция", "category": "Вторые блюда", "sort_order": 1},
    {"name": "Самса (2 шт)", "price": 18000, "cost_price": 8000, "unit": "порция", "category": "Вторые блюда", "sort_order": 2},
    {"name": "Шашлык Куриный", "price": 55000, "cost_price": 28000, "unit": "порция", "category": "Вторые блюда", "sort_order": 3},
    {"name": "Шашлык Говяжий", "price": 70000, "cost_price": 35000, "unit": "порция", "category": "Вторые блюда", "sort_order": 4},
    {"name": "Кола 0.5л", "price": 12000, "cost_price": 5000, "unit": "шт", "category": "Напитки", "sort_order": 1},
    {"name": "Зелёный чай", "price": 8000, "cost_price": 1500, "unit": "чайник", "category": "Напитки", "sort_order": 2},
    {"name": "Чёрный чай", "price": 8000, "cost_price": 1500, "unit": "чайник", "category": "Напитки", "sort_order": 3},
    {"name": "Айран", "price": 10000, "cost_price": 3000, "unit": "стакан", "category": "Напитки", "sort_order": 4},
    {"name": "Пахлава", "price": 20000, "cost_price": 8000, "unit": "порция", "category": "Десерты", "sort_order": 1},
    {"name": "Чак-чак", "price": 15000, "cost_price": 6000, "unit": "порция", "category": "Десерты", "sort_order": 2},
    {"name": "Салат Ташкентский", "price": 22000, "cost_price": 10000, "unit": "порция", "category": "Закуски", "sort_order": 1},
    {"name": "Нон (1 шт)", "price": 5000, "cost_price": 1500, "unit": "шт", "category": "Закуски", "sort_order": 2},
]

# ─── 4. Сотрудники ──────────────────────────────────────────────────────────
STAFF = [
    {"email": "waiter1@marjon.uz", "password": "Pass1234", "name": "Алишер Каримов", "role_slug": "waiter", "phone": "+998901234567"},
    {"email": "waiter2@marjon.uz", "password": "Pass1234", "name": "Зулфия Рашидова", "role_slug": "waiter", "phone": "+998901234568"},
    {"email": "cashier1@marjon.uz", "password": "Pass1234", "name": "Бобур Тошматов", "role_slug": "cashier", "phone": "+998901234569"},
    {"email": "kitchen1@marjon.uz", "password": "Pass1234", "name": "Санжар Юсупов", "role_slug": "kitchen", "phone": "+998901234570"},
    {"email": "manager1@marjon.uz", "password": "Pass1234", "name": "Малика Исмоилова", "role_slug": "manager", "phone": "+998901234571"},
]

# ─── 5. Финансовые транзакции ────────────────────────────────────────────────
TRANSACTIONS = [
    {"amount": 450000, "direction": "income", "comment": "Выручка за обед — зал"},
    {"amount": 320000, "direction": "income", "comment": "Выручка — терраса"},
    {"amount": 1200000, "direction": "expense", "comment": "Закупка овощей — базар Чорсу"},
    {"amount": 180000, "direction": "income", "comment": "Доставка заказов — вечер"},
    {"amount": 500000, "direction": "expense", "comment": "Оплата поставщику мяса"},
    {"amount": 750000, "direction": "income", "comment": "Банкет — предоплата"},
    {"amount": 85000, "direction": "expense", "comment": "Хозтовары (салфетки, перчатки)"},
    {"amount": 290000, "direction": "income", "comment": "Выручка — вечерняя смена"},
]

# ─── 6. Заказы ──────────────────────────────────────────────────────────────
ORDERS = [
    {"order_type": "dine_in", "table_number": "1", "status": "completed", "products": ["Плов Узбекский", "Зелёный чай", "Нон (1 шт)"]},
    {"order_type": "dine_in", "table_number": "2", "status": "completed", "products": ["Лагман", "Шашлык Куриный", "Кола 0.5л", "Кола 0.5л"]},
    {"order_type": "dine_in", "table_number": "3", "status": "completed", "products": ["Мастава", "Самса (2 шт)", "Чёрный чай"]},
    {"order_type": "dine_in", "table_number": "5", "status": "cooking", "products": ["Шашлык Говяжий", "Айран", "Салат Ташкентский"]},
    {"order_type": "takeaway", "table_number": None, "status": "completed", "products": ["Плов Узбекский", "Самса (2 шт)", "Кола 0.5л"]},
    {"order_type": "delivery", "table_number": None, "status": "completed", "products": ["Лагман", "Зелёный чай", "Пахлава"]},
    {"order_type": "dine_in", "table_number": "4", "status": "new", "products": ["Шурпа", "Нон (1 шт)", "Чёрный чай"]},
    {"order_type": "dine_in", "table_number": "6", "status": "completed", "products": ["Плов Узбекский", "Плов Узбекский", "Айран", "Айран", "Нон (1 шт)"]},
    {"order_type": "takeaway", "table_number": None, "status": "completed", "products": ["Самса (2 шт)", "Самса (2 шт)", "Чёрный чай"]},
    {"order_type": "dine_in", "table_number": "2", "status": "completed", "products": ["Шашлык Куриный", "Шашлык Говяжий", "Кола 0.5л", "Кола 0.5л", "Салат Ташкентский", "Чак-чак"]},
]


async def register_or_login(client: httpx.AsyncClient) -> str:
    """Регистрируем компанию или логинимся если уже есть."""
    try:
        resp = await client.post(f"{BASE_URL}/auth/register", json=COMPANY)
        if resp.status_code == 201:
            token = resp.json()["access_token"]
            print(f"✅ Компания зарегистрирована: {COMPANY['company_name']}")
            return token
    except Exception:
        pass

    # Если уже есть — просто логинимся
    resp = await client.post(f"{BASE_URL}/auth/login", json={
        "email": COMPANY["email"],
        "password": COMPANY["password"],
    })
    if resp.status_code == 200:
        token = resp.json()["access_token"]
        print(f"✅ Вход выполнен: {COMPANY['email']}")
        return token

    raise Exception(f"❌ Не удалось зарегистрироваться или войти: {resp.text}")


async def seed_categories(client: httpx.AsyncClient) -> dict[str, str]:
    """Создаём категории. Возвращает dict name→id."""
    category_map = {}
    for cat in CATEGORIES:
        resp = await client.post(f"{BASE_URL}/inventory/categories", json=cat)
        if resp.status_code in (200, 201):
            data = resp.json()
            category_map[cat["name"]] = data["id"]
            print(f"  + Категория: {cat['name']}")
        elif resp.status_code == 409:
            # Уже существует — получаем список
            print(f"  ~ Категория уже есть: {cat['name']}")

    # Подтягиваем существующие если пропустили
    resp = await client.get(f"{BASE_URL}/inventory/categories")
    if resp.status_code == 200:
        for cat in resp.json():
            category_map[cat["name"]] = cat["id"]

    return category_map


async def seed_products(client: httpx.AsyncClient, category_map: dict) -> dict[str, str]:
    """Создаём блюда. Возвращает dict name→id."""
    product_map = {}
    for p in PRODUCTS:
        payload = {
            "name": p["name"],
            "price": p["price"],
            "cost_price": p["cost_price"],
            "unit": p["unit"],
            "sort_order": p["sort_order"],
            "category_id": category_map.get(p["category"]),
            "is_active": True,
            "is_available": True,
        }
        resp = await client.post(f"{BASE_URL}/inventory/products", json=payload)
        if resp.status_code in (200, 201):
            data = resp.json()
            product_map[p["name"]] = {"id": data["id"], "price": p["price"]}
            print(f"  + Блюдо: {p['name']}")
        else:
            print(f"  ! Блюдо пропущено ({resp.status_code}): {p['name']}")

    # Подтягиваем существующие
    resp = await client.get(f"{BASE_URL}/inventory/products")
    if resp.status_code == 200:
        for prod in resp.json():
            product_map[prod["name"]] = {"id": prod["id"], "price": float(prod.get("price", 0))}

    return product_map


async def seed_staff(client: httpx.AsyncClient):
    """Создаём сотрудников."""
    for emp in STAFF:
        payload = {
            "email": emp["email"],
            "password": emp["password"],
            "phone": emp["phone"],
            "role_slug": emp["role_slug"],
            "role_name": emp["name"],
        }
        resp = await client.post(f"{BASE_URL}/auth/users", json=payload)
        if resp.status_code in (200, 201):
            print(f"  + Сотрудник: {emp['name']} ({emp['role_slug']})")
        else:
            print(f"  ~ Сотрудник уже есть или ошибка: {emp['name']}")


async def seed_orders(client: httpx.AsyncClient, product_map: dict):
    """Создаём тестовые заказы."""
    for i, order in enumerate(ORDERS, start=1):
        items = []
        totals: dict[str, int] = {}
        for product_name in order["products"]:
            totals[product_name] = totals.get(product_name, 0) + 1

        total_amount = 0
        for product_name, qty in totals.items():
            prod = product_map.get(product_name)
            if not prod:
                continue
            price = prod["price"]
            total_amount += price * qty
            items.append({
                "product_id": prod["id"],
                "quantity": qty,
                "unit_price": price,
                "total_price": price * qty,
                "name": product_name,
            })

        if not items:
            continue

        payload = {
            "order_number": f"T{i:04d}",
            "order_type": order["order_type"],
            "status": order["status"],
            "table_number": order["table_number"],
            "persons_count": 2,
            "subtotal": total_amount,
            "discount_amount": 0,
            "tax_amount": 0,
            "service_fee": 0,
            "total_amount": total_amount,
            "items": items,
            "source": "seed",
        }
        resp = await client.post(f"{BASE_URL}/pos/orders", json=payload)
        if resp.status_code in (200, 201):
            print(f"  + Заказ #{i}: {order['order_type']} стол {order['table_number'] or '—'} → {total_amount:,} UZS")
        else:
            print(f"  ! Заказ #{i} ошибка ({resp.status_code}): {resp.text[:100]}")


async def seed_shift(client: httpx.AsyncClient):
    """Открываем и закрываем одну кассовую смену."""
    resp = await client.get(f"{BASE_URL}/companies/me/branches")
    if resp.status_code != 200:
        print("  ! Не удалось получить филиалы для смены")
        return

    branches = resp.json()
    items = branches if isinstance(branches, list) else branches.get("items", [])
    if not items:
        print("  ! Нет филиалов — смена пропущена")
        return

    branch_id = items[0]["id"]

    resp = await client.post(f"{BASE_URL}/pos/shifts/open", json={
        "branch_id": branch_id,
        "opening_cash": 500000,
    })
    if resp.status_code in (200, 201):
        print(f"  + Смена открыта (opening_cash: 500 000)")
    else:
        print(f"  ! Смена: {resp.status_code} — {resp.text[:100]}")
        return

    resp = await client.post(f"{BASE_URL}/pos/shifts/close", json={
        "closing_cash": 1850000,
    })
    if resp.status_code in (200, 201):
        print(f"  + Смена закрыта (closing_cash: 1 850 000)")
    else:
        print(f"  ~ Закрытие смены: {resp.status_code}")


async def seed_transactions(client: httpx.AsyncClient):
    """Создаём финансовые транзакции."""
    for tx in TRANSACTIONS:
        payload = {
            "amount": tx["amount"],
            "direction": tx["direction"],
            "comment": tx["comment"],
        }
        resp = await client.post(f"{BASE_URL}/finance/transactions", json=payload)
        if resp.status_code in (200, 201):
            label = "Приход" if tx["direction"] == "income" else "Расход"
            print(f"  + {label}: {tx['amount']:,} UZS — {tx['comment']}")
        else:
            print(f"  ! Транзакция ({resp.status_code}): {resp.text[:80]}")


async def main():
    print("\n🚀 Запуск seed-скрипта Marjon...\n")

    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Регистрация / вход
        token = await register_or_login(client)
        client.headers["Authorization"] = f"Bearer {token}"

        # 2. Категории
        print("\n📂 Создание категорий...")
        category_map = await seed_categories(client)

        # 3. Блюда
        print("\n🍽️  Создание блюд...")
        product_map = await seed_products(client, category_map)

        # 4. Сотрудники
        print("\n👥 Создание сотрудников...")
        await seed_staff(client)

        # 5. Заказы
        print("\n🧾 Создание заказов...")
        await seed_orders(client, product_map)

        # 6. Кассовая смена
        print("\n🕐 Кассовая смена...")
        await seed_shift(client)

        # 7. Финансовые транзакции
        print("\n💰 Финансовые транзакции...")
        await seed_transactions(client)

    print("\n✅ Seed завершён! Открой http://localhost:5175 и проверь данные.\n")


if __name__ == "__main__":
    asyncio.run(main())