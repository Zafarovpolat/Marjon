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
    # Транзиентное поле, не пишется в БД — фиксирует scope ТЕКУЩЕЙ сессии
    # (BE-01), чтобы гарды могли отличить hq_admin-сессию от обычной даже для
    # одного и того же суперадмина.
    user.auth_scope = payload.get("auth_scope", "app")
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise UnauthorizedError("Inactive user")
    return current_user


async def require_company_admin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    if current_user.is_superadmin:
        return current_user
    if not current_user.company_id:
        raise ForbiddenError("User is not assigned to a company")

    result = await db.execute(
        select(Role.slug)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(
            UserRole.user_id == current_user.id,
            Role.company_id == current_user.company_id,
            Role.slug.in_(("owner", "admin")),
        )
    )
    if result.scalars().first():
        return current_user
    raise ForbiddenError("Company admin role required")


async def user_is_company_admin(current_user: User, db: AsyncSession) -> bool:
    """owner/admin роль или суперадмин — но как булев признак, а не гейт.
    Нужен для ветвления анти-эскалации в сервисе: под токеном не-админа
    (кассир со спец-правом) правила создания/правки сотрудников строже."""
    if current_user.is_superadmin:
        return True
    if not current_user.company_id:
        return False
    result = await db.execute(
        select(Role.slug)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(
            UserRole.user_id == current_user.id,
            Role.company_id == current_user.company_id,
            Role.slug.in_(("owner", "admin")),
        )
    )
    return result.scalars().first() is not None


async def user_can_view_past_periods(current_user: User, db: AsyncSession) -> bool:
    """Прошлые периоды (финансы, приход/уход) — владельцу/админу либо сотруднику
    с permissions.can_view_past_periods (тумблер владельца в веб-админке).
    Всем остальным отчёты отдают ТОЛЬКО сегодняшний день — независимо от
    query-параметров, поэтому ограничение нельзя обойти прямым вызовом API."""
    if await user_is_company_admin(current_user, db):
        return True
    perms = current_user.permissions if isinstance(current_user.permissions, dict) else {}
    return perms.get("can_view_past_periods") is True


def require_permission_or_admin(flag: str):
    """Гейт мягче require_company_admin: пропускает owner/admin/суперадмина ИЛИ
    сотрудника компании, которому владелец в веб-админке выдал
    permissions[flag] === true («кассир со спец-правом» на десктопе-терминале).
    Веб-админка (owner/admin) проходит без изменений — регрессий нет.
    Реальная защита от эскалации — в AuthService (роль/права проверяются там)."""
    async def _dep(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if await user_is_company_admin(current_user, db):
            return current_user
        perms = current_user.permissions if isinstance(current_user.permissions, dict) else {}
        if current_user.company_id and perms.get(flag) is True:
            return current_user
        raise ForbiddenError("Permission required")

    return _dep


async def require_superadmin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.is_superadmin:
        return current_user
    raise ForbiddenError("Superadmin role required")


# --- Web-RBAC гарды (BE-01/BI-06), долиты из backend-integration-v1 -----------
# Дополняют нашу базу (require_company_admin / require_superadmin остаются как
# были — на них завязаны наши роутеры). Пока НЕ потребляются нашими роутерами:
# заготовлены для pre-rbac фронта и отложенного full-backend пути.


async def ensure_company_app_identity(
    current_user: User,
    db: AsyncSession,
    *,
    auth_scope: str,
) -> User:
    """Проверяет авторитетную APP-личность (включая ручную WS-аутентификацию)."""
    if auth_scope != "app":
        raise ForbiddenError("Company app session required")
    if current_user.company_id is None or current_user.is_superadmin:
        raise ForbiddenError("Company app identity required")
    roles = list((await db.execute(
        select(Role).join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == current_user.id)
    )).scalars().all())
    from app.modules.rbac.constants import APP_COMPANY_ROLE_SLUGS
    if (len(roles) != 1 or roles[0].company_id != current_user.company_id
            or roles[0].is_system or roles[0].slug not in APP_COMPANY_ROLE_SLUGS):
        raise ForbiddenError("Unambiguous company role required")
    return current_user


async def require_company_app_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    return await ensure_company_app_identity(
        current_user, db, auth_scope=getattr(current_user, "auth_scope", "app"))


async def require_web_owner(
    current_user: User = Depends(require_company_app_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    roles = list((await db.execute(
        select(Role).join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == current_user.id)
    )).scalars().all())
    if (len(roles) != 1 or roles[0].company_id != current_user.company_id
            or roles[0].is_system or roles[0].slug != "owner"):
        raise ForbiddenError("Company owner role required")
    return current_user


async def require_hq_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.is_superadmin and getattr(current_user, "auth_scope", "app") == "hq_admin":
        return current_user
    raise ForbiddenError("HQ admin session required")
