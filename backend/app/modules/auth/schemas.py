from __future__ import annotations
import re
from uuid import UUID
from pydantic import EmailStr, Field, field_validator
from app.shared.base_schema import BaseSchema, BaseResponseSchema


def _validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Пароль должен быть не менее 8 символов")
    if not re.search(r"[A-Za-z]", v):
        raise ValueError("Пароль должен содержать хотя бы одну букву")
    if not re.search(r"\d", v):
        raise ValueError("Пароль должен содержать хотя бы одну цифру")
    return v


def _validate_pin(v: str | None) -> str | None:
    """PIN сотрудника: 2–8 цифр. Пусто (None/"") — «снять PIN», это допустимо.
    Короче 2 цифр не принимаем: на кассе такой PIN нельзя ввести (пин-пад
    отправляет от 2 цифр), да и подобрать его тривиально."""
    if v is None:
        return None
    v = v.strip()
    if not v:
        return ""
    if not re.fullmatch(r"\d{2,8}", v):
        raise ValueError("PIN должен содержать от 2 до 8 цифр")
    return v


class RegisterRequest(BaseSchema):
    model_config = {"from_attributes": True, "extra": "forbid"}

    company_name: str = Field(..., min_length=1, max_length=255)
    company_slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9_-]+$")
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _validate_password(v)


class CompanyUserCreate(BaseSchema):
    model_config = {"from_attributes": True, "extra": "forbid"}
    # email/password опциональны: кассиры/официанты входят по PIN. Если не заданы —
    # сервер синтезирует служебный email и случайный пароль (см. AuthService).
    email: EmailStr | None = None
    password: str | None = None
    phone: str | None = None
    role_slug: str
    role_name: str | None = None
    name: str | None = None
    pin_code: str | None = None
    printer_ip: str | None = None
    nfc_id: str | None = None
    branch_id: UUID | None = None
    is_active: bool | None = None
    permissions: dict | None = None

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str | None) -> str | None:
        return _validate_password(v) if v else v

    @field_validator("pin_code")
    @classmethod
    def check_pin(cls, v: str | None) -> str | None:
        return _validate_pin(v)


class CompanyUserUpdate(BaseSchema):
    """Частичное обновление сотрудника из веб-админки (все поля опциональны)."""

    model_config = {"from_attributes": True, "extra": "forbid"}
    email: EmailStr | None = None
    password: str | None = None
    phone: str | None = None
    role_slug: str | None = None
    role_name: str | None = None
    name: str | None = None
    pin_code: str | None = None
    printer_ip: str | None = None
    nfc_id: str | None = None
    branch_id: UUID | None = None
    is_active: bool | None = None
    permissions: dict | None = None

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str | None) -> str | None:
        return _validate_password(v) if v else v

    @field_validator("pin_code")
    @classmethod
    def check_pin(cls, v: str | None) -> str | None:
        return _validate_pin(v)


class LoginRequest(BaseSchema):
    model_config = {"from_attributes": True, "extra": "forbid"}

    email: str | None = Field(None, min_length=1, max_length=255)
    phone: str | None = Field(None, min_length=1, max_length=30)
    password: str


class PinSetRequest(BaseSchema):
    """Установка PIN сотруднику из веб-админки: строго 4–8 цифр."""
    pin: str = Field(..., min_length=4, max_length=8)

    @field_validator("pin")
    @classmethod
    def check_pin(cls, v: str) -> str:
        if not re.fullmatch(r"\d{4,8}", v):
            raise ValueError("PIN должен состоять из 4-8 цифр")
        return v


class PinLoginRequest(BaseSchema):
    # 2–8 цифр: короткий PIN (2 цифры) разрешён для быстрого входа на кассе.
    pin: str = Field(..., min_length=2, max_length=8, pattern=r"^\d+$")
    # Кого именно логиним (сотрудник выбран на кассе). Если PIN совпал у двух
    # сотрудников, без этого поля вход отдавал токен «первого совпавшего» —
    # десктоп потом отвергал его как «PIN не соответствует выбранному».
    user_id: UUID | None = None
    # Веб-фронт исторически шлёт то же самое как employee_id — принимаем оба ключа.
    employee_id: UUID | None = None


class BranchLoginRequest(BaseSchema):
    """6.2 — вход на кассе по логину/паролю филиала (без выбора филиала)."""
    login: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1)


class BranchInfo(BaseSchema):
    id: UUID
    name: str
    company_id: UUID


class CompanyInfo(BaseSchema):
    id: UUID
    name: str
    slug: str
    currency: str = "UZS"


class RefreshRequest(BaseSchema):
    refresh_token: str = Field(..., min_length=1)


class LogoutRequest(BaseSchema):
    """BE-06: закрытие одной сессии — отзываем именно её refresh-токен."""
    refresh_token: str = Field(..., min_length=1)

    @field_validator("refresh_token")
    @classmethod
    def reject_blank_refresh_token(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("refresh_token must not be blank")
        return value


class TokenResponse(BaseSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class BranchLoginResponse(TokenResponse):
    """Токен терминала филиала + сведения о филиале и организации, чтобы
    десктоп сохранил всё за один шаг (без BranchSelector)."""
    branch: BranchInfo
    company: CompanyInfo


class UserResponse(BaseResponseSchema):
    email: str
    name: str | None = None
    phone: str | None = None
    is_active: bool
    is_superadmin: bool
    # Scope ТЕКУЩЕЙ сессии (BE-01): "app" | "hq_admin". Проставляется транзиентно
    # в get_current_user; веб-фронт (owner-gating в isOwnerWebUser) требует это
    # поле в теле /auth/me — без него вход в веб молча редиректит на /login.
    auth_scope: str = "app"
    company_id: UUID | None
    branch_id: UUID | None = None
    printer_ip: str | None = None
    nfc_id: str | None = None
    permissions: dict | None = None
    role_slugs: list[str] = Field(default_factory=list)
    avatar_url: str | None = None


class CompanyUserResponse(UserResponse):
    role_slug: str | None = None
