#!/usr/bin/env python3
"""
Extra seed: adds more staff users (including monoblock) and cancelled orders with rich details.
Run AFTER seed.py and seed_demo.py:  cd backend && python seed_staff_extra.py
"""
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import select, or_
from app.infrastructure.database.session import AsyncSessionLocal
from app.modules.auth.models import User
from app.modules.auth.security import hash_password, hash_pin
from app.modules.companies.models import Branch, Company
from app.modules.inventory.models import Product
from app.modules.pos.models import Order, OrderItem
from app.modules.rbac.models import Role, UserRole

# Models need to be imported for SA relationship resolution
import app.modules.companies.models       # noqa
import app.modules.auth.models            # noqa
import app.modules.rbac.models            # noqa
import app.modules.inventory.models       # noqa
import app.modules.crm.models             # noqa
import app.modules.pos.models             # noqa
import app.modules.payments.models        # noqa
import app.modules.kitchen.models         # noqa
import app.modules.loyalty.models         # noqa
import app.modules.delivery.models        # noqa
import app.modules.hr.models              # noqa
import app.modules.notifications.models   # noqa
import app.modules.audit.models           # noqa
import app.modules.fiscal.models          # noqa
import app.modules.subscriptions.models   # noqa
import app.modules.printers.models        # noqa
import app.modules.halls.models           # noqa
import app.modules.inventory.warehouse_models  # noqa
import app.modules.finance.models         # noqa


EXTRA_USERS = [
    # monoblock
    {"email": "mono1@marjon.uz", "username": "mono1", "name": "Азиз Каримов", "phone": "+998901111101", "password": "Staff1234", "pin": "1101", "role_slug": "monoblock", "role_name": "Monoblock"},
    {"email": "mono2@marjon.uz", "username": "mono2", "name": "Дилшод Рахимов", "phone": "+998901111102", "password": "Staff1234", "pin": "1102", "role_slug": "monoblock", "role_name": "Monoblock"},
    {"email": "mono3@marjon.uz", "username": "mono3", "name": "Нодир Алиев", "phone": "+998901111103", "password": "Staff1234", "pin": "1103", "role_slug": "monoblock", "role_name": "Monoblock"},
    # more waiters
    {"email": "ofitsiant2@marjon.uz", "username": "ofitsiant2", "name": "Шахзод Миров", "phone": "+998902222201", "password": "Staff1234", "pin": "2201", "role_slug": "waiter", "role_name": "Waiter"},
    {"email": "ofitsiant3@marjon.uz", "username": "ofitsiant3", "name": "Анвар Юлдашев", "phone": "+998902222202", "password": "Staff1234", "pin": "2202", "role_slug": "waiter", "role_name": "Waiter"},
    {"email": "ofitsiant4@marjon.uz", "username": "ofitsiant4", "name": "Жасур Тошматов", "phone": "+998902222203", "password": "Staff1234", "pin": "2203", "role_slug": "waiter", "role_name": "Waiter"},
    # more cashiers
    {"email": "kassir2@marjon.uz", "username": "kassir2", "name": "Малика Исмаилова", "phone": "+998903333201", "password": "Staff1234", "pin": "3201", "role_slug": "cashier", "role_name": "Cashier"},
    {"email": "kassir3@marjon.uz", "username": "kassir3", "name": "Нигора Хасанова", "phone": "+998903333202", "password": "Staff1234", "pin": "3202", "role_slug": "cashier", "role_name": "Cashier"},
    # more kitchen
    {"email": "kuxna2@marjon.uz", "username": "kuxna2", "name": "Бахтиёр Сулейманов", "phone": "+998904444201", "password": "Staff1234", "pin": "4201", "role_slug": "kitchen", "role_name": "Kitchen"},
    {"email": "kuxna3@marjon.uz", "username": "kuxna3", "name": "Ойбек Назаров", "phone": "+998904444202", "password": "Staff1234", "pin": "4202", "role_slug": "kitchen", "role_name": "Kitchen"},
    # more managers
    {"email": "manager2@marjon.uz", "username": "manager2", "name": "Зафар Усманов", "phone": "+998906666201", "password": "Staff1234", "pin": "6201", "role_slug": "manager", "role_name": "Manager"},
    # bar
    {"email": "bar2@marjon.uz", "username": "bar2", "name": "Лазиз Файзуллаев", "phone": "+998908888201", "password": "Staff1234", "pin": "8201", "role_slug": "bar", "role_name": "Bar"},
    # archived users
    {"email": "exwaiter@marjon.uz", "username": "exwaiter", "name": "Аброр Содиков (уволен)", "phone": "+998909999101", "password": "Staff1234", "pin": "9101", "role_slug": "waiter", "role_name": "Waiter", "is_active": False},
    {"email": "exkitchen@marjon.uz", "username": "exkitchen", "name": "Тимур Ахмедов (уволен)", "phone": "+998909999102", "password": "Staff1234", "pin": "9102", "role_slug": "kitchen", "role_name": "Kitchen", "is_active": False},
]

