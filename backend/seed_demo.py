#!/usr/bin/env python3
"""
Extended seed: creates realistic demo data so the frontend shows real API data.
Run AFTER seed.py: cd backend && python seed_demo.py

Creates:
  - 30+ orders over the last 7 days (various statuses)
  - Payments for completed orders
  - HR employees linked to existing users
  - Finance: payment types, categories, transactions
  - Halls with tables
"""
import asyncio
import random
import sys
from datetime import datetime, timedelta, date, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import select
from app.infrastructure.database.session import AsyncSessionLocal

# Import ALL models so SQLAlchemy resolves FK references
import app.modules.companies.models       # noqa: F401
import app.modules.auth.models            # noqa: F401
import app.modules.rbac.models            # noqa: F401
import app.modules.inventory.models       # noqa: F401
import app.modules.crm.models             # noqa: F401
import app.modules.pos.models             # noqa: F401
import app.modules.payments.models        # noqa: F401
import app.modules.kitchen.models         # noqa: F401
import app.modules.loyalty.models         # noqa: F401
import app.modules.delivery.models        # noqa: F401
import app.modules.hr.models              # noqa: F401
import app.modules.notifications.models   # noqa: F401
import app.modules.audit.models           # noqa: F401
import app.modules.fiscal.models          # noqa: F401
import app.modules.subscriptions.models   # noqa: F401
import app.modules.printers.models        # noqa: F401
import app.modules.halls.models           # noqa: F401
import app.modules.inventory.warehouse_models  # noqa: F401
import app.modules.finance.models         # noqa: F401

from app.modules.auth.models import User
from app.modules.companies.models import Branch, Company
from app.modules.inventory.models import Product
from app.modules.pos.models import Order, OrderItem
from app.modules.payments.models import Payment
from app.modules.hr.models import Employee
from app.modules.finance.models import PaymentType, TransactionCategory, FinTransaction
from app.modules.halls.models import Hall, Table


random.seed(42)

ORDER_TYPES = ["dine_in", "dine_in", "dine_in", "takeaway", "delivery"]
STATUSES_WEIGHT = ["completed"] * 6 + ["ready"] * 2 + ["cooking"] * 1 + ["new"] * 1


