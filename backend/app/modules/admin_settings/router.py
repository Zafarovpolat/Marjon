from __future__ import annotations
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.modules.admin_settings import models, schemas
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.organizations.dependencies import get_org_scope
from app.shared.admin_crud import CRUDService, OrgScope, crud_router
from app.shared.pagination import Page, PageParams

router = APIRouter()

router.include_router(crud_router(
    prefix="/languages", tags=["settings"],
    model=models.Language,
    create_schema=schemas.LanguageCreate,
    update_schema=schemas.LanguageUpdate,
    response_schema=schemas.LanguageResponse,
    search_fields=("name", "code"),
    filter_fields=("status",),
    default_sort="name",
))

# ── Фоны десктопа: привязка к организации (company_id) + активный фон ─────────
image_bg = APIRouter(prefix="/image-backgrounds", tags=["settings"])


@image_bg.get("", response_model=Page[schemas.ImageBackgroundResponse], summary="List backgrounds (org-scoped)")
async def list_backgrounds(
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=200),
    search: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    params = PageParams(page=page, size=size)
    items, total = await CRUDService(models.ImageBackground, db).list(
        params, search=search, search_fields=("name",),
        default_sort="sort_order", org_scope=[user.company_id], org_field="company_id",
    )
    return Page.create([schemas.ImageBackgroundResponse.model_validate(i) for i in items], total, params)


@image_bg.get("/active", response_model=schemas.ImageBackgroundResponse | None,
              summary="Активный фон десктопа для организации (для терминала)")
async def active_background(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base = select(models.ImageBackground).where(models.ImageBackground.company_id == user.company_id)
    obj = (await db.execute(
        base.where(models.ImageBackground.is_active.is_(True)).order_by(models.ImageBackground.updated_at.desc())
    )).scalars().first()
    if obj is None:  # активный не выбран — берём самый свежий
        obj = (await db.execute(base.order_by(models.ImageBackground.updated_at.desc()))).scalars().first()
    return obj


@image_bg.post("", response_model=schemas.ImageBackgroundResponse, status_code=status.HTTP_201_CREATED)
async def create_background(
    data: schemas.ImageBackgroundCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await CRUDService(models.ImageBackground, db).create(data, company_id=user.company_id)


@image_bg.patch("/{item_id}", response_model=schemas.ImageBackgroundResponse)
async def update_background(
    item_id: UUID,
    data: schemas.ImageBackgroundUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await CRUDService(models.ImageBackground, db).update(item_id, data)


@image_bg.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_background(
    item_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await CRUDService(models.ImageBackground, db).delete(item_id)


router.include_router(image_bg)

router.include_router(crud_router(
    prefix="/store-versions", tags=["settings"],
    model=models.StoreVersion,
    create_schema=schemas.StoreVersionCreate,
    update_schema=schemas.StoreVersionUpdate,
    response_schema=schemas.StoreVersionResponse,
    search_fields=("title", "version"),
    filter_fields=("platform",),
))


# ── Переводы: CRUD + export/import ───────────────────────────────────────────
translations = APIRouter(prefix="/translations", tags=["settings"])


@translations.get("/export", summary="Экспорт словаря переводов",
                  response_model=dict[str, dict[str, str]])
async def export_translations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items = (await db.execute(select(models.Translation))).scalars().all()
    return {t.key: (t.values or {}) for t in items}


@translations.post("/import", response_model=schemas.TranslationImportResult,
                   summary="Импорт словаря переводов (key -> {lang: value})")
async def import_translations(
    data: dict[str, dict[str, str]],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    created = updated = 0
    for key, values in data.items():
        existing = (
            await db.execute(select(models.Translation).where(models.Translation.key == key))
        ).scalars().first()
        if existing:
            existing.values = {**(existing.values or {}), **values}
            updated += 1
        else:
            db.add(models.Translation(key=key, values=values))
            created += 1
    await db.commit()
    return schemas.TranslationImportResult(created=created, updated=updated)


crud_router(
    prefix="/translations", tags=["settings"],
    model=models.Translation,
    create_schema=schemas.TranslationCreate,
    update_schema=schemas.TranslationUpdate,
    response_schema=schemas.TranslationResponse,
    search_fields=("key",),
    filter_fields=("type",),
    default_sort="key",
    router=translations,
)
router.include_router(translations)


# ── Логи пользователей ───────────────────────────────────────────────────────
user_logs = APIRouter(prefix="/user-logs", tags=["settings"])

LOG_FILTERS = ("device_id", "organization_id", "name")


@user_logs.get("", response_model=Page[schemas.UserLogResponse],
               description=f"Фильтры по полям: {', '.join(LOG_FILTERS)}")
async def list_user_logs(
    request: Request,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    search: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    user: User = Depends(get_current_user),
    org_scope: OrgScope = Depends(get_org_scope),
    db: AsyncSession = Depends(get_db),
):
    params = PageParams(page=page, size=size)
    raw_filters = {f: request.query_params[f] for f in LOG_FILTERS if f in request.query_params}
    items, total = await CRUDService(models.UserLog, db).list(
        params, search=search, search_fields=("name", "device_name"),
        raw_filters=raw_filters, date_from=date_from, date_to=date_to,
        date_field="date", default_sort="-date",
        org_scope=org_scope, org_field="organization_id",
    )
    return Page.create([schemas.UserLogResponse.model_validate(i) for i in items], total, params)


@user_logs.post("", response_model=schemas.UserLogResponse, status_code=status.HTTP_201_CREATED,
                summary="Запись действия из приложения")
async def create_user_log(
    data: schemas.UserLogCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    return await CRUDService(models.UserLog, db).create(data, ip_address=client_ip)


router.include_router(user_logs)
