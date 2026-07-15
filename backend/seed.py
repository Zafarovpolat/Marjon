#!/usr/bin/env python3
"""Seed script for Marjon.

Usage:
    cd backend
    python seed.py

The script is idempotent: it updates known seed rows and avoids creating
duplicates, so it can be run after migrations during local development.
"""
from __future__ import annotations

import asyncio
import sys
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import or_, select

sys.path.insert(0, str(Path(__file__).parent))

from app.infrastructure.database.session import AsyncSessionLocal
from app.modules.admin_settings.models import ImageBackground, Language, StoreVersion, Translation, UserLog
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.security import hash_password
from app.modules.companies.models import Branch, Company
from app.modules.crm.models import Customer, CustomerNote
from app.modules.delivery.models import Courier, DeliveryOrder, DeliveryZone
from app.modules.departments.models import Department
from app.modules.field_service.models import Service, ServiceEmployee, TechHelp
from app.modules.finance.models import (
    Counterparty,
    FinanceHistory,
    FinanceTemplate,
    FinTransaction,
    PaymentType,
    TransactionCategory,
)
from app.modules.fiscal.models import FiscalReceipt
from app.modules.halls.models import Hall, Table as HallTable
from app.modules.handbook.models import Country, District, Region
from app.modules.hr.models import AttendanceLog, Employee, WorkShift
from app.modules.inventory.models import Category, Ingredient, Product, StockItem, StockMovement, Warehouse
from app.modules.inventory.warehouse_models import (
    InventoryCheck,
    PurchaseDocument,
    PurchaseDocumentItem,
    TransferDocument,
    WriteOffDocument,
)
from app.modules.kitchen.models import KitchenStation
from app.modules.loyalty.models import LoyaltyAccount, LoyaltyTransaction
from app.modules.marketing.models import (
    ActivityType,
    Lead,
    LeadCancellationReason,
    LeadStatus,
    LeadTag,
    Source,
)
from app.modules.nomenclature.models import NomCategory, NomOrder, NomProduct, Unit
from app.modules.notifications.models import Notification
from app.modules.organizations.models import OfflineJob, Organization, OrganizationStatus, user_organizations
from app.modules.payments.models import Payment
from app.modules.pos.models import CashierShift, Order, OrderItem, PosTerminal
from app.modules.printers.models import Printer
from app.modules.rbac.models import Role, UserRole
from app.modules.storage.models import Coming, ComingItem, Provider, Storage
from app.modules.storage.models import StorageMovement as AdminStorageMovement
from app.modules.subscriptions.models import Invoice, Plan, Subscription
from app.modules.tasks.models import Task, TaskApproval


COMPANY_SLUG = "marjon"
COMPANY_NAME = "Marjon Cafe"
TODAY = date(2026, 7, 14)
NOW = datetime(2026, 7, 14, 15, 30, tzinfo=timezone.utc)


BRANCHES = [
    {"name": "Главный зал", "address": "ул. Навои 12, Ташкент", "city": "Ташкент"},
    {"name": "Терраса", "address": "ул. Навои 12, летняя терраса", "city": "Ташкент"},
    {"name": "Доставка", "address": "ул. Навои 12, зона доставки", "city": "Ташкент"},
]

USERS = [
    {
        "email": "admin@marjon.uz",
        "username": "admin",
        "name": "Владелец Marjon Cafe",
        "phone": "+998900078779",
        "password": "102938",
        "pin": "1111",
        "role_slug": "owner",
        "role_name": "Owner",
        "is_superadmin": True,
    },
    {
        "email": "manager@marjon.uz",
        "username": "manager",
        "name": "Менеджер зала",
        "phone": "+998901234566",
        "password": "Staff1234",
        "pin": "2222",
        "role_slug": "manager",
        "role_name": "Manager",
    },
    {
        "email": "kassir@marjon.uz",
        "username": "kassir",
        "name": "Кассир",
        "phone": "+998901234568",
        "password": "Staff1234",
        "pin": "3333",
        "role_slug": "cashier",
        "role_name": "Cashier",
    },
    {
        "email": "ofitsiant@marjon.uz",
        "username": "ofitsiant",
        "name": "Официант",
        "phone": "+998901234569",
        "password": "Staff1234",
        "pin": "4444",
        "role_slug": "waiter",
        "role_name": "Waiter",
    },
    {
        "email": "kuxna@marjon.uz",
        "username": "kuxna",
        "name": "Повар",
        "phone": "+998901234570",
        "password": "Staff1234",
        "pin": "5555",
        "role_slug": "kitchen",
        "role_name": "Kitchen",
    },
    {
        "email": "bar@marjon.uz",
        "username": "bar",
        "name": "Бармен",
        "phone": "+998901234571",
        "password": "Staff1234",
        "pin": "6666",
        "role_slug": "bar",
        "role_name": "Bar",
    },
    {
        "email": "warehouse@marjon.uz",
        "username": "warehouse",
        "name": "Кладовщик",
        "phone": "+998901234572",
        "password": "Staff1234",
        "pin": "7777",
        "role_slug": "warehouse",
        "role_name": "Warehouse",
    },
    {
        "email": "courier@marjon.uz",
        "username": "courier",
        "name": "Курьер",
        "phone": "+998901234573",
        "password": "Staff1234",
        "pin": "8888",
        "role_slug": "courier",
        "role_name": "Courier",
    },
]

CATEGORIES = [
    "Горячие блюда",
    "Салаты",
    "Супы",
    "Пицца",
    "Гарниры",
    "Напитки",
    "Десерты",
]

PRODUCTS = [
    ("Лагман", "Горячие блюда", 45000, 22000, "MJ-FOOD-001"),
    ("Плов по-узбекски", "Горячие блюда", 55000, 27000, "MJ-FOOD-002"),
    ("Люля-кебаб (3 шт)", "Горячие блюда", 65000, 31000, "MJ-FOOD-003"),
    ("Шашлык из говядины", "Горячие блюда", 70000, 36000, "MJ-FOOD-004"),
    ("Манты (6 шт)", "Горячие блюда", 40000, 19000, "MJ-FOOD-005"),
    ("Салат Цезарь", "Салаты", 38000, 18000, "MJ-SALAD-001"),
    ("Греческий салат", "Салаты", 35000, 16000, "MJ-SALAD-002"),
    ("Овощной микс", "Салаты", 28000, 12000, "MJ-SALAD-003"),
    ("Шурпа", "Супы", 30000, 14000, "MJ-SOUP-001"),
    ("Борщ", "Супы", 28000, 13000, "MJ-SOUP-002"),
    ("Маргарита", "Пицца", 60000, 30000, "MJ-PIZZA-001"),
    ("Пепперони", "Пицца", 75000, 38000, "MJ-PIZZA-002"),
    ("4 сыра", "Пицца", 80000, 41000, "MJ-PIZZA-003"),
    ("Картофель фри", "Гарниры", 22000, 9000, "MJ-SIDE-001"),
    ("Рис отварной", "Гарниры", 18000, 7000, "MJ-SIDE-002"),
    ("Чай зелёный (чайник)", "Напитки", 15000, 4000, "MJ-DRINK-001"),
    ("Чай чёрный (чайник)", "Напитки", 15000, 4000, "MJ-DRINK-002"),
    ("Кофе эспрессо", "Напитки", 18000, 6000, "MJ-DRINK-003"),
    ("Капучино", "Напитки", 22000, 8000, "MJ-DRINK-004"),
    ("Кола 0.5л", "Напитки", 12000, 6500, "MJ-DRINK-005"),
    ("Вода 0.5л", "Напитки", 8000, 2500, "MJ-DRINK-006"),
    ("Айран", "Напитки", 10000, 3500, "MJ-DRINK-007"),
    ("Мороженое (3 шарика)", "Десерты", 25000, 10000, "MJ-DESSERT-001"),
    ("Наполеон", "Десерты", 30000, 14000, "MJ-DESSERT-002"),
    ("Чизкейк", "Десерты", 35000, 17000, "MJ-DESSERT-003"),
]

INGREDIENTS = [
    ("Говядина", "кг", "Мясо", 42, 8, 72000),
    ("Куриное филе", "кг", "Мясо", 3, 8, 38000),
    ("Рис лазер", "кг", "Бакалея", 85, 20, 16000),
    ("Морковь", "кг", "Овощи", 46, 10, 4500),
    ("Лук", "кг", "Овощи", 31, 10, 3500),
    ("Картофель", "кг", "Овощи", 58, 15, 5200),
    ("Помидоры", "кг", "Овощи", 17, 10, 9000),
    ("Зелень", "кг", "Овощи", 4, 2, 22000),
    ("Молоко", "л", "Бар", 19, 8, 9000),
    ("Кофе зерно", "кг", "Бар", 7, 3, 115000),
    ("Кола 0.5л", "шт", "Бар", 96, 24, 6500),
    ("Упаковка ланч-бокс", "шт", "Упаковка", 180, 50, 1800),
]

PRINTERS = [
    ("Принтер касса", "receipt", "192.168.1.101"),
    ("Принтер кухня", "kitchen", "192.168.1.102"),
    ("Принтер бар", "bar", "192.168.1.103"),
    ("Принтер официант", "waiter", "192.168.1.104"),
]


