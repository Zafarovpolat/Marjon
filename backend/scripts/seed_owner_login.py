from __future__ import annotations

import asyncio
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.infrastructure.database.session import AsyncSessionLocal
from app.modules.auth.models import User
from app.modules.auth.security import hash_password
from app.modules.companies.models import Company
from app.modules.rbac.models import Role, UserRole


PHONE = "+998998900000"
PASSWORD = "owner123"
EMAIL = "owner@marjon.uz"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        company = (await db.execute(select(Company).order_by(Company.created_at))).scalars().first()
        if not company:
            company = Company(
                slug="marjon-local",
                name="MARJON Local",
                country_code="UZ",
                timezone="Asia/Tashkent",
                currency="UZS",
            )
            db.add(company)
            await db.flush()

        role = (
            await db.execute(
                select(Role).where(Role.company_id == company.id, Role.slug == "owner")
            )
        ).scalar_one_or_none()
        if not role:
            role = Role(
                company_id=company.id,
                slug="owner",
                name="Owner",
                is_system=False,
            )
            db.add(role)
            await db.flush()

        user = (await db.execute(select(User).where(User.email == EMAIL))).scalar_one_or_none()
        if not user:
            user = User(
                company_id=company.id,
                email=EMAIL,
                username="owner",
                name="Owner",
                phone=PHONE,
                password_hash=hash_password(PASSWORD),
                is_active=True,
            )
            db.add(user)
            await db.flush()
        else:
            user.company_id = company.id
            user.phone = PHONE
            user.password_hash = hash_password(PASSWORD)
            user.is_active = True
            await db.flush()

        phone_conflicts = (
            await db.execute(select(User).where(User.phone == PHONE, User.id != user.id))
        ).scalars().all()
        for conflicting_user in phone_conflicts:
            conflicting_user.phone = None
        if phone_conflicts:
            await db.flush()

        existing_link = (
            await db.execute(
                select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)
            )
        ).scalar_one_or_none()
        if not existing_link:
            db.add(UserRole(user_id=user.id, role_id=role.id))

        await db.commit()
        print(f"owner_login_ready phone={PHONE} password={PASSWORD} user_id={user.id}")


if __name__ == "__main__":
    asyncio.run(main())
