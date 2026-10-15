from __future__ import annotations

from pathlib import Path

from tests.conftest import register_company


async def _create_product(client, headers, payload=None):
    body = {"name": "Плов", "price": 40000}
    if payload:
        body.update(payload)
    resp = await client.post("/inventory/products", headers=headers, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_product_auto_set_defaults_false(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    body = await _create_product(client, headers)
    assert body["is_auto"] is False
    assert body["is_set"] is False


async def test_product_create_accepts_auto_set(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    body = await _create_product(client, headers, {"is_auto": True, "is_set": True})
    assert body["is_auto"] is True
    assert body["is_set"] is True


async def test_product_update_auto_works_and_independent(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await _create_product(client, headers)
    pid = created["id"]

    resp = await client.patch(f"/inventory/products/{pid}", headers=headers, json={"is_auto": True})
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_auto"] is True
    assert resp.json()["is_set"] is False

    resp = await client.patch(f"/inventory/products/{pid}", headers=headers, json={"is_auto": False})
    assert resp.json()["is_auto"] is False
    assert resp.json()["is_set"] is False


async def test_product_update_set_works_and_independent(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await _create_product(client, headers)
    pid = created["id"]

    resp = await client.patch(f"/inventory/products/{pid}", headers=headers, json={"is_set": True})
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_set"] is True
    assert resp.json()["is_auto"] is False

    resp = await client.patch(f"/inventory/products/{pid}", headers=headers, json={"is_set": False})
    assert resp.json()["is_set"] is False
    assert resp.json()["is_auto"] is False


async def test_product_response_contains_auto_set(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await _create_product(client, headers, {"is_auto": True})
    pid = created["id"]
    assert "is_auto" in created and "is_set" in created

    listing = await client.get("/inventory/products", headers=headers)
    assert listing.status_code == 200
    found = next(p for p in listing.json() if p["id"] == pid)
    assert found["is_auto"] is True
    assert found["is_set"] is False

    single = await client.get(f"/inventory/products/{pid}", headers=headers)
    assert single.json()["is_auto"] is True


async def test_product_unit_and_printer_unaffected_by_auto_set(client):
    headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    await client.post("/companies/me/branches", headers=headers, json={"name": "Main"})
    printer = await client.post("/printers", headers=headers, json={"name": "БАР", "printer_type": "bar"})
    assert printer.status_code == 201, printer.text
    printer_id = printer.json()["id"]

    created = await _create_product(client, headers, {"printer_id": printer_id, "is_auto": True})
    assert created["printer_id"] == printer_id
    assert created["printer_name"] == "БАР"
    assert created["is_auto"] is True
    assert created["is_set"] is False


async def test_migration_adds_auto_set_with_false_default():
    backend_root = Path(__file__).resolve().parents[1]
    path = backend_root / "migrations" / "versions" / "20261004_v24auto01_product_auto_set.py"
    assert path.exists()
    text = path.read_text(encoding="utf-8")
    assert 'revision: str = "v24auto01"' in text
    assert 'down_revision' in text and "un02cmp01" in text
    assert '"is_auto"' in text and '"is_set"' in text
    assert '"products"' in text
    # Existing rows stay valid: NOT NULL + server_default false.
    assert "nullable=False" in text
    assert 'server_default="0"' in text