def dec(value: int | float | str | Decimal) -> Decimal:
    return Decimal(str(value))


def dt(day_offset: int = 0, hour: int = 10, minute: int = 0) -> datetime:
    return datetime.combine(TODAY + timedelta(days=day_offset), time(hour, minute), tzinfo=timezone.utc)


def day(day_offset: int = 0) -> date:
    return TODAY + timedelta(days=day_offset)


def day_text(day_offset: int = 0) -> str:
    return day(day_offset).isoformat()


async def get_or_none(db, model, **filters):
    q = select(model)
    for key, value in filters.items():
        q = q.where(getattr(model, key) == value)
    return (await db.execute(q.limit(1))).scalars().first()


async def ensure(db, model, defaults: dict | None = None, update: bool = False, **filters):
    obj = await get_or_none(db, model, **filters)
    payload = {**filters, **(defaults or {})}
    if obj is None:
        obj = model(**payload)
        db.add(obj)
        await db.flush()
        return obj, True
    if update:
        for key, value in (defaults or {}).items():
            setattr(obj, key, value)
    return obj, False


async def ensure_user_org(db, user_id, organization_id) -> None:
    exists = (
        await db.execute(
            select(user_organizations.c.user_id).where(
                user_organizations.c.user_id == user_id,
                user_organizations.c.organization_id == organization_id,
            )
        )
    ).first()
    if not exists:
        await db.execute(
            user_organizations.insert().values(user_id=user_id, organization_id=organization_id)
        )


async def seed_company_users(db):
    print("--- Company, branches, users ---")
    company, created = await ensure(
        db,
        Company,
        defaults={
            "name": COMPANY_NAME,
            "country_code": "UZ",
            "timezone": "Asia/Tashkent",
            "currency": "UZS",
            "is_active": True,
        },
        update=True,
        slug=COMPANY_SLUG,
    )
    print(f"  {'created' if created else 'ready'} company: {company.name}")

    branches: dict[str, Branch] = {}
    for data in BRANCHES:
        branch, created = await ensure(
            db,
            Branch,
            defaults={**data, "is_active": True},
            update=True,
            company_id=company.id,
            name=data["name"],
        )
        branches[branch.name] = branch
        print(f"  {'created' if created else 'ready'} branch: {branch.name}")

    users: dict[str, User] = {}
    main_branch = branches["Главный зал"]
    for data in USERS:
        role, _ = await ensure(
            db,
            Role,
            defaults={"name": data["role_name"], "description": None, "is_system": False},
            update=True,
            company_id=company.id,
            slug=data["role_slug"],
        )
        user = (
            await db.execute(
                select(User)
                .where(
                    or_(
                        User.email == data["email"],
                        User.username == data["username"],
                        User.phone == data["phone"],
                    )
                )
                .limit(1)
            )
        ).scalars().first()
        if user is None:
            user = User(
                company_id=company.id,
                email=data["email"],
                username=data["username"],
                name=data["name"],
                phone=data["phone"],
                pin_code=data["pin"],
                password_hash=hash_password(data["password"]),
                is_active=True,
                is_superadmin=bool(data.get("is_superadmin")),
            )
            db.add(user)
            await db.flush()
            created = True
        else:
            user.company_id = company.id
            user.username = user.username or data["username"]
            user.name = data["name"]
            user.phone = data["phone"]
            user.pin_code = data["pin"]
            user.password_hash = hash_password(data["password"])
            user.is_active = True
            if data.get("is_superadmin"):
                user.is_superadmin = True
            created = False

        await ensure(db, UserRole, user_id=user.id, role_id=role.id, branch_id=main_branch.id)
        users[data["role_slug"]] = user
        users[data["email"]] = user
        users[data["username"]] = user
        print(f"  {'created' if created else 'ready'} user: {user.email} ({data['role_slug']})")

    return company, branches, users


async def seed_handbook_and_hq(db, users):
    print("--- HQ handbook and organizations ---")
    country, _ = await ensure(db, Country, defaults={"status": True}, update=True, name="Узбекистан")
    region, _ = await ensure(db, Region, defaults={"status": True}, update=True, country_id=country.id, name="Ташкент")
    district, _ = await ensure(db, District, defaults={"status": True}, update=True, region_id=region.id, name="Юнусабад")

    statuses = {}
    for sort, name in enumerate(("Активный", "На проверке", "Заблокирован"), start=1):
        status, _ = await ensure(
            db,
            OrganizationStatus,
            defaults={"sort": sort, "status": True},
            update=True,
            name=name,
        )
        statuses[name] = status

    organizations = {}
    org_rows = [
        ("Marjon Cafe", 950000, 24, True, "302150001", "active", True, True, dec("14250000")),
        ("Marjon Terrace", 720000, 18, False, "302150002", "active", True, True, dec("8200000")),
        ("Marjon Delivery", 520000, 12, False, "302150003", "active", True, False, dec("3650000")),
        ("Marjon Test Branch", 390000, 6, False, "302150004", "blocked", False, False, dec("-320000")),
        ("Marjon Training", 0, 4, False, "302150005", "active", False, False, dec("0")),
        ("Bella Italia Group", 300000, 33, False, "1002841", "active", True, True, dec("18420000")),
        ("Coffee House", 300000, 33, False, "1002842", "active", True, True, dec("4120000")),
        ("Sushi Master", 300000, 33, False, "1002843", "active", True, True, dec("27800000")),
        ("Family Kitchen", 300000, 33, False, "1002844", "active", True, False, dec("6240000")),
        ("Burger Station", 300000, 34, False, "1002845", "active", False, True, dec("1820000")),
        ("MUSTAFO CAFE", 300000, 12, False, "1002945", "active", True, True, dec("-2000000")),
        ("BAYKAL RESTAURANT", 300000, 12, False, "1002944", "active", True, True, dec("0")),
        ("Burger", 300000, 13, False, "1002939", "active", False, True, dec("1500000")),
        ("Сушихона Мукаммал", 300000, 14, False, "1002938", "blocked", True, True, dec("7880000")),
        ("Zarafshon baliqlari", 300000, 14, False, "1002937", "blocked", False, True, dec("-2400000")),
        ("Bek Food 2", 300000, 15, False, "1002936", "active", True, True, dec("-7514000")),
        ("AROUVSOT OTA OSHXONASI", 300000, 15, False, "1002935", "active", True, False, dec("4480000")),
        ("Бош филиал", 0, 10, False, "1003001", "active", False, False, dec("0")),
        ("Нурафшон филиал", 0, 10, False, "1003002", "active", False, False, dec("1700000")),
        ("Наманган филиал", 0, 10, False, "1003003", "active", False, False, dec("6940000")),
        ("Фарғона филиал", 0, 10, False, "1003004", "active", False, False, dec("1000000")),
        ("Сирдарё филиал", 0, 10, False, "1003005", "active", False, False, dec("10000")),
    ]
    for name, tariff, working_days, is_main, cashbox, org_status, storage, online_menu, balance in org_rows:
        organization, created = await ensure(
            db,
            Organization,
            defaults={
                "tariff_price": dec(tariff),
                "working_days": working_days,
                "is_main": is_main,
                "virtual_cash_register_number": cashbox,
                "virtual_cash_register_ip_address": f"192.168.10.{10 + len(organizations)}",
                "country_id": country.id,
                "region_id": region.id,
                "district_id": district.id,
                "installation_date": day(-working_days),
                "tin": f"30{2150000 + len(organizations)}",
                "is_solvent": balance >= 0,
                "enabled_storage_integration": storage,
                "online_menu": online_menu,
                "status": org_status,
                "taplink": f"https://marjon.uz/{name.lower().replace(' ', '-')}",
                "is_billing_autoblock": balance < 0,
                "is_face_detection_required": name == "Marjon Cafe",
                "organization_status_id": statuses["Активный"].id if org_status == "active" else statuses["Заблокирован"].id,
                "cash_balance": balance,
            },
            update=True,
            name=name,
        )
        organizations[name] = organization
        await ensure_user_org(db, users["owner"].id, organization.id)
        print(f"  {'created' if created else 'ready'} organization: {name}")

    for name, dep_type in [
        ("Продажи", "sales"),
        ("Склад", "warehouse"),
        ("Техподдержка", "support"),
        ("Финансы", "finance"),
    ]:
        await ensure(db, Department, defaults={"type": dep_type}, update=True, name=name)

    for sort, (name, code, state) in enumerate(
        [("Русский", "ru", "default"), ("O'zbekcha", "uz", "active"), ("English", "en", "active")],
        start=1,
    ):
        await ensure(
            db,
            Language,
            defaults={"name": name, "status": True, "state": state},
            update=True,
            code=code,
        )

    translations = {
        "dashboard.title": {"ru": "Дашборд", "uz": "Dashboard", "en": "Dashboard"},
        "orders.title": {"ru": "Заказы", "uz": "Buyurtmalar", "en": "Orders"},
        "warehouse.title": {"ru": "Склад", "uz": "Ombor", "en": "Warehouse"},
    }
    for key, values in translations.items():
        await ensure(db, Translation, defaults={"type": "ui", "values": values}, update=True, key=key)

    for name, photo in [
        ("Login Marjon", "/assets/admin/login-marjon.jpg"),
        ("Cafe Hall", "/assets/admin/cafe-hall.jpg"),
    ]:
        await ensure(db, ImageBackground, defaults={"photo": photo}, update=True, name=name)

    for platform, version, title in [
        ("android", "2.4.7", "POS Android"),
        ("ios", "2.4.7", "POS iOS"),
    ]:
        await ensure(
            db,
            StoreVersion,
            defaults={
                "date": TODAY,
                "title": title,
                "description": "Тестовая версия для демо-стенда",
            },
            update=True,
            version=version,
            platform=platform,
        )

    await ensure(
        db,
        UserLog,
        defaults={
            "device_name": "Chrome Admin",
            "device_id": "seed-admin-browser",
            "organization_id": organizations["Marjon Cafe"].id,
            "properties": {"page": "dashboard", "action": "open"},
            "ip_address": "127.0.0.1",
            "date": NOW,
        },
        update=True,
        name="Открыт дашборд",
    )

    return country, region, district, organizations


