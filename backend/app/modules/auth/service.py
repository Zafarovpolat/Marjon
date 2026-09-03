from __future__ import annotations
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.repository import RefreshTokenRepository, UserRepository
from app.modules.auth.security import (
    create_access_token,
    create_refresh_token,
    get_refresh_token_auth_scope,
    hash_password,
    hash_pin,
    hash_refresh_token,
    terminal_email,
    verify_password,
)
from app.modules.companies.models import Branch, Company
from app.modules.rbac.constants import OWNER_ASSIGNABLE_ROLE_SLUGS
from app.modules.rbac.models import Role, UserRole
from app.modules.rbac.repository import RoleRepository
from app.shared.exceptions import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError
from app.shared.phone import normalize_branch_login

# Права-эскалаторы: не-админ (кассир со спец-правом) не может ни выдать их
# другому, ни присвоить себе — иначе «менеджер» бесконтрольно плодил бы «менеджеров».
_ESCALATION_PERMISSION_KEYS = ("can_manage_staff", "can_manage_warehouse")


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

    async def login_admin(self, email: str, password: str) -> tuple[User, str, str]:
        """BE-01: вход в HQ-админку. Выдаёт токен со scope="hq_admin" только
        суперадмину; обычный /auth/login такой scope не выдаёт (см. security.py)."""
        import logging
        log = logging.getLogger(__name__)
        user = await self.user_repo.get_by_login(self._normalize_identifier(email))
        if not user or not verify_password(password, user.password_hash):
            log.warning("Admin login failed: bad credentials — login=%s", email)
            raise UnauthorizedError("Invalid credentials")
        if not user.is_active:
            raise UnauthorizedError("Account is inactive")
        if not user.is_superadmin:
            log.warning("Admin login denied: not superadmin — user_id=%s", user.id)
            raise ForbiddenError("HQ admin access required")
        access_token = create_access_token(user.id, user.company_id, auth_scope="hq_admin")
        refresh_token = create_refresh_token(auth_scope="hq_admin")
        await self._save_refresh_token(user.id, refresh_token)
        return user, access_token, refresh_token

    async def login_by_pin(
        self, company_id: UUID, pin: str, user_id: UUID | None = None
    ) -> tuple[User, str, str]:
        """Быстрый вход сотрудника по PIN в рамках его организации.
        user_id — сотрудник, выбранный на кассе; сверяем PIN только с ним."""
        import logging
        log = logging.getLogger(__name__)

        user = await self.user_repo.get_by_pin(company_id, pin, user_id)
        if not user:
            log.warning("PIN login failed: no active user for pin in company=%s", company_id)
            raise UnauthorizedError("Invalid PIN")

        access_token = create_access_token(user.id, user.company_id)
        refresh_token = create_refresh_token()
        await self._save_refresh_token(user.id, refresh_token)

        return user, access_token, refresh_token

    async def _get_or_create_terminal_user(self, branch: Branch) -> User:
        """Служебный пользователь-терминал филиала (6.2). Один на филиал.
        Не входит по паролю/PIN (пароль случайный, pin_hash пуст) и скрыт из
        списков персонала по маске e-mail. Несёт company_id + branch_id."""
        email = terminal_email(branch.id)
        user = await self.user_repo.get_by_email(email)
        if user:
            changed = False
            if user.branch_id != branch.id:
                user.branch_id = branch.id
                changed = True
            if user.company_id != branch.company_id:
                user.company_id = branch.company_id
                changed = True
            if not user.is_active:
                user.is_active = True
                changed = True
            if changed:
                await self.db.commit()
                await self.db.refresh(user)
            return user

        import secrets as _secrets
        user = User(
            company_id=branch.company_id,
            email=email,
            name=branch.name,
            branch_id=branch.id,
            is_active=True,
            # Пароль случайный: вход в этот аккаунт возможен только через branch-login
            password_hash=hash_password(_secrets.token_urlsafe(32)),
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def login_by_branch(self, login: str, password: str) -> tuple[User, Branch, Company, str, str]:
        """6.2 — вход на кассе одним шагом по логину/паролю филиала.
        Логин филиала определяет и организацию, и филиал. Возвращает служебный
        токен, привязанный к company+branch (через терминального пользователя)."""
        import logging
        log = logging.getLogger(__name__)

        # 6.2 — филиалы логинятся по номеру телефона: приводим к каноничному
        # +998XXXXXXXXX так же, как на записи (BranchService/seed), чтобы сравнение
        # по глобально уникальному индексу ix_branches_login было консистентным.
        norm = normalize_branch_login(login)
        if not norm:
            raise UnauthorizedError("Invalid credentials")

        branch = (await self.db.execute(
            select(Branch).where(func.lower(Branch.login) == norm.lower())
        )).scalar_one_or_none()

        if not branch or not branch.password_hash:
            log.warning("Branch login failed: no branch for login=%s", login)
            raise UnauthorizedError("Invalid credentials")
        if not verify_password(password, branch.password_hash):
            log.warning("Branch login failed: wrong password for login=%s", login)
            raise UnauthorizedError("Invalid credentials")
        if not branch.is_active:
            raise UnauthorizedError("Branch is inactive")

        terminal = await self._get_or_create_terminal_user(branch)
        company = await self.db.get(Company, branch.company_id)

        access_token = create_access_token(terminal.id, terminal.company_id)
        refresh_token = create_refresh_token()
        await self._save_refresh_token(terminal.id, refresh_token)

        return terminal, branch, company, access_token, refresh_token

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

    async def _user_has_admin_role(self, company_id: UUID, user_id: UUID) -> bool:
        """Есть ли у пользователя роль owner/admin в этой компании."""
        res = await self.db.execute(
            select(Role.slug)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(
                UserRole.user_id == user_id,
                Role.company_id == company_id,
                Role.slug.in_(("owner", "admin")),
            )
        )
        return res.scalars().first() is not None

    @staticmethod
    def _reject_escalation_permissions(permissions: dict | None) -> None:
        """Не-админ не может выставить can_manage_* в true (§анти-эскалация)."""
        if isinstance(permissions, dict):
            for key in _ESCALATION_PERMISSION_KEYS:
                if permissions.get(key) is True:
                    raise ForbiddenError(
                        "Недостаточно прав для выдачи административных полномочий"
                    )

    async def create_company_user(
        self,
        company_id: UUID | None,
        email: str | None,
        password: str | None,
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
        actor_is_admin: bool = True,
    ) -> tuple[User, Role]:
        if not company_id:
            raise ValidationError("Current user is not assigned to a company")

        # Анти-эскалация: не-админ (кассир со спец-правом) создаёт только рядовые
        # роли и не может выдать административные права. Владелец/админ — без ограничений.
        if not actor_is_admin:
            if role_slug not in OWNER_ASSIGNABLE_ROLE_SLUGS:
                raise ForbiddenError("Недостаточно прав для назначения этой роли")
            self._reject_escalation_permissions(permissions)

        # PIN-вход не требует email/пароля — синтезируем служебные (по образцу
        # терминального пользователя). Пароль/PIN нигде наружу не возвращаем.
        if not email:
            company = await self.db.get(Company, company_id)
            slug = (company.slug if company and company.slug else "staff")
            email = f"staff.{uuid4().hex[:10]}@{slug}.local"
        if not password:
            password = secrets.token_urlsafe(24)

        if await self.user_repo.get_by_email(email):
            raise ConflictError("Email already registered")

        role = await self._ensure_role(company_id, role_slug, role_name)

        # Одинаковый PIN у двух сотрудников делает вход по PIN неоднозначным
        # (кассир мог получить сессию владельца), поэтому такой PIN не принимаем.
        if pin_code and await self.user_repo.pin_taken_by_other(company_id, pin_code):
            raise ConflictError("PIN уже используется другим сотрудником")

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

        # Привязываем роль к филиалу так же, как и сам аккаунт (User.branch_id),
        # иначе фильтр staff-users по branch_id не найдёт сотрудника (branch_id останется NULL).
        self.db.add(UserRole(user_id=user.id, role_id=role.id, branch_id=branch_id))
        await self.db.commit()
        await self.db.refresh(user)
        await self.db.refresh(role)

        return user, role

    async def update_company_user(
        self,
        company_id: UUID | None,
        user_id: UUID,
        data: dict,
        *,
        actor_is_admin: bool = True,
        actor_id: UUID | None = None,
    ) -> User:
        if not company_id:
            raise ValidationError("Current user is not assigned to a company")
        user = (await self.db.execute(
            select(User).where(User.id == user_id, User.company_id == company_id)
        )).scalar_one_or_none()
        if not user:
            raise NotFoundError("User not found")

        # Анти-эскалация: не-админ (кассир со спец-правом) не правит ни себя,
        # ни владельца/админа, не переводит сотрудника в админскую роль и не
        # раздаёт can_manage_* — иначе «менеджер» бесконтрольно плодил бы «менеджеров».
        if not actor_is_admin:
            if actor_id is not None and actor_id == user.id:
                raise ForbiddenError("Нельзя редактировать собственную учётную запись")
            if await self._user_has_admin_role(company_id, user.id):
                raise ForbiddenError("Недостаточно прав для правки этого сотрудника")
            if data.get("role_slug") and data["role_slug"] not in OWNER_ASSIGNABLE_ROLE_SLUGS:
                raise ForbiddenError("Недостаточно прав для назначения этой роли")
            self._reject_escalation_permissions(data.get("permissions"))

        # Скалярные поля
        for f in ("phone", "name", "printer_ip", "nfc_id", "branch_id", "is_active", "permissions"):
            if data.get(f) is not None:
                setattr(user, f, data[f])
        # PIN — только в хеш, plaintext не сохраняем
        if data.get("pin_code") is not None:
            if data["pin_code"] and await self.user_repo.pin_taken_by_other(
                company_id, data["pin_code"], exclude_user_id=user.id
            ):
                raise ConflictError("PIN уже используется другим сотрудником")
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

        # Сохраняем scope сессии при ротации: hq_admin остаётся hq_admin только
        # если это по-прежнему суперадмин; иначе — обычная app-сессия. Сам маркер
        # scope не доверенный — он уже подтверждён совпадением хеша строки токена.
        requested_scope = get_refresh_token_auth_scope(refresh_token)
        auth_scope = "hq_admin" if requested_scope == "hq_admin" and user.is_superadmin else "app"
        new_access = create_access_token(user.id, user.company_id, auth_scope=auth_scope)
        new_refresh = create_refresh_token(auth_scope=auth_scope)
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
