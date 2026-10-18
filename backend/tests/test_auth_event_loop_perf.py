from __future__ import annotations

import asyncio
import time

from tests.conftest import register_company

# Root cause this guards against: bcrypt.checkpw/hashpw takes ~200-300ms by
# design (that's the point of bcrypt), and uvicorn runs one worker / one
# event loop by default (see backend/Dockerfile, docker-compose.yml — no
# --workers flag). A password check called synchronously inside an `async
# def` route blocks that single event loop for its whole duration, so ONE
# person logging in freezes every other request on the server for everyone
# — including requests that touch no password at all. This was diagnosed
# live: GET /health (no DB, no auth, no bcrypt) was taking 400-650ms in
# production, the same order of magnitude as a bcrypt call, while every
# platform (mobile Staff, mobile Owner, web admin, desktop) felt slow at
# once. verify_password/hash_password now run via asyncio.to_thread
# (app/modules/auth/security.py); bcrypt's C extension releases the GIL
# during the hash itself, so the event loop keeps serving other coroutines
# while that thread works.


async def test_login_bcrypt_check_does_not_stall_concurrent_unrelated_requests(client):
    """A slow, real bcrypt login running concurrently with unrelated, cheap
    requests must not delay them anywhere near its own duration. Before the
    fix this failed hard: the cheap calls queued behind the login and took
    essentially the same time as it, every time."""
    owner_headers, _ = await register_company(client, slug="perf-login", email="perf-owner@example.com")

    async def timed(coro):
        t0 = time.perf_counter()
        resp = await coro
        return time.perf_counter() - t0, resp

    async def login_call():
        return await timed(client.post(
            "/auth/login", json={"email": "perf-owner@example.com", "password": "Passw0rd!"}
        ))

    async def me_call():
        return await timed(client.get("/auth/me", headers=owner_headers))

    # Fire one real (slow) bcrypt-verified login alongside several cheap,
    # unrelated requests at the same instant.
    (login_time, login_resp), *me_results = await asyncio.gather(
        login_call(), me_call(), me_call(), me_call(), me_call()
    )
    assert login_resp.status_code == 200, login_resp.text
    assert login_time > 0.05, "fixture password should take a real, measurable bcrypt check"

    for me_time, me_resp in me_results:
        assert me_resp.status_code == 200, me_resp.text
        # A generous ceiling: a cheap, DB-only request finishing in anywhere
        # near the login's own duration means it waited on the login rather
        # than running alongside it.
        assert me_time < login_time * 0.6, (
            f"GET /auth/me took {me_time:.3f}s while a concurrent login took "
            f"{login_time:.3f}s — looks blocked by it, not running alongside it"
        )
