from __future__ import annotations
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(
    user_id: UUID, company_id: UUID | None = None, auth_scope: str = "app"
) -> str:
    """auth_scope marks what this SESSION is authorized for, independent of the
    user's static is_superadmin flag — a superadmin who logs in through the
    regular /auth/login never gets an "hq_admin"-scoped token; only
    /auth/admin/login issues one (BE-01)."""
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
    """Create an opaque refresh token bound to the issuing session scope.

    The scope marker is not trusted on its own. Refresh only consumes it after
    the hash of the *entire* token matches a server-side RefreshToken row, so a
    caller cannot alter ``app`` to ``hq_admin`` without invalidating the token.
    Legacy unmarked tokens are treated as ordinary app sessions.
    """
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
