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
from app.modules.rbac.models import Role, Permission, RolePermission, UserRole
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
        # Lazily create any of the owner-assignable roles this company has
        # never had a staff member on yet (get_or_create_company_role is a
        # no-op for ones that already exist) — otherwise a company with, say,
        # no courier yet would show a permissions screen missing the
        # "courier" row entirely.
        for slug in OWNER_ASSIGNABLE_ROLE_SLUGS:
            await self.get_or_create_company_role(company_id, slug)
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
        """Full seeded permission catalog — building block for the owner's
        per-role permission editor. Read-only, no company scoping needed:
        the catalog itself is global, only which permissions a given
        company's role HAS is tenant-scoped (see get_role_permissions)."""
        return await self.perm_repo.get_all()

    async def get_role_permissions(self, role_id: UUID, company_id: UUID | None) -> list[Permission]:
        role = await self._get_scoped_role(role_id, company_id)
        return await self.user_role_repo.get_role_permissions(role.id)

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

    def _assert_customizable_role(self, role: Role) -> None:
        """Only the 7 operational company roles can have their permission
        set edited by the owner. "owner" stays frozen (reconciled back to
        its exact DEFAULT_ROLE_PERMISSIONS set on every boot — see
        reconcile_frozen_owner_permissions — so letting it be edited here
        would silently undo itself); "admin" is a legacy ambiguous slug
        that's deliberately kept at zero permissions; system roles (platform
        superadmin/hq_admin) aren't a company's to touch at all."""
        if role.is_system or role.company_id is None:
            raise ForbiddenError("System roles cannot be customized")
        if role.slug not in OWNER_ASSIGNABLE_ROLE_SLUGS:
            raise ForbiddenError(f"The '{role.slug}' role's permissions cannot be customized")

    async def _assert_within_owner_ceiling(self, permission: Permission) -> None:
        """An owner can delegate only what they themselves have — never grant
        a staff role a capability the owner's own frozen permission set
        doesn't include (mirrors the existing OWNER_ASSIGNABLE_ROLE_SLUGS
        delegation-ceiling principle, applied to individual permissions)."""
        value = f"{permission.module}:{permission.action}"
        if value not in DEFAULT_ROLE_PERMISSIONS["owner"]:
            raise ForbiddenError(
                f"'{value}' exceeds the owner's own permission ceiling and cannot be delegated"
            )

    async def assign_permission(self, role_id: UUID, permission_id: UUID, company_id: UUID | None) -> None:
        role = await self._get_scoped_role(role_id, company_id)
        self._assert_customizable_role(role)
        permission = await self.db.get(Permission, permission_id)
        if permission is None:
            raise NotFoundError("Permission not found")
        await self._assert_within_owner_ceiling(permission)
        existing = (await self.db.execute(
            select(RolePermission).where(
                RolePermission.role_id == role.id,
                RolePermission.permission_id == permission.id,
            )
        )).scalar_one_or_none()
        if existing is not None:
            return  # idempotent — already granted
        self.db.add(RolePermission(role_id=role.id, permission_id=permission.id))
        await self.db.commit()

    async def revoke_permission(self, role_id: UUID, permission_id: UUID, company_id: UUID | None) -> None:
        role = await self._get_scoped_role(role_id, company_id)
        self._assert_customizable_role(role)
        link = (await self.db.execute(
            select(RolePermission).where(
                RolePermission.role_id == role.id,
                RolePermission.permission_id == permission_id,
            )
        )).scalar_one_or_none()
        if link is None:
            return  # idempotent — already not granted
        await self.db.delete(link)
        await self.db.commit()

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
