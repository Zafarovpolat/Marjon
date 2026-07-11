from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.auth.models import User
from app.modules.warehouse.models import (
    Warehouse, Purchase, PurchaseItem, Transfer, InventoryCheck, WriteOff,
)
from app.modules.warehouse.schemas import (
    PurchaseCreate, PurchaseUpdate, TransferCreate, InventoryCheckCreate, WriteOffCreate,
)
from app.shared.exceptions import NotFoundError


def _now_str() -> str:
    return datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M")


class WarehouseService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Warehouses ────────────────────────────────────────────────────────────

    async def list_warehouses(self, company_id: UUID) -> list[Warehouse]:
        result = await self.db.execute(
            select(Warehouse).where(Warehouse.company_id == company_id, Warehouse.is_active == True)
            .order_by(Warehouse.name)
        )
        return list(result.scalars().all())

    # ── Purchases ─────────────────────────────────────────────────────────────

    async def _get_creator_name(self, user_id: UUID | None) -> str | None:
        if not user_id:
            return None
        result = await self.db.execute(select(User.name).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def list_purchases(self, company_id: UUID) -> list[dict]:
        result = await self.db.execute(
            select(Purchase).options(selectinload(Purchase.items))
            .where(Purchase.company_id == company_id)
            .order_by(Purchase.created_at.desc())
        )
        purchases = list(result.scalars().all())
        out = []
        for p in purchases:
            creator_name = await self._get_creator_name(p.created_by_id)
            out.append({**p.__dict__, "created_by_name": creator_name})
        return out

    async def create_purchase(self, company_id: UUID, user_id: UUID, data: PurchaseCreate) -> dict:
        # next number for this company
        max_num = await self.db.execute(
            select(func.coalesce(func.max(Purchase.number), 0)).where(Purchase.company_id == company_id)
        )
        next_num = (max_num.scalar_one() or 0) + 1

        total = sum(
            Decimal(str(it.quantity)) * Decimal(str(it.cost_price))
            for it in data.items
        )
        purchase = Purchase(
            company_id=company_id,
            number=next_num,
            supplier=data.supplier,
            warehouse_name=data.warehouse_name,
            date=data.date,
            note=data.note,
            status="draft",
            total_amount=total,
            items_count=len(data.items),
            registered_at=_now_str(),
            created_by_id=user_id,
        )
        self.db.add(purchase)
        await self.db.flush()
        for it in data.items:
            self.db.add(PurchaseItem(
                purchase_id=purchase.id,
                name=it.name,
                quantity=it.quantity,
                unit=it.unit,
                cost_price=it.cost_price,
            ))
        await self.db.commit()
        creator_name = await self._get_creator_name(user_id)
        return {**purchase.__dict__, "created_by_name": creator_name}

    async def update_purchase(self, company_id: UUID, purchase_id: UUID, data: PurchaseUpdate) -> dict:
        result = await self.db.execute(
            select(Purchase).where(Purchase.id == purchase_id, Purchase.company_id == company_id)
        )
        purchase = result.scalar_one_or_none()
        if not purchase:
            raise NotFoundError("Purchase not found")
        if data.status is not None:
            purchase.status = data.status
            if data.status == "accepted":
                purchase.accepted_at = _now_str()
        if data.supplier is not None:
            purchase.supplier = data.supplier
        if data.note is not None:
            purchase.note = data.note
        await self.db.commit()
        creator_name = await self._get_creator_name(purchase.created_by_id)
        return {**purchase.__dict__, "created_by_name": creator_name}

    async def delete_purchase(self, company_id: UUID, purchase_id: UUID) -> None:
        result = await self.db.execute(
            select(Purchase).where(Purchase.id == purchase_id, Purchase.company_id == company_id)
        )
        purchase = result.scalar_one_or_none()
        if not purchase:
            raise NotFoundError("Purchase not found")
        await self.db.delete(purchase)
        await self.db.commit()

    # ── Transfers ─────────────────────────────────────────────────────────────

    async def list_transfers(self, company_id: UUID) -> list[Transfer]:
        result = await self.db.execute(
            select(Transfer).where(Transfer.company_id == company_id)
            .order_by(Transfer.created_at.desc())
        )
        return list(result.scalars().all())

    async def create_transfer(self, company_id: UUID, user_id: UUID, data: TransferCreate) -> Transfer:
        transfer = Transfer(
            company_id=company_id,
            from_warehouse_name=data.from_warehouse_name,
            to_warehouse_name=data.to_warehouse_name,
            date=data.date,
            items_count=data.items_count,
            status="draft",
            created_by_id=user_id,
        )
        self.db.add(transfer)
        await self.db.commit()
        await self.db.refresh(transfer)
        return transfer

    async def delete_transfer(self, company_id: UUID, transfer_id: UUID) -> None:
        result = await self.db.execute(
            select(Transfer).where(Transfer.id == transfer_id, Transfer.company_id == company_id)
        )
        transfer = result.scalar_one_or_none()
        if not transfer:
            raise NotFoundError("Transfer not found")
        await self.db.delete(transfer)
        await self.db.commit()

    # ── InventoryChecks ───────────────────────────────────────────────────────

    async def list_inventory_checks(self, company_id: UUID) -> list[dict]:
        result = await self.db.execute(
            select(InventoryCheck).where(InventoryCheck.company_id == company_id)
            .order_by(InventoryCheck.created_at.desc())
        )
        checks = list(result.scalars().all())
        out = []
        for c in checks:
            creator_name = await self._get_creator_name(c.created_by_id)
            out.append({**c.__dict__, "created_by_name": creator_name})
        return out

    async def create_inventory_check(self, company_id: UUID, user_id: UUID, data: InventoryCheckCreate) -> dict:
        check = InventoryCheck(
            company_id=company_id,
            warehouse_name=data.warehouse_name,
            comment=data.comment,
            check_type=data.check_type,
            status="draft",
            created_by_id=user_id,
        )
        self.db.add(check)
        await self.db.commit()
        creator_name = await self._get_creator_name(user_id)
        return {**check.__dict__, "created_by_name": creator_name}

    # ── WriteOffs ─────────────────────────────────────────────────────────────

    async def list_write_offs(self, company_id: UUID) -> list[dict]:
        result = await self.db.execute(
            select(WriteOff).where(WriteOff.company_id == company_id)
            .order_by(WriteOff.created_at.desc())
        )
        write_offs = list(result.scalars().all())
        out = []
        for w in write_offs:
            creator_name = await self._get_creator_name(w.created_by_id)
            out.append({**w.__dict__, "created_by_name": creator_name})
        return out

    async def create_write_off(self, company_id: UUID, user_id: UUID, data: WriteOffCreate) -> dict:
        write_off = WriteOff(
            company_id=company_id,
            category=data.category,
            items_count=data.items_count,
            note=data.note,
            status="draft",
            created_by_id=user_id,
        )
        self.db.add(write_off)
        await self.db.commit()
        creator_name = await self._get_creator_name(user_id)
        return {**write_off.__dict__, "created_by_name": creator_name}

    async def delete_write_off(self, company_id: UUID, write_off_id: UUID) -> None:
        result = await self.db.execute(
            select(WriteOff).where(WriteOff.id == write_off_id, WriteOff.company_id == company_id)
        )
        write_off = result.scalar_one_or_none()
        if not write_off:
            raise NotFoundError("Write-off not found")
        await self.db.delete(write_off)
        await self.db.commit()
