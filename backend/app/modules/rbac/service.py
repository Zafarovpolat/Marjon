from __future__ import annotations
from uuid import UUID
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.auth.models import User
from app.modules.companies.models import Branch
from app.modules.rbac.constants import (
    APP_COMPANY_ROLE_SLUGS,
    COMPANY_ROLE_SLUGS,
    OWNER_ASSIGNABLE_ROLE_SLUGS,
)
from app.modules.rbac.models import Role, Permission, UserRole
from app.modules.rbac.permissions import DEFAULT_ROLE_PERMISSIONS, sync_role_permissions
from app.modules.rbac.repository import RoleRepository, PermissionRepository, UserRoleRepository
from app.modules.rbac.schemas import RoleCreate, UserRoleAssign
from app.shared.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.shared.tenant_scope import require_company_resource


class RBACService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.role_repo = RoleRepository(db)
        self.perm_repo = PermissionRepository(db)
        self.user_role_repo = UserRoleRepository(db)

    async def create_role(self, company_id: UUID, data: RoleCreate) -> Role:
        raise ForbiddenError(
            "Custom role definitions are deferred until the operational RBAC wave"
        )

    async def get_or_create_company_role(
        self, company_id: UUID, slug: str, name: str | None = None
    ) -> Role:
        """BE-05: single source of truth for company-staff role lookup used
        by AuthService.create_company_user/update_company_user. Rejects any
        slug outside the canonical allowlist instead of silently creating a
        fresh, permission-less Role row for it, and attaches that slug's
        default permission set the first time the role is created for this
        company (see permissions.DEFAULT_ROLE_PERMISSIONS)."""
        if slug not in COMPANY_ROLE_SLUGS:
            raise ValidationError(
                f"Unknown role_slug '{slug}'. Allowed: {', '.join(sorted(COMPANY_ROLE_SLUGS))}"
            )
        role = await self.role_repo.get_by_slug(slug, company_id)
        if role is None:
            role = Role(
                company_id=company_id,
                slug=slug,
                name=name or slug.replace("_", " ").title(),
                is_system=False,
            )
            self.db.add(role)
            await self.db.flush()
            await sync_role_permissions(self.db, role)
        return role

    async def list_roles(self, company_id: UUID) -> list[Role]:
        return list((await self.db.execute(
            select(Role).where(
                Role.company_id == company_id,
                Role.is_system.is_(False),
                Role.slug.in_(COMPANY_ROLE_SLUGS),
            )
        )).scalars().all())

    async def assign_role(
        self, company_id: UUID, actor_user_id: UUID, data: UserRoleAssign
    ) -> UserRole:
        if data.user_id == actor_user_id:
            raise ForbiddenError("Self role changes are not allowed")
        target = await require_company_resource(
            self.db, User, data.user_id, company_id, detail="User not found"
        )
        if target is None or target.is_superadmin:
            raise NotFoundError("User not found")
        role = (
            await self.db.execute(
                select(Role).where(
                    Role.id == data.role_id,
                    Role.company_id == company_id,
                    Role.is_system.is_(False),
                    Role.slug.in_(OWNER_ASSIGNABLE_ROLE_SLUGS),
                )
            )
        ).scalar_one_or_none()
        if role is None:
            raise NotFoundError("Role not found")
        await require_company_resource(
            self.db, Branch, data.branch_id, company_id, detail="Branch not found"
        )
        raise ForbiddenError(
            "Direct role assignment is deferred; use the guarded company-user contract"
        )

    async def list_permissions(self) -> list[Permission]:
        raise ForbiddenError(
            "Permission catalog management is deferred until the operational RBAC wave"
        )

    async def _get_scoped_role(self, role_id: UUID, company_id: UUID | None) -> Role:
        role = (
            await self.db.execute(
                select(Role).where(
                    Role.id == role_id,
                    or_(
                        Role.company_id == company_id,
                        and_(Role.is_system.is_(True), Role.company_id.is_(None)),
                    ),
                )
            )
        ).scalar_one_or_none()
        if role is None:
            raise NotFoundError("Role not found")
        return role

    async def assign_permission(self, role_id: UUID, permission_id: UUID, company_id: UUID | None) -> None:
        raise ForbiddenError(
            "Permission assignment is deferred until the operational RBAC wave"
        )

    async def revoke_permission(self, role_id: UUID, permission_id: UUID, company_id: UUID | None) -> None:
        raise ForbiddenError(
            "Permission assignment is deferred until the operational RBAC wave"
        )

    async def check_permission(
        self, user_id: UUID, permission: str, company_id: UUID
    ) -> bool:
        """Check if user has a permission string like 'pos:orders:create'."""
        parts = permission.split(":")
        if len(parts) < 2:
            return False
        module, action = parts[0], ":".join(parts[1:])

        roles = list((await self.db.execute(
            select(Role)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user_id)
        )).scalars().all())
        if (
            len(roles) != 1
            or roles[0].company_id != company_id
            or roles[0].is_system
            or roles[0].slug not in APP_COMPANY_ROLE_SLUGS
        ):
            return False
        if (
            roles[0].slug == "owner"
            and permission not in DEFAULT_ROLE_PERMISSIONS["owner"]
        ):
            # The frozen OWNER ceiling is authoritative even if a legacy DB
            # still contains pre-BI-06 wildcard links.
            return False
        perms = await self.user_role_repo.get_role_permissions(roles[0].id)
        return any(
            perm.module == module and perm.action == action for perm in perms
        )

    async def get_user_permissions(self, user_id: UUID, company_id: UUID) -> list[str]:
        roles = list((await self.db.execute(
            select(Role)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user_id)
        )).scalars().all())
        if (
            len(roles) != 1
            or roles[0].company_id != company_id
            or roles[0].is_system
            or roles[0].slug not in APP_COMPANY_ROLE_SLUGS
        ):
            return []
        permissions: set[str] = set()
        perms = await self.user_role_repo.get_role_permissions(roles[0].id)
        owner_ceiling = set(DEFAULT_ROLE_PERMISSIONS["owner"])
        for perm in perms:
            value = f"{perm.module}:{perm.action}"
            if roles[0].slug != "owner" or value in owner_ceiling:
                permissions.add(value)
        return list(permissions)
