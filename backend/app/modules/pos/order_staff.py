"""Receipt participants come from the order creator and active item authors.

Taking payment alone does not make someone the author of the dishes.
"""
from sqlalchemy import or_, select

from app.modules.auth.models import User
from app.modules.rbac.models import Role, UserRole


async def resolve_receipt_staff(db, company_id, orders):
    ids = {o.waiter_id for o in orders if o.waiter_id}
    for order in orders:
        ids.update(item.added_by for item in order.items
                   if item.status != "cancelled" and item.added_by)
    if not ids:
        return {}
    names = dict((await db.execute(select(User.id, User.name).where(
        User.company_id == company_id, User.id.in_(ids),
    ))).all())
    roles = (await db.execute(
        select(UserRole.user_id, UserRole.branch_id, Role.slug)
        .join(Role, Role.id == UserRole.role_id)
        .where(UserRole.user_id.in_(ids), Role.slug.in_(["cashier", "waiter"]),
               or_(Role.company_id == company_id, Role.company_id.is_(None)))
    )).all()
    result = {}
    for order in orders:
        authors = {item.added_by for item in order.items
                   if item.status != "cancelled" and item.added_by}
        if order.waiter_id:
            authors.add(order.waiter_id)
        grouped = {"cashier": [], "waiter": []}
        for uid in sorted(authors, key=str):
            slugs = {row.slug for row in roles if row.user_id == uid
                     and row.branch_id in (None, order.branch_id)}
            role = "cashier" if "cashier" in slugs else "waiter" if "waiter" in slugs or uid == order.waiter_id else None
            if role and names.get(uid):
                grouped[role].append(names[uid])
        result[order.id] = [
            {"label": label, "name": ", ".join(grouped[role])}
            for role, label in (("cashier", "Кассир"), ("waiter", "Официант"))
            if grouped[role]
        ]
    return result