CANCEL_REASONS = [
    "Клиент передумал",
    "Блюдо закончилось",
    "Долгое ожидание",
    "Ошибка официанта",
    "Неправильный заказ",
    "Клиент ушёл",
    "Дубликат позиции",
    "Аллергия у гостя",
    None,
    None,
]

random.seed(123)


async def seed_extra():
    async with AsyncSessionLocal() as db:
        company = (await db.execute(
            select(Company).where(Company.slug == "marjon")
        )).scalar_one_or_none()
        if not company:
            print("ERROR: run seed.py first!")
            return

        branch = (await db.execute(
            select(Branch).where(Branch.company_id == company.id, Branch.name == "Главный зал")
        )).scalar_one_or_none()

        # ── Extra Users ──────────────────────────────────────────────────
        print("--- Extra Staff Users ---")
        created_count = 0
        for data in EXTRA_USERS:
            existing = (await db.execute(
                select(User).where(or_(User.email == data["email"], User.phone == data["phone"]))
            )).scalar_one_or_none()

            if existing:
                continue

            role = (await db.execute(
                select(Role).where(Role.company_id == company.id, Role.slug == data["role_slug"])
            )).scalar_one_or_none()

            if not role:
                role = Role(
                    company_id=company.id,
                    name=data["role_name"],
                    slug=data["role_slug"],
                    description=None,
                    is_system=False,
                )
                db.add(role)
                await db.flush()
                print(f"  created role: {data['role_slug']}")

            user = User(
                company_id=company.id,
                email=data["email"],
                username=data["username"],
                name=data["name"],
                phone=data["phone"],
                pin_hash=hash_pin(data["pin"]) if data.get("pin") else None,
                password_hash=hash_password(data["password"]),
                is_active=data.get("is_active", True),
                is_superadmin=False,
            )
            db.add(user)
            await db.flush()

            user_role = UserRole(user_id=user.id, role_id=role.id, branch_id=branch.id)
            db.add(user_role)
            created_count += 1

        await db.flush()
        print(f"  created {created_count} extra users")

        # ── More cancelled orders ────────────────────────────────────────
        print("--- Cancelled Orders (with notes) ---")
        products = (await db.execute(
            select(Product).where(Product.company_id == company.id)
        )).scalars().all()

        all_users = (await db.execute(
            select(User).where(User.company_id == company.id, User.is_active == True)
        )).scalars().all()

        waiters = []
        for u in all_users:
            role_rows = (await db.execute(
                select(Role.slug).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == u.id)
            )).scalars().all()
            if "waiter" in role_rows:
                waiters.append(u)
        if not waiters:
            waiters = all_users[:3]

        existing_cancelled = (await db.execute(
            select(Order).where(Order.company_id == company.id, Order.status == "cancelled")
        )).scalars().all()

        if len(existing_cancelled) >= 10:
            print(f"  already have {len(existing_cancelled)} cancelled orders, skipping")
        else:
            now = datetime.now(timezone.utc)
            cancel_count = 0
            order_types = ["dine_in", "dine_in", "takeaway", "delivery"]

            for day_offset in range(14, 0, -1):
                day_base = now - timedelta(days=day_offset)
                num_cancels = random.randint(1, 3)

                for j in range(num_cancels):
                    order_time = day_base.replace(
                        hour=random.randint(10, 21),
                        minute=random.randint(0, 59),
                        second=0, microsecond=0
                    )
                    order_type = random.choice(order_types)
                    table_num = str(random.randint(1, 15)) if order_type == "dine_in" else None
                    waiter = random.choice(waiters)

                    num_items = random.randint(1, 4)
                    chosen_products = random.sample(products, min(num_items, len(products)))

                    subtotal = Decimal("0")
                    items = []
                    for prod in chosen_products:
                        qty = random.randint(1, 3)
                        item_total = prod.price * qty
                        subtotal += item_total
                        items.append(OrderItem(
                            product_id=prod.id,
                            name=prod.name,
                            price=prod.price,
                            quantity=Decimal(str(qty)),
                            total=item_total,
                            status="cancelled",
                            note=random.choice(CANCEL_REASONS),
                        ))

                    day_str = order_time.strftime("%y%m%d")
                    order = Order(
                        company_id=company.id,
                        branch_id=branch.id,
                        waiter_id=waiter.id,
                        order_number=f"MJ-{day_str}-C{cancel_count + 1:02d}",
                        order_type=order_type,
                        status="cancelled",
                        table_number=table_num,
                        persons_count=random.randint(1, 4),
                        subtotal=subtotal,
                        total_amount=subtotal,
                        source="pos",
                        items=items,
                    )
                    order.created_at = order_time
                    db.add(order)
                    cancel_count += 1

            await db.flush()
            print(f"  created {cancel_count} cancelled orders")

        await db.commit()
        print("\nOK Extra seed complete!")


if __name__ == "__main__":
    asyncio.run(seed_extra())
