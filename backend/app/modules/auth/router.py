from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import get_current_user, require_company_admin
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    CompanyUserCreate,
    CompanyUserResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.modules.auth.service import AuthService
from app.modules.rbac.models import Role, UserRole

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    svc = AuthService(db)
    user, access_token, refresh_token = await svc.register(
        company_name=data.company_name,
        company_slug=data.company_slug,
        email=data.email,
        password=data.password,
    )
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
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
    )
    return CompanyUserResponse.model_validate(user).model_copy(update={"role_slug": role.slug})


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
