"""Creates (or promotes) a platform-level HQ admin account.

`is_superadmin` has no public API setter by design (BE-01) — the only way
to grant it is direct DB access. Run this once to bootstrap the first HQ
admin for https://adminka.marjon.tech (POST /auth/admin/login).

Usage (inside the backend container, where DATABASE_URL is already set):
    SUPERADMIN_EMAIL=admin@marjon.tech \
    SUPERADMIN_USERNAME=hqadmin \
    SUPERADMIN_PHONE='+998...' \
    SUPERADMIN_PASSWORD='...' \
    python scripts/create_superadmin.py

adminka.marjon.tech logs in by phone only — set SUPERADMIN_PHONE.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.infrastructure.database.session import AsyncSessionLocal
from app.modules.auth.models import User
from app.modules.auth.security import hash_password
from app.modules.companies.models import Company  # noqa: F401 — registers
# "Company" for User.company, a string-referenced relationship SQLAlchemy
# only resolves once the target class has actually been imported somewhere.

EMAIL = os.environ.get("SUPERADMIN_EMAIL", "admin@marjon.tech")
USERNAME = os.environ.get("SUPERADMIN_USERNAME", "hqadmin")
PHONE = os.environ.get("SUPERADMIN_PHONE")  # adminka.marjon.tech logs in by phone
PASSWORD = os.environ.get("SUPERADMIN_PASSWORD")
NAME = os.environ.get("SUPERADMIN_NAME", "HQ Admin")


async def main() -> None:
    if not PASSWORD:
        raise SystemExit("Set SUPERADMIN_PASSWORD env var before running this script.")

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == EMAIL))).scalar_one_or_none()
        if not user:
            user = User(
                company_id=None,
                email=EMAIL,
                username=USERNAME,
                name=NAME,
                phone=PHONE,
                password_hash=await hash_password(PASSWORD),
                is_active=True,
                is_superadmin=True,
            )
            db.add(user)
            await db.flush()
        else:
            user.username = USERNAME
            user.name = NAME
            user.phone = PHONE
            user.password_hash = await hash_password(PASSWORD)
            user.is_active = True
            user.is_superadmin = True
            await db.flush()

        if PHONE:
            # Login by phone must resolve to exactly this account (get_by_login
            # matches email OR username OR phone) — release the number from
            # any other user that happens to hold it already.
            conflicts = (
                await db.execute(select(User).where(User.phone == PHONE, User.id != user.id))
            ).scalars().all()
            for conflicting_user in conflicts:
                conflicting_user.phone = None

        await db.commit()
        print(f"superadmin_ready email={EMAIL} username={USERNAME} phone={PHONE} user_id={user.id}")


if __name__ == "__main__":
    asyncio.run(main())
