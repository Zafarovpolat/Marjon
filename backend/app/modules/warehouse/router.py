from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.warehouse.schemas import (
    PurchaseCreate, PurchaseResponse, PurchaseUpdate,
    TransferCreate, TransferResponse,
    InventoryCheckCreate, InventoryCheckResponse,
    WriteOffCreate, WriteOffResponse,
    WarehouseResponse,
)
from app.modules.warehouse.service import WarehouseService

router = APIRouter(prefix="/warehouse", tags=["warehouse"])


@router.get("/list", response_model=list[WarehouseResponse])
async def list_warehouses(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await WarehouseService(db).list_warehouses(user.company_id)


# ── Purchases ─────────────────────────────────────────────────────────────────

@router.get("/purchases", response_model=list[PurchaseResponse])
async def list_purchases(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await WarehouseService(db).list_purchases(user.company_id)


@router.post("/purchases", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase(data: PurchaseCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await WarehouseService(db).create_purchase(user.company_id, user.id, data)


@router.patch("/purchases/{purchase_id}", response_model=PurchaseResponse)
async def update_purchase(purchase_id: UUID, data: PurchaseUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await WarehouseService(db).update_purchase(user.company_id, purchase_id, data)


@router.delete("/purchases/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase(purchase_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await WarehouseService(db).delete_purchase(user.company_id, purchase_id)


# ── Transfers ─────────────────────────────────────────────────────────────────

@router.get("/transfers", response_model=list[TransferResponse])
async def list_transfers(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await WarehouseService(db).list_transfers(user.company_id)


@router.post("/transfers", response_model=TransferResponse, status_code=status.HTTP_201_CREATED)
async def create_transfer(data: TransferCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await WarehouseService(db).create_transfer(user.company_id, user.id, data)


@router.delete("/transfers/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transfer(transfer_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await WarehouseService(db).delete_transfer(user.company_id, transfer_id)


# ── Inventory checks ──────────────────────────────────────────────────────────

@router.get("/inventory-checks", response_model=list[InventoryCheckResponse])
async def list_inventory_checks(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await WarehouseService(db).list_inventory_checks(user.company_id)


@router.post("/inventory-checks", response_model=InventoryCheckResponse, status_code=status.HTTP_201_CREATED)
async def create_inventory_check(data: InventoryCheckCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await WarehouseService(db).create_inventory_check(user.company_id, user.id, data)


# ── Write-offs ────────────────────────────────────────────────────────────────

@router.get("/write-offs", response_model=list[WriteOffResponse])
async def list_write_offs(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await WarehouseService(db).list_write_offs(user.company_id)


@router.post("/write-offs", response_model=WriteOffResponse, status_code=status.HTTP_201_CREATED)
async def create_write_off(data: WriteOffCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await WarehouseService(db).create_write_off(user.company_id, user.id, data)


@router.delete("/write-offs/{write_off_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_write_off(write_off_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await WarehouseService(db).delete_write_off(user.company_id, write_off_id)
