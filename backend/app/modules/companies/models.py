from __future__ import annotations
from uuid import UUID
from typing import TYPE_CHECKING
from sqlalchemy import String, Boolean, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid
from app.modules.organizations.models import JsonType
from app.shared.base_model import TimeStampedModel

if TYPE_CHECKING:
    from app.modules.auth.models import User


class Company(TimeStampedModel):
    __tablename__ = "companies"

    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    country_code: Mapped[str | None] = mapped_column(String(2))
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    currency: Mapped[str] = mapped_column(String(3), default="UZS")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Спец-пароль для отмены заказа (задаётся в веб-админке)
    cancel_password: Mapped[str | None] = mapped_column(String(64))
    # Доля обслуги, начисляемая официанту, % (для отчёта по официантам)
    waiter_service_percent: Mapped[int] = mapped_column(Integer, default=0)
    # 2.5 — конфиг конструктора чека из веб-админки (какие блоки печатать,
    # тексты «спасибо»/подвала и т.п.). Читается форматтером ESC/POS при печати.
    # Форма см. frontend/src/api/receipt.js (buildCustomerTemplate/buildKitchenTemplate).
    receipt_template: Mapped[dict | None] = mapped_column(JsonType, nullable=True)
    kitchen_receipt_template: Mapped[dict | None] = mapped_column(JsonType, nullable=True)

    branches: Mapped[list[Branch]] = relationship(back_populates="company", cascade="all, delete-orphan")
    users: Mapped[list[User]] = relationship(back_populates="company")


class Branch(TimeStampedModel):
    __tablename__ = "branches"

    company_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 6.2 — собственные учётные данные филиала: вход на кассе одним шагом
    # (логин филиала + пароль) без выбора филиала и без логина владельца.
    # Логин глобально уникален → определяет и организацию, и филиал.
    login: Mapped[str | None] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))

    company: Mapped[Company] = relationship(back_populates="branches")
