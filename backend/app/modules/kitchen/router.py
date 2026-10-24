from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import require_kitchen_access, effective_branch_filter
from app.modules.auth.models import User
from app.modules.kitchen.schemas import KitchenItemStatusUpdate, StationCreate, StationResponse
from app.modules.kitchen.service import KitchenService
from app.modules.pos.schemas import OrderResponse, OrderStatusUpdate
from app.modules.pos.service import OrderService

router = APIRouter(prefix="/kitchen", tags=["kitchen"])


@router.post("/stations", response_model=StationResponse, status_code=status.HTTP_201_CREATED)
async def create_station(data: StationCreate, user: User = Depends(require_kitchen_access), db: AsyncSession = Depends(get_db)):
    return await KitchenService(db).create_station(user.company_id, data)


@router.get("/stations", response_model=list[StationResponse])
async def list_stations(user: User = Depends(require_kitchen_access), db: AsyncSession = Depends(get_db)):
    return await KitchenService(db).list_stations(user.company_id)


@router.get("/orders", response_model=list[OrderResponse])
async def active_orders(
    branch_id: UUID | None = Query(None),
    user: User = Depends(require_kitchen_access),
    db: AsyncSession = Depends(get_db),
):
    # Branch-изоляция: сессия филиала видит кухонные заказы только своего
    # филиала. Кухонный экран знает свой филиал из токена и может не передавать
    # branch_id вовсе — тогда берём привязку сессии.
    resolved = effective_branch_filter(user, branch_id)
    if resolved is None:
        raise HTTPException(
            status_code=422,
            detail="branch_id is required for a network-wide session",
        )
    return await KitchenService(db).get_active_orders(user.company_id, resolved)


@router.patch("/orders/items/status")
async def update_item_status(data: KitchenItemStatusUpdate, user: User = Depends(require_kitchen_access), db: AsyncSession = Depends(get_db)):
    return await KitchenService(db).update_item_status(
        user.company_id, data, actor_id=user.id, branch_id=effective_branch_filter(user)
    )


@router.patch("/orders/{order_id}/ready", response_model=OrderResponse)
async def mark_order_ready(
    order_id: UUID,
    user: User = Depends(require_kitchen_access),
    db: AsyncSession = Depends(get_db),
):
    """«Весь заказ готов» с кухонного экрана.

    Отдельная ручка нужна из-за кухонного скоупа: прямой
    PATCH /pos/orders/{id}/status для такой сессии закрыт.

    Заказ, который кухня ещё не брала в работу (`new`/`accepted`), сначала
    переводим в `cooking` — переход в `ready` разрешён только из `cooking`
    (см. VALID_TRANSITIONS и test_order_status_machine: «перепрыгнуть кухню»
    нельзя). Для повара это один тап."""
    service = OrderService(db, branch_scope=effective_branch_filter(user))
    order = await service.get(user.company_id, order_id)
    if order.status in ("new", "accepted"):
        await service.update_status(
            user.company_id, order_id, OrderStatusUpdate(status="cooking"), actor_id=user.id
        )
    return await service.update_status(
        user.company_id, order_id, OrderStatusUpdate(status="ready"), actor_id=user.id
    )
