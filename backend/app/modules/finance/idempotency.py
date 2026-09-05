from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal
import hashlib
import json
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from pydantic_core import to_jsonable_python
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.money import canonical_money_string
from app.modules.finance.models import FinancialOperation
from app.shared.exceptions import ConflictError, ValidationError


SCOPE_COMPANY = "company"
SCOPE_ORGANIZATION = "organization"

OP_FINANCE_CREATE = "finance.transaction.create"
OP_FINANCE_PAY = "finance.transaction.pay"
OP_COMPANY_FINANCE_CREATE = "finance.company_transaction.create"
OP_PAYMENT_PROCESS = "payment.process"
OP_PAYMENT_WEBHOOK_CONFIRM = "payment.webhook.confirm"

FINGERPRINT_V1 = 1
FINGERPRINT_V2 = 2


def request_fingerprint(payload: BaseModel | dict[str, Any]) -> str:
    """Return the durable BI-05B V1 fingerprint.

    Do not use this for new operations. It remains public only so existing V1
    rows can be compared with the exact algorithm that created them.
    """

    if isinstance(payload, BaseModel):
        normalized = payload.model_dump(mode="json")
    else:
        normalized = to_jsonable_python(payload)

    # BI-05A added an optional transaction/template reference. Omitting it
    # must serialize exactly like pre-BI-05A requests so durable BI-05B
    # reservations remain replayable across the deployment boundary.
    def without_absent_template(value):
        if isinstance(value, dict):
            return {
                key: without_absent_template(item)
                for key, item in value.items()
                if not (key == "finance_template_id" and item is None)
            }
        if isinstance(value, list):
            return [without_absent_template(item) for item in value]
        return value

    normalized = without_absent_template(normalized)
    return _hash_normalized(normalized)


def _hash_normalized(normalized: Any) -> str:
    canonical = json.dumps(
        normalized,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _canonicalize_v2(value: Any) -> Any:
    if isinstance(value, Decimal):
        return canonical_money_string(value)
    if isinstance(value, float):
        raise ValidationError(
            "V2 monetary fingerprint requires Decimal-safe normalization"
        )
    if isinstance(value, dict):
        return {
            key: _canonicalize_v2(item)
            for key, item in value.items()
            if not (key == "finance_template_id" and item is None)
        }
    if isinstance(value, list):
        return [_canonicalize_v2(item) for item in value]
    if isinstance(value, tuple):
        return [_canonicalize_v2(item) for item in value]
    return value


def request_fingerprint_v2(payload: BaseModel | dict[str, Any]) -> str:
    """Return a Decimal-safe, scale-aware fingerprint for new operations."""

    if isinstance(payload, BaseModel):
        normalized = payload.model_dump(mode="python")
    else:
        normalized = payload
    normalized = _canonicalize_v2(normalized)
    return _hash_normalized(to_jsonable_python(normalized))


def legacy_v1_fingerprint_compatibility(
    payload: BaseModel | dict[str, Any],
) -> str:
    """Compute V1 only after a stored V1 reservation is discovered."""

    return request_fingerprint(payload)


def legacy_v1_company_transaction_fingerprint(data: dict[str, Any]) -> str:
    """Reproduce the pre-BI-05E1 company transaction V1 float contract.

    This function is supplied as a lazy callback and is never called for a
    newly inserted operation, persisted amount, or V2 fingerprint.
    """

    legacy = {
        "amount": abs(float(data.get("amount") or 0)),
        "direction": data.get("direction") or "income",
        "comment": data.get("comment"),
        "category_id": data.get("category_id"),
        "payment_type_id": data.get("payment_type_id"),
        "counterparty_id": data.get("counterparty_id"),
        "finance_template_id": data.get("finance_template_id"),
    }
    return request_fingerprint(legacy)


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
        legacy_v1_fingerprint: Callable[[], str] | None = None,
    ) -> OperationClaim:
        validate_idempotency_key(idempotency_key)
        operation = FinancialOperation(
            scope_kind=scope_kind,
            scope_id=scope_id,
            operation_type=operation_type,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            fingerprint_version=FINGERPRINT_V2,
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
            if existing.fingerprint_version == FINGERPRINT_V1:
                expected_fingerprint = (
                    legacy_v1_fingerprint()
                    if legacy_v1_fingerprint is not None
                    else fingerprint
                )
            elif existing.fingerprint_version == FINGERPRINT_V2:
                expected_fingerprint = fingerprint
            else:
                raise ConflictError("Unsupported idempotency fingerprint version")
            if existing.request_fingerprint != expected_fingerprint:
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
