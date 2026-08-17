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


def create_access_token(user_id: UUID, company_id: UUID | None = None) -> str:
    payload = {
        "sub": str(user_id),
        "company_id": str(company_id) if company_id else None,
        "jti": str(uuid4()),
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token() -> str:
    return secrets.token_urlsafe(64)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise exc