async def seed_demo():
    async with AsyncSessionLocal() as db:
        company = (await db.execute(select(Company).where(Company.slug == "marjon"))).scalar_one_or_none()
        if not company:
            print("ERROR: run seed.py first!")
            return

        branch = (await db.execute(
            select(Branch).where(Branch.company_id == company.id, Branch.name == "Главный зал")
        )).scalar_one_or_none()

        products = (await db.execute(select(Product).where(Product.company_id == company.id))).scalars().all()
        users = (await db.execute(select(User).where(User.company_id == company.id))).scalars().all()
        waiter = next((u for u in users if "ofitsiant" in (u.email or "")), users[0])

        # ── Halls & Tables ───────────────────────────────────────────
        print("--- Halls & Tables ---")
        existing_hall = (await db.execute(
            select(Hall).where(Hall.company_id == company.id, Hall.name == "Основной зал")
        )).scalar_one_or_none()

        if not existing_hall:
            hall = Hall(
                
                company_id=company.id,
                branch_id=branch.id,
                name="Основной зал",
            )
            db.add(hall)
            await db.flush()

            for i in range(1, 16):
                t = Table(
                    
                    hall_id=hall.id,
                    number=i,
                    capacity=4 if i <= 10 else 6,
                )
                db.add(t)
            print(f"  created hall + 15 tables")
        else:
            hall = existing_hall
            print("  halls already exist")

        # ── HR Employees ─────────────────────────────────────────────
        print("--- HR Employees ---")
        existing_emp = (await db.execute(
            select(Employee).where(Employee.company_id == company.id)
        )).scalars().all()

        if not existing_emp:
            positions = [
                ("Менеджер", "fixed", 8_000_000),
                ("Официант", "fixed", 4_000_000),
                ("Повар", "fixed", 5_500_000),
                ("Бармен", "fixed", 4_500_000),
                ("Кассир", "fixed", 4_000_000),
            ]
            for i, (pos, salary_type, amount) in enumerate(positions):
                emp = Employee(
                    
                    company_id=company.id,
                    branch_id=branch.id,
                    user_id=users[i % len(users)].id,
                    position=pos,
                    hire_date=date(2025, 3, 1) + timedelta(days=i * 30),
                    salary_type=salary_type,
                    salary_amount=Decimal(str(amount)),
                )
                db.add(emp)
            print(f"  created {len(positions)} employees")
        else:
            print(f"  already have {len(existing_emp)} employees")

        # ── Finance setup ────────────────────────────────────────────
        print("--- Finance (payment types & categories) ---")
        pt_cash = (await db.execute(
            select(PaymentType).where(PaymentType.name == "Наличные")
        )).scalar_one_or_none()

        if not pt_cash:
            payment_types = [
                ("Наличные", "cash"),
                ("Карта (Uzcard/Humo)", "card"),
                ("Click", "transfer"),
                ("Payme", "transfer"),
            ]
            pt_objects = []
            for idx, (name, ptype) in enumerate(payment_types):
                pt = PaymentType( name=name, type=ptype, sort=idx)
                db.add(pt)
                pt_objects.append(pt)
            await db.flush()
            pt_cash = pt_objects[0]
            print(f"  created {len(payment_types)} payment types")
        else:
            print("  payment types exist")

        cat_income = (await db.execute(
            select(TransactionCategory).where(
                TransactionCategory.name == "Выручка за блюда", TransactionCategory.kind == "income"
            )
        )).scalar_one_or_none()

        if not cat_income:
            categories = [
                ("Выручка за блюда", "income"),
                ("Доставка", "income"),
                ("Аренда", "expense"),
                ("Зарплата", "expense"),
                ("Продукты (закуп)", "expense"),
            ]
            cat_objects = []
            for name, kind in categories:
                cat = TransactionCategory( name=name, kind=kind)
                db.add(cat)
                cat_objects.append(cat)
            await db.flush()
            cat_income = cat_objects[0]
            cat_expense_rent = cat_objects[2]
            cat_expense_salary = cat_objects[3]
            cat_expense_products = cat_objects[4]
            print(f"  created {len(categories)} categories")
        else:
            print("  categories exist")
            cats = (await db.execute(select(TransactionCategory))).scalars().all()
            cat_expense_rent = next((c for c in cats if c.name == "Аренда"), None)
            cat_expense_salary = next((c for c in cats if c.name == "Зарплата"), None)
            cat_expense_products = next((c for c in cats if c.name == "Продукты (закуп)"), None)

        # ── Orders (last 7 days) ─────────────────────────────────────
        print("--- Orders ---")
        existing_orders = (await db.execute(
            select(Order).where(Order.company_id == company.id)
        )).scalars().all()

        if len(existing_orders) > 5:
            print(f"  already have {len(existing_orders)} orders, skipping")
        else:
            now = datetime.now(timezone.utc)
            order_count = 0
            all_payment_types = (await db.execute(select(PaymentType))).scalars().all()
            pt_cash_id = next((p.id for p in all_payment_types if p.type == "cash"), all_payment_types[0].id if all_payment_types else None)

            for day_offset in range(7, 0, -1):
                day_base = now - timedelta(days=day_offset)
                orders_today = random.randint(8, 15)

                for j in range(orders_today):
                    order_time = day_base.replace(
                        hour=random.randint(10, 21),
                        minute=random.randint(0, 59),
                        second=0, microsecond=0
                    )
                    status = random.choice(STATUSES_WEIGHT)
                    order_type = random.choice(ORDER_TYPES)
                    table_num = str(random.randint(1, 15)) if order_type == "dine_in" else None

                    # Pick 1-5 random products
                    num_items = random.randint(1, 5)
                    chosen_products = random.sample(products, min(num_items, len(products)))

                    subtotal = Decimal("0")
                    items = []
                    for prod in chosen_products:
                        qty = random.randint(1, 3)
                        item_total = prod.price * qty
                        subtotal += item_total
                        item_status = "served" if status == "completed" else ("ready" if status == "ready" else "pending")
                        items.append(OrderItem(
                            
                            product_id=prod.id,
                            name=prod.name,
                            price=prod.price,
                            quantity=Decimal(str(qty)),
                            total=item_total,
                            status=item_status,
                        ))

                    order = Order(
                        
                        company_id=company.id,
                        branch_id=branch.id,
                        waiter_id=waiter.id,
                        order_number=f"{(day_base.month * 100 + day_base.day):04d}-{j + 1:03d}",
                        order_type=order_type,
                        status=status,
                        table_number=table_num,
                        persons_count=random.randint(1, 4),
                        subtotal=subtotal,
                        total_amount=subtotal,
                        source="pos",
                        items=items,
                    )
                    order.created_at = order_time
                    db.add(order)
                    order_count += 1

                    # Payment for completed orders
                    if status == "completed":
                        payment = Payment(
                            
                            company_id=company.id,
                            order_id=order.id,
                            amount=subtotal,
                            method=random.choice(["cash", "card", "click", "payme"]),
                            status="completed",
                        )
                        payment.created_at = order_time + timedelta(minutes=random.randint(15, 45))
                        db.add(payment)

            await db.flush()
            print(f"  created {order_count} orders with items and payments")

        # ── Finance transactions ─────────────────────────────────────
        print("--- Finance Transactions ---")
        existing_txn = (await db.execute(select(FinTransaction))).scalars().all()

        if len(existing_txn) > 3:
            print(f"  already have {len(existing_txn)} transactions, skipping")
        else:
            txn_count = 0
            for day_offset in range(7, 0, -1):
                day_dt = datetime.now(timezone.utc) - timedelta(days=day_offset)

                # Daily income (from orders)
                daily_revenue = random.randint(3_000_000, 8_000_000)
                txn = FinTransaction(
                    
                    date=day_dt.replace(hour=22, minute=0),
                    amount=daily_revenue,
                    direction="income",
                    payment_type_id=pt_cash.id if pt_cash else None,
                    category_id=cat_income.id if cat_income else None,
                    comment=f"Выручка за {day_dt.strftime('%d.%m')}",
                )
                db.add(txn)
                txn_count += 1

                # Random expense every other day
                if day_offset % 2 == 0:
                    expense_cat = random.choice([cat_expense_rent, cat_expense_salary, cat_expense_products])
                    if expense_cat:
                        exp = FinTransaction(
                            
                            date=day_dt.replace(hour=11, minute=0),
                            amount=random.randint(500_000, 2_500_000),
                            direction="expense",
                            payment_type_id=pt_cash.id if pt_cash else None,
                            category_id=expense_cat.id,
                            comment=f"Расход: {expense_cat.name}",
                        )
                        db.add(exp)
                        txn_count += 1

            await db.flush()
            print(f"  created {txn_count} transactions")

        await db.commit()
        print()
        print("OK Demo seed complete!")
        print("  Start backend: uvicorn app.main:app --reload --port 8000")
        print("  Start frontend: cd ../frontend && npm run dev")


if __name__ == "__main__":
    asyncio.run(seed_demo())
