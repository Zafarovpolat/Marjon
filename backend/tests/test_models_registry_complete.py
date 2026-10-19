"""Реестр ORM-моделей обязан быть полным — иначе скрипты падают на старте.

История поломки (дважды)
------------------------
1. CI-шаг «Схема БД и демо-данные»: `create_tables.py` импортировал все модели
   и проходил, а `seed.py` — только часть, и падал на первом запросе к
   `products`:

       NoReferencedTableError: Foreign key associated with column
       'products.unit_id' could not find table 'nm_units'

2. После мерджа main ← prod-current та же история повторилась с
   `users.printer_id` -> `printers` в `scripts/seed_waiter_login.py`: FK
   пришла из prod-линии, а скрипт про чужой модуль не знал.

Обе поломки — один класс: **список импортов в скрипте отставал от моделей**.
Лечится единым реестром (`app/infrastructure/database/models_registry.py`),
а этот файл следит, чтобы реестр не отстал сам и чтобы скрипты им
пользовались, а не собирали список руками.

Проверки
--------
* каждая таблица, объявленная в `app/modules/**`, зарегистрирована в
  `Base.metadata` при импорте ОДНОГО реестра (подпроцесс, без `app.main`);
* все FK в метадате разрешаются в существующие таблицы;
* `create_all` на пустой БД проходит, читая только реестр;
* ни одна таблица не объявлена дважды;
* каждый entrypoint-скрипт, который трогает ORM-модели, тянет реестр
  (или `app.main`, который регистрирует всё сам).
"""

from __future__ import annotations

import ast
import json
from pathlib import Path
import subprocess
import sys

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = BACKEND_ROOT / "app"
MODULES_ROOT = APP_ROOT / "modules"
REGISTRY_PATH = APP_ROOT / "infrastructure" / "database" / "models_registry.py"

# Скрипты-точки входа, которые работают с БД напрямую (не через API).
ENTRYPOINT_SCRIPTS = (
    BACKEND_ROOT / "create_tables.py",
    BACKEND_ROOT / "seed.py",
    *sorted((BACKEND_ROOT / "scripts").glob("*.py")),
)

# Подпроцесс: импортируем ТОЛЬКО реестр (не app.main — он маскирует проблему,
# потому что тянет все роутеры и вместе с ними все модели).
_PROBE = r"""
import json

import app.infrastructure.database.models_registry  # noqa: F401
from app.shared.base_model import Base

report = {"tables": [], "dangling": [], "create_all_error": None}

try:
    report["tables"] = sorted(Base.metadata.tables)
except Exception as exc:  # pragma: no cover - диагностика
    report["dangling"].append(f"metadata.tables: {type(exc).__name__}: {exc}")

for table in list(Base.metadata.tables.values()):
    for fk in table.foreign_keys:
        try:
            fk.column.table.name
        except Exception as exc:
            report["dangling"].append(
                f"{table.name}.{fk.parent.name} -> {fk.target_fullname}: "
                f"{type(exc).__name__}"
            )

from sqlalchemy import create_engine

try:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    engine.dispose()
except Exception as exc:  # pragma: no cover - диагностика
    report["create_all_error"] = f"{type(exc).__name__}: {exc}"

print("<<<PROBE>>>" + json.dumps(report))
"""


