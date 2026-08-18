from __future__ import annotations
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import bcrypt
from jose import JWTError, jwt

from app.config import settings


# 6.2 — «терминальный» служебный пользователь филиала. При входе по логину филиала
# (branch-login) токен выпускается на такого пользователя: он несёт company_id и
# branch_id, поэтому pin-login/staff-users/refresh работают без изменений. От списков
# персонала эти учётки скрыты по маске e-mail (TERMINAL_EMAIL_LIKE).
TERMINAL_EMAIL_LIKE = "terminal+%@marjon.local"


def terminal_email(branch_id) -> str:
    return f"terminal+{branch_id}@marjon.local"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def hash_pin(pin: str) -> str:
    """PIN сотрудника хранится хешированным (bcrypt), не в открытом виде."""
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def verify_pin(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except (ValueError, TypeError):
        return False


def create_access_token(
    user_id: UUID, company_id: UUID | None = None, auth_scope: str = "app"
) -> str:
    # auth_scope помечает, на что авторизована СЕССИЯ, независимо от статичного
    # флага is_superadmin: суперадмин, вошедший через обычный /auth/login, не
    # получает "hq_admin"-токен — такой выдаёт только /auth/admin/login (BE-01).
    payload = {
        "sub": str(user_id),
        "company_id": str(company_id) if company_id else None,
        "jti": str(uuid4()),
        "type": "access",
        "auth_scope": auth_scope,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token(auth_scope: str = "app") -> str:
    # Опаковый refresh-токен, привязанный к scope выпустившей сессии. Маркер
    # scope сам по себе не доверенный: refresh примет его только после того, как
    # хеш ВСЕЙ строки совпадёт со строкой RefreshToken в БД — подменить "app" на
    # "hq_admin" без инвалидации токена нельзя. Старые токены без префикса
    # трактуются как обычные app-сессии (обратная совместимость).
    if auth_scope not in {"app", "hq_admin"}:
        raise ValueError("Unsupported auth scope")
    return f"v1.{auth_scope}.{secrets.token_urlsafe(64)}"


def get_refresh_token_auth_scope(token: str) -> str:
    version, separator, remainder = token.partition(".")
    scope, scope_separator, secret = remainder.partition(".")
    if (
        version == "v1"
        and separator
        and scope_separator
        and secret
        and scope in {"app", "hq_admin"}
    ):
        return scope
    return "app"


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise exc
