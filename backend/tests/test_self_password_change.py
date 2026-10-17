from uuid import UUID, uuid4
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.modules.auth.models import User
from app.modules.auth.security import decode_token, verify_password
from app.modules.auth.service import AuthService
from app.modules.audit.models import AuditLog
from tests.conftest import register_company, create_staff_headers

OLD = "Original123!"
NEW = "Updated456!"


async def account(client):
    suffix = uuid4().hex[:10]
    email = f"password-{suffix}@example.com"
    headers, tokens = await register_company(client, slug=f"pwd-{suffix}", email=email, password=OLD)
    return headers, tokens, email


def payload(**overrides):
    return {"current_password": OLD, "new_password": NEW, "confirm_password": NEW, **overrides}


async def test_change_password_rotates_sessions_and_preserves_identity(client, db_engine):
    headers, initial, email = await account(client)
    before = (await client.get("/auth/me", headers=headers)).json()
    second = (await client.post("/auth/login", json={"email": email, "password": OLD})).json()
    other_headers, _, _ = await account(client)
    response = await client.post("/auth/change-password", headers=headers, json=payload())
    assert response.status_code == 200, response.text
    tokens = response.json()
    new_headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert (await client.get("/auth/me", headers=headers)).status_code == 401
    assert (await client.get("/auth/me", headers={"Authorization": f"Bearer {second['access_token']}"})).status_code == 401
    after = (await client.get("/auth/me", headers=new_headers)).json()
    assert {k: v for k, v in after.items() if k != "updated_at"} == {k: v for k, v in before.items() if k != "updated_at"}
    assert (await client.get("/auth/me", headers=other_headers)).status_code == 200
    for refresh in (initial["refresh_token"], second["refresh_token"]):
        assert (await client.post("/auth/refresh", json={"refresh_token": refresh})).status_code == 401
    assert (await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 200
    assert (await client.post("/auth/login", json={"email": email, "password": OLD})).status_code == 401
    login = await client.post("/auth/login", json={"email": email, "password": NEW})
    assert login.status_code == 200
    assert decode_token(login.json()["access_token"])["auth_version"] == 1
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        user = await db.get(User, UUID(before["id"]))
        assert user.password_hash not in (OLD, NEW)
        assert await verify_password(NEW, user.password_hash)
        logs = (await db.execute(select(AuditLog).where(AuditLog.user_id == user.id))).scalars().all()
        changed = [entry for entry in logs if entry.action == "user.password_changed"]
        assert len(changed) == 1
        assert changed[0].old_data is None and changed[0].new_data is None


@pytest.mark.parametrize("overrides,status", [
    ({"current_password": "Wrong123"}, 403),
    ({"confirm_password": "Different123"}, 422),
    ({"new_password": "short1", "confirm_password": "short1"}, 422),
    ({"new_password": "abcdefgh", "confirm_password": "abcdefgh"}, 422),
    ({"new_password": "12345678", "confirm_password": "12345678"}, 422),
    ({"new_password": "A1" + "я" * 36, "confirm_password": "A1" + "я" * 36}, 422),
    ({"new_password": OLD, "confirm_password": OLD}, 422),
    ({"user_id": str(uuid4())}, 422),
])
async def test_rejected_change_preserves_password_and_session(client, overrides, status):
    headers, _, email = await account(client)
    response = await client.post("/auth/change-password", headers=headers, json=payload(**overrides))
    assert response.status_code == status, response.text
    assert OLD not in response.text and NEW not in response.text
    assert (await client.get("/auth/me", headers=headers)).status_code == 200
    assert (await client.post("/auth/login", json={"email": email, "password": OLD})).status_code == 200


async def test_missing_confirmation_does_not_echo_passwords(client):
    headers, _, _ = await account(client)
    response = await client.post("/auth/change-password", headers=headers, json={"current_password": OLD, "new_password": NEW})
    assert response.status_code == 422
    assert OLD not in response.text and NEW not in response.text


async def test_legacy_access_token_is_valid_until_password_changes(client):
    from jose import jwt
    from app.config import settings
    headers, tokens, _ = await account(client)
    claims = decode_token(tokens["access_token"])
    claims.pop("auth_version")
    legacy = jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)
    legacy_headers = {"Authorization": f"Bearer {legacy}"}
    assert (await client.get("/auth/me", headers=legacy_headers)).status_code == 200
    changed = await client.post("/auth/change-password", headers=legacy_headers, json=payload())
    assert changed.status_code == 200
    assert (await client.get("/auth/me", headers=legacy_headers)).status_code == 401


async def test_requires_authenticated_owner(client):
    assert (await client.post("/auth/change-password", json=payload())).status_code in (401, 403)
    headers, _, _ = await account(client)
    staff = await create_staff_headers(client, headers, email=f"staff-{uuid4().hex[:8]}@example.com", role_slug="waiter")
    assert (await client.post("/auth/change-password", headers=staff, json=payload())).status_code == 403


async def test_wrong_password_attempts_are_rate_limited(client):
    headers, _, _ = await account(client)
    responses = [await client.post("/auth/change-password", headers=headers, json=payload(current_password="Wrong123")) for _ in range(6)]
    assert [r.status_code for r in responses] == [403] * 5 + [429]


async def test_commit_failure_rolls_back_password_and_version(client, db_engine, monkeypatch):
    headers, _, _ = await account(client)
    user_id = UUID((await client.get("/auth/me", headers=headers)).json()["id"])
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        monkeypatch.setattr(db, "commit", AsyncMock(side_effect=RuntimeError("simulated commit failure")))
        with pytest.raises(RuntimeError, match="simulated commit failure"):
            await AuthService(db).change_password(user_id, OLD, NEW, NEW)
    async with sessions() as db:
        user = await db.get(User, user_id)
        assert user.auth_version == 0
        assert await verify_password(OLD, user.password_hash)
    assert (await client.get("/auth/me", headers=headers)).status_code == 200
