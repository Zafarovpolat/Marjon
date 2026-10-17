"""FIFO-учёт партий склада (V46).

Приход создаёт партию, расход списывает старые первыми.
StockItem.quantity = SUM(batches.remaining),
StockItem.cost_price = total_value / quantity (оценка запаса).
Цена расхода = взвешенная по фактически съеденным партиям.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.inventory.models import StockBatch, StockItem
from app.shared.exceptions import ValidationError


def _d(value) -> Decimal:
    return Decimal(str(value or 0))


async def add_fifo_batch(
    db: AsyncSession,
    *,
    company_id: UUID,
    warehouse_id: UUID,
    ingredient_id: UUID,
    quantity: Decimal,
    cost_price: Decimal,
    unit: str = "кг",
    purchase_doc_id: UUID | None = None,
) -> StockBatch:
    qty = _d(quantity)
    # Исторический минус (продажи без остатка): новый приход сначала
    # закрывает отрицательный хвост, остаток — чистый FIFO.
    cover = Decimal("0")
    stock_result = await db.execute(
        select(StockItem).where(
            StockItem.company_id == company_id,
            StockItem.warehouse_id == warehouse_id,
            StockItem.ingredient_id == ingredient_id,
        )
    )
    existing = stock_result.scalar_one_or_none()
    if existing is not None and _d(existing.quantity) < 0:
        cover = min(-_d(existing.quantity), qty)
    batch = StockBatch(
        company_id=company_id,
        warehouse_id=warehouse_id,
        ingredient_id=ingredient_id,
        purchase_doc_id=purchase_doc_id,
        quantity_initial=qty,
        quantity_remaining=qty - cover,
        cost_price=_d(cost_price),
        unit=unit or "кг",
    )
    db.add(batch)
    await db.flush()
    await recalc_stock_from_batches(db, company_id, warehouse_id, ingredient_id)
    return batch


async def get_fifo_batches(
    db: AsyncSession,
    company_id: UUID,
    warehouse_id: UUID,
    ingredient_id: UUID,
) -> list[StockBatch]:
    """Партии с остатком, старые первыми.

    Порядок — по номеру приходного документа (монотонный на компанию),
    а не по created_at: два прихода в одну секунду давали равные метки
    и ломали FIFO. Backfill-партии (без документа — старый остаток)
    всегда первые.
    """
    from app.modules.inventory.warehouse_models import PurchaseDocument

    result = await db.execute(
        select(StockBatch)
        .outerjoin(PurchaseDocument, PurchaseDocument.id == StockBatch.purchase_doc_id)
        .where(
            StockBatch.company_id == company_id,
            StockBatch.warehouse_id == warehouse_id,
            StockBatch.ingredient_id == ingredient_id,
            StockBatch.quantity_remaining > 0,
        )
        .order_by(
            PurchaseDocument.number.asc().nullsfirst(),
            StockBatch.created_at,
            StockBatch.id,
        )
    )
    return list(result.scalars().all())


async def recalc_stock_from_batches(
    db: AsyncSession,
    company_id: UUID,
    warehouse_id: UUID,
    ingredient_id: UUID,
) -> StockItem | None:
    batches_result = await db.execute(
        select(StockBatch).where(
            StockBatch.company_id == company_id,
            StockBatch.warehouse_id == warehouse_id,
            StockBatch.ingredient_id == ingredient_id,
        )
    )
    batches = list(batches_result.scalars().all())
    total_qty = sum((_d(b.quantity_remaining) for b in batches), Decimal("0"))
    total_value = sum(
        (_d(b.quantity_remaining) * _d(b.cost_price) for b in batches),
        Decimal("0"),
    )
    stock_result = await db.execute(
        select(StockItem).where(
            StockItem.company_id == company_id,
            StockItem.warehouse_id == warehouse_id,
            StockItem.ingredient_id == ingredient_id,
        )
    )
    stock = stock_result.scalar_one_or_none()
    if stock is None:
        return None
    stock.quantity = total_qty
    stock.cost_price = (total_value / total_qty) if total_qty > 0 else Decimal("0")
    return stock


async def consume_fifo(
    db: AsyncSession,
    *,
    company_id: UUID,
    warehouse_id: UUID,
    ingredient_id: UUID,
    quantity: Decimal,
    name: str = "",
) -> tuple[Decimal, Decimal]:
    """Списать quantity по FIFO. Возвращает (unit_cost, total_cost).

    unit_cost — средняя цена фактически съеденных партий:
    пока первая партия не кончится, расход идёт по её цене.
    """
    need = _d(quantity)
    if need <= 0:
        return Decimal("0"), Decimal("0")
    batches = await get_fifo_batches(db, company_id, warehouse_id, ingredient_id)
    available = sum((_d(b.quantity_remaining) for b in batches), Decimal("0"))
    if available < need:
        raise ValidationError(
            f"Недостаточно остатка «{name or ingredient_id}»: есть {available}, требуется {need}."
        )
    total = Decimal("0")
    left = need
    for batch in batches:
        if left <= 0:
            break
        rem = _d(batch.quantity_remaining)
        take = min(rem, left)
        batch.quantity_remaining = rem - take
        total += take * _d(batch.cost_price)
        left -= take
    unit_cost = (total / need) if need > 0 else Decimal("0")
    await recalc_stock_from_batches(db, company_id, warehouse_id, ingredient_id)
    return unit_cost, total
