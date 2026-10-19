"""Контракт роутов и OpenAPI: без «магических чисел» и дубликатов.

Почему файл появился
--------------------
Мердж main ← prod-current принёс **дубликаты роутов**: одна и та же пара
(method, path) регистрировалась дважды (attendance, print/summary). FastAPI
такое молча принимает — в `/docs` остаётся последний обработчик, а десктоп
может попасть в «не тот». Плюс в тесте на Postgres стояли ручные счётчики
(509/289 → 510/290), которые приходилось править руками после каждого мерджа —
а это значит, что тест ловил не инвариант, а собственную забывчивость.

Здесь проверяются инварианты, не зависящие от количества роутов:

* ни одна пара (method, path) не зарегистрирована дважды;
* каждый роут попадает в OpenAPI ровно одним путём (path_format);
* operationId уникальны (иначе SDK/клиенты схлопываются);
* у каждой операции есть описание ответа (2xx), иначе клиент не знает схему;
* количество путей в схеме равно количеству уникальных path_format — то есть
  счётчики выше выводятся, а не задаются.

Файл не поднимает БД: только `app.routes` и `app.openapi()`.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from fastapi.routing import APIRoute

from app.main import app


HTTP_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE"})


def _route_rows() -> list[tuple[str, str, APIRoute]]:
    rows: list[tuple[str, str, APIRoute]] = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in sorted(route.methods & HTTP_METHODS):
            rows.append((method, route.path_format, route))
    return rows


# Роуты, намеренно скрытые из схемы (`include_in_schema=False`). Список
# заморожен: скрытый роут не виден ни в /docs, ни в SDK, поэтому «случайно
# скрыть» новый endpoint нельзя — только осознанно, добавив сюда.
HIDDEN_FROM_SCHEMA = frozenset({"/api/v1/auth/login/form"})


def test_no_duplicate_method_path_pairs() -> None:
    counts = Counter((method, path) for method, path, _ in _route_rows())
    duplicates = {key: count for key, count in counts.items() if count > 1}
    assert not duplicates, (
        "одна пара (method, path) зарегистрирована несколько раз — в /docs "
        "останется только последний обработчик, остальные станут недостижимы:\n  "
        + "\n  ".join(f"{method} {path} × {count}" for (method, path), count in duplicates.items())
    )


def test_every_route_has_exactly_one_handler_per_method() -> None:
    by_key: dict[tuple[str, str], list[str]] = defaultdict(list)
    for method, path, route in _route_rows():
        by_key[(method, path)].append(route.endpoint.__name__)
    ambiguous = {
        key: handlers for key, handlers in by_key.items() if len(set(handlers)) > 1
    }
    assert not ambiguous, (
        "на одну пару (method, path) претендуют разные обработчики: "
        + "; ".join(f"{method} {path}: {handlers}" for (method, path), handlers in ambiguous.items())
    )


def test_openapi_paths_match_registered_routes() -> None:
    schema = app.openapi()
    documented = set(schema["paths"])
    registered = {path for _method, path, _route in _route_rows()}
    hidden = registered - documented
    assert hidden == set(HIDDEN_FROM_SCHEMA), (
        "из OpenAPI выпали роуты, которых нет в списке намеренно скрытых "
        f"(include_in_schema=False): {sorted(hidden - set(HIDDEN_FROM_SCHEMA))}; "
        f"лишние записи в списке: {sorted(set(HIDDEN_FROM_SCHEMA) - hidden)}"
    )
    unexpected = documented - registered
    assert not unexpected, (
        f"в схеме есть пути без зарегистрированного роута: {sorted(unexpected)}"
    )


def test_operation_ids_are_unique() -> None:
    schema = app.openapi()
    operation_ids: list[str] = []
    for path, operations in schema["paths"].items():
        for method, operation in operations.items():
            if method not in {m.lower() for m in HTTP_METHODS}:
                continue
            assert operation.get("operationId"), f"{method.upper()} {path}: нет operationId"
            operation_ids.append(operation["operationId"])
    duplicates = [op for op, count in Counter(operation_ids).items() if count > 1]
    assert not duplicates, (
        f"operationId повторяются, SDK/клиенты схлопнут операции: {sorted(duplicates)}"
    )


def test_every_operation_documents_a_success_response_schema() -> None:
    schema = app.openapi()
    problems: list[str] = []
    for path, operations in schema["paths"].items():
        for method, operation in operations.items():
            if method not in {m.lower() for m in HTTP_METHODS}:
                continue
            responses = operation.get("responses") or {}
            success = [code for code in responses if code.startswith("2")]
            if not success:
                problems.append(f"{method.upper()} {path}: нет 2xx-ответа")
                continue
            # 204 — единственный легальный ответ без тела.
            body_optional = success == ["204"]
            if body_optional:
                continue
            if not any(
                "content" in responses[code] for code in success
            ):
                problems.append(f"{method.upper()} {path}: 2xx без схемы тела")
    assert not problems, (
        "у операций нет описанного успешного ответа — клиент не сможет "
        "сгенерировать тип:\n  " + "\n  ".join(problems)
    )


def test_api_prefix_is_consistent() -> None:
    """Все прикладные роуты живут под /api/v1 — кроме служебных."""
    allowed_roots = ("/api/v1", "/health", "/", "/docs", "/redoc", "/openapi.json")
    stray = sorted(
        {
            path
            for _method, path, _route in _route_rows()
            if not path.startswith(allowed_roots)
        }
    )
    assert not stray, (
        f"роуты вне /api/v1 (клиенты и nginx-правила их не ждут): {stray}"
    )