async def seed_menu_inventory(db, company, branches, users):
    print("--- Menu, POS inventory and warehouse ---")
    categories: dict[str, Category] = {}
    for sort, cat_name in enumerate(CATEGORIES, start=1):
        cat, _ = await ensure(
            db,
            Category,
            defaults={"slug": f"cat-{sort:02d}", "sort_order": sort, "is_active": True},
            update=True,
            company_id=company.id,
            name=cat_name,
        )
        categories[cat_name] = cat

    products: dict[str, Product] = {}
    for sort, (name, cat_name, price, cost, sku) in enumerate(PRODUCTS, start=1):
        product, _ = await ensure(
            db,
            Product,
            defaults={
                "category_id": categories[cat_name].id,
                "description": f"Тестовая позиция меню Marjon: {name}",
                "image_url": None,
                "barcode": f"478{sort:010d}",
                "sku": sku,
                "price": dec(price),
                "cost_price": dec(cost),
                "tax_rate": dec("12"),
                "unit": "шт",
                "sort_order": sort,
                "is_active": True,
                "is_available": True,
            },
            update=True,
            company_id=company.id,
            name=name,
        )
        products[name] = product

    terminals = {}
    for name, branch_name in [
        ("Касса главный зал", "Главный зал"),
        ("Касса бар", "Главный зал"),
        ("Касса терраса", "Терраса"),
    ]:
        terminal, _ = await ensure(
            db,
            PosTerminal,
            defaults={"is_active": True},
            update=True,
            company_id=company.id,
            branch_id=branches[branch_name].id,
            name=name,
        )
        terminals[name] = terminal

    for hall_name, branch_name, table_count in [
        ("Основной зал", "Главный зал", 10),
        ("Кабины", "Главный зал", 4),
        ("Терраса", "Терраса", 8),
    ]:
        hall, _ = await ensure(
            db,
            Hall,
            defaults={"description": f"{hall_name} Marjon", "is_active": True},
            update=True,
            company_id=company.id,
            branch_id=branches[branch_name].id,
            name=hall_name,
        )
        for number in range(1, table_count + 1):
            await ensure(
                db,
                HallTable,
                defaults={"capacity": 4 if number % 3 else 6, "is_active": True},
                update=True,
                hall_id=hall.id,
                number=number,
            )

    for station_name, handled_categories in [
        ("Горячий цех", ["Горячие блюда", "Супы", "Гарниры"]),
        ("Пицца", ["Пицца"]),
        ("Бар", ["Напитки", "Десерты"]),
    ]:
        await ensure(
            db,
            KitchenStation,
            defaults={
                "category_ids": [str(categories[name].id) for name in handled_categories],
                "is_active": True,
            },
            update=True,
            company_id=company.id,
            branch_id=branches["Главный зал"].id,
            name=station_name,
        )

    warehouses: dict[str, Warehouse] = {}
    for name, branch_name, is_main in [
        ("Основной склад", "Главный зал", True),
        ("Склад кухни", "Главный зал", False),
        ("Склад бара", "Терраса", False),
    ]:
        warehouse, _ = await ensure(
            db,
            Warehouse,
            defaults={
                "branch_id": branches[branch_name].id,
                "address": branches[branch_name].address,
                "is_main": is_main,
            },
            update=True,
            company_id=company.id,
            name=name,
        )
        warehouses[name] = warehouse

    ingredients = {}
    main_warehouse = warehouses["Основной склад"]
    for name, unit, category, quantity, min_quantity, cost_price in INGREDIENTS:
        ingredient, _ = await ensure(
            db,
            Ingredient,
            defaults={"unit": unit, "category": category, "is_active": True},
            update=True,
            company_id=company.id,
            name=name,
        )
        ingredients[name] = ingredient
        await ensure(
            db,
            StockItem,
            defaults={
                "quantity": dec(quantity),
                "unit": unit,
                "min_quantity": dec(min_quantity),
                "cost_price": dec(cost_price),
            },
            update=True,
            company_id=company.id,
            warehouse_id=main_warehouse.id,
            ingredient_id=ingredient.id,
        )

    movement_rows = [
        ("Говядина", "purchase", 18, 72000, "Приход от Fresh Market", -1),
        ("Рис лазер", "purchase", 25, 16000, "Приход от Fresh Market", -1),
        ("Куриное филе", "writeoff", 2, 38000, "Списание по сроку", 0),
        ("Кофе зерно", "sale", 1.2, 115000, "Расход на продажи", 0),
        ("Упаковка ланч-бокс", "transfer", 40, 1800, "Передача в доставку", 0),
    ]
    for ingredient_name, movement_type, quantity, cost_price, note, offset in movement_rows:
        ingredient = ingredients[ingredient_name]
        await ensure(
            db,
            StockMovement,
            defaults={
                "quantity": dec(quantity),
                "unit": ingredient.unit,
                "cost_price": dec(cost_price),
                "total_cost": dec(quantity) * dec(cost_price),
                "created_by": users["warehouse"].id,
                "note": note,
                "created_at": dt(offset, 11, 20),
            },
            update=True,
            company_id=company.id,
            warehouse_id=main_warehouse.id,
            ingredient_id=ingredient.id,
            movement_type=movement_type,
        )

    purchase, _ = await ensure(
        db,
        PurchaseDocument,
        defaults={
            "supplier": "Fresh Market",
            "warehouse_id": main_warehouse.id,
            "warehouse_name": main_warehouse.name,
            "date": day_text(0),
            "registered_at": dt(0, 8, 40).isoformat(),
            "accepted_at": dt(0, 9, 10).isoformat(),
            "items_count": 3,
            "total_amount": dec(1936000),
            "status": "accepted",
            "created_by": users["warehouse"].id,
            "created_by_name": users["warehouse"].name,
            "note": "Тестовый приход для склада",
        },
        update=True,
        company_id=company.id,
        number=1001,
    )
    for ingredient_name, quantity, price in [
        ("Говядина", 18, 72000),
        ("Рис лазер", 25, 16000),
        ("Морковь", 20, 4500),
    ]:
        ingredient = ingredients[ingredient_name]
        await ensure(
            db,
            PurchaseDocumentItem,
            defaults={
                "ingredient_id": ingredient.id,
                "name": ingredient.name,
                "quantity": dec(quantity),
                "unit": ingredient.unit,
                "cost_price": dec(price),
                "total": dec(quantity) * dec(price),
            },
            update=True,
            document_id=purchase.id,
            name=ingredient.name,
        )

    legacy_purchases = [
        (220, "Bozor", main_warehouse, "23.06.2026", 10, dec(1250000), "accepted", [("Говядина", 10, 78000)]),
        (221, "Поставщик 1", warehouses["Склад кухни"], "23.06.2026", 25, dec(840000), "accepted", [("Рис лазер", 25, 15000)]),
        (222, "Fresh Meat", main_warehouse, "22.06.2026", 30, dec(2400000), "draft", [("Говядина", 30, 80000)]),
        (219, "Bozor", warehouses["Склад бара"], "22.06.2026", 8, dec(560000), "accepted", [("Кофе зерно", 4, 115000)]),
        (218, "Поставщик 2", main_warehouse, "21.06.2026", 14, dec(3750000), "accepted", [("Говядина", 24, 78000)]),
        (217, "Green Market", warehouses["Склад кухни"], "20.06.2026", 12, dec(1120000), "draft", [("Рис лазер", 30, 15000)]),
    ]
    for number, supplier, warehouse, doc_date, items_count, total_amount, status, items in legacy_purchases:
        legacy_purchase, _ = await ensure(
            db,
            PurchaseDocument,
            defaults={
                "supplier": supplier,
                "warehouse_id": warehouse.id,
                "warehouse_name": warehouse.name,
                "date": doc_date,
                "registered_at": dt(-21, 9, 0).isoformat(),
                "accepted_at": dt(-21, 10, 0).isoformat() if status == "accepted" else None,
                "items_count": items_count,
                "total_amount": total_amount,
                "status": status,
                "created_by": users["warehouse"].id,
                "created_by_name": users["warehouse"].name,
                "note": f"Demo IN-{number}",
            },
            update=True,
            company_id=company.id,
            number=number,
        )
        for ingredient_name, quantity, price in items:
            ingredient = ingredients[ingredient_name]
            await ensure(
                db,
                PurchaseDocumentItem,
                defaults={
                    "ingredient_id": ingredient.id,
                    "name": ingredient.name,
                    "quantity": dec(quantity),
                    "unit": ingredient.unit,
                    "cost_price": dec(price),
                    "total": dec(quantity) * dec(price),
                },
                update=True,
                document_id=legacy_purchase.id,
                name=ingredient.name,
            )

    await ensure(
        db,
        TransferDocument,
        defaults={
            "from_warehouse_id": main_warehouse.id,
            "from_warehouse_name": main_warehouse.name,
            "to_warehouse_id": warehouses["Склад кухни"].id,
            "to_warehouse_name": warehouses["Склад кухни"].name,
            "date": day_text(0),
            "items_count": 4,
            "status": "accepted",
            "created_by": users["warehouse"].id,
            "created_by_name": users["warehouse"].name,
            "note": "Передача продуктов на кухню",
        },
        update=True,
        company_id=company.id,
        from_warehouse_id=main_warehouse.id,
        to_warehouse_id=warehouses["Склад кухни"].id,
    )
    await ensure(
        db,
        InventoryCheck,
        defaults={
            "warehouse_id": main_warehouse.id,
            "warehouse_name": main_warehouse.name,
            "comment": "Плановая проверка остатков",
            "check_type": "Плановая инвентаризация",
            "status": "completed",
            "created_by": users["warehouse"].id,
            "created_by_name": users["warehouse"].name,
        },
        update=True,
        company_id=company.id,
        warehouse_id=main_warehouse.id,
    )
    for warehouse, comment, check_type, status in [
        (main_warehouse, "Инвентаризация #INV-31: ожидаемо 128, факт 126, разница -2", "Плановая инвентаризация", "completed"),
        (warehouses["Склад бара"], "Инвентаризация #INV-32: ожидаемо 45, факт 45, разница 0", "Бар", "draft"),
    ]:
        await ensure(
            db,
            InventoryCheck,
            defaults={
                "warehouse_id": warehouse.id,
                "warehouse_name": warehouse.name,
                "comment": comment,
                "check_type": check_type,
                "status": status,
                "created_by": users["warehouse"].id,
                "created_by_name": users["warehouse"].name,
            },
            update=True,
            company_id=company.id,
            warehouse_id=warehouse.id,
            comment=comment,
        )

    await ensure(
        db,
        WriteOffDocument,
        defaults={
            "items_count": 2,
            "status": "accepted",
            "created_by": users["warehouse"].id,
            "created_by_name": users["warehouse"].name,
            "note": "Тестовое списание",
        },
        update=True,
        company_id=company.id,
        category="Срок годности",
    )

    for category, items_count, status, note in [
        ("Истёк срок", 6, "accepted", "WO-321 / Списание #EX-220 / 420 000 UZS"),
        ("Брак", 3, "accepted", "WO-318 / Списание #EX-221 / 180 000 UZS"),
        ("Порча", 8, "draft", "WO-314 / Списание #EX-222 / 640 000 UZS"),
    ]:
        await ensure(
            db,
            WriteOffDocument,
            defaults={
                "items_count": items_count,
                "status": status,
                "created_by": users["warehouse"].id,
                "created_by_name": users["warehouse"].name,
                "note": note,
            },
            update=True,
            company_id=company.id,
            category=category,
        )

    for printer_name, printer_type, ip in PRINTERS:
        await ensure(
            db,
            Printer,
            defaults={
                "printer_type": printer_type,
                "connection_type": "network",
                "ip_address": ip,
                "port": 9100,
                "paper_width": 80,
                "is_active": True,
                "settings": {"encoding": "cp866"},
            },
            update=True,
            company_id=company.id,
            branch_id=branches["Главный зал"].id,
            name=printer_name,
        )

    print(f"  ready categories: {len(categories)}, products: {len(products)}, ingredients: {len(ingredients)}")
    return categories, products, terminals, warehouses, ingredients


