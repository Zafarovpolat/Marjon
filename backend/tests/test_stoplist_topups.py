"""STOP-LIST V3: накопительные топ-апы доступного остатка + история.

Только изолированные in-memory SQLite фикстуры, никогда dev-БД.
Модель: Product.daily_limit (канонический доступный объём, NUMERIC),
Product.sold_count (потреблено, NUMERIC) + append-only
product_limit_topups. Доступно = daily_limit - sold_count.
"""
from __future__ import annotations

import asyncio
from decimal import Decimal
from uuid import uuid4

import pytest

from app.modules.inventory.models import Product
from tests.test_cancelled_dishes_phase1 import _setup_company


async def _order_payload(ctx, product_id, qty):
    return {
        "branch_id": str(ctx["branch_id"]),
        "items": [{"product_id": str(product_id), "quantity": str(qty)}],
    }


async def _topup(client, ctx, pid, amount, key=None):
    key = key or str(uuid4())
    r = await client.post(
        f"/inventory/products/{pid}/topups",
        headers=ctx["headers"],
        json={"amount": str(amount), "idempotency_key": key},
    )
    return r, key


def _available(body):
    assert body["daily_limit"] is not None
    return Decimal(str(body["daily_limit"])) - Decimal(str(body["sold_count"]))


def _history_amounts(body):
    return [Decimal(str(t["amount"])) for t in body.get("recent_topups", [])]


