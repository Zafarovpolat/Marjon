from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.companies.models import Branch
from app.modules.crm.models import Customer
from app.modules.delivery.models import DeliveryOrder
from app.modules.fiscal.models import FiscalReceipt
from app.modules.inventory.models import Category, Product
from app.modules.loyalty.models import LoyaltyAccount, LoyaltyTransaction
from app.modules.payments.models import Payment
from app.modules.pos.models import Order, OrderItem
from tests.conftest import create_staff_headers, register_company


async def _setup_company(client, db_engine, *, slug: str, email: str):
    headers, _ = await register_company(client, slug=slug, email=email)
    me = (await client.get("/auth/me", headers=headers)).json()
    from uuid import UUID

    company_id = UUID(me["company_id"])
    branch_id = uuid4()
    cat_id = uuid4()
    prod_id = uuid4()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        db.add(Branch(id=branch_id, company_id=company_id, name="Main"))
        db.add(Category(id=cat_id, company_id=company_id, name="Cat", slug=f"cat-{slug}"))
        await db.flush()
        db.add(Product(
            id=prod_id, company_id=company_id, category_id=cat_id,
            name="Plov", price=Decimal("100"), cost_price=Decimal("40"),
        ))
        await db.commit()
    return {
        "headers": headers, "company_id": company_id,
        "branch_id": branch_id, "product_id": prod_id, "sessions": sessions,
    }


async def _add_full_order(sessions, *, company_id, branch_id, product_id, status="completed"):
    """Заказ со всеми связями: позиция + платёж + чек + доставка + бонус."""
    oid, iid, pay_id, rec_id, del_id = (uuid4() for _ in range(5))
    cus_id, acc_id, tx_id = (uuid4() for _ in range(3))
    async with sessions() as db:
        db.add(Order(
            id=oid, company_id=company_id, branch_id=branch_id,
            order_number=f"N-{oid.hex[:6]}", status=status,
            subtotal=Decimal("200"), total_amount=Decimal("200"),
        ))
        db.add(OrderItem(
            id=iid, order_id=oid, product_id=product_id, name="Plov",
            price=Decimal("100"), quantity=Decimal("2"),
            discount=Decimal("0"), total=Decimal("200"), status="pending",
        ))
        db.add(Payment(
            id=pay_id, company_id=company_id, order_id=oid,
            amount=Decimal("200"), method="cash", status="completed",
        ))
        db.add(FiscalReceipt(
            id=rec_id, company_id=company_id, order_id=oid, payment_id=pay_id,
        ))
        db.add(DeliveryOrder(
            id=del_id, company_id=company_id, order_id=oid,
            address_text="Ташкент",
        ))
        db.add(Customer(id=cus_id, company_id=company_id, phone="+998900000001"))
        db.add(LoyaltyAccount(
            id=acc_id, company_id=company_id, customer_id=cus_id,
            balance=Decimal("10"), lifetime_points=Decimal("10"),
        ))
        db.add(LoyaltyTransaction(
            id=tx_id, company_id=company_id, account_id=acc_id, order_id=oid,
            transaction_type="earn", points=Decimal("10"), balance_after=Decimal("10"),
        ))
        await db.commit()
    return oid


async def _count(sessions, model, company_id):
    async with sessions() as db:
        return (await db.execute(
            select(func.count()).select_from(model).where(model.company_id == company_id)
        )).scalar_one()


@pytest.mark.asyncio
async def test_purge_removes_everything_but_keeps_other_company(client, db_engine):
    sfx = uuid4().hex[:8]
    a = await _setup_company(client, db_engine, slug=f"pg-a-{sfx}", email=f"pg-a-{sfx}@example.com")
    b = await _setup_company(client, db_engine, slug=f"pg-b-{sfx}", email=f"pg-b-{sfx}@example.com")
    oids_a = [
        await _add_full_order(a["sessions"], company_id=a["company_id"], branch_id=a["branch_id"], product_id=a["product_id"], status="completed"),
        await _add_full_order(a["sessions"], company_id=a["company_id"], branch_id=a["branch_id"], product_id=a["product_id"], status="cancelled"),
    ]
    await _add_full_order(b["sessions"], company_id=b["company_id"], branch_id=b["branch_id"], product_id=b["product_id"], status="completed")

    response = await client.delete("/pos/orders/purge", headers=a["headers"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["orders"] == 2
    assert body["payments"] == 2
    assert body["fiscal_receipts"] == 2
    assert body["delivery_orders"] == 2
    assert body["loyalty_detached"] == 2

    # Компания A пуста во всех связанных таблицах...
    assert await _count(a["sessions"], Order, a["company_id"]) == 0
    async with a["sessions"]() as db:
        leftover_items = (await db.execute(
            select(OrderItem).where(OrderItem.order_id.in_(oids_a))
        )).scalars().all()
        assert leftover_items == []
    assert await _count(a["sessions"], Payment, a["company_id"]) == 0
    assert await _count(a["sessions"], FiscalReceipt, a["company_id"]) == 0
    assert await _count(a["sessions"], DeliveryOrder, a["company_id"]) == 0
    # ...а бонусы отвязаны, но баллы целы.
    async with a["sessions"]() as db:
        txs = (await db.execute(
            select(LoyaltyTransaction).where(LoyaltyTransaction.company_id == a["company_id"])
        )).scalars().all()
        assert len(txs) == 2
        assert all(t.order_id is None for t in txs)
        accs = (await db.execute(
            select(LoyaltyAccount).where(LoyaltyAccount.company_id == a["company_id"])
        )).scalars().all()
        assert sum(t.balance for t in accs) == Decimal("20")

    # Компания B не тронута.
    assert await _count(b["sessions"], Order, b["company_id"]) == 1
    assert await _count(b["sessions"], Payment, b["company_id"]) == 1
    orders_b = await client.get("/pos/orders", headers=b["headers"])
    assert orders_b.status_code == 200, orders_b.text
    assert len(orders_b.json()) == 1

    # Отчёты компании A пусты через API.
    orders_a = await client.get("/pos/orders", headers=a["headers"])
    assert orders_a.status_code == 200, orders_a.text
    assert orders_a.json() == []


@pytest.mark.asyncio
async def test_purge_forbidden_for_non_owner(client, db_engine):
    sfx = uuid4().hex[:8]
    a = await _setup_company(client, db_engine, slug=f"pg-c-{sfx}", email=f"pg-c-{sfx}@example.com")
    staff = await create_staff_headers(
        client, a["headers"], email=f"pg-w-{sfx}@example.com", role_slug="waiter",
    )
    response = await client.delete("/pos/orders/purge", headers=staff)
    assert response.status_code == 403, response.text
    assert await _count(a["sessions"], Order, a["company_id"]) == 0
