from __future__ import annotations
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.inventory.models import (
    Category, Ingredient, Product, StockItem, StockMovement, Warehouse
)
from app.modules.inventory.repository import (
    CategoryRepository, IngredientRepository, ProductRepository,
    StockItemRepository, StockMovementRepository, WarehouseRepository,
)
from app.modules.inventory.schemas import (
    CategoryCreate, IngredientCreate, ProductCreate, ProductUpdate, StockMovementCreate
)
from app.shared.exceptions import NotFoundError, ValidationError


class CategoryService:
    def __init__(self, db: AsyncSession):
        self.repo = CategoryRepository(db)

    async def create(self, company_id: UUID, data: CategoryCreate) -> Category:
        return await self.repo.save(Category(company_id=company_id, **data.model_dump()))

    async def list(self, company_id: UUID) -> list[Category]:
        return await self.repo.get_active(company_id)

    async def get(self, company_id: UUID, category_id: UUID) -> Category:
        cat = await self.repo.get_by_id(category_id, company_id)
        if not cat:
            raise NotFoundError("Category not found")
        return cat


class ProductService:
    def __init__(self, db: AsyncSession):
        self.repo = ProductRepository(db)

    async def create(self, company_id: UUID, data: ProductCreate) -> Product:
        return await self.repo.save(Product(company_id=company_id, **data.model_dump()))

    async def list(self, company_id: UUID) -> list[Product]:
        return await self.repo.get_available(company_id)

    async def list_all(self, company_id: UUID) -> list[Product]:
        return await self.repo.get_all(company_id)

    async def get(self, company_id: UUID, product_id: UUID) -> Product:
        p = await self.repo.get_by_id(product_id, company_id)
        if not p:
            raise NotFoundError("Product not found")
        return p

    async def update(self, company_id: UUID, product_id: UUID, data: ProductUpdate) -> Product:
        p = await self.get(company_id, product_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(p, field, value)
        return await self.repo.save(p)

    async def update_image(self, company_id: UUID, product_id: UUID, image_url: str) -> Product:
        p = await self.get(company_id, product_id)
        p.image_url = image_url
        return await self.repo.save(p)

    async def delete(self, company_id: UUID, product_id: UUID) -> None:
        """Мягкое удаление блюда (снимаем с продажи, скрываем из каталога)."""
        p = await self.get(company_id, product_id)
        p.is_active = False
        if hasattr(p, "is_available"):
            p.is_available = False
        await self.repo.save(p)

    async def set_availability(
        self, company_id: UUID, product_id: UUID, is_available: bool
    ) -> Product:
        """Стоп-лист: снять/вернуть блюдо в продажу (product-level is_available).

        Отдельный метод под отдельный узкий эндпоинт — чтобы кассир мог править
        только доступность, но НЕ цену/название/прочие поля (для этого остаётся
        админский PATCH /products/{id}).
        """
        p = await self.get(company_id, product_id)
        p.is_available = is_available
        return await self.repo.save(p)

    async def set_daily_limit(
        self, company_id: UUID, product_id: UUID, daily_limit: int | None
    ) -> Product:
        """D3 «максимум блюда»: задать/снять дневной лимит порций.

        Задание числа — это «пополнение» на новый день: обнуляем счётчик
        проданного и возвращаем блюдо в продажу (сброс ручной, по образцу
        тумблера стоп-листа). daily_limit=None снимает лимит (без ограничения),
        текущий стоп при этом НЕ трогаем.
        """
        p = await self.get(company_id, product_id)
        p.daily_limit = daily_limit
        if daily_limit is not None:
            p.sold_count = 0
            p.is_available = True
        return await self.repo.save(p)


class IngredientService:
    def __init__(self, db: AsyncSession):
        self.repo = IngredientRepository(db)

    async def list(self, company_id: UUID) -> list[Ingredient]:
        return await self.repo.get_all(company_id)


class StockService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.stock_repo = StockItemRepository(db)
        self.movement_repo = StockMovementRepository(db)
        self.warehouse_repo = WarehouseRepository(db)

    async def get_stock(self, company_id: UUID, warehouse_id: UUID | None = None) -> list[StockItem]:
        if warehouse_id:
            result = await self.db.execute(
                self.stock_repo._base_query(company_id).where(
                    StockItem.warehouse_id == warehouse_id
                )
            )
            return list(result.scalars().all())
        return await self.stock_repo.get_all(company_id)

    async def get_low_stock(self, company_id: UUID) -> list[StockItem]:
        return await self.stock_repo.get_low_stock(company_id)

    async def create_movement(
        self, company_id: UUID, created_by: UUID, data: StockMovementCreate
    ) -> StockMovement:
        total = data.quantity * data.cost_price
        movement = StockMovement(
            company_id=company_id,
            created_by=created_by,
            total_cost=total,
            **data.model_dump(),
        )
        # Остаток блокируем на время операции (FOR UPDATE): движение и остаток
        # меняем атомарно (один commit), без гонок между параллельными операциями.
        result = await self.db.execute(
            select(StockItem).where(
                StockItem.company_id == company_id,
                StockItem.warehouse_id == data.warehouse_id,
                StockItem.ingredient_id == data.ingredient_id,
            ).with_for_update()
        )
        stock = result.scalar_one_or_none()

        inbound = data.movement_type in ("purchase", "adjustment")
        outbound = data.movement_type in ("sale", "writeoff", "transfer")

        if stock is None:
            if outbound:
                # Нельзя списать/переместить то, чего нет на складе
                raise ValidationError("Недостаточно остатка: позиция отсутствует на складе")
            # Приход/корректировка на отсутствующую позицию — заводим остаток
            stock = StockItem(
                company_id=company_id,
                warehouse_id=data.warehouse_id,
                ingredient_id=data.ingredient_id,
                quantity=Decimal("0"),
            )
            self.db.add(stock)

        if inbound:
            stock.quantity = (stock.quantity or Decimal("0")) + data.quantity
        elif outbound:
            new_qty = (stock.quantity or Decimal("0")) - data.quantity
            if new_qty < 0:
                # Запрет ухода остатка в минус
                raise ValidationError("Недостаточно остатка для списания")
            stock.quantity = new_qty

        self.db.add(movement)
        await self.db.flush()
        await self.db.commit()
        await self.db.refresh(movement)
        return movement
