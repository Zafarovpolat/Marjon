from __future__ import annotations
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.audit.service import AuditService
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
    verify_pin,
)
from app.modules.companies.models import Branch, Company
from app.modules.rbac.constants import COMPANY_ROLE_SLUGS, OWNER_ASSIGNABLE_ROLE_SLUGS
from app.modules.rbac.models import Role, UserRole
from app.modules.rbac.permissions import reconcile_frozen_owner_permissions
from app.modules.rbac.service import RBACService
from app.shared.exceptions import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError
from app.shared.phone import normalize_branch_login

# Права-эскалаторы: не-админ (кассир со спец-правом) не может ни выдать их
# другому, ни присвоить себе — иначе «менеджер» бесконтрольно плодил бы «менеджеров».
_ESCALATION_PERMISSION_KEYS = ("can_manage_staff", "can_manage_warehouse")

# BE-08: троттлинг подбора PIN, независимый от общего rate-limit на
# POST /auth/pin-login — запирается КОНКРЕТНАЯ учётка после серии неверных
# PIN, чтобы нельзя было размазать перебор по многим сотрудникам.
PIN_MAX_ATTEMPTS = 5
PIN_LOCKOUT_MINUTES = 15


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = RefreshTokenRepository(db)

    async def _manageable_company_role_slug(
        self, user_id: UUID, company_id: UUID
    ) -> str:
        """Единственная не-системная роль сотрудника из канонического списка.
        Неоднозначное состояние (нет роли, две роли, чужая компания) — 403:
        такой аккаунт не считается управляемым сотрудником."""
        roles = list((await self.db.execute(
            select(Role)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user_id)
        )).scalars().all())
        if (
            len(roles) != 1
            or roles[0].company_id != company_id
            or roles[0].is_system
            or roles[0].slug not in COMPANY_ROLE_SLUGS
        ):
            raise ForbiddenError("User role state is ambiguous")
        return roles[0].slug

    async def register(
        self, company_name: str, company_slug: str, email: str, password: str
    ) -> tuple[User, str, str]:
        if await self.user_repo.get_by_email(email):
            raise ConflictError("Email already registered")

        company = Company(name=company_name, slug=company_slug)
        self.db.add(company)
        await self.db.flush()

        # Онбординг: у компании сразу есть один филиал, чтобы места, принтеры и
        # прочее могли к нему привязаться (Настройки → Место сам подхватывает
        # единственный филиал). Мультифилиальные компании не ломаются.
        self.db.add(Branch(company_id=company.id, name="Основной филиал"))
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
        await reconcile_frozen_owner_permissions(self.db, owner_role)

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
        assignable_role_slugs: frozenset[str] | None = None,
    ) -> tuple[User, Role]:
        if not company_id:
            raise ValidationError("Current user is not assigned to a company")

        # BE-05: сначала slug сверяется с каноническим списком (иначе 422),
        # потом — с потолком полномочий самого актёра (иначе 403).
        if role_slug not in COMPANY_ROLE_SLUGS:
            raise ValidationError(
                f"Unknown role_slug '{role_slug}'. Allowed: {', '.join(sorted(COMPANY_ROLE_SLUGS))}"
            )
        # Анти-эскалация: не-админ (кассир со спец-правом) создаёт только рядовые
        # роли и не может выдать административные права.
        if not actor_is_admin:
            if role_slug not in OWNER_ASSIGNABLE_ROLE_SLUGS:
                raise ForbiddenError("Недостаточно прав для назначения этой роли")
            self._reject_escalation_permissions(permissions)
        if assignable_role_slugs is not None and role_slug not in assignable_role_slugs:
            raise ForbiddenError("Role is outside the actor's privilege ceiling")

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
        if phone and await self.user_repo.get_by_phone(phone):
            # get_by_login() резолвит email/username/телефон с limit(1) —
            # дубль телефона сделал бы вход неоднозначным.
            raise ConflictError("Phone already registered")

        # Имя роли — каноническое (Cashier/Waiter/...); role_name из формы
        # относится к сотруднику, а не к роли, поэтому сюда не передаём.
        role = await RBACService(self.db).get_or_create_company_role(company_id, role_slug)

        # Одинаковый PIN у двух сотрудников делает вход по PIN неоднозначным
        # (кассир мог бы получить сессию владельца) — такой PIN не принимаем.
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

        # Роль привязываем к тому же филиалу, что и сам аккаунт (User.branch_id),
        # иначе фильтр staff-users по branch_id не найдёт сотрудника.
        self.db.add(UserRole(user_id=user.id, role_id=role.id, branch_id=branch_id))
        await self.db.commit()
        await self.db.refresh(user)
        await self.db.refresh(role)
        return user, role

    async def update_company_user(
        self,
        user_id: UUID,
        company_id: UUID | None,
        *,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        password: str | None = None,
        role_slug: str | None = None,
        is_active: bool | None = None,
        pin_code: str | None = None,
        printer_ip: str | None = None,
        nfc_id: str | None = None,
        branch_id: UUID | None = None,
        permissions: dict | None = None,
        assignable_role_slugs: frozenset[str] | None = None,
        actor_user_id: UUID | None = None,
        actor_is_admin: bool = True,
    ) -> tuple[User, list[str]]:
        if not company_id:
            raise ValidationError("Current user is not assigned to a company")

        user = await self.user_repo.get_by_id(user_id)
        if not user or user.company_id != company_id or user.is_superadmin:
            raise NotFoundError("User not found")

        # BE-05: актёр не правит ни себя, ни аккаунт вне своего потолка полномочий
        # (владелец/админ имеют роль вне OWNER_ASSIGNABLE_ROLE_SLUGS и потому защищены).
        if actor_user_id is not None:
            target_role_slug = await self._manageable_company_role_slug(user_id, company_id)
            if (
                actor_user_id == user_id
                or assignable_role_slugs is None
                or target_role_slug not in assignable_role_slugs
            ):
                raise ForbiddenError("Protected company identity cannot be changed")

        # Анти-эскалация для не-админа (кассир со спец-правом can_manage_staff):
        # он не выдаёт административные роли и не раздаёт can_manage_*.
        if not actor_is_admin:
            if role_slug is not None and role_slug not in OWNER_ASSIGNABLE_ROLE_SLUGS:
                raise ForbiddenError("Недостаточно прав для назначения этой роли")
            self._reject_escalation_permissions(permissions)

        if actor_user_id == user_id and role_slug is not None:
            raise ForbiddenError("Self role changes are not allowed")
        if role_slug is not None:
            if role_slug not in COMPANY_ROLE_SLUGS:
                raise ValidationError(
                    f"Unknown role_slug '{role_slug}'. Allowed: {', '.join(sorted(COMPANY_ROLE_SLUGS))}"
                )
            if assignable_role_slugs is not None and role_slug not in assignable_role_slugs:
                raise ForbiddenError("Role is outside the actor's privilege ceiling")

        if name is not None:
            user.name = name
        if email is not None:
            existing = await self.user_repo.get_by_email(email)
            if existing and existing.id != user_id:
                raise ConflictError("Email already in use")
            user.email = email
        if phone is not None:
            # BE-07: дубль телефона — тоже 409, иначе вход по телефону неоднозначен.
            existing_phone = await self.user_repo.get_by_phone(phone)
            if existing_phone and existing_phone.id != user_id:
                raise ConflictError("Phone already in use")
            user.phone = phone
        if password is not None:
            user.password_hash = hash_password(password)
        if is_active is not None:
            user.is_active = is_active
        if printer_ip is not None:
            user.printer_ip = printer_ip or None
        if nfc_id is not None:
            user.nfc_id = nfc_id or None
        if branch_id is not None:
            user.branch_id = branch_id
        if permissions is not None:
            user.permissions = permissions

        # PIN храним хешем; пустая строка — снять PIN. Plaintext не логируем.
        if pin_code is not None:
            if pin_code and await self.user_repo.pin_taken_by_other(
                company_id, pin_code, exclude_user_id=user_id
            ):
                raise ConflictError("PIN уже используется другим сотрудником")
            user.pin_hash = hash_pin(pin_code) if pin_code else None
            # Смена PIN снимает блокировку по неудачным попыткам — иначе сотрудник,
            # запертый на 15 минут, остался бы заперт и с новым PIN.
            user.pin_failed_attempts = 0
            user.pin_locked_until = None

        if role_slug is not None:
            role = await RBACService(self.db).get_or_create_company_role(company_id, role_slug)
            await self.db.execute(delete(UserRole).where(UserRole.user_id == user_id))
            # Роль привязана к тому же филиалу, что и аккаунт (см. create_company_user).
            self.db.add(UserRole(user_id=user_id, role_id=role.id, branch_id=user.branch_id))

        await self.db.commit()
        await self.db.refresh(user)

        roles_res = await self.db.execute(
            select(Role.slug).join(UserRole, UserRole.role_id == Role.id).where(
                UserRole.user_id == user_id
            )
        )
        return user, list(roles_res.scalars().all())

    async def refresh(self, refresh_token: str) -> tuple[str, str]:
        token_hash = hash_refresh_token(refresh_token)
        async with self.db.begin():
            # PostgreSQL row locking makes one active token a one-shot
            # credential even when requests arrive at the same instant. The
            # loser waits for this transaction, then observes revoked_at and
            # is rejected without issuing a second successor.
            stored = await self.token_repo.get_by_hash_for_update(token_hash)
            if not stored:
                raise UnauthorizedError("Invalid or expired refresh token")

            user = await self.user_repo.get_by_id(stored.user_id)
            if not user or not user.is_active:
                raise UnauthorizedError("User not found or inactive")

            # Сохраняем scope сессии при ротации: hq_admin остаётся hq_admin
            # только пока пользователь по-прежнему суперадмин; иначе сессия
            # опускается до обычной app. Права всегда берём из БД, а не из токена.
            requested_scope = get_refresh_token_auth_scope(refresh_token)
            auth_scope = (
                "hq_admin"
                if requested_scope == "hq_admin" and user.is_superadmin
                else "app"
            )
            new_access = create_access_token(
                user.id, user.company_id, auth_scope=auth_scope
            )
            new_refresh = create_refresh_token(auth_scope=auth_scope)
            now = datetime.now(timezone.utc)
            expires_at = now + timedelta(days=settings.refresh_token_expire_days)

            stored.revoked_at = now
            self.db.add(RefreshToken(
                user_id=user.id,
                token_hash=hash_refresh_token(new_refresh),
                expires_at=expires_at,
            ))

        return new_access, new_refresh

    async def logout(self, user_id: UUID, refresh_token: str) -> None:
        """Отзываем ровно один токен, принадлежащий текущему пользователю.

        Отсутствие токена в теле — ошибка валидации на границе API; выйти из
        всех сессий сразу можно только через logout_all().
        """
        token_hash = hash_refresh_token(refresh_token)
        await self.token_repo.revoke_by_hash(token_hash, user_id)

    async def logout_all(self, user_id: UUID) -> None:
        await self.token_repo.revoke_all_for_user(user_id)

    async def set_pin(
        self, actor_user_id: UUID, target_user_id: UUID, company_id: UUID | None, pin: str
    ) -> None:
        """BE-08: назначение/сброс PIN сотрудника. Только в рамках своей компании,
        с проверкой уникальности PIN, хешированием, снятием блокировки и записью
        в аудит — сам PIN никуда не пишем и не возвращаем."""
        if not company_id:
            raise ValidationError("Current user is not assigned to a company")

        target = await self.user_repo.get_by_id(target_user_id)
        if not target or target.company_id != company_id or target.is_superadmin:
            raise NotFoundError("User not found")
        if await self._manageable_company_role_slug(target_user_id, company_id) == "owner":
            raise ForbiddenError("Protected company identity cannot be changed")

        # PIN уникален внутри компании. Хеш солёный, поэтому сравнить равенством
        # нельзя — проверяем PIN против хеша каждого сотрудника. На масштабе
        # персонала ресторана это дешево (тысячи аккаунтов на компанию не ожидаются).
        peers = await self.user_repo.get_company_users(company_id)
        for peer in peers:
            if peer.id != target.id and peer.pin_hash and verify_pin(pin, peer.pin_hash):
                raise ConflictError("PIN уже используется другим сотрудником")

        target.pin_hash = hash_pin(pin)
        target.pin_failed_attempts = 0
        target.pin_locked_until = None
        await self.db.commit()

        await AuditService(self.db).log(
            company_id=company_id, user_id=actor_user_id,
            action="user.pin_reset", entity_type="user", entity_id=target.id,
        )

    async def deactivate_company_user(
        self, actor_user_id: UUID, target_user_id: UUID, company_id: UUID | None,
        *, actor_is_admin: bool = True,
    ) -> None:
        if not company_id:
            raise ValidationError("Current user is not assigned to a company")
        target = await self.user_repo.get_by_id(target_user_id)
        if not target or target.company_id != company_id or target.is_superadmin:
            raise NotFoundError("User not found")
        target_role_slug = await self._manageable_company_role_slug(
            target_user_id, company_id
        )
        if actor_user_id == target_user_id or target_role_slug == "owner":
            raise ForbiddenError("Protected company identity cannot be changed")
        # Не-админ (кассир со спец-правом) отключает только рядовых сотрудников.
        if not actor_is_admin and target_role_slug not in OWNER_ASSIGNABLE_ROLE_SLUGS:
            raise ForbiddenError("Недостаточно прав для этого сотрудника")
        target.is_active = False
        await self.db.commit()

    async def pin_login(self, employee_id: UUID, pin: str) -> tuple[User, str, str]:
        """BE-08: сотрудника задаёт employee_id, PIN лишь подтверждает вход —
        поэтому «нельзя найти сотрудника другой организации по PIN» верно по
        построению: кросс-компанийного поиска по PIN нет вообще. Неудачные
        попытки ведут к блокировке КОНКРЕТНОЙ учётки, независимо от общего
        rate-limit эндпоинта."""
        user = await self.user_repo.get_by_id(employee_id)
        if not user or not user.pin_hash:
            raise UnauthorizedError("Invalid PIN")
        if not user.is_active:
            raise UnauthorizedError("Account is inactive")

        locked_until = user.pin_locked_until
        if locked_until is not None:
            # SQLite (тесты) возвращает naive datetime даже для DateTime(timezone=True),
            # в отличие от Postgres/asyncpg — нормализуем перед сравнением, иначе
            # сломается на одном бэкенде и не сломается на другом.
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if locked_until > datetime.now(timezone.utc):
                raise UnauthorizedError("PIN temporarily locked — too many failed attempts")

        if not verify_pin(pin, user.pin_hash):
            user.pin_failed_attempts += 1
            if user.pin_failed_attempts >= PIN_MAX_ATTEMPTS:
                user.pin_locked_until = datetime.now(timezone.utc) + timedelta(minutes=PIN_LOCKOUT_MINUTES)
                user.pin_failed_attempts = 0
            await self.db.commit()
            raise UnauthorizedError("Invalid PIN")

        user.pin_failed_attempts = 0
        user.pin_locked_until = None
        await self.db.commit()

        access_token = create_access_token(user.id, user.company_id)
        refresh_token = create_refresh_token()
        await self._save_refresh_token(user.id, refresh_token)

        return user, access_token, refresh_token

    async def _save_refresh_token(self, user_id: UUID, token: str) -> None:
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
        rt = RefreshToken(
            user_id=user_id,
            token_hash=hash_refresh_token(token),
            expires_at=expires_at,
        )
        self.db.add(rt)
        await self.db.commit()