async def seed_admin_nomenclature_storage(db, organizations):
    print("--- Admin nomenclature and storage reports ---")
    nom_categories = {}
    for sort, name in enumerate(["Мясо", "Бакалея", "Овощи", "Напитки", "Упаковка"], start=1):
        category, _ = await ensure(db, NomCategory, defaults={"sort": sort, "status": True}, update=True, name=name)
        nom_categories[name] = category

    units = {}
    for sort, (name, short_name) in enumerate([("Килограмм", "кг"), ("Литр", "л"), ("Штука", "шт")], start=1):
        unit, _ = await ensure(db, Unit, defaults={"short_name": short_name, "sort": sort, "status": True}, update=True, name=name)
        units[short_name] = unit

    nom_products = {}
    rows = [
        ("Говядина охлажденная", "Мясо", "кг", 72000, False),
        ("Куриное филе", "Мясо", "кг", 38000, False),
        ("Рис лазер", "Бакалея", "кг", 16000, False),
        ("Картофель", "Овощи", "кг", 5200, False),
        ("Кола 0.5л", "Напитки", "шт", 12000, False),
        ("Ланч-бокс", "Упаковка", "шт", 1800, True),
    ]
    rows.extend([
        ("Мука в/с", "Бакалея", "кг", 9000, False),
        ("Оливковое масло", "Бакалея", "л", 48000, False),
        ("Кофе зерно", "Напитки", "кг", 115000, False),
        ("Говядина", "Мясо", "кг", 78000, False),
        ("Рис", "Бакалея", "кг", 15000, False),
        ("Лимон", "Овощи", "кг", 22000, False),
    ])

    for name, category_name, unit_name, price, is_used in rows:
        product, _ = await ensure(
            db,
            NomProduct,
            defaults={
                "photo": None,
                "category_id": nom_categories[category_name].id,
                "price": dec(price),
                "unit_id": units[unit_name].id,
                "status": True,
                "is_used": is_used,
                "is_archived": False,
            },
            update=True,
            name=name,
        )
        nom_products[name] = product

    provider, _ = await ensure(
        db,
        Provider,
        defaults={"phone": "+998909001122", "comment": "Тестовый поставщик"},
        update=True,
        name="Fresh Market",
    )
    providers = {"Fresh Market": provider}
    for provider_name, phone in [
        ("Bella Foods", "+998901020304"),
        ("Coffee Trade", "+998905060708"),
        ("Bozor", "+998909090901"),
        ("Поставщик 1", "+998909090902"),
        ("Поставщик 2", "+998909090903"),
        ("Fresh Meat", "+998909090904"),
        ("Green Market", "+998909090905"),
    ]:
        item, _ = await ensure(
            db,
            Provider,
            defaults={"phone": phone, "comment": "Demo provider"},
            update=True,
            name=provider_name,
        )
        providers[provider_name] = item

    storages = {}
    for name, org_name in [
        ("Центральный склад", "Marjon Cafe"),
        ("Склад кухни", "Marjon Cafe"),
        ("Склад бара", "Marjon Terrace"),
    ]:
        storage, _ = await ensure(
            db,
            Storage,
            defaults={"organization_id": organizations[org_name].id},
            update=True,
            name=name,
        )
        storages[name] = storage

    for name, org_name in [
        ("Главный склад", "Marjon Cafe"),
        ("Кухня", "Marjon Cafe"),
        ("Бар", "Marjon Terrace"),
    ]:
        storage, _ = await ensure(
            db,
            Storage,
            defaults={"organization_id": organizations[org_name].id},
            update=True,
            name=name,
        )
        storages[name] = storage

    coming, _ = await ensure(
        db,
        Coming,
        defaults={
            "provider_id": provider.id,
            "storage_id": storages["Центральный склад"].id,
            "receipt_date": day(-1),
            "registration_date": day(-1),
            "acceptance_date": day(0),
            "comment": "Приход тестовых товаров",
            "status": "accepted",
            "total_sum": dec(2954000),
        },
        update=True,
        number="ADM-IN-1001",
    )
    for product_name, qty, price in [
        ("Говядина охлажденная", 18, 72000),
        ("Куриное филе", 12, 38000),
        ("Рис лазер", 40, 16000),
        ("Ланч-бокс", 300, 1800),
    ]:
        product = nom_products[product_name]
        await ensure(
            db,
            ComingItem,
            defaults={
                "category_id": product.category_id,
                "type": "product",
                "price": dec(price),
                "qty": dec(qty),
                "total": dec(qty) * dec(price),
            },
            update=True,
            coming_id=coming.id,
            product_id=product.id,
        )

    legacy_comings = [
        ("PR-10241", "Bella Foods", "Главный склад", "2026-06-11", "2026-06-11", "accepted", 18420000, [("Мука в/с", 32, 575625)]),
        ("PR-10238", "Coffee Trade", "Бар", "2026-06-10", "2026-06-10", "accepted", 4120000, [("Кофе зерно", 12, 343333.33)]),
        ("PR-10235", "Fresh Market", "Кухня", "2026-06-10", None, "draft", 27800000, [("Говядина", 48, 579166.67)]),
    ]
    for number, provider_name, storage_name, receipt_date, acceptance_date, status, total_sum, items in legacy_comings:
        legacy_coming, _ = await ensure(
            db,
            Coming,
            defaults={
                "provider_id": providers[provider_name].id,
                "storage_id": storages[storage_name].id,
                "receipt_date": date.fromisoformat(receipt_date),
                "registration_date": date.fromisoformat(receipt_date),
                "acceptance_date": date.fromisoformat(acceptance_date) if acceptance_date else None,
                "comment": f"Demo {number}",
                "status": status,
                "total_sum": dec(total_sum),
            },
            update=True,
            number=number,
        )
        for product_name, qty, price in items:
            product = nom_products[product_name]
            await ensure(
                db,
                ComingItem,
                defaults={
                    "category_id": product.category_id,
                    "type": "product",
                    "price": dec(price),
                    "qty": dec(qty),
                    "total": dec(total_sum),
                },
                update=True,
                coming_id=legacy_coming.id,
                product_id=product.id,
            )

    flow_rows = [
        ("Центральный склад", "Говядина охлажденная", "income", 18, 72000, -1, "Приход ADM-IN-1001", coming.id),
        ("Центральный склад", "Куриное филе", "income", 12, 38000, -1, "Приход ADM-IN-1001", coming.id),
        ("Центральный склад", "Рис лазер", "income", 40, 16000, -1, "Приход ADM-IN-1001", coming.id),
        ("Центральный склад", "Ланч-бокс", "income", 300, 1800, -1, "Приход ADM-IN-1001", coming.id),
        ("Склад кухни", "Говядина охлажденная", "expense", 6, 72000, 0, "Расход на кухню", None),
        ("Склад кухни", "Рис лазер", "expense", 11, 16000, 0, "Расход на плов", None),
        ("Склад бара", "Кола 0.5л", "income", 96, 6500, -2, "Приход напитков", None),
        ("Склад бара", "Кола 0.5л", "expense", 24, 6500, 0, "Продажи напитков", None),
    ]
    flow_rows.extend([
        ("Главный склад", "Мука в/с", "income", 1240, 9000, -33, "Приход PR-10241", None),
        ("Бар", "Оливковое масло", "income", 86, 48000, -33, "Приход PR-10238", None),
        ("Бар", "Кофе зерно", "income", 410, 115000, -33, "Приход PR-10238", None),
        ("Главный склад", "Говядина", "income", 10, 78000, -21, "Приход #IN-220", None),
        ("Кухня", "Рис", "income", 25, 15000, -21, "Приход #IN-221", None),
        ("Главный склад", "Говядина", "expense", 6, 78000, -21, "Расход #OUT-144", None),
        ("Бар", "Лимон", "expense", 3, 22000, -21, "Списание #EX-221", None),
    ])

    for storage_name, product_name, direction, qty, price, offset, comment, coming_id in flow_rows:
        await ensure(
            db,
            AdminStorageMovement,
            defaults={
                "qty": dec(qty),
                "price": dec(price),
                "date": dt(offset, 13, 0),
                "coming_id": coming_id,
                "comment": comment,
            },
            update=True,
            storage_id=storages[storage_name].id,
            product_id=nom_products[product_name].id,
            direction=direction,
            comment=comment,
        )

    await ensure(
        db,
        NomOrder,
        defaults={
            "payment_id": "seed-payment-1001",
            "items": [
                {"product_id": str(nom_products["Говядина охлажденная"].id), "qty": 2, "price": 72000},
                {"product_id": str(nom_products["Рис лазер"].id), "qty": 5, "price": 16000},
            ],
            "price": dec(224000),
            "comment": "Тестовый заказ номенклатуры",
            "status": "paid",
            "organization_id": organizations["Marjon Cafe"].id,
        },
        update=True,
        name="Заказ Marjon Cafe 1001",
    )

    return nom_categories, units, nom_products, storages


