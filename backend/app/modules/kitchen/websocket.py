from __future__ import annotations
import json
import logging
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect, Query
from jose import JWTError

from app.modules.auth.security import decode_token

logger = logging.getLogger(__name__)


class KitchenConnectionManager:
    def __init__(self):
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, company_id: UUID):
        await ws.accept()
        key = str(company_id)
        if key not in self._connections:
            self._connections[key] = set()
        self._connections[key].add(ws)
        logger.info("Kitchen WS connected: company=%s, total=%d", key, len(self._connections[key]))

    def disconnect(self, ws: WebSocket, company_id: UUID):
        key = str(company_id)
        conns = self._connections.get(key)
        if conns:
            conns.discard(ws)
            if not conns:
                del self._connections[key]

    async def broadcast(self, company_id: UUID, event_type: str, data: dict | None = None):
        key = str(company_id)
        conns = self._connections.get(key)
        if not conns:
            return
        message = json.dumps({"type": event_type, "data": data or {}})
        closed = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                closed.append(ws)
        for ws in closed:
            conns.discard(ws)


kitchen_manager = KitchenConnectionManager()


async def kitchen_ws_endpoint(ws: WebSocket, token: str = Query(...)):
    try:
        payload = decode_token(token)
    except JWTError:
        await ws.close(code=4001, reason="Invalid token")
        return

    company_id_str = payload.get("company_id")
    if not company_id_str:
        await ws.close(code=4002, reason="No company")
        return

    company_id = UUID(company_id_str)
    await kitchen_manager.connect(ws, company_id)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        kitchen_manager.disconnect(ws, company_id)
