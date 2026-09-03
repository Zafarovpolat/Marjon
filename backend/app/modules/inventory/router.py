from __future__ import annotations
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import get_current_user, require_company_admin
from app.modules.auth.models import User
from app.modules.inventory.schemas import (
    CategoryCreate, CategoryResponse,
    IngredientCreate, IngredientResponse,
    ProductAvailabilityUpdate, ProductCreate, ProductLimitUpdate, ProductResponse, ProductUpdate,
    StockItemResponse, StockMovementCreate, StockMovementResponse,
)
from app.modules.inventory.service import CategoryService, IngredientService, ProductService, StockService
from sqlalchemy import select
from app.modules.inventory.models import Product, Ingredient, ProductRecipe
from app.modules.rbac.models import Role, UserRole
from app.shared.exceptions import ForbiddenError, NotFoundError
from app.shared.storage import storage

router = APIRouter(prefix="/inventory", tags=["inventory"])

# Загрузка изображений товаров (политика совпадает с auth/router: /me/photo).
# Раньше эти имена использовались в хендлерах, но нигде не определялись — NameError.
_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
_EXT_MAP = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

# Стоп-лист правят с десктопа кассир и повар (плюс владелец/админ и HQ-суперадмин).
# Официанту и курьеру — запрещено (deny-by-default). Гвард отдельный от
# require_company_admin: тот НЕ пускает кассира/повара, а здесь они — основные редакторы.
_STOP_LIST_EDITOR_ROLES = ("owner", "admin", "cashier", "kitchen")


async def require_stop_list_editor(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    if user.is_superadmin:
        return user
    if not user.company_id:
        raise ForbiddenError("User is not assigned to a company")
    result = await db.execute(
        select(Role.slug)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(
            UserRole.user_id == user.id,
            Role.company_id == user.company_id,
            Role.slug.in_(_STOP_LIST_EDITOR_ROLES),
        )
    )
    if result.scalars().first():
        return user
    raise ForbiddenError("Cashier role required to edit stop-list")


@router.get("/products/{product_id}/recipe")
async def product_recipe(
    product_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Техкарта блюда: ингредиенты с количеством."""
    prod = (await db.execute(
        select(Product).where(Product.id == product_id, Product.company_id == user.company_id)
    )).scalar_one_or_none()
    if not prod:
        raise NotFoundError("Product not found")
    rows = (await db.execute(
        select(ProductRecipe, Ingredient)
        .join(Ingredient, Ingredient.id == ProductRecipe.ingredient_id)
        .where(ProductRecipe.product_id == product_id, ProductRecipe.company_id == user.company_id)
    )).all()
    items = [
        {"ingredient_name": ing.name, "quantity": float(pr.quantity or 0), "unit": pr.unit or ing.unit}
        for pr, ing in rows
    ]
    return {
        "product_id": str(product_id),
        "product_name": prod.name,
        "unit": prod.unit,
        "description": prod.description,
        "items": items,
    }


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(data: CategoryCreate, user: User = Depends(require_company_admin), db: AsyncSession = Depends(get_db)):
    return await CategoryService(db).create(user.company_id, data)


@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await CategoryService(db).list(user.company_id)


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(data: ProductCreate, user: User = Depends(require_company_admin), db: AsyncSession = Depends(get_db)):
    return await ProductService(db).create(user.company_id, data)


@router.get("/products", response_model=list[ProductResponse])
async def list_products(
    include_all: bool = Query(False),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ProductService(db)
    if include_all:
        return await svc.list_all(user.company_id)
    return await svc.list(user.company_id)


@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await ProductService(db).get(user.company_id, product_id)


@router.patch("/products/{product_id}", response_model=ProductResponse)
async def update_product(product_id: UUID, data: ProductUpdate, user: User = Depends(require_company_admin), db: AsyncSession = Depends(get_db)):
    return await ProductService(db).update(user.company_id, product_id, data)


@router.patch("/products/{product_id}/availability", response_model=ProductResponse)
async def set_product_availability(
    product_id: UUID,
    data: ProductAvailabilityUpdate,
    user: User = Depends(require_stop_list_editor),
    db: AsyncSession = Depends(get_db),
):
    """Стоп-лист: снять/вернуть блюдо в продажу. Доступно только кассиру.

    Узкий эндпоинт правит ТОЛЬКО is_available — в отличие от админского
    PATCH /products/{id}, который меняет любые поля блюда. Так кассир управляет
    стоп-листом с десктопа, но не может трогать цены/названия.
    """
    return await ProductService(db).set_availability(
        user.company_id, product_id, data.is_available
    )


@router.patch("/products/{product_id}/limit", response_model=ProductResponse)
async def set_product_daily_limit(
    product_id: UUID,
    data: ProductLimitUpdate,
    user: User = Depends(require_stop_list_editor),
    db: AsyncSession = Depends(get_db),
):
    """D3 «максимум блюда»: задать дневной лимит порций (или снять — null).

    Тот же гейт, что у стоп-листа (кассир/повар/владелец/админ): задание числа
    обнуляет счётчик и возвращает блюдо в продажу; при достижении лимита в ходе
    продаж блюдо авто-встаёт в стоп. Так повар/кассир регулируют «максимум»
    с десктопа, не трогая цену/название.
    """
    return await ProductService(db).set_daily_limit(
        user.company_id, product_id, data.daily_limit
    )


@router.post("/upload-image", response_model=dict)
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(require_company_admin),
):
    """Generic image upload — returns {url: "..."} for use in PATCH body."""
    if file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Поддерживаются только jpg, png, webp")
    ext = _EXT_MAP[file.content_type]
    key = f"products/{user.company_id}/{uuid4()}.{ext}"
    try:
        url = await storage.upload(await file.read(), key, file.content_type)
    except Exception as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Ошибка хранилища: {exc}") from exc
    return {"url": url}


@router.post("/products/{product_id}/photo", response_model=ProductResponse)
async def upload_product_photo(
    product_id: UUID,
    file: UploadFile = File(...),
    user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Поддерживаются только jpg, png, webp")
    ext = _EXT_MAP[file.content_type]
    key = f"products/{user.company_id}/{product_id}.{ext}"
    try:
        image_url = await storage.upload(await file.read(), key, file.content_type)
    except Exception as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Ошибка хранилища: {exc}") from exc
    return await ProductService(db).update_image(user.company_id, product_id, image_url)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: UUID, user: User = Depends(require_company_admin), db: AsyncSession = Depends(get_db)):
    await ProductService(db).delete(user.company_id, product_id)


@router.get("/ingredients", response_model=list[IngredientResponse])
async def list_ingredients(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await IngredientService(db).list(user.company_id)


@router.get("/stock", response_model=list[StockItemResponse])
async def get_stock(
    warehouse_id: UUID | None = Query(None),
    low_stock: bool = Query(False),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = StockService(db)
    if low_stock:
        return await svc.get_low_stock(user.company_id)
    return await svc.get_stock(user.company_id, warehouse_id)


@router.post("/stock/movements", response_model=StockMovementResponse, status_code=status.HTTP_201_CREATED)
async def create_movement(data: StockMovementCreate, user: User = Depends(require_company_admin), db: AsyncSession = Depends(get_db)):
    return await StockService(db).create_movement(user.company_id, user.id, data)
