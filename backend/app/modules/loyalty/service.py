from __future__ import annotations
from decimal import Decimal
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.crm.models import Customer
from app.modules.loyalty.models import LoyaltyAccount, LoyaltyTransaction
from app.modules.pos.models import Order
from app.modules.loyalty.repository import LoyaltyAccountRepository, LoyaltyTransactionRepository
from app.modules.loyalty.schemas import EarnPointsRequest, RedeemPointsRequest
from app.shared.exceptions import NotFoundError, ValidationError
from app.shared.tenant_scope import require_company_resource


TIER_THRESHOLDS = {"bronze": 0, "silver": 5000, "gold": 20000, "platinum": 50000}


class LoyaltyService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.account_repo = LoyaltyAccountRepository(db)
        self.tx_repo = LoyaltyTransactionRepository(db)

    async def get_or_create_account(self, company_id: UUID, customer_id: UUID) -> LoyaltyAccount:
        await require_company_resource(
            self.db, Customer, customer_id, company_id, detail="Customer not found"
        )
        account = await self.account_repo.get_by_customer(company_id, customer_id)
        if not account:
            account = LoyaltyAccount(company_id=company_id, customer_id=customer_id)
            account = await self.account_repo.save(account)
        return account

    async def earn(self, company_id: UUID, data: EarnPointsRequest) -> LoyaltyTransaction:
        await require_company_resource(
            self.db, Order, data.order_id, company_id, detail="Order not found"
        )
        account = await self.get_or_create_account(company_id, data.customer_id)
        account.balance += data.points
        account.lifetime_points += data.points
        account.tier = self._calc_tier(account.lifetime_points)
        await self.account_repo.save(account)

        tx = LoyaltyTransaction(
            company_id=company_id, account_id=account.id,
            order_id=data.order_id, transaction_type="earn",
            points=data.points, balance_after=account.balance,
            description=f"Earned {data.points} points",
        )
        return await self.tx_repo.save(tx)

    async def redeem(self, company_id: UUID, data: RedeemPointsRequest) -> LoyaltyTransaction:
        await require_company_resource(
            self.db, Customer, data.customer_id, company_id, detail="Customer not found"
        )
        await require_company_resource(
            self.db, Order, data.order_id, company_id, detail="Order not found"
        )
        account = await self.account_repo.get_by_customer(company_id, data.customer_id)
        if not account:
            raise NotFoundError("Loyalty account not found")
        if account.balance < data.points:
            raise ValidationError("Insufficient loyalty points")

        account.balance -= data.points
        await self.account_repo.save(account)

        tx = LoyaltyTransaction(
            company_id=company_id, account_id=account.id,
            order_id=data.order_id, transaction_type="redeem",
            points=-data.points, balance_after=account.balance,
            description=f"Redeemed {data.points} points",
        )
        return await self.tx_repo.save(tx)

    def _calc_tier(self, lifetime: Decimal) -> str:
        tier = "bronze"
        for name, threshold in TIER_THRESHOLDS.items():
            if lifetime >= threshold:
                tier = name
        return tier
