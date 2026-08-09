from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import get_current_user, require_company_admin
from app.modules.auth.models import User
from app.modules.halls.schemas import (
    HallCreate, HallResponse, HallUpdate,
    TableCreate, TableResponse, TableUpdate,
)
from app.modules.halls.service import HallService
from app.modules.finance.ownership import FinanceScope
from app.modules.finance.ownership_router import get_company_finance_scope

router = APIRouter(prefix="/halls", tags=["halls"])


@router.get("", response_model=list[HallResponse])
async def list_halls(
    branch_id: UUID | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await HallService(db).list(user.company_id, branch_id)


@router.post("", response_model=HallResponse, status_code=status.HTTP_201_CREATED)
async def create_hall(
    data: HallCreate,
    user: User = Depends(require_company_admin),
    scope: FinanceScope = Depends(get_company_finance_scope),
    db: AsyncSession = Depends(get_db),
):
    return await HallService(db).create(scope.tenant_id, data)


@router.get("/{hall_id}", response_model=HallResponse)
async def get_hall(
    hall_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await HallService(db).get(user.company_id, hall_id)


@router.patch("/{hall_id}", response_model=HallResponse)
async def update_hall(
    hall_id: UUID,
    data: HallUpdate,
    user: User = Depends(require_company_admin),
    scope: FinanceScope = Depends(get_company_finance_scope),
    db: AsyncSession = Depends(get_db),
):
    return await HallService(db).update(scope.tenant_id, hall_id, data)


@router.delete("/{hall_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_hall(
    hall_id: UUID,
    user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    await HallService(db).delete(user.company_id, hall_id)


@router.get("/{hall_id}/tables", response_model=list[TableResponse])
async def list_tables(
    hall_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await HallService(db).list_tables(user.company_id, hall_id)


@router.post("/{hall_id}/tables", response_model=TableResponse, status_code=status.HTTP_201_CREATED)
async def create_table(
    hall_id: UUID,
    data: TableCreate,
    user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    return await HallService(db).create_table(user.company_id, hall_id, data)


@router.patch("/{hall_id}/tables/{table_id}", response_model=TableResponse)
async def update_table(
    hall_id: UUID,
    table_id: UUID,
    data: TableUpdate,
    user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    return await HallService(db).update_table(user.company_id, hall_id, table_id, data)


@router.delete("/{hall_id}/tables/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_table(
    hall_id: UUID,
    table_id: UUID,
    user: User = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    await HallService(db).delete_table(user.company_id, hall_id, table_id)


@router.get("/branch/{branch_id}/tables", response_model=list[TableResponse])
async def branch_tables(
    branch_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All active tables in a branch (for waiter table picker)."""
    return await HallService(db).branch_tables(user.company_id, branch_id)
