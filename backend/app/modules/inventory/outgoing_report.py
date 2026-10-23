"""Read-only outgoing report. Historical money comes ONLY from stock movements."""
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select

from app.modules.companies.models import Company
from app.modules.inventory.models import Ingredient, Product, ProductIngredient, StockMovement, Warehouse
from app.modules.inventory.warehouse_models import ExpenseDocument
from app.shared.exceptions import ValidationError

_QTY_STEP = Decimal("0.0001")
# Сколько заказов подставлять в один IN(...) при восстановлении блюд.
_ORDER_CHUNK = 500
# Примечание sale-движения, в котором списание само записало блюдо:
# "dish sale: Лаваш". Это самый надёжный источник — он не зависит от того,
# жив ли заказ и не переписали ли техкарту после продажи.
_DISH_NOTE_PREFIX = "dish sale: "


def _note_dish(movement) -> str:
    note = (movement.note or "").strip()
    if not note.startswith(_DISH_NOTE_PREFIX):
        return ""
    return note[len(_DISH_NOTE_PREFIX):].strip()


async def _dish_shares(db, records):
    """(order_id, ingredient_id) → [(блюдо, израсходовано), ...].

    Sale-движение пишется на пару (заказ, ингредиент) и хранит ref_id = order_id,
    поэтому блюда восстанавливаются из позиций заказа и их техкарт
    (норма × проданные порции). Отменённые позиции не участвуют — их списание
    откатывается отдельно. Одно и то же блюдо может стоять в заказе несколько
    раз — такие строки складываются в одну.
    """
    order_ids = sorted({m.ref_id for m, _receiver in records if m.movement_type == "sale" and m.ref_id})
    if not order_ids:
        return {}
    # Импорт внутри функции: pos-модули тянут inventory, поэтому на уровне файла
    # это дало бы цикл (тот же приём, что в inventory/service.py).
    from app.modules.pos.models import OrderItem

    # Заказ в списке — пачками: за бурный день продаж их тысячи, и один
    # IN(...) на всё сделал бы планировщику больно.
    rows = []
    for start in range(0, len(order_ids), _ORDER_CHUNK):
        rows.extend((await db.execute(
            select(OrderItem.order_id, OrderItem.name, ProductIngredient.ingredient_id,
                   ProductIngredient.quantity, OrderItem.quantity)
            .join(ProductIngredient, ProductIngredient.product_id == OrderItem.product_id)
            .where(OrderItem.order_id.in_(order_ids[start:start + _ORDER_CHUNK]),
                   OrderItem.status != "cancelled")
        )).all())
    shares: dict[tuple, dict] = {}
    for order_id, dish_name, ingredient_id, per_portion, sold_qty in rows:
        amount = Decimal(str(per_portion or 0)) * Decimal(str(sold_qty or 0))
        if amount <= 0:
            continue
        by_dish = shares.setdefault((order_id, ingredient_id), {})
        name = str(dish_name or "—")
        by_dish[name] = by_dish.get(name, Decimal("0")) + amount
    return {key: list(by_dish.items()) for key, by_dish in shares.items()}


def _split_by_dish(shares, order_id, ingredient_id, quantity):
    """Доли блюд, приведённые ровно к списанному количеству.

    Техкарта могла измениться после продажи, поэтому доли нормируются на факт:
    сумма разбивки всегда равна движению (последняя доля добирает остаток).
    """
    parts = shares.get((order_id, ingredient_id)) or []
    total = sum((amount for _name, amount in parts), Decimal("0"))
    if total <= 0:
        return []
    qty = Decimal(str(quantity or 0))
    scale = qty / total
    dishes = []
    acc = Decimal("0")
    for index, (dish_name, amount) in enumerate(parts):
        last = index == len(parts) - 1
        share = (qty - acc) if last else (amount * scale).quantize(_QTY_STEP, rounding=ROUND_HALF_UP)
        acc += share
        dishes.append({"name": dish_name, "qty": str(share)})
    return dishes


async def outgoing_report(db, company_id, date_from: date, date_to: date, *, web_timezone: str | None = None):
    if date_from > date_to:
        raise ValidationError("date_from must not be after date_to")
    tz_name = await db.scalar(select(Company.timezone).where(Company.id == company_id))
    try:
        tz = ZoneInfo(web_timezone or tz_name or "Asia/Tashkent")
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
    shares = await _dish_shares(db, records)
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
        # Блюдо берём из примечания движения (его пишет списание), а если
        # примечания нет — восстанавливаем из заказа и техкарты. У ручного
        # расходного документа блюд нет по определению.
        if movement.movement_type != "sale":
            dishes = []
        else:
            note_dish = _note_dish(movement)
            dishes = (
                [{"name": note_dish, "qty": str(movement.quantity)}]
                if note_dish
                else _split_by_dish(shares, movement.ref_id, movement.ingredient_id,
                                    movement.quantity)
            )
        lines.append({"key": str(movement.id), "ingredientId": str(movement.ingredient_id),
                      "name": name, "category": (ingredient.category if ingredient else None) or "Без категории",
                      "qty": str(movement.quantity), "unit": unit, "sum": str(amount),
                      "isTovar": is_tovar, "warehouseKey": key,
                      "registeredAt": movement.created_at.isoformat(), "source": movement.movement_type,
                      "dishes": dishes})
    result = [{**r, "product": str(r["product"]), "tovar": str(r["tovar"]),
               "raw": str(r["product"] + r["tovar"])} for r in rows.values()]
    return {"rows": result, "lines": lines,
            "total": str(sum((Decimal(r["raw"]) for r in result), Decimal("0"))),
            "date_from": date_from.isoformat(), "date_to": date_to.isoformat()}
