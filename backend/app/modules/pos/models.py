from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from uuid import UUID
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid
from app.shared.base_model import TimeStampedModel


class PosTerminal(TimeStampedModel):
    __tablename__ = "pos_terminals"

    company_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("companies.id"), index=True)
    branch_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("branches.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Order(TimeStampedModel):
    __tablename__ = "orders"

    # Индексы производительности из миграции e9f0idx01. Объявлять их здесь
    # обязательно: модель — источник правды для `alembic autogenerate`. Пока их
    # тут не было, автогенерация видела в базе «лишние» индексы и предлагала их
    # УДАЛИТЬ. Один неосторожный `alembic revision --autogenerate` — и заказы
    # остались бы без индексов по статусу, столу и паре (филиал, дата), то есть
    # без самых частых запросов дашборда и кассы.
    __table_args__ = (
        Index("ix_orders_status", "status"),
        Index("ix_orders_table_number", "table_number"),
        Index("ix_orders_branch_created", "branch_id", "created_at"),
    )

    company_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("companies.id"), index=True)
    branch_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("branches.id"), index=True)
    terminal_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("pos_terminals.id"), nullable=True)
    customer_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("customers.id"), nullable=True)
    waiter_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)
    order_number: Mapped[str] = mapped_column(String(20), nullable=False)
    # dine_in | takeaway | delivery | qr
    order_type: Mapped[str] = mapped_column(String(20), default="dine_in")
    # new | accepted | cooking | ready | completed | cancelled
    status: Mapped[str] = mapped_column(String(20), default="new")
    table_number: Mapped[str | None] = mapped_column(String(20))
    persons_count: Mapped[int] = mapped_column(Integer, default=1)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    service_fee: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    note: Mapped[str | None] = mapped_column(Text)
    # pos | qr | delivery_app
    source: Mapped[str] = mapped_column(String(50), default="pos")
    # Доставка: контакты клиента
    customer_phone: Mapped[str | None] = mapped_column(String(30))
    customer_address: Mapped[str | None] = mapped_column(Text)
    # Чек напечатан → стол «ожидает оплату» (зелёный). Сбрасывается при дозаказе.
    receipt_printed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Комментарий при отмене заказа (почему отменили)
    cancel_comment: Mapped[str | None] = mapped_column(Text)

    items: Mapped[list[OrderItem]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(TimeStampedModel):
    __tablename__ = "order_items"

    order_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("products.id"), index=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    # pending | cooking | ready | served | cancelled
    status: Mapped[str] = mapped_column(String(20), default="pending")
    note: Mapped[str | None] = mapped_column(Text)
    modifiers: Mapped[dict] = mapped_column(JSON, default=list)
    course: Mapped[int] = mapped_column(Integer, default=1)
    # Позиция «с собой» — не облагается сервисным сбором
    takeaway: Mapped[bool] = mapped_column(Boolean, default=False)

    order: Mapped[Order] = relationship(back_populates="items")


class CashierShift(TimeStampedModel):
    __tablename__ = "cashier_shifts"

    company_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("companies.id"), index=True)
    branch_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("branches.id"), index=True)
    cashier_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opening_cash: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    closing_cash: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    # open | closed
    status: Mapped[str] = mapped_column(String(20), default="open")
