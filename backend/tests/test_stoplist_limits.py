"""STOP-LIST V1: канонический daily_limit + backend POS-enforcement.

Только изолированные in-memory SQLite фикстуры, никогда dev-БД.
Модель переиспользована (Product.daily_limit/sold_count/is_available),
миграций нет. Остаток — реальный ProductResponse.stock (null без рецепта).
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.modules.inventory.models import Product
from tests.test_cancelled_dishes_phase1 import _setup_company


async def _order_payload(ctx, product_id, qty):
    return {
        "branch_id": str(ctx["branch_id"]),
        "items": [{"product_id": str(product_id), "quantity": str(qty)}],
    }


@pytest.mark.asyncio
async def test_limit_persists_and_survives_refetch(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-a-{sfx}", email=f"stop-a-{sfx}@example.com")
    pid = ctx["product_id"]

    r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": 8})
    assert r.status_code == 200, r.text
    assert Decimal(str(r.json()["daily_limit"])) == 8

    # Канонический refetch — то же значение (F5/Ctrl+F5 держатся сервером).
    r = await client.get(f"/inventory/products/{pid}", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    assert Decimal(str(r.json()["daily_limit"])) == 8


@pytest.mark.asyncio
async def test_limit_quantity_validation(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-b-{sfx}", email=f"stop-b-{sfx}@example.com")
    pid = ctx["product_id"]
    for bad in (0, -3):
        r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": bad})
        assert r.status_code == 422, r.text
    # Продукт не задет невалидной попыткой.
    r = await client.get(f"/inventory/products/{pid}", headers=ctx["headers"])
    assert r.json()["daily_limit"] is None


@pytest.mark.asyncio
async def test_limit_company_scoped_and_cross_tenant_denied(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-c-{sfx}", email=f"stop-c-{sfx}@example.com")
    foreign = await _setup_company(client, db_engine, slug=f"stop-cf-{sfx}", email=f"stop-cf-{sfx}@example.com")
    pid = ctx["product_id"]

    r = await client.patch(f"/inventory/products/{pid}/limit", headers=foreign["headers"], json={"daily_limit": 5})
    assert r.status_code == 404, r.text
    r = await client.get(f"/inventory/products/{pid}", headers=foreign["headers"])
    assert r.status_code == 404, r.text
    # Своя компания — ок.
    r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": 5})
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_reset_removes_limit_without_deleting_product(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-d-{sfx}", email=f"stop-d-{sfx}@example.com")
    pid = ctx["product_id"]

    r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": 5})
    assert r.status_code == 200, r.text
    r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": None})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["daily_limit"] is None
    assert body["is_active"] is True
    # Продукт жив и читается.
    r = await client.get(f"/inventory/products/{pid}", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Plov"


@pytest.mark.asyncio
async def test_remainder_is_truthful_not_fabricated(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-e-{sfx}", email=f"stop-e-{sfx}@example.com")
    r = await client.get(f"/inventory/products/{ctx['product_id']}", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    # Без рецепта — null, а не фейковый 0 и не копия лимита.
    assert r.json()["stock"] is None
    r = await client.patch(
        f"/inventory/products/{ctx['product_id']}/limit", headers=ctx["headers"], json={"daily_limit": 12}
    )
    assert r.status_code == 200, r.text
    assert r.json()["stock"] is None
    assert Decimal(str(r.json()["daily_limit"])) == 12


@pytest.mark.asyncio
async def test_pos_rejects_stopped_dish(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-f-{sfx}", email=f"stop-f-{sfx}@example.com")
    r = await client.patch(
        f"/inventory/products/{ctx['product_id']}/availability",
        headers=ctx["headers"], json={"is_available": False},
    )
    assert r.status_code == 200, r.text
    r = await client.post(
        "/pos/orders", headers=ctx["headers"],
        json=await _order_payload(ctx, ctx["product_id"], 1),
    )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_pos_enforces_limit_and_autostops(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-g-{sfx}", email=f"stop-g-{sfx}@example.com")
    pid = ctx["product_id"]
    r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": 5})
    assert r.status_code == 200, r.text

    # 3 порции — ок, счётчик 3.
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 3))
    assert r.status_code == 201, r.text

    async with ctx["sessions"]() as db:
        product = await db.get(Product, pid)
        assert product.sold_count == 3
        assert product.is_available is True

    # 3 сверх остатка 2 — отказ (не только disabled-кнопка фронта).
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 3))
    assert r.status_code == 422, r.text

    # Ровно остаток 2 — ок, лимит исчерпан → авто-стоп.
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 2))
    assert r.status_code == 201, r.text
    async with ctx["sessions"]() as db:
        product = await db.get(Product, pid)
        assert product.sold_count == 5
        assert product.is_available is False

    # После исчерпания — любая продажа отклоняется.
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, 1))
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_pos_cross_tenant_product_denied(client, db_engine):
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-h-{sfx}", email=f"stop-h-{sfx}@example.com")
    foreign = await _setup_company(client, db_engine, slug=f"stop-hf-{sfx}", email=f"stop-hf-{sfx}@example.com")
    r = await client.post(
        "/pos/orders", headers=foreign["headers"],
        json=await _order_payload(foreign, ctx["product_id"], 1),
    )
    assert r.status_code in (403, 404, 422), r.text


@pytest.mark.asyncio
async def test_limit_accepts_decimal_and_integer_exact(client, db_engine):
    """V2.1: лимит принимает 0.5 / 1.25 / 1212; целое 1212 хранится точно."""
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-dec-{sfx}", email=f"stop-dec-{sfx}@example.com")
    pid = ctx["product_id"]
    for value in ("0.5", "1.25", 1212, "1212.750"):
        r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": value})
        assert r.status_code == 200, (value, r.text)
        assert Decimal(str(r.json()["daily_limit"])) == Decimal(str(value))
    async with ctx["sessions"]() as db:
        product = await db.get(Product, pid)
        assert product.daily_limit == Decimal("1212.750")
        assert isinstance(product.daily_limit, Decimal)
    # 0 и отрицательные по-прежнему invalid; >3 знаков — invalid.
    for bad in (0, "-3", "1.2345"):
        r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": bad})
        assert r.status_code == 422, (bad, r.text)


@pytest.mark.asyncio
async def test_pos_exact_decimal_accounting(client, db_engine):
    """V2.1: limit 2.0; 0.5 → sold 0.5 (rem 1.5); 0.5 → sold 1.0 (rem 1.0);
    0.75 → sold 1.75 (rem 0.25); 0.30 → 422 (0.30 > 0.25); 0.25 → 201 + autostop."""
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-ex-{sfx}", email=f"stop-ex-{sfx}@example.com")
    pid = ctx["product_id"]
    r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": "2.0"})
    assert r.status_code == 200, r.text

    async def sold():
        async with ctx["sessions"]() as db:
            return await db.get(Product, pid)

    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "0.5"))
    assert r.status_code == 201, r.text
    assert (await sold()).sold_count == Decimal("0.5")

    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "0.5"))
    assert r.status_code == 201, r.text
    p = await sold()
    assert p.sold_count == Decimal("1.0")
    assert p.is_available is True

    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "0.75"))
    assert r.status_code == 201, r.text
    assert (await sold()).sold_count == Decimal("1.75")

    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "0.30"))
    assert r.status_code == 422, r.text
    assert (await sold()).sold_count == Decimal("1.75")

    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "0.25"))
    assert r.status_code == 201, r.text
    p = await sold()
    assert p.sold_count == Decimal("2.0")
    assert p.is_available is False


@pytest.mark.asyncio
async def test_pos_decimal_sums_exact(client, db_engine):
    """V2.1: 1.25 + 0.50 = 1.75 ровно (не 2, не 1.8)."""
    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-sum-{sfx}", email=f"stop-sum-{sfx}@example.com")
    pid = ctx["product_id"]
    r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": 10})
    assert r.status_code == 200, r.text
    for qty in ("1.25", "0.50"):
        r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, qty))
        assert r.status_code == 201, r.text
    async with ctx["sessions"]() as db:
        product = await db.get(Product, pid)
        assert product.sold_count == Decimal("1.75")


@pytest.mark.asyncio
async def test_cancel_restores_exact_decimal(client, db_engine):
    """V2.1: sold 1.75, отмена позиции 0.50 → 1.25 ровно; ниже нуля не уходит."""
    from app.modules.pos.service import OrderService

    sfx = uuid4().hex[:8]
    ctx = await _setup_company(client, db_engine, slug=f"stop-can-{sfx}", email=f"stop-can-{sfx}@example.com")
    pid = ctx["product_id"]
    r = await client.patch(f"/inventory/products/{pid}/limit", headers=ctx["headers"], json={"daily_limit": 10})
    assert r.status_code == 200, r.text
    r = await client.post("/pos/orders", headers=ctx["headers"], json=await _order_payload(ctx, pid, "1.75"))
    assert r.status_code == 201, r.text
    order_id = r.json()["id"]
    async with ctx["sessions"]() as db:
        await OrderService(db)._restore_to_limit(ctx["company_id"], pid, Decimal("0.50"))
        await db.commit()
    async with ctx["sessions"]() as db:
        product = await db.get(Product, pid)
        assert product.sold_count == Decimal("1.25")
    # Полная отмена заказа через API тоже вычитает точное количество.
    r = await client.delete(f"/pos/orders/{order_id}", headers=ctx["headers"])
    assert r.status_code == 200, r.text
    async with ctx["sessions"]() as db:
        product = await db.get(Product, pid)
        assert product.sold_count == Decimal("0")


@pytest.mark.asyncio
async def test_no_rounding_in_limit_path():
    """V2.1: int()/ceil/floor/ROUND_CEILING вне лимитного пути насовсем."""
    import re
    from pathlib import Path

    service = Path(__file__).resolve().parents[1] / "app" / "modules" / "pos" / "service.py"
    text = service.read_text(encoding="utf-8")
    assert "_limit_portions" not in text
    assert "ROUND_CEILING" not in text
    assert "ROUND_FLOOR" not in text
    for name in ("_ensure_sale_allowed", "_apply_sale_to_limit", "_restore_to_limit"):
        block = text.split(f"def {name}")[1].split("\n    async def ")[0].split("\n    def ")[0]
        # Убираем docstring и комментарии: проверяем только исполняемый код.
        code = re.sub(r'"""[\s\S]*?"""', "", block)
        code = "\n".join(line.split("#")[0] for line in code.splitlines())
        assert "int(" not in code, name
        assert "float(" not in code, name


@pytest.mark.asyncio
async def test_concurrency_lock_preserved():
    """V2.1: SELECT FOR UPDATE на пути продажи сохранён (сериализация гонок)."""
    from pathlib import Path

    service = Path(__file__).resolve().parents[1] / "app" / "modules" / "pos" / "service.py"
    text = service.read_text(encoding="utf-8")
    assert "for_update=True" in text
    assert "with_for_update()" in text


@pytest.mark.asyncio
async def test_migration_decimal_limits_shape():
    """V2.1: ревизия v32dec01 от v31sort01 переводит оба поля в NUMERIC(12,3)."""
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[1]
        / "migrations" / "versions" / "20261007_v32dec01_product_decimal_limits.py"
    )
    text = path.read_text(encoding="utf-8")
    assert 'down_revision: str = "v31sort01"' in text
    assert "Numeric(12, 3)" in text
    assert text.count("Numeric(12, 3)") >= 2
    assert "daily_limit" in text and "sold_count" in text
    # Downgrade честно помечен как lossy, не притворяется безпотерьным.
    assert "LOSSY" in text
