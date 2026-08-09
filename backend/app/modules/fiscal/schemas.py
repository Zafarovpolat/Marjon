from __future__ import annotations
import re
from uuid import UUID

from pydantic import field_validator

from app.shared.base_schema import BaseSchema, BaseResponseSchema


_CREDENTIAL_REF_PATTERN = re.compile(
    r"^(?:secret|vault|test)://[A-Za-z0-9][A-Za-z0-9._:/-]{1,239}$"
)
_FORBIDDEN_REFERENCE_PARTS = ("bearer", "password", "api_key", "token", "=")


class FiscalReceiptCreate(BaseSchema):
    order_id: UUID
    payment_id: UUID
    provider: str = "ofd_uz"


class FiscalReceiptResponse(BaseResponseSchema):
    company_id: UUID
    order_id: UUID
    payment_id: UUID
    status: str
    fiscal_code: str | None
    receipt_url: str | None
    provider: str
    error_message: str | None


class FiscalSettingsUpdate(BaseSchema):
    enabled: bool
    provider: str | None = None
    tin: str | None = None
    credential_ref: str | None = None

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not re.fullmatch(r"[a-z][a-z0-9_-]{1,49}", value):
            raise ValueError("provider must be a stable provider identifier")
        return value

    @field_validator("tin")
    @classmethod
    def validate_tin(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not re.fullmatch(r"[0-9]{9,14}", value):
            raise ValueError("tin must contain 9 to 14 digits")
        return value

    @field_validator("credential_ref")
    @classmethod
    def validate_credential_ref(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        lowered = value.lower()
        if not _CREDENTIAL_REF_PATTERN.fullmatch(value) or any(
            part in lowered for part in _FORBIDDEN_REFERENCE_PARTS
        ):
            raise ValueError(
                "credential_ref must be an opaque secret://, vault://, or test:// reference"
            )
        return value


class FiscalSettingsResponse(BaseSchema):
    company_id: UUID
    enabled: bool
    provider: str | None
    tin: str | None
    credential_ref: str | None
