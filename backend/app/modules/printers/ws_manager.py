from __future__ import annotations
import logging
from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class PrinterWSManager:
    """
    Keeps track of desktop terminal WebSocket connections.
    Organized by company_id → branch_id so broadcasts are scoped correctly.
    """

    def __init__(self) -> None:
        # {company_id_str: {branch_id_str: [WebSocket, ...]}}
        self._connections: dict[str, dict[str, list[WebSocket]]] = defaultdict(
            lambda: defaultdict(list)
        )

    async def connect(self, ws: WebSocket, company_id: UUID, branch_id: UUID) -> None:
        await ws.accept()
        self._connections[str(company_id)][str(branch_id)].append(ws)
        logger.info("Printer WS connected: company=%s branch=%s", company_id, branch_id)

    def disconnect(self, ws: WebSocket, company_id: UUID, branch_id: UUID) -> None:
        conns = self._connections[str(company_id)][str(branch_id)]
        try:
            conns.remove(ws)
        except ValueError:
            pass
        logger.info("Printer WS disconnected: company=%s branch=%s", company_id, branch_id)

    async def broadcast(self, company_id: UUID, branch_id: UUID, message: dict) -> None:
        """Send a print job notification to all terminals connected for this branch."""
        conns = list(self._connections[str(company_id)][str(branch_id)])
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                self._connections[str(company_id)][str(branch_id)].remove(ws)
            except ValueError:
                pass


# Singleton reused across the app lifetime
printer_ws_manager = PrinterWSManager()