@pytest.mark.asyncio
async def test_topup_first_200(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-a-{sfx}", email=f"v3-a-{sfx}@example.com")
    pid = ctx["product_id"]
    r, _ = await _topup(client, ctx, pid, "200")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["duplicate"] is False
    assert _available(body["product"]) == Decimal("200")
    assert _history_amounts(body["product"]) == [Decimal("200")]


@pytest.mark.asyncio
async def test_topup_accumulates_and_history_slides(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-b-{sfx}", email=f"v3-b-{sfx}@example.com")
    pid = ctx["product_id"]
    for amount in ("200", "55", "25", "40"):
        r, _ = await _topup(client, ctx, pid, amount)
        assert r.status_code == 201, r.text
    # Полная история — все четыре, по порядку.
    r = await client.get(f"/inventory/products/{pid}/topups", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    assert [Decimal(str(t["amount"])) for t in r.json()] == [
        Decimal("200"), Decimal("55"), Decimal("25"), Decimal("40"),
    ]
    # Видимые — только последние два.
    r = await client.get(f"/inventory/products/{pid}", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    assert _history_amounts(r.json()) == [Decimal("25"), Decimal("40")]
    assert _available(r.json()) == Decimal("320")


@pytest.mark.asyncio
async def test_sales_consume_and_topup_adds_exact(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-c-{sfx}", email=f"v3-c-{sfx}@example.com")
    pid = ctx["product_id"]
    for amount in ("200", "55"):
        r, _ = await _topup(client, ctx, pid, amount)
        assert r.status_code == 201, r.text
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 30))
    assert r.status_code == 201, r.text
    r = await client.get(f"/inventory/products/{pid}", headers=ctx["headers"])
    assert _available(r.json()) == Decimal("225")
    # Продажа историю не меняет.
    assert _history_amounts(r.json()) == [Decimal("200"), Decimal("55")]
    r, _ = await _topup(client, ctx, pid, "25")
    assert r.status_code == 201, r.text
    assert _available(r.json()["product"]) == Decimal("250")
    assert _history_amounts(r.json()["product"]) == [Decimal("55"), Decimal("25")]
    # Дробная продажа 0.5 → 249.5 ровно.
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "0.5"))
    assert r.status_code == 201, r.text
    r = await client.get(f"/inventory/products/{pid}", headers=ctx["headers"])
    assert _available(r.json()) == Decimal("249.5")


@pytest.mark.asyncio
async def test_idempotent_replay_no_double_add(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-d-{sfx}", email=f"v3-d-{sfx}@example.com")
    pid = ctx["product_id"]
    key = str(uuid4())
    r, _ = await _topup(client, ctx, pid, "55", key)
    assert r.status_code == 201, r.text
    r2, _ = await _topup(client, ctx, pid, "55", key)
    assert r2.status_code == 200, r2.text
    assert r2.json()["duplicate"] is True
    assert _available(r2.json()["product"]) == Decimal("55")
    r = await client.get(f"/inventory/products/{pid}/topups", headers=ctx["headers"])
    assert len(r.json()) == 1


@pytest.mark.asyncio
async def test_concurrent_topups_no_loss(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-e-{sfx}", email=f"v3-e-{sfx}@example.com")
    pid = ctx["product_id"]
    results = await asyncio.gather(*[_topup(client, ctx, pid, "25") for _ in range(5)])
    assert all(r.status_code == 201 for r, _ in results), [r.text for r, _ in results]
    r = await client.get(f"/inventory/products/{pid}", headers=ctx["headers"])
    assert _available(r.json()) == Decimal("125")
    r = await client.get(f"/inventory/products/{pid}/topups", headers=ctx["headers"])
    assert len(r.json()) == 5


@pytest.mark.asyncio
async def test_concurrent_sale_and_topup_consistent(client, db_engine):
    # Примечание: настоящий write-write рейс sale+topup на этом harness
    # невозможен детерминированно — тестовый SQLite делит одно соединение,
    # и конкурентное создание заказов падает StaleDataError в коде заказов
    # (не в лимитах). Гонку записей покрывает 5× gather топ-апов выше +
    # FOR UPDATE + retry в проде (Postgres). Здесь — когерентность смешанных
    # операций: продажа потребляет, пополнение добавляет, итог точный.
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-f-{sfx}", email=f"v3-f-{sfx}@example.com")
    pid = ctx["product_id"]
    r, _ = await _topup(client, ctx, pid, "100")
    assert r.status_code == 201, r.text
    r = await client.post("/pos/orders", headers=ctx["headers"], json={
        "branch_id": str(ctx["branch_id"]),
        "items": [{"product_id": str(pid), "quantity": "30"}],
    })
    assert r.status_code == 201, r.text
    r, _ = await _topup(client, ctx, pid, "25")
    assert r.status_code == 201, r.text
    r = await client.get(f"/inventory/products/{pid}", headers=ctx["headers"])
    body = r.json()
    assert Decimal(str(body["daily_limit"])) == Decimal("125")
    assert Decimal(str(body["sold_count"])) == Decimal("30")
    assert _available(body) == Decimal("95")


@pytest.mark.asyncio
async def test_oversell_blocked_and_autostop_recovers_on_topup(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-g-{sfx}", email=f"v3-g-{sfx}@example.com")
    pid = ctx["product_id"]
    r, _ = await _topup(client, ctx, pid, "2.0")
    assert r.status_code == 201, r.text
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "2.0"))
    assert r.status_code == 201, r.text
    async with ctx["sessions"]() as db:
        assert (await db.get(Product, pid)).is_available is False
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "0.5"))
    assert r.status_code == 422, r.text
    # Пополнение после авто-стопа возвращает в продажу (ручной стоп — нет).
    r, _ = await _topup(client, ctx, pid, "1.0")
    assert r.status_code == 201, r.text
    async with ctx["sessions"]() as db:
        assert (await db.get(Product, pid)).is_available is True
    assert _available(r.json()["product"]) == Decimal("1.0")


