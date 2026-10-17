import asyncio
from uuid import UUID

from tests.test_auth_refresh_postgres import postgres_auth_client, postgres_auth_database_url  # noqa: F401
from tests.test_self_password_change import account, payload, OLD, NEW
from app.modules.auth.models import User


async def test_password_change_serializes_with_refresh(postgres_auth_client):
    client, sessions = postgres_auth_client
    headers, old_tokens, _ = await account(client)
    change, *refreshes = await asyncio.gather(
        client.post("/auth/change-password", headers=headers, json=payload()),
        *(client.post("/auth/refresh", json={"refresh_token": old_tokens["refresh_token"]}) for _ in range(4)),
    )
    assert change.status_code == 200, change.text
    assert all(response.status_code in (200, 401) for response in refreshes)
    for response in refreshes:
        if response.status_code == 200:
            stale = response.json()
            assert (await client.get("/auth/me", headers={"Authorization": f"Bearer {stale['access_token']}"})).status_code == 401
            assert (await client.post("/auth/refresh", json={"refresh_token": stale["refresh_token"]})).status_code == 401
    fresh = change.json()
    assert (await client.get("/auth/me", headers={"Authorization": f"Bearer {fresh['access_token']}"})).status_code == 200
    assert (await client.post("/auth/refresh", json={"refresh_token": fresh["refresh_token"]})).status_code == 200


async def test_two_password_changes_cannot_both_use_old_password(postgres_auth_client):
    client, sessions = postgres_auth_client
    headers, _, _ = await account(client)
    user_id = UUID((await client.get("/auth/me", headers=headers)).json()["id"])
    responses = await asyncio.gather(*(
        client.post("/auth/change-password", headers=headers, json=payload()) for _ in range(2)
    ))
    assert sorted(response.status_code for response in responses)[0] == 200
    assert sum(response.status_code == 200 for response in responses) == 1
    assert all(response.status_code in (200, 401, 403) for response in responses)
    async with sessions() as db:
        assert (await db.get(User, user_id)).auth_version == 1
