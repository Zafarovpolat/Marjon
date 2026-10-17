from __future__ import annotations
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.shared.base_repository import TenantRepository, BaseRepository
from app.modules.inventory.models import (
    Category, Product, Ingredient, Warehouse, StockItem, StockMovement
)


class CategoryRepository(TenantRepository[Category]):
    def __init__(self, db: AsyncSession):
        super().__init__(Category, db)

    async def get_active(self, company_id: UUID) -> list[Category]:
        result = await self.db.execute(
            self._base_query(company_id).where(Category.is_active == True)
        )
        return list(result.scalars().all())


class ProductRepository(TenantRepository[Product]):
    def __init__(self, db: AsyncSession):
        super().__init__(Product, db)

    def _base_query(self, company_id: UUID):
        # V40: последовательности разделены по product_type — смешанные списки
        # группируем сначала по типу, затем по позиции (детерминированно).
        return super()._base_query(company_id).order_by(
            Product.product_type, Product.sort_order, Product.created_at, Product.id,
        )

    async def get_available(self, company_id: UUID) -> list[Product]:
        result = await self.db.execute(
            self._base_query(company_id)
            .where(Product.is_active == True, Product.is_available == True)
        )
        return list(result.scalars().all())

    async def get_by_category(self, company_id: UUID, category_id: UUID) -> list[Product]:
        result = await self.db.execute(
            self._base_query(company_id).where(Product.category_id == category_id)
        )
        return list(result.scalars().all())


class IngredientRepository(TenantRepository[Ingredient]):
    def __init__(self, db: AsyncSession):
        super().__init__(Ingredient, db)


class WarehouseRepository(TenantRepository[Warehouse]):
    def __init__(self, db: AsyncSession):
        super().__init__(Warehouse, db)


class StockItemRepository(TenantRepository[StockItem]):
    def __init__(self, db: AsyncSession):
        super().__init__(StockItem, db)

    async def get_low_stock(self, company_id: UUID) -> list[StockItem]:
        from sqlalchemy import and_, or_
        from app.modules.inventory.models import Ingredient
        # V47: порог из карточки продукта (deficit_threshold) действует,
        # когда у складской строки свой порог не задан (min_quantity = 0).
        # Строковый порог конкретнее — он побеждает при обоих заданных.
        # Outer join: строки с удалённым шаблоном видны как раньше.
        return list((await self.db.execute(
            select(StockItem)
            .outerjoin(
                Ingredient,
                and_(
                    Ingredient.id == StockItem.ingredient_id,
                    Ingredient.company_id == company_id,
                ),
            )
            .where(
                StockItem.company_id == company_id,
                or_(
                    StockItem.quantity <= StockItem.min_quantity,
                    and_(
                        StockItem.min_quantity <= 0,
                        Ingredient.deficit_threshold.is_not(None),
                        StockItem.quantity <= Ingredient.deficit_threshold,
                    ),
                ),
            )
        )).scalars().all())


class StockMovementRepository(TenantRepository[StockMovement]):
    def __init__(self, db: AsyncSession):
        super().__init__(StockMovement, db)
