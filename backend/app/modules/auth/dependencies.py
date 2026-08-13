from __future__ import annotations
from uuid import UUID
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.modules.auth.models import User
from app.modules.auth.repository import UserRepository
from app.modules.auth.security import decode_token
from app.modules.rbac.models import Role, UserRole
from app.shared.exceptions import ForbiddenError
from app.shared.exceptions import UnauthorizedError

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login/form")


async def ensure_company_app_identity(
    current_user: User,
    db: AsyncSession,
    *,
    auth_scope: str,
) -> User:
    """Validate authoritative APP identity, including manual WS auth."""
    if auth_scope != "app":
        raise ForbiddenError("Company app session required")
    if current_user.company_id is None or current_user.is_superadmin:
        raise ForbiddenError("Company app identity required")
    roles = list((await db.execute(
        select(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == current_user.id)
    )).scalars().all())
    from app.modules.rbac.constants import APP_COMPANY_ROLE_SLUGS
    if (
        len(roles) != 1
        or roles[0].company_id != current_user.company_id
        or roles[0].is_system
        or roles[0].slug not in APP_COMPANY_ROLE_SLUGS
    ):
        raise ForbiddenError("Unambiguous company role required")
    return current_user


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_token(token)
    except JWTError:
        raise UnauthorizedError("Could not validate credentials")

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise UnauthorizedError("Could not validate credentials")

    try:
        user_id = UUID(user_id_str)
    except (ValueError, AttributeError):
        raise UnauthorizedError("Could not validate credentials")

    user = await UserRepository(db).get_by_id(user_id)
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")
    # Transient, not persisted — records what THIS SESSION's token was scoped
    # to (BE-01), so guards can tell an hq_admin session from a regular one
    # even for the same superadmin user.
    user.auth_scope = payload.get("auth_scope", "app")
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise UnauthorizedError("Inactive user")
    return current_user


async def require_company_app_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Require an app-scoped session and one unambiguous company role."""
    return await ensure_company_app_identity(
        current_user,
        db,
        auth_scope=getattr(current_user, "auth_scope", "app"),
    )


async def require_web_owner(
    current_user: User = Depends(require_company_app_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Require the frozen BI-06 Web OWNER identity.

    Client/session scope, tenant membership and business role are independent
    assertions.  A company id in a JWT is not an OWNER role, and an HQ session
    must never inherit restaurant-app authority from ``is_superadmin``.
    """
    roles = list((await db.execute(
        select(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == current_user.id)
    )).scalars().all())
    if (
        len(roles) != 1
        or roles[0].company_id != current_user.company_id
        or roles[0].is_system
        or roles[0].slug != "owner"
    ):
        raise ForbiddenError("Company owner role required")
    return current_user


async def require_company_admin(
    current_user: User = Depends(require_web_owner),
) -> User:
    """Backward-compatible name for the frozen Web OWNER admin guard.

    Operational admin/manager semantics are explicitly deferred.  Existing
    assignments remain in the database, but they do not receive OWNER's Web
    administration ceiling in BI-06.
    """
    return current_user


async def require_superadmin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.is_superadmin and getattr(current_user, "auth_scope", "app") == "hq_admin":
        return current_user
    raise ForbiddenError("HQ admin session required")


async def require_hq_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """BE-02: guard for HQ admin panel endpoints. Requires BOTH the static
    is_superadmin flag AND a session that was actually issued by
    /auth/admin/login — a superadmin token from the regular /auth/login
    (e.g. logged into a company as its owner) does not pass this."""
    if current_user.is_superadmin and getattr(current_user, "auth_scope", "app") == "hq_admin":
        return current_user
    raise ForbiddenError("HQ admin session required")
