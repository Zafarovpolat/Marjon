from __future__ import annotations
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.finance import models, schemas
from app.modules.finance.service import TransactionService
from app.modules.organizations.dependencies import get_org_scope
from app.modules.organizations.models import Organization
from app.shared.admin_crud import CRUDService, OrgScope, crud_router
from app.shared.pagination import Page, PageParams

router = APIRouter(prefix="/finance", tags=["finance"])

router.include_router(crud_router(
    prefix="/payment-types", tags=["finance"],
    model=models.PaymentType,
    create_schema=schemas.PaymentTypeCreate,
    update_schema=schemas.PaymentTypeUpdate,
    response_schema=schemas.PaymentTypeResponse,
    search_fields=("name",),
    filter_fields=("status", "type"),
    default_sort="sort",
))

router.include_router(crud_router(
    prefix="/transaction-categories", tags=["finance"],
    model=models.TransactionCategory,
    create_schema=schemas.TransactionCategoryCreate,
    update_schema=schemas.TransactionCategoryUpdate,
    response_schema=schemas.TransactionCategoryResponse,
    search_fields=("name",),
    filter_fields=("status", "kind", "parent_id"),
    default_sort="name",
))

router.include_router(crud_router(
    prefix="/finance-templates", tags=["finance"],
    model=models.FinanceTemplate,
    create_schema=schemas.FinanceTemplateCreate,
    update_schema=schemas.FinanceTemplateCreate,
    response_schema=schemas.FinanceTemplateResponse,
    search_fields=("name",),
    default_sort="name",
))


# ── Контрагенты ──────────────────────────────────────────────────────────────
counterparties = crud_router(
    prefix="/counterparties", tags=["finance"],
    model=models.Counterparty,
    create_schema=schemas.CounterpartyCreate,
    update_schema=schemas.CounterpartyUpdate,
    response_schema=schemas.CounterpartyResponse,
    search_fields=("full_name", "phone"),
    filter_fields=("type",),
    default_sort="full_name",
)


@counterparties.get("/{counterparty_id}/transactions",
                    response_model=Page[schemas.TransactionResponse],
                    summary="Транзакции контрагента")
async def counterparty_transactions(
    counterparty_id: UUID,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    params = PageParams(page=page, size=size)
    items, total = await TransactionService(db).list(
        params,
        raw_filters={"counterparty_id": str(counterparty_id)},
        date_from=date_from, date_to=date_to, date_field="date",
        default_sort="-date",
    )
    rows = [
        await _transaction_response(db, item, ((page - 1) * size) + index)
        for index, item in enumerate(items, start=1)
    ]
    return Page.create(rows, total, params)


router.include_router(counterparties)


# ── Транзакции ───────────────────────────────────────────────────────────────
transactions = APIRouter(prefix="/transactions", tags=["finance"])

TX_FILTERS = ("direction", "payment_type_id", "counterparty_id", "category_id", "organization_id")


async def _transaction_response(db: AsyncSession, tx: models.FinTransaction, id_num: int | None = None) -> schemas.TransactionResponse:
    payload = schemas.TransactionResponse.model_validate(tx).model_dump()
    payment_type = await db.get(models.PaymentType, tx.payment_type_id) if tx.payment_type_id else None
    counterparty = await db.get(models.Counterparty, tx.counterparty_id) if tx.counterparty_id else None
    category = await db.get(models.TransactionCategory, tx.category_id) if tx.category_id else None
    organization = await db.get(Organization, tx.organization_id) if tx.organization_id else None

    payment_type_name = payment_type.name if payment_type else None
    counterparty_name = counterparty.full_name if counterparty else None
    category_name = category.name if category else None

    payload.update({
        "payment_type_name": payment_type_name,
        "payment_type": payment_type_name,
        "counterparty_name": counterparty_name,
        "category_name": category_name,
        "category": category_name,
        "organization_name": organization.name if organization else None,
        "status": "PAID",
        "payment_for": category_name,
        "id_num": id_num,
    })
    return schemas.TransactionResponse.model_validate(payload)


@transactions.get("", response_model=Page[schemas.TransactionResponse],
                  description=f"Фильтры по полям: {', '.join(TX_FILTERS)}")
async def list_transactions(
    request: Request,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    sort: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    user: User = Depends(get_current_user),
    org_scope: OrgScope = Depends(get_org_scope),
    db: AsyncSession = Depends(get_db),
):
    params = PageParams(page=page, size=size)
    raw_filters = {f: request.query_params[f] for f in TX_FILTERS if f in request.query_params}
    items, total = await TransactionService(db).list(
        params, sort=sort, default_sort="-date",
        raw_filters=raw_filters,
        date_from=date_from, date_to=date_to, date_field="date",
        org_scope=org_scope, org_field="organization_id",
    )
    rows = [
        await _transaction_response(db, item, ((page - 1) * size) + index)
        for index, item in enumerate(items, start=1)
    ]
    return Page.create(rows, total, params)


@transactions.post("", response_model=schemas.TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    data: schemas.TransactionCreate,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await TransactionService(db).create_transaction(data, user.id, idempotency_key)


@transactions.post("/pay", response_model=list[schemas.TransactionResponse],
                   status_code=status.HTTP_201_CREATED,
                   summary="Разбивка оплаты долга (debt-payment-split)")
async def pay(
    data: schemas.PayRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await TransactionService(db).pay(data, user.id, idempotency_key)


@transactions.get("/{tx_id}", response_model=schemas.TransactionResponse)
async def get_transaction(tx_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await TransactionService(db).get(tx_id)


@transactions.patch("/{tx_id}", response_model=schemas.TransactionResponse)
async def update_transaction(tx_id: UUID, data: schemas.TransactionUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await TransactionService(db).update_transaction(tx_id, data, user.id)


@transactions.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(tx_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await TransactionService(db).delete_transaction(tx_id, user.id)


router.include_router(transactions)


# ── История изменений сумм (только чтение) ──────────────────────────────────
history = APIRouter(prefix="/finance-history", tags=["finance"])


@history.get("", response_model=Page[schemas.FinanceHistoryResponse])
async def list_finance_history(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    ref_id: UUID | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    params = PageParams(page=page, size=size)
    raw_filters = {"ref_id": str(ref_id)} if ref_id else {}
    items, total = await CRUDService(models.FinanceHistory, db).list(
        params, raw_filters=raw_filters,
        date_from=date_from, date_to=date_to, date_field="date",
        default_sort="-date",
    )
    return Page.create([schemas.FinanceHistoryResponse.model_validate(i) for i in items], total, params)


router.include_router(history)
