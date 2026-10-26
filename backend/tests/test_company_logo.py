import io
from unittest.mock import AsyncMock

from botocore.exceptions import EndpointConnectionError
from PIL import Image

from tests.conftest import register_company


def png_bytes():
    output = io.BytesIO()
    Image.new("RGB", (16, 16), "white").save(output, format="PNG")
    return output.getvalue()


async def test_logo_upload_detects_bytes_and_replacements_get_a_fresh_url(client, monkeypatch):
    from app.modules.companies.router import storage
    headers, _ = await register_company(client, slug="logo-bytes", email="logo-bytes@example.com")
    async def upload(data, key, content_type, public):
        assert data == png_bytes() and content_type == "image/png" and public is True
        return f"https://media.example.com/{key}"
    mock = AsyncMock(side_effect=upload)
    monkeypatch.setattr(storage, "upload", mock)
    results = []
    for _ in range(2):
        response = await client.post("/companies/me/logo", headers=headers,
            files={"file": ("logo.PNG", png_bytes(), "application/octet-stream")})
        assert response.status_code == 200, response.text
        results.append(response.json()["logo"])
    assert results[0] != results[1]
    profile = await client.get("/companies/me", headers=headers)
    assert profile.json()["logo"] == results[-1]


async def test_logo_rejects_corrupt_and_large_files_without_touching_storage(client, monkeypatch):
    from app.modules.companies.router import storage
    headers, _ = await register_company(client, slug="logo-bad", email="logo-bad@example.com")
    upload = AsyncMock()
    monkeypatch.setattr(storage, "upload", upload)
    for body, status in ((b"not an image", 400), (b"x" * (5 * 1024 * 1024 + 1), 413)):
        response = await client.post("/companies/me/logo", headers=headers,
            files={"file": ("logo.png", body, "image/png")})
        assert response.status_code == status, response.text
    upload.assert_not_called()


async def test_logo_storage_failure_is_a_readable_error_not_fake_success(client, monkeypatch):
    from app.modules.companies.router import storage
    headers, _ = await register_company(client, slug="logo-offline", email="logo-offline@example.com")
    monkeypatch.setattr(storage, "upload", AsyncMock(side_effect=EndpointConnectionError(endpoint_url="http://storage.invalid")))
    response = await client.post("/companies/me/logo", headers=headers,
        files={"file": ("logo.png", png_bytes(), "image/png")})
    assert response.status_code == 503
    assert "Хранилище" in response.json()["detail"]
    assert (await client.get("/companies/me", headers=headers)).json()["logo"] is None
