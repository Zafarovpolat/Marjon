"""PWD-POLICY-01 + PWD-LOCK-01.

Пароль теперь может быть из 4 символов без требований к составу («6611»,
«QW12»), а верхняя граница задана в БАЙТАХ (72), потому что bcrypt 5.x
бросает ValueError выше этого предела — раньше это давало 500 вместо 422.

Взамен у парольного входа появился собственный лок-аут: 10 неудач на аккаунт
→ 15 минут. Он не зависит от лимита по IP, иначе перебор 10 000 комбинаций
четырёхзначного пароля упирался бы только в количество адресов у атакующего.
"""
from __future__ import annotations

from app.modules.auth import service as auth_service
from tests.conftest import register_company


async def _register(client, *, slug: str, password: str):
    return await client.post(
        "/auth/register",
        json={
            "company_name": slug.title(),
            "company_slug": slug,
            "email": f"{slug}@acme.example.com",
            "password": password,
        },
    )


async def test_four_digit_password_is_accepted(client):
    await register_company(client, slug="shortpw", email="shortpw@acme.example.com", password="6611")
    resp = await client.post(
        "/auth/login", json={"email": "shortpw@acme.example.com", "password": "6611"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"]


async def test_four_alphanumeric_password_is_accepted(client):
    await register_company(client, slug="qw12", email="qw12@acme.example.com", password="QW12")
    resp = await client.post(
        "/auth/login", json={"email": "qw12@acme.example.com", "password": "QW12"}
    )
    assert resp.status_code == 200, resp.text


async def test_cyrillic_password_is_accepted(client):
    """Раньше «Пароль12» отклонялся: регулярка [A-Za-z] не считала кириллицу
    буквой, хотя цифра и длина были в порядке."""
    await register_company(client, slug="cyrpw", email="cyrpw@acme.example.com", password="Пароль12")
    resp = await client.post(
        "/auth/login", json={"email": "cyrpw@acme.example.com", "password": "Пароль12"}
    )
    assert resp.status_code == 200, resp.text


async def test_three_char_password_rejected(client):
    resp = await _register(client, slug="threepw", password="Ab1")
    assert resp.status_code == 422, resp.text
    assert "password" in resp.json()["field_errors"]


async def test_password_over_72_bytes_returns_422_not_500(client):
    # 80 байт ASCII: _validate_password должен отсечь это до bcrypt.
    resp = await _register(client, slug="longpw", password="a1" * 40)
    assert resp.status_code == 422, resp.text
    assert "password" in resp.json()["field_errors"]


def test_lockout_threshold_is_ten_attempts():
    assert auth_service.PASSWORD_MAX_ATTEMPTS == 10
    assert auth_service.PASSWORD_LOCKOUT_MINUTES == 15


async def test_login_locks_account_after_max_failures(client, monkeypatch):
    # Порог уменьшен, чтобы тест не упирался в лимит 10 запросов/мин на
    # /auth/login — механика та же, что и на боевых 10 попытках.
    monkeypatch.setattr(auth_service, "PASSWORD_MAX_ATTEMPTS", 3)
    await register_company(client, slug="lockpw", email="lockpw@acme.example.com", password="6611")

    for _ in range(3):
        bad = await client.post(
            "/auth/login", json={"email": "lockpw@acme.example.com", "password": "0000"}
        )
        assert bad.status_code == 401

    # Четвёртая попытка — даже с ВЕРНЫМ паролем — упирается в блокировку.
    locked = await client.post(
        "/auth/login", json={"email": "lockpw@acme.example.com", "password": "6611"}
    )
    assert locked.status_code == 401, locked.text
    assert "Слишком много неверных попыток" in locked.json()["message"]


async def test_branch_login_locks_after_max_failures(client, monkeypatch):
    """Пароль филиала живёт на branches, а не на users — у него свой счётчик."""
    monkeypatch.setattr(auth_service, "PASSWORD_MAX_ATTEMPTS", 3)
    headers, _ = await register_company(
        client, slug="branchlock", email="branchlock@acme.example.com"
    )
    created = await client.post(
        "/companies/me/branches",
        headers=headers,
        json={"name": "Branch One", "login": "branchlock-1", "password": "6611"},
    )
    assert created.status_code == 201, created.text

    for _ in range(3):
        bad = await client.post(
            "/auth/branch-login", json={"login": "branchlock-1", "password": "0000"}
        )
        assert bad.status_code == 401

    locked = await client.post(
        "/auth/branch-login", json={"login": "branchlock-1", "password": "6611"}
    )
    assert locked.status_code == 401, locked.text
    assert "Слишком много неверных попыток" in locked.json()["message"]


async def test_successful_login_resets_failure_counter(client, monkeypatch):
    monkeypatch.setattr(auth_service, "PASSWORD_MAX_ATTEMPTS", 3)
    await register_company(client, slug="resetpw", email="resetpw@acme.example.com", password="6611")

    for _ in range(2):
        await client.post(
            "/auth/login", json={"email": "resetpw@acme.example.com", "password": "0000"}
        )
    ok = await client.post(
        "/auth/login", json={"email": "resetpw@acme.example.com", "password": "6611"}
    )
    assert ok.status_code == 200, ok.text

    # После успешного входа счётчик обнулён: ещё две ошибки не блокируют.
    for _ in range(2):
        bad = await client.post(
            "/auth/login", json={"email": "resetpw@acme.example.com", "password": "0000"}
        )
        assert bad.status_code == 401
    still_ok = await client.post(
        "/auth/login", json={"email": "resetpw@acme.example.com", "password": "6611"}
    )
    assert still_ok.status_code == 200, still_ok.text
