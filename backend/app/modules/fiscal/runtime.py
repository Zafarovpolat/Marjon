from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Protocol, runtime_checkable
from uuid import UUID

from app.shared.exceptions import ValidationError


@runtime_checkable
class FiscalCredentialResolver(Protocol):
    """Resolve an opaque reference without storing credentials in Marjon DB."""

    available: bool

    async def resolve(self, company_id: UUID, credential_ref: str) -> object:
        ...


@runtime_checkable
class FiscalProvider(Protocol):
    """BI-05C2 transport contract. BI-05C1 never calls these methods."""

    name: str

    async def submit_receipt(
        self,
        *,
        event_id: UUID,
        company_id: UUID,
        receipt_id: UUID,
        credential: object,
    ) -> object:
        ...

    async def get_status(
        self,
        *,
        event_id: UUID,
        company_id: UUID,
        receipt_id: UUID,
        credential: object,
    ) -> object:
        ...


class DisabledFiscalCredentialResolver:
    """Production-safe default until BI-05C2 supplies a Secret Manager."""

    available = False

    async def resolve(self, company_id: UUID, credential_ref: str) -> object:
        raise ValidationError("Fiscal credential resolver is unavailable")


@dataclass(frozen=True)
class FiscalRuntime:
    resolver: FiscalCredentialResolver = field(
        default_factory=DisabledFiscalCredentialResolver
    )
    providers: Mapping[str, FiscalProvider] = field(default_factory=dict)

    async def assert_ready(
        self,
        *,
        company_id: UUID,
        provider: str,
        credential_ref: str,
    ) -> None:
        if provider not in self.providers:
            raise ValidationError("Fiscal provider capability is unavailable")
        if not self.resolver.available:
            raise ValidationError("Fiscal credential resolver is unavailable")
        credential = await self.resolver.resolve(company_id, credential_ref)
        if credential is None:
            raise ValidationError("Fiscal credential reference cannot be resolved")


_PRODUCTION_RUNTIME = FiscalRuntime()


def get_fiscal_runtime() -> FiscalRuntime:
    return _PRODUCTION_RUNTIME
