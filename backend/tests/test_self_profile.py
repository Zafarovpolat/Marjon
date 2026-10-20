import io
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest
from PIL import Image
from tests.conftest import register_company
from app.shared.storage import storage


async def account(client):
    return (await register_company(client, slug=uuid4().hex, email=f"{uuid4().hex}@test.example"))[0]


def png():
    data = io.BytesIO()
    Image.new("RGB", (2, 2), "red").save(data, "PNG")
    return data.getvalue()


@pytest.mark.asyncio
async def test_self_profile_is_persistent_and_cannot_change_other_identity_fields(client):
    headers = await account(client)
    other_headers = await account(client)
    before = (await client.get("/auth/me", headers=headers)).json()
    other_before = (await client.get("/auth/me", headers=other_headers)).json()
    assert (await client.patch("/auth/me/profile", data={"name": "Name"})).status_code in (401, 403)
    response = await client.patch("/auth/me/profile", headers=headers, data={
        "name": "  Новое имя  ", "user_id": other_before["id"], "is_superadmin": "true", "email": "evil@test.example"})
    assert response.status_code == 422
    response = await client.patch("/auth/me/profile", headers=headers, data={"name": "  Новое имя  "})
    assert response.status_code == 200, response.text
    saved = (await client.get("/auth/me", headers=headers)).json()
    assert saved["name"] == "Новое имя"
    for field in ("id", "email", "company_id", "branch_id", "is_superadmin", "role_slugs", "permissions", "auth_scope"):
        assert saved[field] == before[field]
    login = await client.post("/auth/login", json={"email": before["email"], "password": "Passw0rd!"})
    assert login.status_code == 200
    new_session = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get("/auth/me", headers=new_session)).json()["name"] == "Новое имя"
    assert (await client.get("/auth/me", headers=other_headers)).json() == other_before
    assert (await client.get("/auth/me/photo", headers=headers)).status_code == 404


@pytest.mark.asyncio
async def test_photo_roundtrip_private_and_other_account_cannot_read_it(client, monkeypatch):
    headers = await account(client)
    other = await account(client)
    objects = {}
    async def upload(data, key, content_type, public=False):
        assert public is False
        assert content_type == "image/webp"
        objects[key] = data
        return storage.public_url(key)
    monkeypatch.setattr(storage, "upload", upload)
    monkeypatch.setattr(storage, "download", AsyncMock(side_effect=lambda key: objects.get(key)))
    response = await client.patch("/auth/me/profile", headers=headers, data={"name": "Photo Owner"}, files={"file": ("photo.png", png(), "image/png")})
    assert response.status_code == 200, response.text
    assert "/avatars/" in response.json()["avatar_url"]
    own = await client.get("/auth/me/photo", headers=headers)
    assert own.status_code == 200
    assert own.json()["image"].startswith("data:image/webp;base64,")
    assert own.headers["cache-control"] == "private, no-store"
    assert (await client.get("/auth/me/photo", headers=other)).status_code == 404
    removed = await client.patch("/auth/me/profile", headers=headers, data={"name": "Photo Owner", "remove_photo": "true"})
    assert removed.status_code == 200 and removed.json()["avatar_url"] is None
    assert (await client.get("/auth/me/photo", headers=headers)).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["", "   ", "x" * 256])
async def test_invalid_names_do_not_change_profile(client, name):
    headers = await account(client)
    before = (await client.get("/auth/me", headers=headers)).json()
    assert (await client.patch("/auth/me/profile", headers=headers, data={"name": name})).status_code == 422
    assert (await client.get("/auth/me", headers=headers)).json() == before


@pytest.mark.asyncio
# TEST-ID-01: без явных ids pytest строит id из repr параметра, а третий кейс —
# это 5 МБ байтов. Итоговый node id уезжает в переменную окружения
# PYTEST_CURRENT_TEST, и на Windows (лимит 32767 символов) тест падает в setup
# с «environment variable is longer than 32767 characters», не доходя до кода.
@pytest.mark.parametrize(
    "raw,mime,expected",
    [(b"<svg/>", "image/svg+xml", 422), (b"fake", "image/png", 422), (b"x" * (5*1024*1024+1), "image/png", 413)],
    ids=["svg-not-allowed", "not-an-image", "over-5mb"],
)
async def test_invalid_photos_do_not_commit_name(client, raw, mime, expected):
    headers = await account(client)
    before = (await client.get("/auth/me", headers=headers)).json()
    response = await client.patch("/auth/me/profile", headers=headers, data={"name": "Must not save"}, files={"file": ("photo", raw, mime)})
    assert response.status_code == expected, response.text
    assert (await client.get("/auth/me", headers=headers)).json() == before


@pytest.mark.asyncio
async def test_storage_failure_does_not_commit_name_or_avatar(client, monkeypatch):
    headers = await account(client)
    before = (await client.get("/auth/me", headers=headers)).json()
    monkeypatch.setattr(storage, "upload", AsyncMock(side_effect=RuntimeError("unavailable")))
    response = await client.patch("/auth/me/profile", headers=headers, data={"name": "Must not save"}, files={"file": ("photo.png", png(), "image/png")})
    assert response.status_code == 503
    assert (await client.get("/auth/me", headers=headers)).json() == before
