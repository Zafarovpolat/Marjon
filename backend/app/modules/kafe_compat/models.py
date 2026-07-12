from __future__ import annotations
from uuid import UUID
from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid
from app.shared.base_model import TimeStampedModel


class SupportTicket(TimeStampedModel):
    """Обращение в поддержку из плавающего виджета (ТЗ Web §3.14)."""

    __tablename__ = "support_tickets"

    company_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), index=True, nullable=True)
    user_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    country: Mapped[str | None] = mapped_column(String(8))
    message: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="new")  # new|in_progress|closed
