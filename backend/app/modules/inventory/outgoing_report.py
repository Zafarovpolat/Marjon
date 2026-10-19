"""Read-only outgoing report. Historical money comes ONLY from stock movements."""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select

from app.modules.companies.models import Company
from app.modules.inventory.models import Ingredient, Product, StockMovement, Warehouse
from app.modules.inventory.warehouse_models import ExpenseDocument
from app.shared.exceptions import ValidationError


async def outgoing_report(db, company_id, date_from: date, date_to: date):
    if date_from > date_to:
        raise ValidationError("date_from must not be after date_to")
    tz_name = await db.scalar(select(Company.timezone).where(Company.id == company_id))
    try:
        tz = ZoneInfo(tz_name or "Asia/Tashkent")
    except (ZoneInfoNotFoundError, KeyError):
        tz = ZoneInfo("Asia/Tashkent")
    start = datetime.combine(date_from, time.min, tzinfo=tz).astimezone(timezone.utc)
    end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)
    warehouses = (await db.execute(select(Warehouse).where(Warehouse.company_id == company_id))).scalars().all()
    ingredients = {i.id: i for i in (await db.execute(select(Ingredient).where(Ingredient.company_id == company_id))).scalars()}
    sale_keys = {(p.name.strip().lower(), (p.unit or "").strip().lower()) for p in
                 (await db.execute(select(Product).where(Product.company_id == company_id, Product.product_type == "sale", Product.is_active.is_(True)))).scalars()}
    # Outer join preserves real movements even if an old document was deleted.
    records = (await db.execute(
        select(StockMovement, ExpenseDocument.receiver)
        .outerjoin(ExpenseDocument, (ExpenseDocument.id == StockMovement.ref_id) & (ExpenseDocument.company_id == company_id))
        .where(StockMovement.company_id == company_id,
               StockMovement.movement_type.in_(["sale", "expense"]),
               StockMovement.created_at >= start, StockMovement.created_at < end)
        .order_by(StockMovement.created_at, StockMovement.id)
    )).all()
    rows = {str(w.id): {"key": str(w.id), "id": str(w.id), "name": w.name,
                        "product": Decimal("0"), "tovar": Decimal("0")} for w in warehouses}
    lines = []
    for movement, receiver in records:
        if movement.movement_type == "expense" and (
            receiver == "Инвентаризация" or (movement.note or "").startswith("Инвентаризация")
        ):
            continue
        key = str(movement.warehouse_id)
        row = rows.setdefault(key, {"key": key, "id": key, "name": "Склад", "product": Decimal("0"), "tovar": Decimal("0")})
        ingredient = ingredients.get(movement.ingredient_id)
        name = ingredient.name if ingredient else "Удалённый продукт"
        unit = movement.unit or ""
        is_tovar = movement.movement_type != "sale" and (name.strip().lower(), unit.strip().lower()) in sale_keys
        amount = Decimal(str(movement.total_cost or 0))
        row["tovar" if is_tovar else "product"] += amount
        lines.append({"key": str(movement.id), "ingredientId": str(movement.ingredient_id),
                      "name": name, "category": (ingredient.category if ingredient else None) or "Без категории",
                      "qty": str(movement.quantity), "unit": unit, "sum": str(amount),
                      "isTovar": is_tovar, "warehouseKey": key,
                      "registeredAt": movement.created_at.isoformat(), "source": movement.movement_type})
    result = [{**r, "product": str(r["product"]), "tovar": str(r["tovar"]),
               "raw": str(r["product"] + r["tovar"])} for r in rows.values()]
    return {"rows": result, "lines": lines,
            "total": str(sum((Decimal(r["raw"]) for r in result), Decimal("0"))),
            "date_from": date_from.isoformat(), "date_to": date_to.isoformat()}