async def seed_customers_orders_payments(db, company, branches, users, products, terminals):
    print("--- Customers, orders, payments and analytics ---")
    customers = {}
    for phone, name, source, spent in [
        ("+998901111111", "Aziza Karimova", "pos", 650000),
        ("+998902222222", "Jasur Aliyev", "delivery", 430000),
        ("+998903333333", "Dilnoza Rashidova", "qr", 280000),
    ]:
        customer, _ = await ensure(
            db,
            Customer,
            defaults={
                "name": name,
                "email": f"{phone[-4:]}@example.uz",
                "birth_date": date(1994, 5, 12),
                "gender": "F" if name.startswith(("Aziza", "Dilnoza")) else "M",
                "source": source,
                "total_orders": 4,
                "total_spent": dec(spent),
                "last_visit_at": NOW,
            },
            update=True,
            company_id=company.id,
            phone=phone,
        )
        customers[phone] = customer

    note_exists = await get_or_none(db, CustomerNote, customer_id=customers["+998901111111"].id, body="VIP клиент, любит террасу")
    if not note_exists:
        db.add(CustomerNote(customer_id=customers["+998901111111"].id, author_id=users["manager"].id, body="VIP клиент, любит террасу"))
        await db.flush()

    order_specs = [
        {
            "number": "MJ-260714-001",
            "offset": 0,
            "hm": (9, 20),
            "type": "dine_in",
            "status": "completed",
            "table": "1",
            "persons": 2,
            "waiter": "ofitsiant",
            "customer": "+998901111111",
            "payment": "cash",
            "items": [("Плов по-узбекски", 2), ("Чай зелёный (чайник)", 1), ("Овощной микс", 1)],
        },
        {
            "number": "MJ-260714-002",
            "offset": 0,
            "hm": (10, 40),
            "type": "dine_in",
            "status": "completed",
            "table": "4",
            "persons": 3,
            "waiter": "ofitsiant",
            "customer": "+998903333333",
            "payment": "card",
            "items": [("Люля-кебаб (3 шт)", 2), ("Картофель фри", 2), ("Кола 0.5л", 3)],
        },
        {
            "number": "MJ-260714-003",
            "offset": 0,
            "hm": (12, 5),
            "type": "delivery",
            "status": "completed",
            "table": None,
            "persons": 1,
            "waiter": "manager",
            "customer": "+998902222222",
            "payment": "payme",
            "items": [("Пепперони", 1), ("Салат Цезарь", 1), ("Вода 0.5л", 2)],
        },
        {
            "number": "MJ-260714-004",
            "offset": 0,
            "hm": (13, 30),
            "type": "takeaway",
            "status": "completed",
            "table": None,
            "persons": 1,
            "waiter": "kassir",
            "customer": "+998901111111",
            "payment": "click",
            "items": [("Манты (6 шт)", 2), ("Айран", 2)],
        },
        {
            "number": "MJ-260714-005",
            "offset": 0,
            "hm": (14, 10),
            "type": "dine_in",
            "status": "ready",
            "table": "7",
            "persons": 2,
            "waiter": "ofitsiant",
            "customer": "+998903333333",
            "items": [("Шурпа", 2), ("Чай чёрный (чайник)", 1)],
        },
        {
            "number": "MJ-260714-006",
            "offset": 0,
            "hm": (14, 35),
            "type": "dine_in",
            "status": "cooking",
            "table": "8",
            "persons": 4,
            "waiter": "ofitsiant",
            "customer": "+998901111111",
            "items": [("Шашлык из говядины", 4), ("Греческий салат", 2)],
        },
        {
            "number": "MJ-260714-007",
            "offset": 0,
            "hm": (15, 0),
            "type": "delivery",
            "status": "new",
            "table": None,
            "persons": 1,
            "waiter": "manager",
            "customer": "+998902222222",
            "items": [("Маргарита", 1), ("Капучино", 2)],
        },
        {
            "number": "MJ-260714-008",
            "offset": 0,
            "hm": (15, 15),
            "type": "dine_in",
            "status": "cancelled",
            "table": "3",
            "persons": 2,
            "waiter": "ofitsiant",
            "customer": "+998903333333",
            "payment": "cash",
            "items": [("Чизкейк", 2), ("Кофе эспрессо", 2)],
        },
    ]

    daily_templates = [
        [("Плов по-узбекски", 2), ("Чай зелёный (чайник)", 1)],
        [("Лагман", 2), ("Салат Цезарь", 1), ("Кола 0.5л", 2)],
        [("Пепперони", 1), ("Вода 0.5л", 2)],
        [("Шашлык из говядины", 3), ("Овощной микс", 1)],
        [("Манты (6 шт)", 2), ("Айран", 2)],
        [("Маргарита", 1), ("Наполеон", 2)],
    ]
    for i in range(1, 8):
        order_specs.append(
            {
                "number": f"MJ-2607{14 - i:02d}-001",
                "offset": -i,
                "hm": (12, 15),
                "type": "dine_in" if i % 2 else "takeaway",
                "status": "completed",
                "table": str((i % 8) + 1) if i % 2 else None,
                "persons": 2 + (i % 3),
                "waiter": "ofitsiant",
                "customer": "+998901111111" if i % 2 else "+998902222222",
                "payment": "cash" if i % 2 else "card",
                "items": daily_templates[i % len(daily_templates)],
            }
        )
        order_specs.append(
            {
                "number": f"MJ-2607{14 - i:02d}-002",
                "offset": -i,
                "hm": (19, 10),
                "type": "delivery" if i % 2 else "dine_in",
                "status": "completed",
                "table": str((i % 6) + 3) if i % 2 == 0 else None,
                "persons": 1 + (i % 4),
                "waiter": "manager",
                "customer": "+998903333333",
                "payment": "payme" if i % 2 else "click",
                "items": daily_templates[(i + 2) % len(daily_templates)],
            }
        )

    created_orders: dict[str, Order] = {}
    for spec in order_specs:
        created_at = dt(spec["offset"], spec["hm"][0], spec["hm"][1])
        branch = branches["Доставка"] if spec["type"] == "delivery" else branches["Главный зал"]
        terminal = terminals["Касса главный зал"]
        waiter = users[spec["waiter"]]
        customer = customers[spec["customer"]]
        subtotal = sum(dec(products[name].price) * dec(qty) for name, qty in spec["items"])
        discount = dec(0)
        service_fee = (subtotal * dec("0.05")).quantize(dec("0.01")) if spec["type"] == "dine_in" else dec(0)
        tax = dec(0)
        total = subtotal - discount + service_fee + tax

        order = await get_or_none(db, Order, company_id=company.id, order_number=spec["number"])
        if order is None:
            order = Order(
                company_id=company.id,
                branch_id=branch.id,
                terminal_id=terminal.id,
                customer_id=customer.id,
                waiter_id=waiter.id,
                order_number=spec["number"],
                order_type=spec["type"],
                status=spec["status"],
                table_number=spec["table"],
                persons_count=spec["persons"],
                subtotal=subtotal,
                discount_amount=discount,
                tax_amount=tax,
                service_fee=service_fee,
                total_amount=total,
                note="Тестовый заказ",
                source="delivery_app" if spec["type"] == "delivery" else "pos",
                created_at=created_at,
                updated_at=created_at,
            )
            db.add(order)
            await db.flush()
            for product_name, qty in spec["items"]:
                product = products[product_name]
                item_status = {
                    "completed": "served",
                    "cancelled": "cancelled",
                    "ready": "ready",
                    "cooking": "cooking",
                }.get(spec["status"], "pending")
                item = OrderItem(
                    order_id=order.id,
                    product_id=product.id,
                    name=product.name,
                    price=product.price,
                    quantity=dec(qty),
                    discount=dec(0),
                    total=dec(product.price) * dec(qty),
                    status=item_status,
                    note="Отказ гостя" if spec["status"] == "cancelled" else None,
                    modifiers=[],
                    course=1,
                    created_at=created_at,
                    updated_at=created_at,
                )
                db.add(item)
            await db.flush()
        else:
            order.status = spec["status"]
            order.total_amount = total
            order.subtotal = subtotal
            order.service_fee = service_fee
            order.created_at = created_at
            order.updated_at = created_at
        created_orders[spec["number"]] = order

        if spec.get("payment"):
            payment_status = "refunded" if spec["status"] == "cancelled" else "completed"
            provider_tx_id = f"seed-{spec['number']}-{payment_status}"
            payment, payment_created = await ensure(
                db,
                Payment,
                defaults={
                    "company_id": company.id,
                    "order_id": order.id,
                    "amount": total,
                    "method": spec["payment"],
                    "status": payment_status,
                    "provider_data": {"seed": True},
                    "cashier_id": users["cashier"].id,
                    "cash_received": total if spec["payment"] == "cash" else dec(0),
                    "change_given": dec(0),
                    "receipt_url": f"/receipts/{spec['number']}.pdf",
                    "fiscal_code": f"FISC-{spec['number']}",
                    "created_at": created_at,
                    "updated_at": created_at,
                },
                update=True,
                provider_tx_id=provider_tx_id,
            )
            if payment_created:
                payment.company_id = company.id
                payment.order_id = order.id
            if payment_status == "completed":
                await ensure(
                    db,
                    FiscalReceipt,
                    defaults={
                        "status": "sent",
                        "fiscal_code": f"FISC-{spec['number']}",
                        "receipt_url": f"/receipts/{spec['number']}.pdf",
                        "provider": "ofd_uz",
                        "error_message": None,
                        "created_at": created_at,
                    },
                    update=True,
                    company_id=company.id,
                    order_id=order.id,
                    payment_id=payment.id,
                )

    shift_open = dt(0, 8, 0)
    await ensure(
        db,
        CashierShift,
        defaults={
            "closed_at": None,
            "opening_cash": dec(500000),
            "closing_cash": None,
            "status": "open",
        },
        update=True,
        company_id=company.id,
        branch_id=branches["Главный зал"].id,
        cashier_id=users["cashier"].id,
        opened_at=shift_open,
    )
    await ensure(
        db,
        CashierShift,
        defaults={
            "closed_at": dt(-1, 23, 20),
            "opening_cash": dec(400000),
            "closing_cash": dec(1850000),
            "status": "closed",
        },
        update=True,
        company_id=company.id,
        branch_id=branches["Главный зал"].id,
        cashier_id=users["cashier"].id,
        opened_at=dt(-1, 8, 0),
    )

    zone, _ = await ensure(
        db,
        DeliveryZone,
        defaults={
            "polygon": [[41.31, 69.24], [41.32, 69.28], [41.28, 69.29]],
            "delivery_fee": dec(15000),
            "min_order": dec(50000),
            "estimated_minutes": 35,
            "is_active": True,
        },
        update=True,
        company_id=company.id,
        branch_id=branches["Доставка"].id,
        name="Центр Ташкента",
    )
    courier, _ = await ensure(
        db,
        Courier,
        defaults={
            "user_id": users["courier"].id,
            "phone": users["courier"].phone,
            "vehicle_type": "bike",
            "is_active": True,
            "is_available": True,
            "current_lat": dec("41.311081"),
            "current_lng": dec("69.240562"),
            "last_location_at": NOW,
        },
        update=True,
        company_id=company.id,
        name=users["courier"].name,
    )
    delivery_order = created_orders.get("MJ-260714-003")
    if delivery_order:
        await ensure(
            db,
            DeliveryOrder,
            defaults={
                "courier_id": courier.id,
                "zone_id": zone.id,
                "status": "delivered",
                "address_text": "Ташкент, Юнусабад, 4 квартал",
                "address_lat": dec("41.325000"),
                "address_lng": dec("69.280000"),
                "delivery_fee": dec(15000),
                "estimated_time": 35,
                "actual_time": 31,
                "assigned_at": dt(0, 12, 10),
                "picked_up_at": dt(0, 12, 30),
                "delivered_at": dt(0, 12, 55),
            },
            update=True,
            company_id=company.id,
            order_id=delivery_order.id,
        )

    account, _ = await ensure(
        db,
        LoyaltyAccount,
        defaults={"balance": dec(1850), "lifetime_points": dec(7200), "tier": "gold"},
        update=True,
        company_id=company.id,
        customer_id=customers["+998901111111"].id,
    )
    await ensure(
        db,
        LoyaltyTransaction,
        defaults={
            "order_id": created_orders["MJ-260714-001"].id,
            "points": dec(340),
            "balance_after": dec(1850),
            "expires_at": dt(180, 0, 0),
        },
        update=True,
        company_id=company.id,
        account_id=account.id,
        transaction_type="earn",
        description="Начисление за заказ MJ-260714-001",
    )

    print(f"  ready orders: {len(created_orders)}")
    return customers, created_orders


