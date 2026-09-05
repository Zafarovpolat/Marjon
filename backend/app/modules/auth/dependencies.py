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
from app.modules.auth.security import decode_token, TERMINAL_EMAIL_LIKE
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


# --- Наши гейты для терминала/десктопа (дополняют web-RBAC выше) -------------
# Веб-гарды выше — про личность и scope сессии. Ниже — про гранулярные права
# из permissions-JSON, которые владелец выдаёт сотруднику в веб-админке.


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


def require_permission_or_admin(flag: str, rbac_permission: str | None = None):
    """Гейт мягче require_company_admin: пропускает owner/admin/суперадмина ИЛИ
    сотрудника компании, которому владелец в веб-админке выдал
    permissions[flag] === true («кассир со спец-правом» на десктопе-терминале).
    Веб-админка (owner) проходит без изменений — регрессий нет.
    Реальная защита от эскалации — в AuthService (роль/права проверяются там).

    rbac_permission (необязательный) добавляет третью ветку: роль сотрудника
    имеет это право в RBAC (upstream BE-05: manager/warehouse и
    inventory:stock:write). Нужен там, где upstream заменил ролевой гейт на
    require_permission: без этой ветки запись склада закрылась бы либо для
    роли warehouse, либо для кассира со спец-правом на кассе."""
    async def _dep(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if await user_is_company_admin(current_user, db):
            return current_user
        perms = current_user.permissions if isinstance(current_user.permissions, dict) else {}
        if current_user.company_id and perms.get(flag) is True:
            return current_user
        if rbac_permission and current_user.company_id:
            from app.modules.rbac.service import RBACService
            if await RBACService(db).check_permission(
                current_user.id, rbac_permission, current_user.company_id
            ):
                return current_user
        raise ForbiddenError("Permission required")

    return _dep


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


# --- Мягкое чтение токена и гейт «владелец в вебе ИЛИ терминал филиала» -------


oauth2_scheme_optional = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login/form", auto_error=False
)


async def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme_optional),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Пользователь, если валидный токен есть, иначе None — без 401.

    Нужен для /auth/pin-login, куда веб-фронт ходит анонимно (сотрудника задаёт
    employee_id), а касса — с org-токеном терминала. Протухший или битый токен
    трактуем как его отсутствие: иначе старый токен в localStorage не давал бы
    войти по PIN вместо того, чтобы просто игнорироваться."""
    if not token:
        return None
    try:
        payload = decode_token(token)
    except JWTError:
        return None
    user_id_str = payload.get("sub")
    if not user_id_str:
        return None
    try:
        user_id = UUID(user_id_str)
    except (ValueError, AttributeError):
        return None
    user = await UserRepository(db).get_by_id(user_id)
    if not user or not user.is_active:
        return None
    user.auth_scope = payload.get("auth_scope", "app")
    return user


def is_terminal_service_user(user: User) -> bool:
    """Служебный аккаунт терминала филиала (выдаётся /auth/branch-login).
    Роли у него нет вовсе, поэтому ни один ролевой гейт он не проходит —
    опознаём по шаблону e-mail из TERMINAL_EMAIL_LIKE."""
    if user.is_superadmin or not user.company_id or not user.email:
        return False
    if getattr(user, "auth_scope", "app") != "app":
        return False
    prefix, _, suffix = TERMINAL_EMAIL_LIKE.partition("%")
    return user.email.startswith(prefix) and user.email.endswith(suffix)


async def require_web_owner_or_terminal(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Список персонала читают двое: владелец в вебе (замороженный контракт
    BI-06 — операционным ролям здесь 403) и терминал филиала, которому этот
    список нужен ДО входа по PIN, то есть до появления сессии сотрудника."""
    if is_terminal_service_user(current_user):
        return current_user
    user = await ensure_company_app_identity(
        current_user, db, auth_scope=getattr(current_user, "auth_scope", "app")
    )
    return await require_web_owner(current_user=user, db=db)


async def require_company_app_user_or_terminal(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Данные организации, которые касса читает ДО входа сотрудника (список
    филиалов для BranchSelector): пускаем служебный терминал филиала, у которого
    роли нет вовсе. Для всех остальных вызывающих — полная проверка личности
    app-сессии (ensure_company_app_identity), то есть контракт BI-06 не ослаблен."""
    if is_terminal_service_user(current_user):
        return current_user
    return await ensure_company_app_identity(
        current_user, db, auth_scope=getattr(current_user, "auth_scope", "app")
    )