@pytest.fixture(scope="module")
def registry_probe() -> dict:
    """Единственный импорт реестра в чистом процессе: что он реально тянет."""
    completed = subprocess.run(
        [sys.executable, "-c", _PROBE],
        cwd=BACKEND_ROOT,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert completed.returncode == 0, (
        "импорт одного models_registry упал — значит реестр неполон:\n"
        f"STDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
    )
    marker = "<<<PROBE>>>"
    assert marker in completed.stdout, completed.stdout
    payload = completed.stdout.split(marker, 1)[1].strip().splitlines()[0]
    return json.loads(payload)


def _declared_tables() -> dict[str, Path]:
    """`__tablename__ = "..."` по всем файлам моделей: таблица -> файл.

    Читаем только `*models*.py` (остальные модули объявляют таблицы там же) и с
    `utf-8-sig`: в части файлов есть BOM, а `ast.parse` строки с U+FEFF падает.
    """
    tables: dict[str, Path] = {}
    duplicates: dict[str, list[Path]] = {}
    for path in sorted(MODULES_ROOT.rglob("*models*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.AnnAssign):
                targets = [node.target]
            elif isinstance(node, ast.Assign):
                targets = node.targets
            else:
                continue
            if not isinstance(node.value, ast.Constant) or not isinstance(node.value.value, str):
                continue
            for target in targets:
                if isinstance(target, ast.Name) and target.id == "__tablename__":
                    name = node.value.value
                    if name in tables and tables[name] != path:
                        duplicates.setdefault(name, [tables[name]]).append(path)
                    tables.setdefault(name, path)
    assert not duplicates, (
        "одна и та же таблица объявлена в разных модулях — маппинг неоднозначен: "
        + "; ".join(f"{name}: {[str(p) for p in paths]}" for name, paths in duplicates.items())
    )
    return tables


def _registry_imports() -> list[str]:
    tree = ast.parse(REGISTRY_PATH.read_text(encoding="utf-8"))
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.append(node.module)
    return modules


def test_every_declared_table_is_registered_by_the_registry_alone(registry_probe: dict) -> None:
    declared = _declared_tables()
    registered = set(registry_probe["tables"])
    missing = sorted(set(declared) - registered)
    assert not missing, (
        "таблицы объявлены в моделях, но не попадают в Base.metadata при импорте "
        "одного models_registry:\n  "
        + "\n  ".join(f"{name} ({declared[name].relative_to(BACKEND_ROOT)})" for name in missing)
        + "\nПочинка: добавить модуль в app/infrastructure/database/models_registry.py."
    )


def test_no_dangling_foreign_keys_in_metadata(registry_probe: dict) -> None:
    assert not registry_probe["dangling"], (
        "в метадате есть FK на незарегистрированные таблицы — это ровно та "
        "ошибка NoReferencedTableError, которой падал seed.py:\n  "
        + "\n  ".join(registry_probe["dangling"])
    )


def test_create_all_succeeds_with_only_the_registry(registry_probe: dict) -> None:
    assert registry_probe["create_all_error"] is None, (
        "create_all на пустой БД не проходит, читая только реестр: "
        f"{registry_probe['create_all_error']}"
    )
    assert len(registry_probe["tables"]) >= 100, (
        "подозрительно мало таблиц в метадате: "
        f"{len(registry_probe['tables'])} — реестр, похоже, загрузил не всё"
    )


def test_registry_imports_existing_modules_only() -> None:
    missing: list[str] = []
    for module in _registry_imports():
        if not module.startswith("app."):
            continue
        relative = module.split(".")
        as_file = BACKEND_ROOT.joinpath(*relative).with_suffix(".py")
        as_package = BACKEND_ROOT.joinpath(*relative) / "__init__.py"
        if not as_file.exists() and not as_package.exists():
            missing.append(module)
    assert not missing, f"реестр импортирует несуществующие модули: {missing}"


def test_registry_covers_every_model_module_on_disk() -> None:
    """Каждый модуль, объявляющий таблицы, обязан быть в реестре.

    Модули-заглушки без `__tablename__` (например `app.modules.warehouse.models`
    — одна строка-комментарий со ссылкой на inventory.warehouse_models) в
    реестре не нужны: таблиц они не создают.
    """
    imported = set(_registry_imports())
    declaring_files = set(_declared_tables().values())
    missing: list[str] = []
    for path in sorted(declaring_files):
        module = ".".join(path.relative_to(BACKEND_ROOT).with_suffix("").parts)
        if module not in imported:
            missing.append(module)
    assert not missing, (
        "модули моделей не импортируются реестром (новая FK в них снова уронит "
        f"скрипты): {missing}"
    )


def test_entrypoint_scripts_use_the_registry() -> None:
    """Скрипт, который трогает ORM, обязан тянуть реестр (или app.main)."""
    offenders: list[str] = []
    for path in ENTRYPOINT_SCRIPTS:
        if not path.exists() or path.name == "__init__.py":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        modules: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                modules.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                modules.add(node.module)
        touches_orm = any(
            module.startswith("app.modules.") and "models" in module
            for module in modules
        )
        if not touches_orm:
            continue
        uses_registry = (
            "app.infrastructure.database.models_registry" in modules
            or "app.main" in modules
        )
        if not uses_registry:
            offenders.append(str(path.relative_to(BACKEND_ROOT)))
    assert not offenders, (
        "скрипты импортируют модели поштучно, без единого реестра — новая FK в "
        "чужом модуле снова уронит их с NoReferencedTableError:\n  "
        + "\n  ".join(offenders)
        + "\nПочинка: `import app.infrastructure.database.models_registry  # noqa: F401`."
    )
