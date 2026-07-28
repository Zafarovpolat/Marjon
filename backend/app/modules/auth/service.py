from __future__ import annotations
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.repository import RefreshTokenRepository, UserRepository
from app.modules.auth.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_pin,
    hash_refresh_token,
    verify_password,
)
from app.modules.companies.models import Company
from app.modules.rbac.models import Role, UserRole
from app.modules.rbac.repository import RoleRepository
from app.shared.exceptions import ConflictError, NotFoundError, UnauthorizedError, ValidationError


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = RefreshTokenRepository(db)

    async def register(
        self, company_name: str, company_slug: str, email: str, password: str
    ) -> tuple[User, str, str]:
        if await self.user_repo.get_by_email(email):
            raise ConflictError("Email already registered")

        company = Company(name=company_name, slug=company_slug)
        self.db.add(company)
        await self.db.flush()

        user = User(
            company_id=company.id,
            email=email,
            password_hash=hash_password(password),
        )
        self.db.add(user)
        await self.db.flush()

        owner_role = Role(
            company_id=company.id,
            slug="owner",
            name="Owner",
            is_system=False,
        )
        self.db.add(owner_role)
        await self.db.flush()

        self.db.add(UserRole(user_id=user.id, role_id=owner_role.id))
        await self.db.commit()
        await self.db.refresh(user)

        access_token = create_access_token(user.id, company.id)
        refresh_token = create_refresh_token()
        await self._save_refresh_token(user.id, refresh_token)

        return user, access_token, refresh_token

    @staticmethod
    def _normalize_identifier(identifier: str) -> str:
        import re
        stripped = re.sub(r"[\s\-().]", "", identifier)
        if stripped.startswith("+"):
            return stripped
        if re.match(r"^\d+$", stripped):
            if len(stripped) == 9:          # local UZ: 901234567 → +998901234567
                return "+998" + stripped
            if len(stripped) == 12 and stripped.startswith("998"):  # 998901234567
                return "+" + stripped
            return stripped
        return identifier  # email or username — return as-is

    async def login(self, email: str, password: str) -> tuple[User, str, str]:
        import logging
        log = logging.getLogger(__name__)

        user = await self.user_repo.get_by_login(self._normalize_identifier(email))
        if not user:
            log.warning("Login failed: user not found — login=%s", email)
            raise UnauthorizedError("Invalid credentials")

        if not verify_password(password, user.password_hash):
            log.warning("Login failed: wrong password — email=%s", email)
            raise UnauthorizedError("Invalid credentials")

        if not user.is_active:
            raise UnauthorizedError("Account is inactive")

        access_token = create_access_token(user.id, user.company_id)
        refresh_token = create_refresh_token()
        await self._save_refresh_token(user.id, refresh_token)

        return user, access_token, refresh_token

    async def login_by_pin(self, company_id: UUID, pin: str) -> tuple[User, str, str]:
        """Быстрый вход сотрудника по PIN в рамках его организации."""
        import logging
        log = logging.getLogger(__name__)

        user = await self.user_repo.get_by_pin(company_id, pin)
        if not user:
            log.warning("PIN login failed: no active user for pin in company=%s", company_id)
            raise UnauthorizedError("Invalid PIN")

        access_token = create_access_token(user.id, user.company_id)
        refresh_token = create_refresh_token()
        await self._save_refresh_token(user.id, refresh_token)

        return user, access_token, refresh_token

    async def _ensure_role(self, company_id: UUID, role_slug: str, role_name: str | None) -> Role:
        role_repo = RoleRepository(self.db)
        role = await role_repo.get_by_slug(role_slug, company_id)
        if not role:
            role = Role(
                company_id=company_id,
                slug=role_slug,
                name=role_name or role_slug.replace("_", " ").title(),
                is_system=False,
            )
            self.db.add(role)
            await self.db.flush()
        return role

    async def create_company_user(
        self,
        company_id: UUID | None,
        email: str,
        password: str,
        role_slug: str,
        role_name: str | None = None,
        phone: str | None = None,
        *,
        name: str | None = None,
        pin_code: str | None = None,
        printer_ip: str | None = None,
        nfc_id: str | None = None,
        branch_id: UUID | None = None,
        is_active: bool | None = None,
        permissions: dict | None = None,
    ) -> tuple[User, Role]:
        if not company_id:
            raise ValidationError("Current user is not assigned to a company")

        if await self.user_repo.get_by_email(email):
            raise ConflictError("Email already registered")

        role = await self._ensure_role(company_id, role_slug, role_name)

        user = User(
            company_id=company_id,
            email=email,
            phone=phone,
            name=name or role_name,
            pin_hash=hash_pin(pin_code) if pin_code else None,
            printer_ip=printer_ip or None,
            nfc_id=nfc_id or None,
            branch_id=branch_id,
            permissions=permissions or {},
            is_active=True if is_active is None else is_active,
            password_hash=hash_password(password),
        )
        self.db.add(user)
        await self.db.flush()

        self.db.add(UserRole(user_id=user.id, role_id=role.id))
        await self.db.commit()
        await self.db.refresh(user)
        await self.db.refresh(role)

        return user, role

    async def update_company_user(self, company_id: UUID | None, user_id: UUID, data: dict) -> User:
        if not company_id:
            raise ValidationError("Current user is not assigned to a company")
        user = (await self.db.execute(
            select(User).where(User.id == user_id, User.company_id == company_id)
        )).scalar_one_or_none()
        if not user:
            raise NotFoundError("User not found")

        # Скалярные поля
        for f in ("phone", "name", "printer_ip", "nfc_id", "branch_id", "is_active", "permissions"):
            if data.get(f) is not None:
                setattr(user, f, data[f])
        # PIN — только в хеш, plaintext не сохраняем
        if data.get("pin_code") is not None:
            user.pin_hash = hash_pin(data["pin_code"]) if data["pin_code"] else None
        if data.get("email"):
            user.email = data["email"]
        if data.get("password"):
            user.password_hash = hash_password(data["password"])

        # Смена роли (заменяем привязку)
        if data.get("role_slug"):
            role = await self._ensure_role(company_id, data["role_slug"], data.get("role_name"))
            await self.db.execute(delete(UserRole).where(UserRole.user_id == user.id))
            self.db.add(UserRole(user_id=user.id, role_id=role.id))

        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def refresh(self, refresh_token: str) -> tuple[str, str]:
        token_hash = hash_refresh_token(refresh_token)
        stored = await self.token_repo.get_by_hash(token_hash)
        if not stored:
            raise UnauthorizedError("Invalid or expired refresh token")

        user = await self.user_repo.get_by_id(stored.user_id)
        if not user or not user.is_active:
            raise UnauthorizedError("User not found or inactive")

        # Rotation: revoke old token and issue new pair
        stored.revoked_at = datetime.now(timezone.utc)
        await self.db.commit()

        new_access = create_access_token(user.id, user.company_id)
        new_refresh = create_refresh_token()
        await self._save_refresh_token(user.id, new_refresh)

        return new_access, new_refresh

    async def logout(self, user_id: UUID) -> None:
        await self.token_repo.revoke_all_for_user(user_id)

    async def _save_refresh_token(self, user_id: UUID, token: str) -> None:
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
        rt = RefreshToken(
            user_id=user_id,
            token_hash=hash_refresh_token(token),
            expires_at=expires_at,
        )
        self.db.add(rt)
        await self.db.commit()
