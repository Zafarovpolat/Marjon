from __future__ import annotations

from app.shared import storage as storage_module


async def _upload(monkeypatch, **kwargs):
    calls: dict = {}

    class FakeClient:
        def put_object(self, **kw):
            calls.update(kw)

    monkeypatch.setattr("boto3.client", lambda *args, **kw: FakeClient())
    url = await storage_module.StorageService().upload(b"bytes", "categories/x.png", "image/png", **kwargs)
    return url, calls


async def test_storage_upload_public_sets_public_read(monkeypatch):
    """V6.4/V6.5: menu/catalog media (products, categories, logos) renders
    without credentials, so public=True must mark the object public-read."""
    url, calls = await _upload(monkeypatch, public=True)
    assert calls["ACL"] == "public-read"
    assert calls["Key"] == "categories/x.png"
    assert calls["ContentType"] == "image/png"
    assert url.startswith("http")
    assert url.endswith("/categories/x.png")


async def test_storage_upload_private_by_default(monkeypatch):
    """V6.5 media audit: user/staff media must never inherit a blanket-public
    ACL — private is the default, no ACL kwarg is sent at all."""
    url, calls = await _upload(monkeypatch)
    assert "ACL" not in calls
    assert url.endswith("/categories/x.png")
