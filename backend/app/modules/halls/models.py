from __future__ import annotations
from uuid import UUID
from sqlalchemy import String, Boolean, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid
from app.shared.base_model import TimeStampedModel


class Hall(TimeStampedModel):
    __tablename__ = "halls"

    company_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    tables: Mapped[list[Table]] = relationship(back_populates="hall", cascade="all, delete-orphan")


class Table(TimeStampedModel):
    __tablename__ = "tables"

    hall_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("halls.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=4)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    hall: Mapped[Hall] = relationship(back_populates="tables")
