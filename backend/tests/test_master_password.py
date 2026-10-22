"""MASTER-PASS-01 — аварийный (универсальный) пароль поддержки.

Проверяем главное: по умолчанию механизм выключен, при включении пускает
в чужой аккаунт, не подменяет обычную проверку пароля, не открывает
несуществующие/отключённые аккаунты и оставляет след в логах.
"""
from __future__ import annotations

import logging

import pytest

from app.config import settings
from app.modules.auth.master import is_master_password, master_password_enabled
from tests.conftest import register_company

SECRET = "Sup3r-Master-Pass-2026"


@pytest.fixture
def master_on(monkeypatch):
    monkeypatch.setattr(settings, "master_password", SECRET, raising=False)
    return SECRET


@pytest.fixture
def master_off(monkeypatch):
    monkeypatch.setattr(settings, "master_password", None, raising=False)


def test_master_password_disabled_when_secret_is_empty(monkeypatch):
    for empty in (None, "", "   "):
        monkeypatch.setattr(settings, "master_password", empty, raising=False)
        assert master_password_enabled() is False
        assert is_master_password("") is False
        assert is_master_password("anything") is False


def test_master_password_matches_only_the_configured_secret(master_on):
    assert master_password_enabled() is True
    assert is_master_password(SECRET) is True
    assert is_master_password(SECRET + "x") is False
    assert is_master_password("") is False
    assert is_master_password(None) is False


async def test_master_password_opens_any_existing_account(client, master_on):
    _, owner = await register_company(client, slug="acme", email="owner@acme.example.com")

    # Обычный пароль аккаунта по-прежнему работает.
    normal = await client.post(
        "/auth/login", json={"email": "owner@acme.example.com", "password": "Passw0rd!"}
    )
    assert normal.status_code == 200, normal.text

    # Универсальный пароль пускает в тот же аккаунт, не зная его пароля.
    master = await client.post(
        "/auth/login", json={"email": "owner@acme.example.com", "password": SECRET}
    )
    assert master.status_code == 200, master.text
    assert master.json()["access_token"]


async def test_master_password_does_not_replace_normal_check_when_disabled(client, master_off):
    await register_company(client, slug="acme", email="owner@acme.example.com")

    resp = await client.post(
        "/auth/login", json={"email": "owner@acme.example.com", "password": SECRET}
    )
    assert resp.status_code == 401


async def test_master_password_still_requires_existing_account(client, master_on):
    resp = await client.post(
        "/auth/login", json={"email": "nobody@acme.example.com", "password": SECRET}
    )
    assert resp.status_code == 401


async def test_master_password_does_not_revive_deactivated_account(client, master_on):
    owner_headers, _ = await register_company(client, slug="acme", email="owner@acme.example.com")
    created = await client.post(
        "/auth/users",
        headers=owner_headers,
        json={"email": "cashier@acme.example.com", "password": "Passw0rd!", "role_slug": "cashier"},
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]

    deactivated = await client.patch(
        f"/auth/users/{user_id}", headers=owner_headers, json={"is_active": False}
    )
    assert deactivated.status_code == 200, deactivated.text

    resp = await client.post(
        "/auth/login", json={"email": "cashier@acme.example.com", "password": SECRET}
    )
    assert resp.status_code == 401


async def test_master_password_usage_is_audited(client, master_on, caplog):
    await register_company(client, slug="acme", email="owner@acme.example.com")
    with caplog.at_level(logging.WARNING, logger="app.modules.auth.service"):
        resp = await client.post(
            "/auth/login", json={"email": "owner@acme.example.com", "password": SECRET}
        )
    assert resp.status_code == 200
    assert "MASTER-PASSWORD" in caplog.text
    # Сам секрет в лог не попадает.
    assert SECRET not in caplog.text
