"""Единицы измерения по умолчанию: порядок 1..5 вместо нулей

Что не так было
---------------
Справочник ``nm_units`` ничем не заполнялся при создании компании, поэтому
владелец заводил Кг/Гр/Лт/Пр/Шт руками. У всех пяти строк ``sort = 0``:
колонка «Порядок» в «Настройки → Единицы измерения» показывала нули, а
порядок строк задавался именем, а не владельцем.

Что делает миграция
-------------------
1. Проставляет ``sort`` по канону из ``nomenclature/default_units.py``:
   Килограмм=1, Порция=2, Штука=3, Грамм=4, Литр=5. Сопоставление по
   имени без учёта регистра, поэтому «килограмм» и «Килограмм» попадают
   в одну строку.
2. Переименовывает легаси «Штук»/«Штуки» в «Штука» — но только там, где
   «Штука» ещё нет, иначе в одном справочнике появились бы две одинаковые
   единицы.
3. Компаниям с полностью пустым справочником создаёт стартовую пятёрку.

Чего миграция НЕ делает
-----------------------
Не трогает единицы с другими именами (владелец мог завести «Упаковка»,
«Ящик» и т.п.) — им остаётся их ``sort``. Не удаляет ничего: откат
(downgrade) только возвращает нули в ``sort``, строки остаются.

Revision ID: un03sort01
Revises: pwlock01
Create Date: 2026-10-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "un03sort01"
down_revision: Union[str, None] = "pwlock01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


#: Канонический порядок. Держим в синхроне с nomenclature/default_units.py
#: (там же — короткие имена). В миграции дублируется намеренно: миграция
#: должна оставаться неизменной, даже если канон в коде поменяется.
CANONICAL: tuple[tuple[str, int], ...] = (
    ("Килограмм", 1),
    ("Порция", 2),
    ("Штука", 3),
    ("Грамм", 4),
    ("Литр", 5),
)

LEGACY_SHORT_NAMES = ("Штук", "Штуки")


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Порядок по канону. Один UPDATE на имя, регистронезависимо.
    for name, sort in CANONICAL:
        bind.execute(
            sa.text(
                "UPDATE nm_units SET sort = :sort "
                "WHERE lower(name) = lower(:name)"
            ),
            {"sort": sort, "name": name},
        )

    # 2. «Штук»/«Штуки» → «Штука», если «Штуки» в этом же справочнике нет.
    for legacy in LEGACY_SHORT_NAMES:
        bind.execute(
            sa.text(
                """
                UPDATE nm_units AS u
                   SET name = 'Штука'
                 WHERE lower(u.name) = lower(:legacy)
                   AND NOT EXISTS (
                        SELECT 1 FROM nm_units AS other
                         WHERE other.company_id IS NOT DISTINCT FROM u.company_id
                           AND lower(other.name) = lower('Штука')
                   )
                """
            ),
            {"legacy": legacy},
        )

    # 3. Компании без единиц вообще получают стартовую пятёрку.
    bind.execute(
        sa.text(
            """
            INSERT INTO nm_units (id, company_id, name, short_name, sort, status)
            SELECT gen_random_uuid(), c.id, v.name, v.short_name, v.sort, true
              FROM companies AS c
             CROSS JOIN (VALUES
                    ('Килограмм', 'Кг', 1),
                    ('Порция',    'Пр', 2),
                    ('Штука',     'Шт', 3),
                    ('Грамм',     'Гр', 4),
                    ('Литр',      'Лт', 5)
             ) AS v(name, short_name, sort)
             WHERE NOT EXISTS (
                    SELECT 1 FROM nm_units AS u WHERE u.company_id = c.id
             )
            """
        )
    )


def downgrade() -> None:
    """Вернуть нули в ``sort`` для канонических единиц.

    Строки, созданные миграцией, не удаляются: отличить их от заведённых
    владельцем нельзя, а удаление справочника сломало бы ссылки products.
    """
    bind = op.get_bind()
    names = [name for name, _ in CANONICAL]
    bind.execute(
        sa.text("UPDATE nm_units SET sort = 0 WHERE lower(name) = ANY(:names)"),
        {"names": [n.lower() for n in names]},
    )
