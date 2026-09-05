# ВАЖНО: здесь НЕТ 'from __future__ import annotations'.
# На эндпоинтах этого модуля висит @limiter.limit (slowapi). Обёртка slowapi
# подменяет __globals__ функции, поэтому FastAPI не может разрезолвить
# строковые аннотации: body-параметры вырождались в query (HTTP 422 на
# /auth/login, /auth/refresh, POST /pos/orders), а Depends() по аннотации
# падал на старте. С реальными аннотациями резолв не нужен.
from datetime import datetime, timedelta, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, Request, status, UploadFile
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import (
    get_current_user,
    get_current_user_optional,
    require_company_admin,
    require_permission_or_admin,
    require_web_owner_or_terminal,
    user_is_company_admin,
)
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.schemas import (
    BranchLoginRequest,
    BranchLoginResponse,
    CompanyUserCreate,
    CompanyUserResponse,
    CompanyUserUpdate,
    LoginRequest,
    LogoutRequest,
    PinLoginRequest,
    PinSetRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.modules.auth.service import AuthService
from app.modules.rbac.constants import OWNER_ASSIGNABLE_ROLE_SLUGS
from app.modules.rbac.models import Role, UserRole
from app.shared.exceptions import UnauthorizedError
from app.shared.rate_limit import limiter
from app.shared.storage import storage

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    svc = AuthService(db)
    user, access_token, refresh_token = await svc.register(
        company_name=data.company_name,
        company_slug=data.company_slug,
        email=data.email,
        password=data.password,
    )
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    svc = AuthService(db)
    identifier = data.phone or data.email
    if not identifier:
        from app.shared.exceptions import UnauthorizedError
        raise UnauthorizedError("phone или email обязателен")
    _, access_token, refresh_token = await svc.login(identifier, data.password)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/admin/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login_admin(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    # BE-01: вход в HQ-админку. Тот же контракт, что /login, но токен получает
    # scope="hq_admin" и пускает только суперадмина (проверка в service.login_admin):
    # владелец/менеджер получают 403 даже с верным паролем. Касса и owner-приложение
    # продолжают ходить в /auth/login.
    svc = AuthService(db)
    identifier = data.phone or data.email
    if not identifier:
        from app.shared.exceptions import UnauthorizedError
        raise UnauthorizedError("phone или email обязателен")
    _, access_token, refresh_token = await svc.login_admin(identifier, data.password)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/users", response_model=CompanyUserResponse, status_code=status.HTTP_201_CREATED)
async def create_company_user(
    data: CompanyUserCreate,
    current_user: User = Depends(require_permission_or_admin("can_manage_staff")),
    db: AsyncSession = Depends(get_db),
):
    # Владелец/админ проходят без ограничений; кассир со спец-правом — под анти-эскалацией.
    actor_is_admin = await user_is_company_admin(current_user, db)
    user, role = await AuthService(db).create_company_user(
        company_id=current_user.company_id,
        email=data.email,
        password=data.password,
        phone=data.phone,
        role_slug=data.role_slug,
        role_name=data.role_name,
        name=data.name,
        pin_code=data.pin_code,
        printer_ip=data.printer_ip,
        nfc_id=data.nfc_id,
        branch_id=data.branch_id,
        is_active=data.is_active,
        permissions=data.permissions,
        actor_is_admin=actor_is_admin,
        # BE-05: потолок полномочий — через /auth/users нельзя создать owner/admin
        # даже владельцу; такие учётки заводятся только регистрацией компании.
        assignable_role_slugs=OWNER_ASSIGNABLE_ROLE_SLUGS,
    )
    return CompanyUserResponse.model_validate(user).model_copy(update={"role_slug": role.slug})


@router.patch("/users/{user_id}", response_model=CompanyUserResponse)
async def update_company_user(
    user_id: UUID,
    data: CompanyUserUpdate,
    current_user: User = Depends(require_permission_or_admin("can_manage_staff")),
    db: AsyncSession = Depends(get_db),
):
    actor_is_admin = await user_is_company_admin(current_user, db)
    user, slugs = await AuthService(db).update_company_user(
        user_id,
        current_user.company_id,
        # name — имя сотрудника; веб-форма исторически шлёт его как role_name.
        name=data.name if data.name is not None else data.role_name,
        email=str(data.email) if data.email else None,
        phone=data.phone,
        password=data.password,
        role_slug=data.role_slug,
        is_active=data.is_active,
        pin_code=data.pin_code,
        printer_ip=data.printer_ip,
        nfc_id=data.nfc_id,
        branch_id=data.branch_id,
        permissions=data.permissions,
        assignable_role_slugs=OWNER_ASSIGNABLE_ROLE_SLUGS,
        # BE-05: actor_user_id включает защиту — нельзя править ни себя,
        # ни владельца/админа (их роль вне OWNER_ASSIGNABLE_ROLE_SLUGS).
        actor_user_id=current_user.id,
        actor_is_admin=actor_is_admin,
    )
    return CompanyUserResponse.model_validate(user).model_copy(
        update={"role_slugs": slugs, "role_slug": slugs[0] if slugs else None}
    )


@router.post("/login/form", response_model=TokenResponse, include_in_schema=False)
async def login_form(
    # Зависимость указана ЯВНО (а не пустым Depends()): так FastAPI не обязан
    # выводить её из аннотации. Rate-limit здесь НЕ ставим: form-эндпоинт не имеет
    # body-модели "data", а тест test_openapi_body_contract требует её от каждого
    # лимитированного маршрута.
    form: OAuth2PasswordRequestForm = Depends(OAuth2PasswordRequestForm),
    db: AsyncSession = Depends(get_db),
):
    """OAuth2 form login (used by Swagger UI)."""
    svc = AuthService(db)
    _, access_token, refresh_token = await svc.login(form.username, form.password)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
async def refresh(request: Request, data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    svc = AuthService(db)
    access_token, refresh_token = await svc.refresh(data.refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/branch-login", response_model=BranchLoginResponse)
@limiter.limit("10/minute")
async def branch_login(request: Request, data: BranchLoginRequest, db: AsyncSession = Depends(get_db)):
    """6.2 — вход на кассе одним шагом по логину/паролю филиала.
    Логин филиала глобально уникален и определяет и организацию, и филиал.
    Токен выпускается на служебного (терминального) пользователя филиала, поэтому
    pin-login / staff-users / refresh работают дальше без изменений."""
    svc = AuthService(db)
    terminal, branch, company, access_token, refresh_token = await svc.login_by_branch(
        data.login, data.password
    )
    return BranchLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        branch={"id": branch.id, "name": branch.name, "company_id": branch.company_id},
        company={
            "id": company.id,
            "name": company.name,
            "slug": company.slug,
            "currency": company.currency,
        },
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    data: LogoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Отзыв ОДНОЙ сессии: refresh-токен обязателен, иначе выход на одном
    устройстве убивал бы сессии на всех остальных."""
    await AuthService(db).logout(current_user.id, data.refresh_token)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """BE-06: явный «выйти на всех устройствах» — отзывает все refresh-токены
    пользователя, независимо от того, из какой сессии пришёл запрос."""
    await AuthService(db).logout_all(current_user.id)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Role.slug)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == current_user.id)
    )
    role_slugs = list(result.scalars().all())
    return UserResponse.model_validate(current_user).model_copy(update={
        "role_slugs": role_slugs,
        # BE-01: клиент должен видеть, в каком контуре выпущен токен (app/hq_admin).
        "auth_scope": getattr(current_user, "auth_scope", "app"),
    })


@router.get("/users", response_model=list[CompanyUserResponse])
async def list_company_users(
    current_user: User = Depends(require_permission_or_admin("can_manage_staff")),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.auth.repository import UserRepository
    users = await UserRepository(db).get_company_users(current_user.company_id)
    result = []
    for user in users:
        # Суперадмин платформы не сотрудник компании — в списках персонала не показываем.
        if user.is_superadmin:
            continue
        roles_res = await db.execute(
            select(Role.slug)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user.id)
        )
        slugs = list(roles_res.scalars().all())
        result.append(
            CompanyUserResponse.model_validate(user).model_copy(
                update={"role_slugs": slugs, "role_slug": slugs[0] if slugs else None}
            )
        )
    return result


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company_user(
    user_id: UUID,
    current_user: User = Depends(require_permission_or_admin("can_manage_staff")),
    db: AsyncSession = Depends(get_db),
):
    # Вся защита — в сервисе: чужая компания → 404, себя и владельца → 403,
    # не-админ (кассир со спец-правом) отключает только рядовых сотрудников.
    actor_is_admin = await user_is_company_admin(current_user, db)
    await AuthService(db).deactivate_company_user(
        current_user.id, user_id, current_user.company_id, actor_is_admin=actor_is_admin
    )


_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
_IMG_EXT_MAP = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


@router.post("/me/photo", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Поддерживаются только jpg, png, webp")
    ext = _IMG_EXT_MAP[file.content_type]
    key = f"avatars/{current_user.id}.{ext}"
    avatar_url = await storage.upload(await file.read(), key, file.content_type)
    current_user.avatar_url = avatar_url
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    result = await db.execute(
        select(Role.slug)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == current_user.id)
    )
    role_slugs = list(result.scalars().all())
    return UserResponse.model_validate(current_user).model_copy(update={"role_slugs": role_slugs})


@router.patch("/users/{user_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def set_user_pin(
    user_id: UUID,
    data: PinSetRequest,
    current_user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    """BE-08: назначение/сброс PIN сотрудника — только владелец/админ в вебе
    (кассир, правящий свой PIN, здесь получает 403). На кассе менеджер со
    спец-правом меняет PIN через PATCH /auth/users/{id} полем pin_code."""
    await AuthService(db).set_pin(current_user.id, user_id, current_user.company_id, data.pin)


@router.post("/pin-login", response_model=TokenResponse)
@limiter.limit("30/minute")
async def pin_login(
    request: Request,
    data: PinLoginRequest,
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Быстрый вход сотрудника по PIN — два входа в один эндпоинт.

    1) Передан employee_id/user_id (веб-фронт и касса при выборе сотрудника):
       сотрудника задаёт ID, PIN лишь подтверждает вход. Кросс-компанийного
       поиска по PIN нет вообще, плюс работает блокировка КОНКРЕТНОЙ учётки
       после неудачных попыток (AuthService.pin_login).
    2) ID не передан (экран PIN на кассе без выбора сотрудника): организацию
       задаёт org-токен терминала в Authorization, PIN ищется в рамках этой
       организации — одинаковые PIN в разных компаниях не пересекаются.

    Токен читаем «мягко» (get_current_user_optional): без него ветка (1)
    требовала бы авторизации и ломала бы веб-фронт, который ходит сюда
    анонимно.
    """
    svc = AuthService(db)
    employee_id = data.employee_id or data.user_id
    if employee_id is not None:
        _, access_token, refresh_token = await svc.pin_login(employee_id, data.pin)
    elif current_user is not None and current_user.company_id:
        _, access_token, refresh_token = await svc.login_by_pin(current_user.company_id, data.pin)
    else:
        raise UnauthorizedError("PIN login requires employee_id or a terminal token")
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.get("/staff-users", response_model=list[CompanyUserResponse])
async def staff_users(
    branch_id: UUID | None = None,
    current_user: User = Depends(require_web_owner_or_terminal),
    db: AsyncSession = Depends(get_db),
):
    """Список сотрудников организации. При указании branch_id — сотрудники
    этого филиала плюс те, у кого филиал не задан (UserRole.branch_id IS NULL):
    аккаунты из веб-панели создаются без филиала и должны быть видны на кассе.

    Доступ: владелец в вебе (замороженный контракт BI-06 — кассиру здесь 403)
    либо служебный терминал филиала, который тянет этот список ДО входа по PIN."""
    from app.modules.auth.repository import UserRepository
    users = await UserRepository(db).get_company_users(current_user.company_id)

    branch_user_ids: set[UUID] | None = None
    if branch_id is not None:
        rows = await db.execute(
            select(UserRole.user_id).where(
                or_(UserRole.branch_id == branch_id, UserRole.branch_id.is_(None))
            )
        )
        branch_user_ids = set(rows.scalars().all())

    result = []
    for user in users:
        # Суперадмин платформы не сотрудник компании — в списках персонала не показываем.
        if user.is_superadmin:
            continue
        if branch_user_ids is not None and user.id not in branch_user_ids:
            continue
        roles_res = await db.execute(
            select(Role.slug).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user.id)
        )
        slugs = list(roles_res.scalars().all())
        result.append(
            CompanyUserResponse.model_validate(user).model_copy(
                update={"role_slugs": slugs, "role_slug": slugs[0] if slugs else None}
            )
        )
    return result


# Окно, в течение которого сессия считается «активной» (одна смена)
_SESSION_WINDOW = timedelta(hours=16)


@router.get("/active-staff", response_model=list[str])
async def active_staff(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """ID сотрудников с активной сессией: есть неотозванный непросроченный
    refresh-токен, выданный в течение текущей смены. Схему БД не меняем —
    используем существующую таблицу refresh_tokens."""
    now = datetime.now(timezone.utc)
    from app.modules.auth.security import TERMINAL_EMAIL_LIKE
    rows = await db.execute(
        select(RefreshToken.user_id)
        .join(User, User.id == RefreshToken.user_id)
        .where(
            User.company_id == current_user.company_id,
            ~User.email.like(TERMINAL_EMAIL_LIKE),
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
            RefreshToken.created_at > now - _SESSION_WINDOW,
        )
        .distinct()
    )
    return [str(uid) for uid in rows.scalars().all()]