@pytest.mark.asyncio
async def test_manual_stop_survives_topup(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-h-{sfx}", email=f"v3-h-{sfx}@example.com")
    pid = ctx["product_id"]
    r = await client.patch(
        f"/inventory/products/{pid}/availability", headers=ctx["headers"], json={"is_available": False}
    )
    assert r.status_code == 200, r.text
    r, _ = await _topup(client, ctx, pid, "50")
    assert r.status_code == 201, r.text
    async with ctx["sessions"]() as db:
        assert (await db.get(Product, pid)).is_available is False
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 1))
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_cancel_does_not_double_restore(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-i-{sfx}", email=f"v3-i-{sfx}@example.com")
    pid = ctx["product_id"]
    r, _ = await _topup(client, ctx, pid, "10")
    assert r.status_code == 201, r.text
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "3.5"))
    assert r.status_code == 201, r.text
    order_id = r.json()["id"]
    r = await client.delete(f"/pos/orders/{order_id}", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    async with ctx["sessions"]() as db:
        assert (await db.get(Product, pid)).sold_count == Decimal("0")
    r = await client.delete(f"/pos/orders/{order_id}", headers=ctx["headers"])
    assert r.status_code == 422, r.text
    async with ctx["sessions"]() as db:
        assert (await db.get(Product, pid)).sold_count == Decimal("0")


@pytest.mark.asyncio
async def test_company_isolation(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-j-{sfx}", email=f"v3-j-{sfx}@example.com")
    foreign = await _setup_company(client, db_engine, slug=f"v3-jf-{sfx}", email=f"v3-jf-{sfx}@example.com")
    pid = ctx["product_id"]
    r, _ = await _topup(client, foreign, pid, "10")
    assert r.status_code == 404, r.text
    r = await client.get(f"/inventory/products/{pid}/topups", headers=foreign["headers"])
    assert r.status_code == 404, r.text


@pytest.mark.asyncio
async def test_warehouse_stock_untouched_by_topup(client, db_engine):
    from decimal import Decimal as D

    from app.modules.inventory.models import Ingredient, StockItem, Warehouse

    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-k-{sfx}", email=f"v3-k-{sfx}@example.com")
    pid = ctx["product_id"]
    async with ctx["sessions"]() as db:
        wh = Warehouse(company_id=ctx["company_id"], name="Main")
        ing = Ingredient(company_id=ctx["company_id"], name="Flour", unit="кг")
        db.add_all([wh, ing])
        await db.flush()
        db.add(StockItem(
            company_id=ctx["company_id"], warehouse_id=wh.id, ingredient_id=ing.id,
            quantity=D("100"), unit="кг", min_quantity=D("0"), cost_price=D("10"),
        ))
        await db.commit()
        before = (await db.execute(
            __import__("sqlalchemy").select(StockItem.quantity).where(
                StockItem.company_id == ctx["company_id"])
        )).scalar_one()
    r, _ = await _topup(client, ctx, pid, "77.5")
    assert r.status_code == 201, r.text
    async with ctx["sessions"]() as db:
        after = (await db.execute(
            __import__("sqlalchemy").select(StockItem.quantity).where(
                StockItem.company_id == ctx["company_id"])
        )).scalar_one()
    assert after == before == D("100")


@pytest.mark.asyncio
async def test_reset_keeps_product_and_history(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v3-l-{sfx}", email=f"v3-l-{sfx}@example.com")
    pid = ctx["product_id"]
    for amount in ("200", "55"):
        r, _ = await _topup(client, ctx, pid, amount)
        assert r.status_code == 201, r.text
    r = await client.post(f"/inventory/products/{pid}/allowance-reset", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["daily_limit"] is None
    assert Decimal(str(body["sold_count"])) == Decimal("0")
    assert body["is_active"] is True
    # История жива: обе строки на месте.
    r = await client.get(f"/inventory/products/{pid}/topups", headers=ctx["headers"])
    assert [Decimal(str(t["amount"])) for t in r.json()] == [Decimal("200"), Decimal("55")]


async def _flag(db_sessions, pid):
    async with db_sessions() as db:
        product = await db.get(Product, pid)
        return product.is_available, product.limit_auto_stopped


@pytest.mark.asyncio
async def test_auto_stop_sets_flag_and_topup_clears_it(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v32-a-{sfx}", email=f"v32-a-{sfx}@example.com")
    pid = ctx["product_id"]
    r, _ = await _topup(client, ctx, pid, "2.0")
    assert r.status_code == 201, r.text
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "2.0"))
    assert r.status_code == 201, r.text
    assert await _flag(ctx["sessions"], pid) == (False, True)
    r, _ = await _topup(client, ctx, pid, "1.0")
    assert r.status_code == 201, r.text
    assert await _flag(ctx["sessions"], pid) == (True, False)
    assert _available(r.json()["product"]) == Decimal("1.0")


@pytest.mark.asyncio
async def test_manual_stop_while_exhausted_survives_topup(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v32-b-{sfx}", email=f"v32-b-{sfx}@example.com")
    pid = ctx["product_id"]
    r, _ = await _topup(client, ctx, pid, "2.0")
    assert r.status_code == 201, r.text
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "2.0"))
    assert r.status_code == 201, r.text
    assert await _flag(ctx["sessions"], pid) == (False, True)
    # Владелец вручную подтверждает стоп поверх авто-стопа: приоритет у человека.
    r = await client.patch(
        f"/inventory/products/{pid}/availability", headers=ctx["headers"], json={"is_available": False}
    )
    assert r.status_code == 200, r.text
    assert await _flag(ctx["sessions"], pid) == (False, False)
    r, _ = await _topup(client, ctx, pid, "10")
    assert r.status_code == 201, r.text
    # Квота выросла, но блюдо НЕ вернулось в продажу.
    assert await _flag(ctx["sessions"], pid) == (False, False)
    assert _available(r.json()["product"]) == Decimal("10")
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 1))
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_first_topup_ignores_pre_quota_sales(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v32-c-{sfx}", email=f"v32-c-{sfx}@example.com")
    pid = ctx["product_id"]
    # Реальный путь к состоянию (limit=None, sold=40): был абсолютный лимит,
    # продали 40, лимит сняли абсолютным PATCH (счётчик остался).
    r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": 100})
    assert r.status_code == 200, r.text
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 40))
    assert r.status_code == 201, r.text
    r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": None})
    assert r.status_code == 200, r.text
    async with ctx["sessions"]() as db:
        p = await db.get(Product, pid)
        assert p.daily_limit is None and p.sold_count == Decimal("40")
    # Первое пополнение: доступно ровно 200, а не 160.
    r, _ = await _topup(client, ctx, pid, "200")
    assert r.status_code == 201, r.text
    assert _available(r.json()["product"]) == Decimal("200")
    async with ctx["sessions"]() as db:
        assert (await db.get(Product, pid)).sold_count == Decimal("0")
    # Обычный случай: остаток 170 + 55 = 225 (sold относится к allowance).
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 30))
    assert r.status_code == 201, r.text
    r, _ = await _topup(client, ctx, pid, "55")
    assert r.status_code == 201, r.text
    assert _available(r.json()["product"]) == Decimal("225")


