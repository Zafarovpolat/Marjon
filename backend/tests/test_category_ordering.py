"""REORDER V1 — company-scoped persistent Category ordering (behavioural).

Drag-and-drop порядок категорий (семейство «Места», PATCH /halls/reorder), но
с PARTIAL-контрактом: страница категорий фильтрует список (slug-префикс +
таб Active/Archived), поэтому клиент шлёт только видимые id. Покрытие: happy
path, отказы (дубликаты/чужие/неизвестные id, аноним), инвариант «меняется
только sort_order» и то, что категории вне списка свой порядок сохраняют.
"""
from __future__ import annotations

from uuid import uuid4

from tests.conftest import register_company


async def _create_category(client, headers, name, slug, **extra):
    resp = await client.post(
        "/inventory/categories",
        headers=headers,
        json={"name": name, "slug": slug, **extra},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _list(client, headers, *, include_inactive=False):
    params = {"include_inactive": "true"} if include_inactive else {}
    resp = await client.get("/inventory/categories", headers=headers, params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _reorder(client, headers, category_ids):
    return await client.patch(
        "/inventory/categories/reorder",
        headers=headers,
        json={"category_ids": category_ids},
    )


# ── Reorder happy path ─────────────────────────────────────────────────────

async def test_reorder_persists_and_returns_canonical_order(client):
    headers, _ = await register_company(client, slug="acme", email="o@acme.example.com")
    a = await _create_category(client, headers, "Супы", "dish-soup")
    b = await _create_category(client, headers, "Горячее", "dish-hot")
    c = await _create_category(client, headers, "Салаты", "dish-salad")
    resp = await _reorder(client, headers, [c["id"], a["id"], b["id"]])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Response is canonical DB state in the new order — not the raw request echo.
    assert [r["name"] for r in body] == ["Салаты", "Супы", "Горячее"]
    assert [r["sort_order"] for r in body] == [0, 1, 2]
    # Persisted: a fresh read reflects the new positions (GET /categories has no
    # server-side order_by — the frontend sorts by sort_order — so compare
    # positions, not the array order).
    rows = {r["name"]: r for r in await _list(client, headers)}
    assert rows["Салаты"]["sort_order"] == 0
    assert rows["Супы"]["sort_order"] == 1
    assert rows["Горячее"]["sort_order"] == 2


# ── Reorder rejections (all 409/401, never partially applied) ──────────────

async def test_reorder_duplicate_id_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="o@acme.example.com")
    a = await _create_category(client, headers, "Супы", "dish-soup")
    await _create_category(client, headers, "Горячее", "dish-hot")
    resp = await _reorder(client, headers, [a["id"], a["id"]])
    assert resp.status_code == 409, resp.text
    # Nothing changed.
    rows = await _list(client, headers)
    assert [r["sort_order"] for r in rows] == [0, 0]


async def test_reorder_unknown_id_rejected(client):
    headers, _ = await register_company(client, slug="acme", email="o@acme.example.com")
    a = await _create_category(client, headers, "Супы", "dish-soup")
    resp = await _reorder(client, headers, [a["id"], str(uuid4())])
    assert resp.status_code == 409, resp.text


async def test_reorder_foreign_tenant_category_rejected(client):
    a_headers, _ = await register_company(client, slug="alpha", email="o@alpha.example.com")
    b_headers, _ = await register_company(client, slug="beta", email="o@beta.example.com")
    mine = await _create_category(client, a_headers, "MINE", "dish-mine")
    foreign = await _create_category(client, b_headers, "FOREIGN", "dish-foreign")
    resp = await _reorder(client, a_headers, [mine["id"], foreign["id"]])
    assert resp.status_code == 409, resp.text
    # The foreign category keeps its identity and position.
    rows = await _list(client, b_headers)
    assert [r["name"] for r in rows] == ["FOREIGN"]


async def test_reorder_requires_auth(client):
    headers, _ = await register_company(client, slug="acme", email="o@acme.example.com")
    a = await _create_category(client, headers, "Супы", "dish-soup")
    resp = await client.patch(
        "/inventory/categories/reorder", json={"category_ids": [a["id"]]}
    )
    assert resp.status_code in (401, 403), resp.text


# ── PARTIAL-контракт: категории вне списка сохраняют порядок ───────────────

async def test_reorder_subset_leaves_other_categories_untouched(client):
    headers, _ = await register_company(client, slug="acme", email="o@acme.example.com")
    a = await _create_category(client, headers, "Супы", "dish-soup", sort_order=0)
    b = await _create_category(client, headers, "Горячее", "dish-hot", sort_order=1)
    c = await _create_category(client, headers, "Чай", "sales-tea", sort_order=5, is_active=False)
    resp = await _reorder(client, headers, [b["id"], a["id"]])
    assert resp.status_code == 200, resp.text
    rows = {r["name"]: r for r in await _list(client, headers, include_inactive=True)}
    # The sent (visible) subset is renumbered 0..n-1 in the requested order…
    assert rows["Горячее"]["sort_order"] == 0
    assert rows["Супы"]["sort_order"] == 1
    # …while the category outside the list keeps its stored position.
    assert rows["Чай"]["sort_order"] == 5


# ── Invariants: reorder mutates ONLY sort_order ────────────────────────────

async def test_reorder_does_not_touch_flags_name_or_slug(client):
    headers, _ = await register_company(client, slug="acme", email="o@acme.example.com")
    a = await _create_category(
        client, headers, "Супы", "dish-soup",
        calculate_service=True, show_in_menu=True,
    )
    b = await _create_category(client, headers, "Горячее", "dish-hot")
    resp = await _reorder(client, headers, [b["id"], a["id"]])
    assert resp.status_code == 200, resp.text
    rows = {r["name"]: r for r in await _list(client, headers)}
    # Order applied…
    assert rows["Горячее"]["sort_order"] == 0
    assert rows["Супы"]["sort_order"] == 1
    # …and business state survived untouched (order is order, nothing else).
    assert rows["Супы"]["slug"] == "dish-soup"
    assert rows["Супы"]["calculate_service"] is True
    assert rows["Супы"]["show_in_menu"] is True
    assert rows["Супы"]["is_active"] is True
    assert rows["Горячее"]["calculate_service"] is False


async def test_reorder_keeps_archived_flag_and_tab_split(client):
    headers, _ = await register_company(client, slug="acme", email="o@acme.example.com")
    a = await _create_category(client, headers, "Супы", "dish-soup")
    b = await _create_category(client, headers, "Горячее", "dish-hot")
    c = await _create_category(client, headers, "Старое", "dish-old")
    # Archive the middle category; the Active tab drag then reorders only the
    # two actives, and the archived row is never reactivated or renumbered.
    assert (
        await client.patch(
            f"/inventory/categories/{b['id']}", headers=headers, json={"is_active": False}
        )
    ).status_code == 200
    resp = await _reorder(client, headers, [c["id"], a["id"]])
    assert resp.status_code == 200, resp.text
    rows = {r["name"]: r for r in await _list(client, headers, include_inactive=True)}
    # Active subset renumbered; the archived one is untouched and still archived.
    assert rows["Старое"]["sort_order"] == 0
    assert rows["Супы"]["sort_order"] == 1
    assert rows["Горячее"]["is_active"] is False
    assert rows["Горячее"]["sort_order"] == 0  # its original create-time value
