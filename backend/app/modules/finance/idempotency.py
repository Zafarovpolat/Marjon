from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from pydantic_core import to_jsonable_python
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.models import FinancialOperation
from app.shared.exceptions import ConflictError, ValidationError


SCOPE_COMPANY = "company"
SCOPE_ORGANIZATION = "organization"

OP_FINANCE_CREATE = "finance.transaction.create"
OP_FINANCE_PAY = "finance.transaction.pay"
OP_COMPANY_FINANCE_CREATE = "finance.company_transaction.create"
OP_PAYMENT_PROCESS = "payment.process"
OP_PAYMENT_WEBHOOK_CONFIRM = "payment.webhook.confirm"


def request_fingerprint(payload: BaseModel | dict[str, Any]) -> str:
    """Return a deterministic SHA-256 hash of a normalized request payload."""

    if isinstance(payload, BaseModel):
        normalized = payload.model_dump(mode="json")
    else:
        normalized = to_jsonable_python(payload)
    canonical = json.dumps(
        normalized,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def validate_idempotency_key(idempotency_key: str) -> None:
    if not idempotency_key or len(idempotency_key) > 128:
        raise ValidationError(
            "Idempotency-Key must contain between 1 and 128 characters"
        )


@dataclass(frozen=True)
class OperationClaim:
    operation: FinancialOperation
    is_new: bool


class FinancialOperationService:
    """Claim and complete an idempotent operation in the caller transaction.

    The unique insert is protected by a savepoint. On PostgreSQL a concurrent
    insert of the same identity waits for the winner to commit; if the winner
    rolls back, the waiter can claim the key. No reservation is committed
    separately from the monetary write it protects.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _identity_query(
        scope_kind: str,
        scope_id: UUID,
        operation_type: str,
        idempotency_key: str,
    ):
        return select(FinancialOperation).where(
            FinancialOperation.scope_kind == scope_kind,
            FinancialOperation.scope_id == scope_id,
            FinancialOperation.operation_type == operation_type,
            FinancialOperation.idempotency_key == idempotency_key,
        )

    async def claim(
        self,
        *,
        scope_kind: str,
        scope_id: UUID,
        operation_type: str,
        idempotency_key: str,
        fingerprint: str,
    ) -> OperationClaim:
        validate_idempotency_key(idempotency_key)
        operation = FinancialOperation(
            scope_kind=scope_kind,
            scope_id=scope_id,
            operation_type=operation_type,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            status="processing",
        )
        try:
            async with self.db.begin_nested():
                self.db.add(operation)
                await self.db.flush()
        except IntegrityError:
            existing = (
                await self.db.execute(
                    self._identity_query(
                        scope_kind,
                        scope_id,
                        operation_type,
                        idempotency_key,
                    ).with_for_update()
                )
            ).scalar_one_or_none()
            if existing is None:
                raise
            if existing.request_fingerprint != fingerprint:
                raise ConflictError(
                    "Idempotency-Key was already used with a different request"
                )
            if existing.status != "completed":
                raise ConflictError("Idempotent operation is not completed")
            return OperationClaim(operation=existing, is_new=False)
        return OperationClaim(operation=operation, is_new=True)

    @staticmethod
    def complete(
        operation: FinancialOperation,
        result_metadata: dict[str, Any],
    ) -> None:
        operation.status = "completed"
        operation.result_metadata = to_jsonable_python(result_metadata)
