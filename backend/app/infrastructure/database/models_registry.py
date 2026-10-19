"""Единая регистрация всех ORM-моделей в ``Base.metadata``.

Зачем это нужно
---------------
SQLAlchemy конфигурирует мапперы лениво — при первом обращении к модели.
Если модуль, объявляющий таблицу, на которую ссылается внешний ключ, не
импортирован, конфигурация падает:

    NoReferencedTableError: Foreign key associated with column
    'products.unit_id' could not find table 'nm_units'

Именно так ломался CI-шаг «Схема БД и демо-данные»: ``create_tables.py``
импортировал все модули и проходил, а ``seed.py`` — только часть, и падал на
первом запросе к ``products``. Позже та же история повторилась с
``users.printer_id`` -> ``printers`` в ``scripts/seed_waiter_login.py``:
FK пришла из прод-линии, а скрипт про чужой модуль не знал.

Правило
-------
Скриптам (``create_tables.py``, ``seed.py``, ``scripts/*.py``) нужно
импортировать ЭТОТ модуль, а не отдельные ``app.modules.*.models``. Тогда
новая FK в любом модуле не сможет незаметно сломать скрипт, который о ней
не знает.

Правило проверяется тестами (``tests/test_models_registry_complete.py``):
* каждая таблица, объявленная в ``app/modules/**``, присутствует в
  ``Base.metadata`` при импорте ОДНОГО этого модуля;
* ни один FK не ссылается на незарегистрированную таблицу;
* ``create_all`` на пустой БД проходит;
* каждый entrypoint-скрипт, трогающий ORM, тянет этот модуль (или
  ``app.main``). Добавили модель — тест сам потребует добавить её сюда.

Приложение (``app.main``) этот модуль не использует: там роутеры сами
подтягивают нужные модели.
"""

# Порядок не важен — важен сам факт импорта: каждый модуль регистрирует
# свои таблицы в общем Base.metadata.
import app.modules.companies.models  # noqa: F401
import app.modules.auth.models  # noqa: F401
import app.modules.rbac.models  # noqa: F401
import app.modules.inventory.models  # noqa: F401
import app.modules.crm.models  # noqa: F401
import app.modules.pos.models  # noqa: F401
import app.modules.payments.models  # noqa: F401
import app.modules.kitchen.models  # noqa: F401
import app.modules.loyalty.models  # noqa: F401
import app.modules.delivery.models  # noqa: F401
import app.modules.hr.models  # noqa: F401
import app.modules.notifications.models  # noqa: F401
import app.modules.audit.models  # noqa: F401
import app.modules.fiscal.models  # noqa: F401
import app.modules.subscriptions.models  # noqa: F401
import app.modules.printers.models  # noqa: F401
import app.modules.halls.models  # noqa: F401
import app.modules.inventory.warehouse_models  # noqa: F401
import app.modules.inventory.semi_product_models  # noqa: F401
import app.modules.kafe_compat.models  # noqa: F401
import app.modules.handbook.models  # noqa: F401
import app.modules.organizations.models  # noqa: F401
import app.modules.departments.models  # noqa: F401
import app.modules.marketing.models  # noqa: F401
import app.modules.nomenclature.models  # noqa: F401
import app.modules.storage.models  # noqa: F401
import app.modules.finance.models  # noqa: F401
import app.modules.field_service.models  # noqa: F401
import app.modules.tasks.models  # noqa: F401
import app.modules.admin_settings.models  # noqa: F401