async def seed_hr_sessions_notifications(db, company, branches, users):
    print("--- HR, sessions and notifications ---")
    employees = {}
    positions = {
        "owner": ("Владелец", 0),
        "manager": ("Менеджер", 7000000),
        "cashier": ("Кассир", 4500000),
        "waiter": ("Официант", 3800000),
        "kitchen": ("Повар", 5200000),
        "bar": ("Бармен", 4200000),
        "warehouse": ("Кладовщик", 4300000),
        "courier": ("Курьер", 3500000),
    }
    for role_slug, (position, salary) in positions.items():
        employee, _ = await ensure(
            db,
            Employee,
            defaults={
                "branch_id": branches["Главный зал"].id,
                "position": position,
                "hire_date": date(2025, 1, 10),
                "dismiss_date": None,
                "salary_type": "monthly",
                "salary_amount": dec(salary),
            },
            update=True,
            company_id=company.id,
            user_id=users[role_slug].id,
        )
        employees[role_slug] = employee
    for role_slug in ("cashier", "waiter", "kitchen", "bar", "warehouse"):
        employee = employees[role_slug]
        shift, _ = await ensure(
            db,
            WorkShift,
            defaults={
                "scheduled_end": dt(0, 18, 0),
                "actual_start": dt(0, 8, 55),
                "actual_end": None if role_slug in ("cashier", "waiter") else dt(0, 17, 45),
                "status": "active" if role_slug in ("cashier", "waiter") else "completed",
            },
            update=True,
            company_id=company.id,
            branch_id=branches["Главный зал"].id,
            employee_id=employee.id,
            scheduled_start=dt(0, 9, 0),
        )
        for action, when in [("check_in", dt(0, 8, 55)), ("check_out", dt(0, 17, 45))]:
            if action == "check_out" and role_slug in ("cashier", "waiter"):
                continue
            await ensure(
                db,
                AttendanceLog,
                defaults={"timestamp": when, "method": "pin", "note": "seed"},
                update=True,
                company_id=company.id,
                employee_id=employee.id,
                shift_id=shift.id,
                action=action,
            )

    for i, role_slug in enumerate(("owner", "manager", "cashier", "waiter", "kitchen", "bar"), start=1):
        created_at = dt(0, 8 + i, 5)
        await ensure(
            db,
            RefreshToken,
            defaults={
                "device_id": f"seed-device-{role_slug}",
                "expires_at": created_at + timedelta(days=7),
                "revoked_at": created_at + timedelta(hours=2, minutes=15) if role_slug not in ("owner", "cashier") else None,
                "created_at": created_at,
            },
            update=True,
            user_id=users[role_slug].id,
            token_hash=f"seed-refresh-{role_slug}-20260714",
        )

    for title, body, user_key, n_type in [
        ("Низкий остаток", "Куриное филе ниже минимального остатка", "manager", "stock"),
        ("Новый заказ", "Заказ MJ-260714-007 ожидает подтверждения", "cashier", "order"),
        ("Смена открыта", "Кассовая смена открыта в 08:00", "owner", "shift"),
    ]:
        await ensure(
            db,
            Notification,
            defaults={
                "body": body,
                "notification_type": n_type,
                "channel": "in_app",
                "status": "delivered",
                "data": {"seed": True},
                "read_at": None,
                "sent_at": NOW,
            },
            update=True,
            company_id=company.id,
            user_id=users[user_key].id,
            title=title,
        )

    return employees


