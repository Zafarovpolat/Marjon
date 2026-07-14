#!/usr/bin/env python3
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.infrastructure.database.session import AsyncSessionLocal
from app.modules.auth.models import User
from app.modules.auth.security import hash_password
from app.modules.companies.models import Branch, Company
from app.modules.rbac.models import Role, UserRole


PHONE = "+998900078779"
PASSWORD = "102938"


async def first(db, model, *criteria):
    result = await db.execute(select(model).where(*criteria).limit(1))
    return result.scalars().first()


async def main():
    async with AsyncSessionLocal() as db:
        company = await first(db, Company, Company.slug == "marjon")
        if company is None:
            company = Company(
                slug="marjon",
                name="Marjon Cafe",
                country_code="UZ",
                timezone="Asia/Tashkent",
                currency="UZS",
                is_active=True,
            )
            db.add(company)
            await db.flush()
        else:
            company.name = "Marjon Cafe"
            company.is_active = True

        branch = await first(db, Branch, Branch.company_id == company.id, Branch.name == "Главный зал")
        if branch is None:
            branch = Branch(
                company_id=company.id,
                name="Главный зал",
                address="ул. Навои 12, Ташкент",
                city="Ташкент",
                is_active=True,
            )
            db.add(branch)
            await db.flush()
        else:
            branch.is_active = True

        role = await first(db, Role, Role.company_id == company.id, Role.slug == "owner")
        if role is None:
            role = Role(company_id=company.id, slug="owner", name="Owner", is_system=False)
            db.add(role)
            await db.flush()

        user = await first(db, User, User.phone == PHONE)
        if user is None:
            user = await first(db, User, User.username == "admin")
        if user is None:
            user = await first(db, User, User.email == "admin@marjon.uz")
        if user is None:
            user = await first(db, User, User.email == "admin@example.com")
        if user is None:
            user = User(
                company_id=company.id,
                email="admin@marjon.uz",
                username="admin",
                name="Владелец Marjon Cafe",
                phone=PHONE,
                pin_code="1111",
                password_hash=hash_password(PASSWORD),
                is_active=True,
                is_superadmin=False,
            )
            db.add(user)
            await db.flush()
        else:
            email_owner = await first(db, User, User.email == "admin@marjon.uz")
            username_owner = await first(db, User, User.username == "admin")
            user.company_id = company.id
            if email_owner is None or email_owner.id == user.id:
                user.email = "admin@marjon.uz"
            if username_owner is None or username_owner.id == user.id:
                user.username = "admin"
            user.name = "Владелец Marjon Cafe"
            user.phone = PHONE
            user.pin_code = "1111"
            user.password_hash = hash_password(PASSWORD)
            user.is_active = True
            user.is_superadmin = False

        owner_users = list((await db.execute(select(User).where(User.phone == PHONE))).scalars().all())
        if all(owner.id != user.id for owner in owner_users):
            owner_users.append(user)

        for owner in owner_users:
            owner.company_id = company.id
            owner.name = "Владелец Marjon Cafe"
            owner.phone = PHONE
            owner.pin_code = "1111"
            owner.password_hash = hash_password(PASSWORD)
            owner.is_active = True
            owner.is_superadmin = False

            link = await first(
                db,
                UserRole,
                UserRole.user_id == owner.id,
                UserRole.role_id == role.id,
                UserRole.branch_id == branch.id,
            )
            if link is None:
                db.add(UserRole(user_id=owner.id, role_id=role.id, branch_id=branch.id))

        await db.commit()
        print("OK owner credentials ready: 90 007 87 79 / 102938")


if __name__ == "__main__":
    asyncio.run(main())
