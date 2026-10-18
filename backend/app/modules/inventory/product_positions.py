"""Canonical positions within company + active state + product type.

Requires the v31sort01 normalization before deployment; v40typ01 splits the
sequences per product_type (Блюда vs Товары — у каждого свой 1..N).
Every position writer locks the parent company, including empty catalogs and
cross-state transfers. Caller owns the transaction.
"""
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.companies.models import Company
from app.modules.inventory.models import Product
from app.shared.exceptions import NotFoundError


class ProductPositions:
    def __init__(self, db: AsyncSession, company_id: UUID):
        self.db = db
        self.company_id = company_id

    async def lock(self) -> None:
        company = (await self.db.execute(
            select(Company.id).where(Company.id == self.company_id).with_for_update()
        )).scalar_one_or_none()
        if company is None:
            raise NotFoundError("Company not found")

    def _scope(self, active: bool, product_type: str):
        return (
            Product.company_id == self.company_id,
            Product.is_active == active,
            Product.product_type == product_type,
        )

    async def _count(self, active: bool, product_type: str) -> int:
        return (await self.db.execute(
            select(func.count()).select_from(Product).where(*self._scope(active, product_type))
        )).scalar_one()

    async def _shift(self, active: bool, product_type: str, delta: int, *bounds) -> None:
        await self.db.execute(
            update(Product).where(*self._scope(active, product_type), *bounds)
            .values(sort_order=Product.sort_order + delta, updated_at=Product.updated_at)
            .execution_options(synchronize_session=False)
        )

    async def insert(self, active: bool, product_type: str, requested: int) -> int:
        position = min(requested, await self._count(active, product_type) + 1)
        await self._shift(active, product_type, 1, Product.sort_order >= position)
        return position

    async def append(self, active: bool, product_type: str) -> int:
        return await self._count(active, product_type) + 1

    async def leave(self, product: Product) -> None:
        """Compact the product's own scope without changing its state."""
        await self.db.execute(
            update(Product).where(
                Product.company_id == self.company_id,
                Product.is_active == product.is_active,
                Product.product_type == (product.product_type or "dish"),
                Product.sort_order > product.sort_order,
            ).values(sort_order=Product.sort_order - 1, updated_at=Product.updated_at)
            .execution_options(synchronize_session=False)
        )

    async def move(self, product: Product, requested: int) -> None:
        scope_type = product.product_type or "dish"
        position = min(requested, await self._count(product.is_active, scope_type))
        old = product.sort_order
        if position < old:
            await self._shift(
                product.is_active, scope_type, 1, Product.sort_order >= position, Product.sort_order < old,
            )
        elif position > old:
            await self._shift(
                product.is_active, scope_type, -1, Product.sort_order > old, Product.sort_order <= position,
            )
        product.sort_order = position

    async def transfer(self, product: Product, active: bool) -> None:
        if product.is_active == active:
            return
        scope_type = product.product_type or "dish"
        destination = await self._count(active, scope_type) + 1
        await self._shift(product.is_active, scope_type, -1, Product.sort_order > product.sort_order)
        product.is_active = active
        product.sort_order = destination
