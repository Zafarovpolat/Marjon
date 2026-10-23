"""Shared, non-mutating presentation rules for both receipt renderers."""
from dataclasses import replace
from decimal import Decimal


def separator_style(template):
    value = (template or {}).get("separator") or {}
    if not isinstance(value, dict):
        value = {}
    pattern = value.get("pattern", "dashed")
    weight = value.get("weight", "thin")
    return (
        pattern if pattern in ("dashed", "solid", "stars") else "dashed",
        weight if weight in ("thin", "medium", "bold") else "thin",
    )


def grouped_items(items):
    """Combine identical lines for paper only; never change an order or money.

    Different products, effective prices, notes, courses and modifiers remain
    separate. Missing amounts are not the same as a real zero amount.
    """
    result, indices = [], {}
    for item in items:
        qty = Decimal(str(item.qty))
        amount = item.total
        key = (
            getattr(item, "product_id", None), item.name,
            getattr(item, "price", None),
            Decimal(str(amount)) / qty if amount is not None and qty > 0 else None,
            amount is None, tuple(item.modifiers), getattr(item, "note", None) or "",
            getattr(item, "course", 1), getattr(item, "takeaway", False),
        )
        if qty <= 0 or key not in indices:
            if qty > 0:
                indices[key] = len(result)
            result.append(replace(item))
            continue
        previous = result[indices[key]]
        combined = Decimal(str(previous.qty)) + qty
        previous.qty = format(combined.normalize(), "f") if isinstance(previous.qty, str) else combined
        if amount is not None:
            previous.total += amount
    return result