async def seed_finance_and_subscription(db, company, users, organizations):
    print("--- Finance and subscription ---")
    payment_types = {}
    for sort, (name, ptype) in enumerate(
        [("Наличные", "cash"), ("Terminal", "card"), ("Payme", "payme"), ("Click", "click"), ("Перечисление", "transfer")],
        start=1,
    ):
        item, _ = await ensure(db, PaymentType, defaults={"sort": sort, "type": ptype, "status": True}, update=True, name=name)
        payment_types[ptype] = item
        payment_types[name] = item

    for sort, (name, ptype) in enumerate(
        [
            ("Pul O'tkazish", "card"),
            ("CLICK", "click"),
            ("Наличные", "cash"),
            ("Перечисление", "transfer"),
        ],
        start=20,
    ):
        item, _ = await ensure(db, PaymentType, defaults={"sort": sort, "type": ptype, "status": True}, update=True, name=name)
        payment_types[name] = item
        payment_types.setdefault(ptype, item)

    categories = {}
    for kind, names in {
        "income": ["Продажи", "Пополнение кассы", "Возврат поставщика"],
        "expense": ["Закупка продуктов", "Зарплата", "Аренда", "Маркетинг"],
    }.items():
        for name in names:
            category, _ = await ensure(db, TransactionCategory, defaults={"parent_id": None, "status": True}, update=True, name=name, kind=kind)
            categories[(kind, name)] = category

    legacy_category_names = [
        "Приход от продаж",
        "Стартовый баланс",
        "Продажа в долг",
        "Продажа в VIP",
        "Oylik to'lov",
        "Pochta",
        "Taksi",
        "POCHTA",
        "Obed",
        "OYLIK ISH HAQI",
        "Arenda",
        "Qarz yopish",
        "POCHTA filial",
        "FILIAL OCHISHI",
        "Закупка товара",
        "Зарплата",
        "Аренда",
        "Коммунальные услуги",
        "Доставка",
        "Маркетинг",
        "Ремонт оборудования",
        "Возврат клиенту",
        "Налоги",
        "Комиссия банка",
        "Прочие расходы",
        "Пополнение кассы",
        "Инкассация",
        "Прочее поступление",
    ]
    for kind in ("income", "expense"):
        for name in legacy_category_names:
            if (kind, name) in categories:
                continue
            category, _ = await ensure(
                db,
                TransactionCategory,
                defaults={"parent_id": None, "status": True},
                update=True,
                name=name,
                kind=kind,
            )
            categories[(kind, name)] = category

    counterparties = {}
    for name, phone, ctype, balance in [
        ("Fresh Market", "+998909001122", "provider", -1250000),
        ("Premium Meat", "+998909003344", "provider", -740000),
        ("Aziza Karimova", "+998901111111", "client", 320000),
        ("Dilnoza Catering", "+998907777777", "client", 180000),
        ("Сотрудники Marjon", None, "employee", 0),
    ]:
        item, _ = await ensure(
            db,
            Counterparty,
            defaults={"phone": phone, "balance": dec(balance), "type": ctype, "deleted_at": None},
            update=True,
            full_name=name,
        )
        counterparties[name] = item

    for name, phone, ctype, balance in [
        ("Admin 01", "+998900000001", "employee", 0),
        ("Поставщик", "+998900000002", "provider", 0),
        ("Bek choyxonasi", "+998900000003", "client", 0),
        ("XAM XAM KAFE", "+998900000004", "client", 0),
        ("SHANARAQ 2", "+998900000005", "client", 0),
        ("SHANARAQ", "+998900000006", "client", 0),
        ("KARVON CHOYXONA", "+998900000007", "client", 0),
        ("—", None, "other", 0),
    ]:
        item, _ = await ensure(
            db,
            Counterparty,
            defaults={"phone": phone, "balance": dec(balance), "type": ctype, "deleted_at": None},
            update=True,
            full_name=name,
        )
        counterparties[name] = item

    tx_rows = [
        ("seed-fin-income-001", 385000, "income", "cash", "Aziza Karimova", "Продажи", 0, "Продажи за завтрак"),
        ("seed-fin-income-002", 446000, "income", "card", "Dilnoza Catering", "Продажи", 0, "Оплата терминалом"),
        ("seed-fin-income-003", 190000, "income", "payme", "Aziza Karimova", "Продажи", 0, "Payme доставка"),
        ("seed-fin-expense-001", 1936000, "expense", "transfer", "Fresh Market", "Закупка продуктов", -1, "Закупка продуктов"),
        ("seed-fin-expense-002", 4500000, "expense", "transfer", "Сотрудники Marjon", "Зарплата", -3, "Аванс сотрудникам"),
        ("seed-fin-expense-003", 1200000, "expense", "cash", "Premium Meat", "Закупка продуктов", -2, "Мясо для кухни"),
        ("seed-fin-income-004", 250000, "income", "cash", "Fresh Market", "Возврат поставщика", -2, "Возврат за недопоставку"),
    ]
    for key, amount, direction, payment_type, counterparty, category, offset, comment in tx_rows:
        tx, _ = await ensure(
            db,
            FinTransaction,
            defaults={
                "date": dt(offset, 16, 0),
                "amount": dec(amount),
                "direction": direction,
                "payment_type_id": payment_types[payment_type].id,
                "counterparty_id": counterparties[counterparty].id,
                "category_id": categories[(direction, category)].id,
                "organization_id": organizations["Marjon Cafe"].id,
                "comment": comment,
                "user_id": users["owner"].id,
                "deleted_at": None,
            },
            update=True,
            idempotency_key=key,
        )
        await ensure(
            db,
            FinanceHistory,
            defaults={
                "status": "created",
                "date": tx.date,
                "company_id": company.id,
                "organization_id": organizations["Marjon Cafe"].id,
                "new_amount": tx.amount,
                "old_amount": dec(0),
                "type": direction,
                "user_id": users["owner"].id,
                "comment": f"Seed history: {comment}",
            },
            update=True,
            ref_id=tx.id,
        )

    legacy_tx_rows = [
        ("money-42142689", datetime(2026, 7, 4, 21, 25, tzinfo=timezone.utc), -720000, "—", "—", "Продажа в долг", "Бош филиал", "Заказ № 42142689: Xprinter mini printer, model: XP - 80 TS x 1"),
        ("money-42142750", datetime(2026, 7, 4, 21, 25, tzinfo=timezone.utc), -240000, "—", "—", "Продажа в долг", "Бош филиал", "Заказ № 42142750: MERCURY SG108 C (ХАП) x 1"),
        ("money-42143611", datetime(2026, 7, 4, 21, 25, tzinfo=timezone.utc), -4200000, "—", "—", "Продажа в долг", "Бош филиал", "Заказ № 42143611: Моноблок - 15 Inch Monitor model: TSM-1514 (8-128 GB, Windows Cash Register) x 1"),
        ("money-42422642", datetime(2026, 7, 4, 11, 48, tzinfo=timezone.utc), -240000, "—", "—", "Продажа в долг", "Бош филиал", "Заказ № 42422642: Tenda SG 108 8 Gigabit Power x 1"),
        ("money-20260703-2100", datetime(2026, 7, 3, 21, 0, tzinfo=timezone.utc), 1700000, "Наличные", "Admin 01", "Пополнение кассы", "Нурафшон филиал", "02.07.2026"),
        ("money-20260703-2052", datetime(2026, 7, 3, 20, 52, tzinfo=timezone.utc), 580000, "Наличные", "Admin 01", "Пополнение кассы", "Наманган филиал", "02.07.2026"),
        ("money-20260703-2043-income", datetime(2026, 7, 3, 20, 43, tzinfo=timezone.utc), 5600000, "Наличные", "Admin 01", "Инкассация", "Наманган филиал", "Эркин олган"),
        ("money-20260703-2043-expense", datetime(2026, 7, 3, 20, 43, tzinfo=timezone.utc), -4200000, "—", "—", "Продажа в долг", "Бош филиал", "Заказ № 42143611: Моноблок - 15 Inch Monitor model: TSM-1514 (8-128 GB, Windows Cash Register) x 1"),
        ("money-20260703-2042", datetime(2026, 7, 3, 20, 42, tzinfo=timezone.utc), 1000000, "Наличные", "Admin 01", "Инкассация", "Фарғона филиал", "Эркин олган"),
        ("money-20260703-2040", datetime(2026, 7, 3, 20, 40, tzinfo=timezone.utc), 760000, "Наличные", "Admin 01", "Инкассация", "Наманган филиал", "Эркин олган"),
        ("money-20260703-1846", datetime(2026, 7, 3, 18, 46, tzinfo=timezone.utc), 7820000, "Перечисление", "Поставщик", "Закупка товара", "Наманган филиал", "Закупку товара. Товарный лист №83618"),
        ("money-20260703-1737", datetime(2026, 7, 3, 17, 37, tzinfo=timezone.utc), 10000, "Наличные", "—", "Прочее поступление", "Сирдарё филиал", "—"),
    ]
    for key, tx_date, signed_amount, payment_type, counterparty, category, organization_name, comment in legacy_tx_rows:
        direction = "expense" if signed_amount < 0 else "income"
        counterparty_obj = counterparties.get(counterparty)
        tx, _ = await ensure(
            db,
            FinTransaction,
            defaults={
                "date": tx_date,
                "amount": dec(abs(signed_amount)),
                "direction": direction,
                "payment_type_id": payment_types.get(payment_type, payment_types["cash"]).id if payment_type != "—" else None,
                "counterparty_id": counterparty_obj.id if counterparty_obj and counterparty != "—" else None,
                "category_id": categories[(direction, category)].id,
                "organization_id": organizations.get(organization_name, organizations["Marjon Cafe"]).id,
                "comment": comment,
                "user_id": users["owner"].id,
                "deleted_at": None,
            },
            update=True,
            idempotency_key=key,
        )
        await ensure(
            db,
            FinanceHistory,
            defaults={
                "status": "created",
                "date": tx.date,
                "company_id": company.id,
                "organization_id": organizations.get(organization_name, organizations["Marjon Cafe"]).id,
                "new_amount": tx.amount,
                "old_amount": dec(0),
                "type": direction,
                "user_id": users["owner"].id,
                "comment": f"Seed history: {comment}",
            },
            update=True,
            ref_id=tx.id,
        )

    await ensure(
        db,
        FinanceTemplate,
        defaults={"payload": {"direction": "expense", "category": "Закупка продуктов", "amount": 0}},
        update=True,
        name="Закупка поставщика",
    )

    plan, _ = await ensure(
        db,
        Plan,
        defaults={
            "name": "Pro",
            "description": "Тестовый тариф для ресторана",
            "price_monthly": dec(490000),
            "price_yearly": dec(4900000),
            "features": {"branches": 3, "users": 20, "warehouse": True},
            "is_active": True,
        },
        update=True,
        slug="pro",
    )
    subscription, _ = await ensure(
        db,
        Subscription,
        defaults={
            "plan_id": plan.id,
            "status": "active",
            "billing_cycle": "monthly",
            "trial_ends_at": None,
            "current_period_start": dt(-10, 0, 0),
            "current_period_end": dt(20, 23, 59),
            "cancelled_at": None,
        },
        update=True,
        company_id=company.id,
    )
    await ensure(
        db,
        Invoice,
        defaults={
            "amount": dec(490000),
            "currency": "UZS",
            "status": "open",
            "paid_at": None,
            "payment_id": None,
        },
        update=True,
        company_id=company.id,
        subscription_id=subscription.id,
        due_date=dt(5, 23, 59),
    )


