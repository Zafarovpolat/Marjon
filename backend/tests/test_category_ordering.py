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
    # A fresh read uses the persisted canonical positions.
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
    assert [r["sort_order"] for r in rows] == [0, 1]


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
    assert rows["Горячее"]["sort_order"] == b["sort_order"]


async def test_new_category_is_always_at_bottom_even_with_zero_from_old_client(client):
    headers, _ = await register_company(client, slug="append", email="o@append.example.com")
    first = await _create_category(client, headers, "Ягоды", "dish-berries", sort_order=0)
    second = await _create_category(client, headers, "Супы", "dish-soups", sort_order=0)
    new = await _create_category(client, headers, "Абрикос", "dish-apricot", sort_order=0)
    assert [first["sort_order"], second["sort_order"], new["sort_order"]] == [0, 1, 2]
    assert [row["id"] for row in await _list(client, headers)] == [first["id"], second["id"], new["id"]]


async def test_append_after_reorder_keeps_existing_order(client):
    headers, _ = await register_company(client, slug="append-drag", email="o@append-drag.example.com")
    first = await _create_category(client, headers, "Ягоды", "dish-berries")
    second = await _create_category(client, headers, "Супы", "dish-soups")
    assert (await _reorder(client, headers, [second["id"], first["id"]])).status_code == 200
    new = await _create_category(client, headers, "Абрикос", "dish-apricot")
    assert [row["id"] for row in await _list(client, headers)] == [second["id"], first["id"], new["id"]]
    assert new["sort_order"] == 2


async def test_append_after_legacy_zero_positions_does_not_renumber_existing(client):
    headers, _ = await register_company(client, slug="append-legacy", email="o@append-legacy.example.com")
    first = await _create_category(client, headers, "Ягоды", "legacy-berries")
    second = await _create_category(client, headers, "Супы", "dish-soups")
    assert (await client.patch(f"/inventory/categories/{second['id']}", headers=headers, json={"sort_order": 0})).status_code == 200
    new = await _create_category(client, headers, "Абрикос", "dish-apricot")
    rows = await _list(client, headers)
    assert rows[-1]["id"] == new["id"]
    assert new["sort_order"] == 1
    assert {row["id"]: row["sort_order"] for row in rows if row["id"] != new["id"]} == {first["id"]: 0, second["id"]: 0}


async def test_append_handles_gaps_archives_other_sections_and_company_scope(client):
    headers, _ = await register_company(client, slug="append-scope", email="o@append-scope.example.com")
    foreign_headers, _ = await register_company(client, slug="append-other", email="o@append-other.example.com")
    await _create_category(client, foreign_headers, "Чужая", "dish-other", sort_order=999)
    legacy = await _create_category(client, headers, "Старая", "legacy-food", sort_order=20)
    archived = await _create_category(client, headers, "Архив", "sales-old", sort_order=50, is_active=False)
    for prefix in ("dish", "sales", "raw", "semi"):
        new = await _create_category(client, headers, "Новая " + prefix, prefix + "-new", sort_order=0)
        assert new["sort_order"] == 51 + ("dish", "sales", "raw", "semi").index(prefix)
    rows = {row["id"]: row for row in await _list(client, headers, include_inactive=True)}
    assert rows[legacy["id"]]["sort_order"] == 20
    assert rows[archived["id"]]["sort_order"] == 50
    assert rows[archived["id"]]["is_active"] is False
