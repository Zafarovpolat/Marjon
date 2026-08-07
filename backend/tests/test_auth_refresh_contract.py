from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

import app.modules.auth.service as auth_service_module
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.security import decode_token, hash_password, hash_refresh_token
from app.modules.auth.service import AuthService
from app.modules.companies.models import Company
from tests.conftest import register_company


async def _create_superadmin(
    db_engine,
    *,
    email: str,
    password: str = "RootPass1!",
) -> tuple[UUID, str, str]:
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        user = User(
            email=email,
            password_hash=hash_password(password),
            is_superadmin=True,
            is_active=True,
        )
        session.add(user)
        await session.commit()
    return user.id, email, password


async def _store_refresh_token(db_engine, user_id: UUID, raw_token: str) -> None:
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        session.add(RefreshToken(
            user_id=user_id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        ))
        await session.commit()


async def test_app_scope_marker_tampering_is_rejected_without_consuming_token(
    client, db_engine
):
    _, email, password = await _create_superadmin(
        db_engine, email="marker-tamper@marjon.local"
    )
    login = await client.post(
        "/auth/login", json={"email": email, "password": password}
    )
    assert login.status_code == 200
    legitimate = login.json()["refresh_token"]
    assert legitimate.startswith("v1.app.")

    tampered = legitimate.replace("v1.app.", "v1.hq_admin.", 1)
    rejected = await client.post(
        "/auth/refresh", json={"refresh_token": tampered}
    )
    assert rejected.status_code == 401
    assert "access_token" not in rejected.json()

    # Changing the marker changes the hash lookup key; the untouched token
    # remains usable and keeps the regular-login app scope.
    valid = await client.post(
        "/auth/refresh", json={"refresh_token": legitimate}
    )
    assert valid.status_code == 200
    access_token = valid.json()["access_token"]
    assert decode_token(access_token)["auth_scope"] == "app"
    hq = await client.get(
        "/organizations", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert hq.status_code == 403


@pytest.mark.parametrize(
    "malformed_token",
    ("v1.hq_admin", "v1.not-a-scope.review-secret"),
)
async def test_malformed_stored_marker_fails_closed_to_app_scope(
    client, db_engine, malformed_token
):
    user_id, _, _ = await _create_superadmin(
        db_engine, email="malformed-marker@marjon.local"
    )
    await _store_refresh_token(db_engine, user_id, malformed_token)

    refreshed = await client.post(
        "/auth/refresh", json={"refresh_token": malformed_token}
    )
    assert refreshed.status_code == 200
    access_token = refreshed.json()["access_token"]
    assert decode_token(access_token)["auth_scope"] == "app"
    hq = await client.get(
        "/organizations", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert hq.status_code == 403


async def test_unknown_stored_marker_version_fails_closed_to_app_scope(
    client, db_engine
):
    user_id, _, _ = await _create_superadmin(
        db_engine, email="unknown-marker@marjon.local"
    )
    unknown_version_token = "v999.hq_admin.review-secret"
    await _store_refresh_token(db_engine, user_id, unknown_version_token)

    refreshed = await client.post(
        "/auth/refresh", json={"refresh_token": unknown_version_token}
    )
    assert refreshed.status_code == 200
    access_token = refreshed.json()["access_token"]
    assert decode_token(access_token)["auth_scope"] == "app"
    hq = await client.get(
        "/organizations", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert hq.status_code == 403


async def test_legacy_superadmin_token_downgrades_until_fresh_admin_login(
    client, db_engine
):
    user_id, email, password = await _create_superadmin(
        db_engine, email="legacy-hq@marjon.local"
    )
    legacy_token = secrets.token_urlsafe(64)
    await _store_refresh_token(db_engine, user_id, legacy_token)

    refreshed = await client.post(
        "/auth/refresh", json={"refresh_token": legacy_token}
    )
    assert refreshed.status_code == 200
    downgraded_access = refreshed.json()["access_token"]
    assert decode_token(downgraded_access)["auth_scope"] == "app"
    denied = await client.get(
        "/organizations",
        headers={"Authorization": f"Bearer {downgraded_access}"},
    )
    assert denied.status_code == 403

    fresh_login = await client.post(
        "/auth/admin/login", json={"email": email, "password": password}
    )
    assert fresh_login.status_code == 200
    hq_access = fresh_login.json()["access_token"]
    assert decode_token(hq_access)["auth_scope"] == "hq_admin"
    allowed = await client.get(
        "/organizations", headers={"Authorization": f"Bearer {hq_access}"}
    )
    assert allowed.status_code == 200


async def test_refresh_uses_current_company_from_database(client, db_engine):
    _, tokens = await register_company(
        client, slug="before-refresh", email="owner@company-refresh.example.com"
    )
    user_id = UUID(decode_token(tokens["access_token"])["sub"])

    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        company = Company(name="After Refresh", slug="after-refresh")
        session.add(company)
        await session.flush()
        await session.execute(
            update(User).where(User.id == user_id).values(company_id=company.id)
        )
        new_company_id = company.id
        await session.commit()

    refreshed = await client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200
    payload = decode_token(refreshed.json()["access_token"])
    assert payload["company_id"] == str(new_company_id)


async def test_refresh_rejects_currently_inactive_user(client, db_engine):
    _, tokens = await register_company(
        client, slug="inactive-refresh", email="owner@inactive-refresh.example.com"
    )
    user_id = UUID(decode_token(tokens["access_token"])["sub"])

    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        await session.execute(
            update(User).where(User.id == user_id).values(is_active=False)
        )
        await session.commit()

    refreshed = await client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 401


async def test_refresh_rejects_expired_server_side_token(client, db_engine):
    _, tokens = await register_company(
        client, slug="expired-refresh", email="owner@expired-refresh.example.com"
    )

    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        await session.execute(
            update(RefreshToken)
            .where(
                RefreshToken.token_hash
                == hash_refresh_token(tokens["refresh_token"])
            )
            .values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
        )
        await session.commit()

    refreshed = await client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 401


async def test_multiple_rotations_leave_only_latest_token_usable(client):
    _, tokens = await register_company(
        client, slug="many-rotations", email="owner@many-rotations.example.com"
    )
    current = tokens["refresh_token"]

    for _ in range(3):
        rotated = await client.post("/auth/refresh", json={"refresh_token": current})
        assert rotated.status_code == 200
        replacement = rotated.json()["refresh_token"]

        reused = await client.post("/auth/refresh", json={"refresh_token": current})
        assert reused.status_code == 401
        current = replacement

    latest = await client.post("/auth/refresh", json={"refresh_token": current})
    assert latest.status_code == 200


async def test_legacy_unmarked_refresh_token_is_fail_closed_to_app_scope(client, db_engine):
    _, tokens = await register_company(
        client, slug="legacy-refresh", email="owner@legacy-refresh.example.com"
    )
    user_id = UUID(decode_token(tokens["access_token"])["sub"])
    legacy_token = secrets.token_urlsafe(64)

    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        session.add(RefreshToken(
            user_id=user_id,
            token_hash=hash_refresh_token(legacy_token),
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        ))
        await session.commit()

    refreshed = await client.post(
        "/auth/refresh", json={"refresh_token": legacy_token}
    )
    assert refreshed.status_code == 200
    assert decode_token(refreshed.json()["access_token"])["auth_scope"] == "app"


async def test_rotation_database_error_rolls_back_old_token(
    client, db_engine, monkeypatch
):
    _, tokens = await register_company(
        client, slug="rollback-refresh", email="owner@rollback-refresh.example.com"
    )
    old_refresh = tokens["refresh_token"]
    original_factory = auth_service_module.create_refresh_token
    monkeypatch.setattr(
        auth_service_module,
        "create_refresh_token",
        lambda auth_scope="app": old_refresh,
    )

    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        with pytest.raises(IntegrityError):
            await AuthService(session).refresh(old_refresh)

    async with session_factory() as session:
        stored = await session.scalar(
            select(RefreshToken).where(
                RefreshToken.token_hash == hash_refresh_token(old_refresh)
            )
        )
        assert stored.revoked_at is None

    monkeypatch.setattr(auth_service_module, "create_refresh_token", original_factory)
    retry = await client.post(
        "/auth/refresh", json={"refresh_token": old_refresh}
    )
    assert retry.status_code == 200
