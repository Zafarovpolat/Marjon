from __future__ import annotations
from datetime import datetime, timedelta, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, Request, status, UploadFile
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import get_current_user, require_company_admin
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.schemas import (
    CompanyUserCreate,
    CompanyUserResponse,
    CompanyUserUpdate,
    LoginRequest,
    PinLoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.modules.auth.service import AuthService
from app.modules.rbac.models import Role, UserRole
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


@router.post("/users", response_model=CompanyUserResponse, status_code=status.HTTP_201_CREATED)
async def create_company_user(
    data: CompanyUserCreate,
    current_user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
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
    )
    return CompanyUserResponse.model_validate(user).model_copy(update={"role_slug": role.slug})


@router.patch("/users/{user_id}", response_model=CompanyUserResponse)
async def update_company_user(
    user_id: UUID,
    data: CompanyUserUpdate,
    current_user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await AuthService(db).update_company_user(
        current_user.company_id, user_id, data.model_dump(exclude_unset=True)
    )
    roles_res = await db.execute(
        select(Role.slug).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user.id)
    )
    slugs = list(roles_res.scalars().all())
    return CompanyUserResponse.model_validate(user).model_copy(
        update={"role_slugs": slugs, "role_slug": slugs[0] if slugs else None}
    )


@router.post("/login/form", response_model=TokenResponse, include_in_schema=False)
async def login_form(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """OAuth2 form login (used by Swagger UI)."""
    svc = AuthService(db)
    _, access_token, refresh_token = await svc.login(form.username, form.password)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    svc = AuthService(db)
    access_token, refresh_token = await svc.refresh(data.refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await AuthService(db).logout(current_user.id)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Role.slug)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == current_user.id)
    )
    role_slugs = list(result.scalars().all())
    return UserResponse.model_validate(current_user).model_copy(update={"role_slugs": role_slugs})


@router.get("/users", response_model=list[CompanyUserResponse])
async def list_company_users(
    current_user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.auth.repository import UserRepository
    users = await UserRepository(db).get_company_users(current_user.company_id)
    result = []
    for user in users:
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
    current_user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update as sql_update
    from app.modules.auth.repository import UserRepository
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user or user.company_id != current_user.company_id:
        from app.shared.exceptions import NotFoundError
        raise NotFoundError("User not found")
    await db.execute(
        sql_update(User).where(User.id == user_id).values(is_active=False)
    )
    await db.commit()


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


@router.post("/pin-login", response_model=TokenResponse)
async def pin_login(
    data: PinLoginRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Быстрый вход сотрудника по PIN.

    Терминал привязан к организации токеном админа (передаётся в Authorization).
    PIN ищется в рамках этой организации — так один и тот же PIN в разных
    компаниях не пересекается.
    """
    if not current_user.company_id:
        from app.shared.exceptions import ForbiddenError
        raise ForbiddenError("Терминал не привязан к организации")
    _, access_token, refresh_token = await AuthService(db).login_by_pin(
        current_user.company_id, data.pin
    )
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.get("/staff-users", response_model=list[CompanyUserResponse])
async def staff_users(
    branch_id: UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Список сотрудников организации. При указании branch_id — только те,
    кто привязан к этому филиалу через UserRole.branch_id."""
    from app.modules.auth.repository import UserRepository
    users = await UserRepository(db).get_company_users(current_user.company_id)

    branch_user_ids: set[UUID] | None = None
    if branch_id is not None:
        rows = await db.execute(
            select(UserRole.user_id).where(UserRole.branch_id == branch_id)
        )
        branch_user_ids = set(rows.scalars().all())

    result = []
    for user in users:
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
    rows = await db.execute(
        select(RefreshToken.user_id)
        .join(User, User.id == RefreshToken.user_id)
        .where(
            User.company_id == current_user.company_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
            RefreshToken.created_at > now - _SESSION_WINDOW,
        )
        .distinct()
    )
    return [str(uid) for uid in rows.scalars().all()]
