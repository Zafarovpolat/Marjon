from __future__ import annotations
import asyncio
import json
import logging
from uuid import UUID

from fastapi import Depends, Query, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.infrastructure.database.session import get_db
from app.modules.auth.dependencies import ensure_company_app_identity
from app.modules.auth.repository import UserRepository
from app.modules.auth.security import decode_token
from app.modules.companies.models import Branch
from app.shared.tenant_scope import require_company_resource

logger = logging.getLogger(__name__)


class KitchenConnectionManager:
    """
    Scoped by "{company_id}:{branch_id}".

    Broadcast strategy:
    - If Redis is configured: publish to Redis channel so ALL uvicorn workers
      deliver the message to their local WebSocket clients (multi-worker safe).
    - If Redis is unavailable: fall back to in-process delivery (single-worker only).
    """

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._listeners:   dict[WebSocket, asyncio.Task] = {}

    # ── helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _key(company_id: UUID, branch_id: UUID) -> str:
        return f"{company_id}:{branch_id}"

    @staticmethod
    def _channel(key: str) -> str:
        return f"kitchen:{key}"

    # ── connection lifecycle ──────────────────────────────────────────────────

    async def connect(self, ws: WebSocket, company_id: UUID, branch_id: UUID) -> None:
        await ws.accept()
        key = self._key(company_id, branch_id)
        self._connections.setdefault(key, set()).add(ws)

        # Forward Redis messages to this specific client
        task = asyncio.create_task(
            self._redis_forward(ws, self._channel(key)),
            name=f"kitchen-redis-{id(ws)}",
        )
        self._listeners[ws] = task
        logger.info("Kitchen WS connected: %s total=%d", key, len(self._connections[key]))

    def disconnect(self, ws: WebSocket, company_id: UUID, branch_id: UUID) -> None:
        key = self._key(company_id, branch_id)
        conns = self._connections.get(key)
        if conns:
            conns.discard(ws)
            if not conns:
                del self._connections[key]
        task = self._listeners.pop(ws, None)
        if task:
            task.cancel()

    # ── broadcast ─────────────────────────────────────────────────────────────

    async def broadcast(
        self,
        company_id: UUID,
        branch_id: UUID,
        event_type: str,
        data: dict | None = None,
    ) -> None:
        key = self._key(company_id, branch_id)
        message = json.dumps({"type": event_type, "data": data or {}})

        if settings.redis_url:
            try:
                import redis.asyncio as aioredis
                client = aioredis.from_url(settings.redis_url, decode_responses=True)
                await client.publish(self._channel(key), message)
                await client.aclose()
                return  # _redis_forward tasks handle local delivery
            except Exception as exc:
                logger.warning("Redis publish failed (%s) — falling back to local", exc)

        # Fallback: deliver directly to in-process connections only
        await self._send_local(key, message)

    # ── internals ─────────────────────────────────────────────────────────────

    async def _send_local(self, key: str, message: str) -> None:
        conns = self._connections.get(key, set())
        closed: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                closed.append(ws)
        for ws in closed:
            conns.discard(ws)

    async def _redis_forward(self, ws: WebSocket, channel: str) -> None:
        """Subscribe to a Redis channel and forward every message to `ws`."""
        if not settings.redis_url:
            return  # No Redis — broadcast falls back to _send_local

        try:
            import redis.asyncio as aioredis
            client = aioredis.from_url(settings.redis_url, decode_responses=True)
            pubsub = client.pubsub()
            await pubsub.subscribe(channel)
            async for msg in pubsub.listen():
                if msg["type"] == "message":
                    try:
                        await ws.send_text(msg["data"])
                    except Exception:
                        break  # WS closed — stop listener
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning("Redis forward error on %s: %s", channel, exc)
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await client.aclose()
            except Exception:
                pass


kitchen_manager = KitchenConnectionManager()


async def kitchen_ws_endpoint(
    ws: WebSocket,
    token: str = Query(...),
    branch_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        payload = decode_token(token)
    except JWTError:
        await ws.close(code=4001, reason="Invalid token")
        return

    user_id_str = payload.get("sub")
    if not user_id_str:
        await ws.close(code=4002, reason="Company app session required")
        return
    try:
        user = await UserRepository(db).get_by_id(UUID(user_id_str))
    except (ValueError, TypeError):
        user = None
    if not user or not user.is_active:
        await ws.close(code=4001, reason="Unauthorized")
        return
    try:
        await ensure_company_app_identity(
            user, db, auth_scope=payload.get("auth_scope", "app")
        )
        await require_company_resource(
            db, Branch, branch_id, user.company_id, detail="Branch not found"
        )
    except Exception:
        await ws.close(code=4003, reason="Branch not found")
        return

    company_id = user.company_id
    await kitchen_manager.connect(ws, company_id, branch_id)
    try:
        while True:
            await ws.receive_text()  # keep alive; client can send pings
    except WebSocketDisconnect:
        pass
    finally:
        kitchen_manager.disconnect(ws, company_id, branch_id)
