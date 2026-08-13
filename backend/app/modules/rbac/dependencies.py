"""
RBAC dependency factories for FastAPI routers.

Usage:
    @router.post("/orders", dependencies=[Depends(require_permission("pos:orders:create"))])
"""
from __future__ import annotations
from typing import Callable
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import require_company_app_user
from app.modules.auth.models import User
from app.modules.rbac.service import RBACService
from app.shared.exceptions import ForbiddenError


def require_permission(permission: str) -> Callable:
    """Returns a FastAPI dependency that checks the user has the given permission."""

    async def _check(
        user: User = Depends(require_company_app_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        assert user.company_id is not None
        has = await RBACService(db).check_permission(user.id, permission, user.company_id)
        if not has:
            raise ForbiddenError(f"Permission '{permission}' required")
        return user

    return _check
