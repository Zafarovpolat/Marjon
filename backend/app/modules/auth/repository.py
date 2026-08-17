from __future__ import annotations
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.shared.base_repository import BaseRepository
from app.modules.auth.models import User, RefreshToken


class UserRepository(BaseRepository[User]):
    def __init__(self, db: AsyncSession):
        super().__init__(User, db)

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: UUID) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_login(self, login: str) -> Optional[User]:
        """Login by email, username or phone."""
        result = await self.db.execute(
            select(User).where(
                (User.email == login) | (User.username == login) | (User.phone == login)
            ).limit(1)
        )
        return result.scalar_one_or_none()

    async def get_company_users(self, company_id: UUID) -> list[User]:
        # 6.2 — служебные терминальные учётки филиалов скрыты из списка персонала
        from app.modules.auth.security import TERMINAL_EMAIL_LIKE
        result = await self.db.execute(
            select(User).where(
                User.company_id == company_id,
                ~User.email.like(TERMINAL_EMAIL_LIKE),
            )
        )
        return list(result.scalars().all())

    async def get_by_pin(self, company_id: UUID, pin: str) -> Optional[User]:
        """PIN-вход сотрудника: перебираем активных сотрудников компании и сверяем
        bcrypt-хеш. Plaintext-PIN в БД больше не хранится (см. pin_hash).
        PIN уникален только внутри организации, поэтому scope по company_id обязателен."""
        from app.modules.auth.security import verify_pin
        result = await self.db.execute(
            select(User).where(
                User.company_id == company_id,
                User.is_active == True,  # noqa: E712
                User.pin_hash.is_not(None),
            )
        )
        for user in result.scalars().all():
            if verify_pin(pin, user.pin_hash):
                return user
        return None


class RefreshTokenRepository(BaseRepository[RefreshToken]):
    def __init__(self, db: AsyncSession):
        super().__init__(RefreshToken, db)

    async def get_by_hash(self, token_hash: str) -> Optional[RefreshToken]:
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked_at == None,
                RefreshToken.expires_at > datetime.now(timezone.utc),
            )
        )
        return result.scalar_one_or_none()

    async def revoke_all_for_user(self, user_id: UUID) -> None:
        from sqlalchemy import update
        await self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at == None)
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
