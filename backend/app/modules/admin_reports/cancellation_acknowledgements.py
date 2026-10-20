"""Per-user receipts for report-derived cancellation notifications.

Use the existing notifications table; these already-read receipts are never
returned as unread notifications and do not change orders or report totals.
"""
from datetime import datetime, timezone
from uuid import UUID, NAMESPACE_URL, uuid5

from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.notifications.models import Notification
from app.modules.pos.models import Order, OrderItem
from app.shared.exceptions import NotFoundError

RECEIPT_TYPE = "cancelled_order_ack"


async def list_receipts(db: AsyncSession, user: User):
    rows = (await db.execute(select(Notification).where(
        Notification.company_id == user.company_id,
        Notification.user_id == user.id,
        Notification.notification_type == RECEIPT_TYPE,
        Notification.read_at.is_not(None),
    ))).scalars().all()
    return [{"order_id": row.data["order_id"], "acknowledged_at": row.read_at}
            for row in rows if row.data and row.data.get("order_id")]


async def acknowledge(db: AsyncSession, user: User, order_id: UUID):
    order = (await db.execute(select(Order).where(
        Order.id == order_id, Order.company_id == user.company_id,
        or_(Order.status == "cancelled", exists(select(OrderItem.id).where(
            OrderItem.order_id == Order.id, OrderItem.status == "cancelled",
        ))),
    ))).scalar_one_or_none()
    if order is None:
        raise NotFoundError("Cancelled order not found")
    # Serialize concurrent clicks from this user's devices. A deterministic
    # receipt ID also prevents duplicate receipts without a schema migration.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    receipt_id = uuid5(NAMESPACE_URL, f"marjon:cancelled-order-ack:{user.company_id}:{user.id}:{order_id}")
    receipt = await db.get(Notification, receipt_id)
    if receipt is None:
        receipt = Notification(
            id=receipt_id, company_id=user.company_id, user_id=user.id,
            notification_type=RECEIPT_TYPE, channel="in_app",
            title="Cancellation reviewed", body="", data={"order_id": str(order_id)},
        )
        db.add(receipt)
    receipt.read_at = datetime.now(timezone.utc)
    receipt.status = "read"
    stamp = receipt.read_at
    await db.commit()
    return {"order_id": order_id, "acknowledged_at": stamp}