@pytest.mark.asyncio
async def test_reset_clears_flag_but_keeps_stop(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v32-d-{sfx}", email=f"v32-d-{sfx}@example.com")
    pid = ctx["product_id"]
    r, _ = await _topup(client, ctx, pid, "5")
    assert r.status_code == 201, r.text
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 5))
    assert r.status_code == 201, r.text
    assert await _flag(ctx["sessions"], pid) == (False, True)
    r = await client.post(f"/inventory/products/{pid}/allowance-reset", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    # Счётчики чистые, стоп на месте, флаг причины стёрт, история жива.
    assert await _flag(ctx["sessions"], pid) == (False, False)
    r = await client.get(f"/inventory/products/{pid}/topups", headers=ctx["headers"])
    assert len(r.json()) == 1


@pytest.mark.asyncio
async def test_allowance_zero_blocks_sales_not_unlimited(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v35-a-{sfx}", email=f"v35-a-{sfx}@example.com")
    pid = ctx["product_id"]
    for amount in ("200", "50"):
        r, _ = await _topup(client, ctx, pid, amount)
        assert r.status_code == 201, r.text
    r = await client.post(f"/inventory/products/{pid}/allowance-zero", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert Decimal(str(body["daily_limit"])) == Decimal("0")
    assert Decimal(str(body["sold_count"])) == Decimal("0")
    assert body["is_available"] is False
    # Ноль — не unlimited: продажа отклоняется, склад и история не тронуты.
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 1))
    assert r.status_code == 422, r.text
    async with ctx["sessions"]() as db:
        from app.modules.inventory.models import ProductLimitTopup

        assert (await db.get(Product, pid)).sold_count == Decimal("0")
        count = len((await db.execute(
            __import__("sqlalchemy").select(ProductLimitTopup).where(
                ProductLimitTopup.product_id == pid)
        )).scalars().all())
        assert count == 2
    # Повтор идемпотентен; топ-ап 40 после нуля даёт ровно 40.
    r = await client.post(f"/inventory/products/{pid}/allowance-zero", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    r, _ = await _topup(client, ctx, pid, "40")
    assert r.status_code == 201, r.text
    assert _available(r.json()["product"]) == Decimal("40")


@pytest.mark.asyncio
async def test_allowance_zero_preserves_manual_stop(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v35-b-{sfx}", email=f"v35-b-{sfx}@example.com")
    pid = ctx["product_id"]
    r, _ = await _topup(client, ctx, pid, "100")
    assert r.status_code == 201, r.text
    r = await client.patch(
        f"/inventory/products/{pid}/availability", headers=ctx["headers"], json={"is_available": False}
    )
    assert r.status_code == 200, r.text
    r = await client.post(f"/inventory/products/{pid}/allowance-zero", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    assert await _flag(ctx["sessions"], pid) == (False, False)


@pytest.mark.asyncio
async def test_history_reset_checkpoint_survives_and_filters(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v35-c-{sfx}", email=f"v35-c-{sfx}@example.com")
    pid = ctx["product_id"]
    for amount in ("200", "55", "25"):
        r, _ = await _topup(client, ctx, pid, amount)
        assert r.status_code == 201, r.text
    r = await client.post(f"/inventory/products/{pid}/history-reset", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    # Видимое окно пусто (checkpoint=3), остаток НЕ тронут.
    assert body["recent_topups"] == []
    assert body["history_reset_seq"] == 3
    assert _available(body) == Decimal("280")
    # Полная история цела (3 строки).
    r = await client.get(f"/inventory/products/{pid}/topups", headers=ctx["headers"])
    assert [Decimal(str(t["amount"])) for t in r.json()] == [
        Decimal("200"), Decimal("55"), Decimal("25")]
    # Повтор идемпотентен (тот же checkpoint).
    r = await client.post(f"/inventory/products/{pid}/history-reset", headers=ctx["headers"])
    assert r.json()["history_reset_seq"] == 3
    # Следующий топ-ап 40 виден как [40], затем 20 → (40) 20; старое не всплывает.
    r, _ = await _topup(client, ctx, pid, "40")
    assert [Decimal(str(t["amount"])) for t in r.json()["product"]["recent_topups"]] == [Decimal("40")]
    r, _ = await _topup(client, ctx, pid, "20")
    assert [Decimal(str(t["amount"])) for t in r.json()["product"]["recent_topups"]] == [
        Decimal("40"), Decimal("20")]
    assert _available(r.json()["product"]) == Decimal("340")


@pytest.mark.asyncio
async def test_zero_and_history_endpoints_company_scoped(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v35-d-{sfx}", email=f"v35-d-{sfx}@example.com")
    foreign = await _setup_company(client, db_engine, slug=f"v35-df-{sfx}", email=f"v35-df-{sfx}@example.com")
    pid = ctx["product_id"]
    for path in ("allowance-zero", "history-reset"):
        r = await client.post(f"/inventory/products/{pid}/{path}", headers=foreign["headers"])
        assert r.status_code == 404, (path, r.text)


@pytest.mark.asyncio
async def test_reported_lavash_case_end_to_end(client, db_engine):
    """Точный сценарий из пользовательского репорта:
    остаток 23 + история (56) 23 → zero → history-reset → 40 → 20."""
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"v35-e-{sfx}", email=f"v35-e-{sfx}@example.com")
    pid = ctx["product_id"]
    for amount in ("56", "23"):
        r, _ = await _topup(client, ctx, pid, amount)
        assert r.status_code == 201, r.text
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 56))
    assert r.status_code == 201, r.text
    # A: остаток 23, история (56) 23 → обнулить остаток → 0, история intact.
    r = await client.post(f"/inventory/products/{pid}/allowance-zero", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    assert _available(r.json()) == Decimal("0")
    assert _history_amounts(r.json()) == [Decimal("56"), Decimal("23")]
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 1))
    assert r.status_code == 422, r.text
    # B: обнулить историю → видимое 0, остаток 0, audit цел.
    r = await client.post(f"/inventory/products/{pid}/history-reset", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["recent_topups"] == []
    assert _available(r.json()) == Decimal("0")
    r = await client.get(f"/inventory/products/{pid}/topups", headers=ctx["headers"])
    assert [Decimal(str(t["amount"])) for t in r.json()] == [Decimal("56"), Decimal("23")]
    # C: топ-ап 40 → остаток 40, видимая [40].
    r, _ = await _topup(client, ctx, pid, "40")
    assert r.status_code == 201, r.text
    assert _available(r.json()["product"]) == Decimal("40")
    assert _history_amounts(r.json()["product"]) == [Decimal("40")]
    # D: топ-ап 20 → остаток 60, видимая (40) 20.
    r, _ = await _topup(client, ctx, pid, "20")
    assert r.status_code == 201, r.text
    assert _available(r.json()["product"]) == Decimal("60")
    assert _history_amounts(r.json()["product"]) == [Decimal("40"), Decimal("20")]
