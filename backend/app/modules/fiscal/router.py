from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import require_company_app_user, require_web_owner
from app.modules.auth.models import User
from app.modules.fiscal.runtime import FiscalRuntime, get_fiscal_runtime
from app.modules.fiscal.schemas import (
    FiscalReceiptCreate,
    FiscalReceiptResponse,
    FiscalSettingsResponse,
    FiscalSettingsUpdate,
)
from app.modules.fiscal.service import FiscalService

router = APIRouter(prefix="/fiscal", tags=["fiscal"])


@router.post("/receipts", response_model=FiscalReceiptResponse, status_code=status.HTTP_201_CREATED)
async def create_receipt(
    data: FiscalReceiptCreate,
    user: User = Depends(require_company_app_user),
    db: AsyncSession = Depends(get_db),
    runtime: FiscalRuntime = Depends(get_fiscal_runtime),
):
    return await FiscalService(db, runtime).create(user.company_id, data)


@router.get("/receipts", response_model=list[FiscalReceiptResponse])
async def list_receipts(user: User = Depends(require_company_app_user), db: AsyncSession = Depends(get_db)):
    return await FiscalService(db).list(user.company_id)


@router.get("/receipts/{receipt_id}", response_model=FiscalReceiptResponse)
async def get_receipt(receipt_id: UUID, user: User = Depends(require_company_app_user), db: AsyncSession = Depends(get_db)):
    return await FiscalService(db).get(user.company_id, receipt_id)


@router.get("/settings", response_model=FiscalSettingsResponse)
async def get_fiscal_settings(
    user: User = Depends(require_web_owner),
    db: AsyncSession = Depends(get_db),
):
    settings = await FiscalService(db).get_settings(user.company_id)
    if settings is None:
        return FiscalSettingsResponse(
            company_id=user.company_id,
            enabled=False,
            provider=None,
            tin=None,
            credential_ref=None,
        )
    return settings


@router.put("/settings", response_model=FiscalSettingsResponse)
async def save_fiscal_settings(
    data: FiscalSettingsUpdate,
    user: User = Depends(require_web_owner),
    db: AsyncSession = Depends(get_db),
    runtime: FiscalRuntime = Depends(get_fiscal_runtime),
):
    return await FiscalService(db, runtime).save_settings(user.company_id, data)
