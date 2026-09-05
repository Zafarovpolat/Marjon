from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.auth.models import User
from app.modules.auth.security import hash_password
from app.modules.finance.models import PaymentType, TransactionCategory
from app.modules.finance.schemas import TransactionCreate
from app.modules.finance.service import TransactionService
from app.modules.organizations.models import Organization
from app.shared.exceptions import NotFoundError, ValidationError as AppValidationError


async def _seed_finance_refs(db):
    user = User(email="finance@example.com", password_hash=hash_password("Passw0rd!"))
    org = Organization(name="Main branch")
    other_org = Organization(name="Other branch")
    db.add_all([user, org, other_org])
    await db.flush()
    # Справочники BI-05A видны только внутри своего scope: проводке организации
    # нужны строки со scope_kind="organization" и её organization_id, иначе
    # require_finance_reference не найдёт их и вернёт 404.
    payment_type = PaymentType(
        name="Наличные", type="cash", status=True,
        scope_kind="organization", organization_id=org.id,
    )
    income_category = TransactionCategory(
        name="Продажи", kind="income", status=True,
        scope_kind="organization", organization_id=org.id,
    )
    expense_category = TransactionCategory(
        name="Расход", kind="expense", status=True,
        scope_kind="organization", organization_id=org.id,
    )
    db.add_all([payment_type, income_category, expense_category])
    await db.flush()
    return user, org, other_org, payment_type, income_category, expense_category


async def test_create_income_transaction_success(db_engine):
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as db:
        user, org, _, payment_type, income_category, _ = await _seed_finance_refs(db)

        tx = await TransactionService(db).create_transaction(
            TransactionCreate(
                amount=Decimal("234234234"),
                direction="income",
                payment_type_id=payment_type.id,
                organization_id=org.id,
                category_id=income_category.id,
                comment="Комментарий",
            ),
            user.id,
            org_scope=[org.id],
        )

        assert tx.id
        assert tx.direction == "income"
        assert tx.amount == Decimal("234234234")
        await db.refresh(org)
        assert org.cash_balance == Decimal("234234234")


async def test_create_transaction_rejects_zero_amount():
    with pytest.raises(PydanticValidationError):
        TransactionCreate(amount=Decimal("0"), direction="income")


async def test_create_transaction_rejects_foreign_organization(db_engine):
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as db:
        user, org, other_org, payment_type, income_category, _ = await _seed_finance_refs(db)

        # Чужая организация скрывается как несуществующая (fail closed,
        # без раскрытия факта её существования) — см. finance/service.py.
        with pytest.raises(NotFoundError):
            await TransactionService(db).create_transaction(
                TransactionCreate(
                    amount=Decimal("1000"),
                    direction="income",
                    payment_type_id=payment_type.id,
                    organization_id=other_org.id,
                    category_id=income_category.id,
                ),
                user.id,
                org_scope=[org.id],
            )


async def test_create_transaction_rejects_wrong_category_kind(db_engine):
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as db:
        user, org, _, payment_type, _, expense_category = await _seed_finance_refs(db)

        with pytest.raises(AppValidationError):
            await TransactionService(db).create_transaction(
                TransactionCreate(
                    amount=Decimal("1000"),
                    direction="income",
                    payment_type_id=payment_type.id,
                    organization_id=org.id,
                    category_id=expense_category.id,
                ),
                user.id,
                org_scope=[org.id],
            )
