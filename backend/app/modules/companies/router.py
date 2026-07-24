from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import get_current_user, require_company_admin, require_superadmin
from app.modules.auth.models import User
from app.modules.companies.schemas import (
    BranchCreate, BranchResponse, BranchUpdate,
    CompanyCreate, CompanyResponse, CompanyUpdate,
)
from app.modules.companies.service import BranchService, CompanyService


class CancelPasswordSet(BaseModel):
    password: str | None = None


router = APIRouter(prefix="/companies", tags=["companies"])


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    data: CompanyCreate,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    return await CompanyService(db).create(data)


@router.get("/me", response_model=CompanyResponse)
async def get_my_company(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await CompanyService(db).get(current_user.company_id)


@router.patch("/me", response_model=CompanyResponse)
async def update_my_company(
    data: CompanyUpdate,
    current_user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    return await CompanyService(db).update(current_user.company_id, data)


@router.post("/me/branches", response_model=BranchResponse, status_code=status.HTTP_201_CREATED)
async def create_branch(
    data: BranchCreate,
    current_user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    return await BranchService(db).create(current_user.company_id, data)


@router.get("/me/branches", response_model=list[BranchResponse])
async def list_branches(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    branches = await BranchService(db).list(current_user.company_id)
    # «Один логин = один филиал»: если аккаунт привязан к филиалу — отдаём только его
    if getattr(current_user, "branch_id", None):
        scoped = [b for b in branches if b.id == current_user.branch_id]
        if scoped:
            return scoped
    return branches


@router.get("/me/cancel-password")
async def cancel_password_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    company = await CompanyService(db).get(current_user.company_id)
    return {"is_set": bool(getattr(company, "cancel_password", None))}


@router.post("/me/cancel-password")
async def set_cancel_password(
    data: CancelPasswordSet,
    current_user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    company = await CompanyService(db).get(current_user.company_id)
    company.cancel_password = (data.password or None)
    await db.commit()
    return {"is_set": bool(company.cancel_password)}


@router.patch("/me/branches/{branch_id}", response_model=BranchResponse)
async def update_branch(
    branch_id: UUID,
    data: BranchUpdate,
    current_user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    return await BranchService(db).update(branch_id, current_user.company_id, data)
