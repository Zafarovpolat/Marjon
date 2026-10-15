from __future__ import annotations

from uuid import UUID

from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.dependencies import ensure_company_app_identity, require_web_owner
from app.modules.auth.models import User
from app.modules.nomenclature.models import Unit
from app.modules.nomenclature.schemas import UnitCreate, UnitUpdate
from app.shared.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.shared.pagination import PageParams


def is_hq_session(user: User) -> bool:
    return bool(
        user.is_superadmin
        and getattr(user, "auth_scope", "app") == "hq_admin"
    )


def _read_scope(user: User):
    if is_hq_session(user):
        return None
    if user.company_id is None:
        raise ForbiddenError("Company app identity required")
    return or_(Unit.company_id.is_(None), Unit.company_id == user.company_id)


async def require_units_writer(user: User, db: AsyncSession) -> str:
    if is_hq_session(user):
        return "hq"
    await ensure_company_app_identity(
        user, db, auth_scope=getattr(user, "auth_scope", "app")
    )
    await require_web_owner(current_user=user, db=db)
    return "owner"


class UnitService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(
        self,
        user: User,
        params: PageParams,
        *,
        search: str | None = None,
        sort: str | None = None,
        status: bool | None = None,
    ) -> tuple[list[Unit], int]:
        query = select(Unit)
        scope = _read_scope(user)
        if scope is not None:
            query = query.where(scope)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(Unit.name.ilike(pattern), Unit.short_name.ilike(pattern))
            )
        if status is not None:
            query = query.where(Unit.status == status)

        total = (await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )).scalar_one()
        allowed_sort = {
            "sort": Unit.sort,
            "name": Unit.name,
            "short_name": Unit.short_name,
            "status": Unit.status,
            "created_at": Unit.created_at,
        }
        for token in (sort or "sort").split(","):
            token = token.strip()
            if not token:
                continue
            field = token.lstrip("-")
            column = allowed_sort.get(field)
            if column is None:
                raise ValidationError(f"Unknown sort field: {field}")
            query = query.order_by((desc if token.startswith("-") else asc)(column))
        query = query.offset(params.offset).limit(params.size)
        return list((await self.db.execute(query)).scalars().all()), total

    async def get_visible(self, user: User, unit_id: UUID) -> Unit:
        query = select(Unit).where(Unit.id == unit_id)
        scope = _read_scope(user)
        if scope is not None:
            query = query.where(scope)
        unit = (await self.db.execute(query)).scalar_one_or_none()
        if unit is None:
            raise NotFoundError("Unit not found")
        return unit

    async def create(self, user: User, data: UnitCreate) -> Unit:
        actor = await require_units_writer(user, self.db)
        unit = Unit(
            **data.model_dump(exclude_unset=True),
            company_id=None if actor == "hq" else user.company_id,
        )
        self.db.add(unit)
        await self.db.commit()
        await self.db.refresh(unit)
        return unit

    async def _get_mutable(self, user: User, unit_id: UUID) -> Unit:
        actor = await require_units_writer(user, self.db)
        company_id = None if actor == "hq" else user.company_id
        unit = (await self.db.execute(
            select(Unit).where(Unit.id == unit_id, Unit.company_id == company_id)
        )).scalar_one_or_none()
        if unit is None:
            # Global rows are visible to owners, but remain immutable. Foreign
            # private ids use the same 404 to avoid tenant-existence leakage.
            raise NotFoundError("Unit not found")
        return unit

    async def update(self, user: User, unit_id: UUID, data: UnitUpdate) -> Unit:
        unit = await self._get_mutable(user, unit_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(unit, field, value)
        await self.db.commit()
        await self.db.refresh(unit)
        return unit

    async def delete(self, user: User, unit_id: UUID) -> None:
        unit = await self._get_mutable(user, unit_id)
        await self.db.delete(unit)
        await self.db.commit()
