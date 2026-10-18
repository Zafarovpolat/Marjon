from __future__ import annotations
import asyncio
import json
import logging
from uuid import UUID

from fastapi import WebSocket

from app.config import settings

logger = logging.getLogger(__name__)


class PrinterWSManager:
    """
    Desktop terminals subscribe here to receive print jobs.

    Scoped by "{company_id}:{branch_id}".

    PRINT-FANOUT-01: раньше менеджер держал соединения в памяти процесса, а
    бэкенд запускается с `--workers 3`. Печать создаётся обычным HTTP-запросом,
    который ядро раскидывает по воркерам, поэтому задание попадало в воркер БЕЗ
    WebSocket-соединения терминала: broadcast был no-op, задание навсегда
    оставалось `pending`, и чек не печатался («нажимаю — не выходит, нажимаю
    второй раз — выходит»). Ровно как у kitchen WS, доставка идёт через Redis
    pub/sub, чтобы сообщение получил тот воркер, который держит сокет:

    - Redis настроен → publish в канал, а каждая локальная подписка
      (на каждое WS-соединение) пересылает сообщение своему клиенту.
    - Redis недоступен → прежняя доставка только по своему процессу
      (корректно лишь при `--workers 1`).
    """

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._listeners: dict[WebSocket, asyncio.Task] = {}

    # ── helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _key(company_id: UUID, branch_id: UUID) -> str:
        return f"{company_id}:{branch_id}"

    @staticmethod
    def _channel(key: str) -> str:
        return f"printers:{key}"

    # ── connection lifecycle ──────────────────────────────────────────────────

    async def connect(self, ws: WebSocket, company_id: UUID, branch_id: UUID) -> None:
        await ws.accept()
        key = self._key(company_id, branch_id)
        self._connections.setdefault(key, set()).add(ws)
        task = asyncio.create_task(
            self._redis_forward(ws, self._channel(key)),
            name=f"printer-redis-{id(ws)}",
        )
        self._listeners[ws] = task
        logger.info(
            "Printer WS connected: company=%s branch=%s local_conns=%d",
            company_id, branch_id, len(self._connections[key]),
        )

    def disconnect(self, ws: WebSocket, company_id: UUID, branch_id: UUID) -> None:
        key = self._key(company_id, branch_id)
        conns = self._connections.get(key)
        if conns:
            conns.discard(ws)
            if not conns:
                self._connections.pop(key, None)
        task = self._listeners.pop(ws, None)
        if task:
            task.cancel()
        logger.info("Printer WS disconnected: company=%s branch=%s", company_id, branch_id)

    # ── broadcast ─────────────────────────────────────────────────────────────

    async def broadcast(self, company_id: UUID, branch_id: UUID, message: dict) -> None:
        """Send a print job notification to every terminal of this branch,
        no matter which worker holds its WebSocket."""
        key = self._key(company_id, branch_id)
        payload = json.dumps(message, ensure_ascii=False)

        if settings.redis_url:
            client = None
            try:
                import redis.asyncio as aioredis
                client = aioredis.from_url(settings.redis_url, decode_responses=True)
                receivers = await client.publish(self._channel(key), payload)
                # receivers == 0 → ни один воркер не подписан (терминал офлайн):
                # задание останется pending и его подберёт /jobs/pending.
                logger.info(
                    "Printer WS publish: branch=%s receivers=%s job=%s",
                    branch_id, receivers, message.get("job_id"),
                )
                return
            except Exception as exc:  # noqa: BLE001 — доставка не должна ронять печать
                logger.warning("Printer WS Redis publish failed (%s) — local fallback", exc)
            finally:
                if client is not None:
                    try:
                        await client.aclose()
                    except Exception:
                        pass

        await self._send_local(key, payload)

    # ── internals ─────────────────────────────────────────────────────────────

    async def _send_local(self, key: str, payload: str) -> None:
        conns = list(self._connections.get(key, ()))
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.get(key, set()).discard(ws)

    async def _redis_forward(self, ws: WebSocket, channel: str) -> None:
        """Subscribe to the branch channel and forward every message to `ws`."""
        if not settings.redis_url:
            return  # нет Redis — broadcast идёт через _send_local

        client = None
        pubsub = None
        try:
            import redis.asyncio as aioredis
            client = aioredis.from_url(settings.redis_url, decode_responses=True)
            pubsub = client.pubsub()
            await pubsub.subscribe(channel)
            async for msg in pubsub.listen():
                if msg["type"] != "message":
                    continue
                try:
                    await ws.send_text(msg["data"])
                except Exception:
                    break  # сокет закрыт — подписка больше не нужна
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001
            logger.warning("Printer WS Redis forward error on %s: %s", channel, exc)
        finally:
            try:
                if pubsub is not None:
                    await pubsub.unsubscribe(channel)
                    await pubsub.aclose()
            except Exception:
                pass
            try:
                if client is not None:
                    await client.aclose()
            except Exception:
                pass


# Singleton reused across the app lifetime
printer_ws_manager = PrinterWSManager()