async def seed_marketing_tasks_services(db, users, region, district, organizations):
    print("--- Marketing, service and tasks ---")
    lead_statuses = {}
    for sort, (name, color) in enumerate([("Новый", "#2563eb"), ("В работе", "#f59e0b"), ("Успешный", "#16a34a")], start=1):
        item, _ = await ensure(db, LeadStatus, defaults={"sort": sort, "color": color, "status": True}, update=True, name=name)
        lead_statuses[name] = item
    tags = {}
    for sort, (name, color) in enumerate([("VIP", "#8b5cf6"), ("Доставка", "#06b6d4"), ("Повторный", "#22c55e")], start=1):
        item, _ = await ensure(db, LeadTag, defaults={"sort": sort, "color": color}, update=True, name=name)
        tags[name] = item
    cancel_reason, _ = await ensure(db, LeadCancellationReason, defaults={"status": True}, update=True, name="Нет ответа")
    source, _ = await ensure(db, Source, defaults={"status": True}, update=True, name="Instagram")
    activity, _ = await ensure(db, ActivityType, defaults={"status": True}, update=True, name="Ресторан")

    lead, _ = await ensure(
        db,
        Lead,
        defaults={
            "phones": ["+998909990011"],
            "type_of_activity_id": activity.id,
            "region_id": region.id,
            "district_id": district.id,
            "source_id": source.id,
            "status_id": lead_statuses["В работе"].id,
            "cancellation_reason_id": None,
            "type": "online",
            "quality": "hot",
            "quantity": 1,
            "comment": "Хочет подключить доставку",
            "user_id": users["manager"].id,
            "organization_id": organizations["Marjon Cafe"].id,
        },
        update=True,
        customer_name="Marjon Lead Test",
    )
    lead.tags = [tags["VIP"], tags["Доставка"]]

    employees = {}
    for fio, phone, role, balance, lat, lng in [
        ("Sardor Installer", "+998901010101", "installer", 125000, "41.311081", "69.240562"),
        ("Madina Support", "+998902020202", "support", 0, "41.321000", "69.250000"),
    ]:
        employee, _ = await ensure(
            db,
            ServiceEmployee,
            defaults={
                "phone": phone,
                "role": role,
                "balance": dec(balance),
                "participates_in_rating": True,
                "external_id": f"seed-{phone[-4:]}",
                "organization_id": organizations["Marjon Cafe"].id,
                "last_lat": dec(lat),
                "last_lng": dec(lng),
                "deleted_at": None,
            },
            update=True,
            fio=fio,
        )
        employees[role] = employee

    service, _ = await ensure(
        db,
        Service,
        defaults={
            "penalty_percent": dec(5),
            "points_on_time": 10,
            "points_late": 3,
            "points_not_done": -5,
            "deadline_hours": 24,
            "external_id": "seed-install-pos",
            "deleted_at": None,
        },
        update=True,
        name="Установка POS",
    )
    task, _ = await ensure(
        db,
        Task,
        defaults={
            "user_id": users["owner"].id,
            "organization_id": organizations["Marjon Cafe"].id,
            "region_id": region.id,
            "description": "Проверить кассу и принтеры",
            "service_id": service.id,
            "source_id": source.id,
            "status": "in_progress",
            "assignee_id": employees["installer"].id,
            "deadline": dt(1, 18, 0),
            "completed_at": None,
            "deleted_at": None,
        },
        update=True,
        name="Проверка оборудования Marjon Cafe",
    )
    await ensure(
        db,
        TaskApproval,
        defaults={
            "change": {"status": "completed", "comment": "Готово после проверки"},
            "status": "pending",
            "user_id": users["manager"].id,
            "resolved_by": None,
        },
        update=True,
        task_id=task.id,
    )
    await ensure(
        db,
        TechHelp,
        defaults={
            "requester": "Админ Marjon",
            "provider": "Madina Support",
            "status": "new",
            "rating": None,
            "organization_id": organizations["Marjon Cafe"].id,
        },
        update=True,
        text="Не печатается чек на барном принтере",
    )
    await ensure(
        db,
        OfflineJob,
        defaults={
            "type": "sync_orders",
            "organization_id": organizations["Marjon Cafe"].id,
            "status": "pending",
            "error": None,
            "payload": {"orders": 3},
        },
        update=True,
        idempotency_key="seed-offline-sync-orders",
    )


async def seed():
    async with AsyncSessionLocal() as db:
        company, branches, users = await seed_company_users(db)
        _country, region, district, organizations = await seed_handbook_and_hq(db, users)
        _categories, products, terminals, _warehouses, _ingredients = await seed_menu_inventory(db, company, branches, users)
        await seed_admin_nomenclature_storage(db, organizations)
        await seed_customers_orders_payments(db, company, branches, users, products, terminals)
        await seed_hr_sessions_notifications(db, company, branches, users)
        await seed_finance_and_subscription(db, company, users, organizations)
        try:
            await seed_marketing_tasks_services(db, users, region, district, organizations)
        except Exception as e:
            print(f"  [WARN] seed_marketing_tasks_services skipped: {e}")

        await db.commit()

        print()
        print("OK Seed complete")
        print()
        print("Credentials:")
        print("  90 007 87 79  / 102938     (owner + superadmin)")
        print("  90 123 45 66  / Staff1234  (manager)")
        print("  90 123 45 68  / Staff1234  (cashier)")
        print("  90 123 45 69  / Staff1234  (waiter)")
        print("  90 123 45 70  / Staff1234  (kitchen)")
        print("  90 123 45 71  / Staff1234  (bar)")
        print("  90 123 45 72  / Staff1234  (warehouse)")
        print("  90 123 45 73  / Staff1234  (courier)")


if __name__ == "__main__":
    asyncio.run(seed())
