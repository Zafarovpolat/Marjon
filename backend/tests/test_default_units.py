"""Стартовый справочник единиц измерения (UN03SORT-01).

Проверяем три вещи:
1. состав и порядок канона в самом модуле — sort идёт 1..5, без нулей;
2. регистрация компании сразу отдаёт эти единицы через GET /units в том же
   порядке (список по умолчанию сортируется по sort);
3. справочник тенантный: у второй компании свои строки, чужие не видны.
"""
from tests.conftest import register_company

from app.modules.nomenclature.default_units import DEFAULT_UNITS

EXPECTED = [
    ("Килограмм", "Кг", 1),
    ("Порция", "Пр", 2),
    ("Штука", "Шт", 3),
    ("Грамм", "Гр", 4),
    ("Литр", "Лт", 5),
]


def test_canonical_units_start_at_one_and_keep_declared_order():
    assert [(u["name"], u["short_name"], u["sort"]) for u in DEFAULT_UNITS] == EXPECTED
    # Ноль — это «не задано»: в настройках колонка «Порядок» показывала бы
    # нули, и порядок строк задавался бы именем, а не владельцем.
    assert all(u["sort"] != 0 for u in DEFAULT_UNITS)
    assert [u["sort"] for u in DEFAULT_UNITS] == [1, 2, 3, 4, 5]


async def test_register_seeds_units_in_canonical_order(client):
    headers, _ = await register_company(
        client, slug="units-order", email="units@units-order.example.com"
    )

    resp = await client.get("/units", headers=headers, params={"size": 50})

    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert [(u["name"], u["short_name"], u["sort"]) for u in items] == EXPECTED
    # Фронт читает sort_order (мирроринг поля sort для owner-приложения).
    assert [u["sort_order"] for u in items] == [1, 2, 3, 4, 5]


async def test_units_are_tenant_scoped(client):
    first, _ = await register_company(
        client, slug="units-alpha", email="units@alpha.example.com"
    )
    second, _ = await register_company(
        client, slug="units-beta", email="units@beta.example.com"
    )

    alpha = (await client.get("/units", headers=first, params={"size": 50})).json()["items"]
    beta = (await client.get("/units", headers=second, params={"size": 50})).json()["items"]

    assert len(alpha) == len(beta) == 5
    assert {u["company_id"] for u in alpha} != {u["company_id"] for u in beta}
    assert not {u["id"] for u in alpha} & {u["id"] for u in beta}
