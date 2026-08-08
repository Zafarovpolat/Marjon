from __future__ import annotations

from collections.abc import Iterable
from typing import Any, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.exceptions import NotFoundError


M = TypeVar("M")


async def require_company_resource(
    db: AsyncSession,
    model: type[M],
    resource_id: UUID | None,
    company_id: UUID,
    *,
    detail: str | None = None,
) -> M | None:
    """Resolve a direct-tenant foreign key without ever loading another tenant's row."""
    if resource_id is None:
        return None
    resource = (
        await db.execute(
            select(model).where(
                model.id == resource_id,
                model.company_id == company_id,
            )
        )
    ).scalar_one_or_none()
    if resource is None:
        raise NotFoundError(detail or f"{model.__name__} not found")
    return resource


async def require_company_resource_ids(
    db: AsyncSession,
    model: type[Any],
    resource_ids: Iterable[UUID | None],
    company_id: UUID,
    *,
    detail: str | None = None,
) -> None:
    """Validate a set of direct-tenant foreign keys with one scoped query."""
    requested = {resource_id for resource_id in resource_ids if resource_id is not None}
    if not requested:
        return
    found = set(
        (
            await db.execute(
                select(model.id).where(
                    model.id.in_(requested),
                    model.company_id == company_id,
                )
            )
        ).scalars()
    )
    if found != requested:
        raise NotFoundError(detail or f"{model.__name__} not found")
