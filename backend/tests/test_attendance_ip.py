"""ATT-IP-01 — IP устройства в журнале посещаемости.

Веб-страница «Посещаемость» читает смены (work_shifts), поэтому IP пишется на
смену при отметке прихода/ухода. За nginx `request.client.host` — адрес
контейнера, значит адрес надо брать из заголовков прокси; исторические смены
остаются без IP, и это не ошибка.
"""
from __future__ import annotations

from types import SimpleNamespace

from app.shared.request_ip import client_ip, normalize_ip
from tests.conftest import register_company

TERMINAL_PASSWORD = "Terminal-Pass-1"


def _request(*, headers=None, peer="172.18.0.2"):
    return SimpleNamespace(
        headers={k.lower(): v for k, v in (headers or {}).items()},
        client=SimpleNamespace(host=peer) if peer else None,
    )


# ── Разбор адреса ────────────────────────────────────────────────────────────


def test_normalize_ip_accepts_real_addresses_only():
    assert normalize_ip("192.168.0.243") == "192.168.0.243"
    assert normalize_ip(" 192.168.0.243 ") == "192.168.0.243"
    assert normalize_ip("192.168.0.243:5678") == "192.168.0.243"
    assert normalize_ip("[2001:db8::1]:443") == "2001:db8::1"
    assert normalize_ip("2001:db8::1") == "2001:db8::1"
    # IPv4-mapped IPv6 показываем как обычный IPv4.
    assert normalize_ip("::ffff:10.0.0.7") == "10.0.0.7"
    for junk in ("", None, "unknown", "localhost", "1.2.3", "999.1.1.1"):
        assert normalize_ip(junk) is None


def test_client_ip_prefers_x_real_ip_set_by_nginx():
    request = _request(headers={"X-Real-IP": "95.182.119.150", "X-Forwarded-For": "10.0.0.1"})
    assert client_ip(request) == "95.182.119.150"


def test_client_ip_uses_last_forwarded_hop_not_the_client_supplied_one():
    # nginx дописывает реальный адрес в конец ($proxy_add_x_forwarded_for),
    # поэтому первая запись — то, что клиент прислал сам, и верить ей нельзя.
    request = _request(headers={"X-Forwarded-For": "1.2.3.4, 95.182.119.150"})
    assert client_ip(request) == "95.182.119.150"


def test_client_ip_falls_back_to_peer_when_no_proxy_headers():
    assert client_ip(_request()) == "172.18.0.2"
    assert client_ip(_request(peer=None)) is None


# ── Сквозной путь: отметка → строка журнала ─────────────────────────────────


async def _company_with_employee(client, *, slug="att-ip"):
    owner_headers, _ = await register_company(client, slug=slug, email=f"owner@{slug}.example.com")
    branch = await client.post(
        "/companies/me/branches",
        headers=owner_headers,
        json={"name": "Main", "login": "+998 90 111-22-33", "password": TERMINAL_PASSWORD},
    )
    assert branch.status_code == 201, branch.text
    branch_id = branch.json()["id"]

    staff = await client.post(
        "/auth/users",
        headers=owner_headers,
        json={"email": f"waiter@{slug}.example.com", "password": "Passw0rd!", "role_slug": "waiter"},
    )
    assert staff.status_code == 201, staff.text
    staff_id = staff.json()["id"]

    employee = await client.post(
        "/hr/employees",
        headers=owner_headers,
        json={"user_id": staff_id, "branch_id": branch_id, "position": "Официант", "hire_date": "2026-01-01"},
    )
    assert employee.status_code == 201, employee.text
    return owner_headers, staff_id


async def test_check_in_ip_lands_in_the_attendance_journal(client):
    owner_headers, staff_id = await _company_with_employee(client)

    marked = await client.post(
        "/hr/attendance/mark",
        headers={**owner_headers, "X-Real-IP": "95.182.119.150"},
        json={"user_id": staff_id, "action": "check_in"},
    )
    assert marked.status_code == 201, marked.text

    rows = await client.get("/hr/attendance", headers=owner_headers)
    assert rows.status_code == 200, rows.text
    journal = rows.json()
    assert len(journal) == 1
    assert journal[0]["ip"] == "95.182.119.150"
    assert journal[0]["employee"]


async def test_check_out_refreshes_ip_and_historical_rows_stay_empty(client):
    owner_headers, staff_id = await _company_with_employee(client, slug="att-ip-out")

    await client.post(
        "/hr/attendance/mark",
        headers={**owner_headers, "X-Real-IP": "95.182.119.150"},
        json={"user_id": staff_id, "action": "check_in"},
    )
    await client.post(
        "/hr/attendance/mark",
        headers={**owner_headers, "X-Real-IP": "10.10.10.10"},
        json={"user_id": staff_id, "action": "check_out"},
    )

    journal = (await client.get("/hr/attendance", headers=owner_headers)).json()
    assert journal[0]["ip"] == "95.182.119.150", "приход важнее ухода — открытая смена показывает, откуда пришли"
    assert journal[0]["end"], "отметка ухода закрывает смену"


async def test_attendance_without_any_ip_reports_empty_string(client, db_engine):
    """Смены, созданные до появления колонки, не должны получать выдуманный адрес."""
    from datetime import datetime, timedelta, timezone
    from uuid import UUID

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.modules.hr.models import Employee, WorkShift

    owner_headers, staff_id = await _company_with_employee(client, slug="att-ip-legacy")

    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        employee = (
            await session.execute(select(Employee).where(Employee.user_id == UUID(staff_id)))
        ).scalars().first()
        now = datetime.now(timezone.utc)
        session.add(
            WorkShift(
                company_id=employee.company_id,
                branch_id=employee.branch_id,
                employee_id=employee.id,
                scheduled_start=now - timedelta(hours=9),
                scheduled_end=now,
                actual_start=now - timedelta(hours=9),
                actual_end=now,
                status="completed",
            )
        )
        await session.commit()

    journal = (await client.get("/hr/attendance", headers=owner_headers)).json()
    assert len(journal) == 1
    assert journal[0]["ip"] == ""
