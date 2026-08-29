from __future__ import annotations
from decimal import Decimal
from uuid import UUID
from app.shared.base_schema import BaseSchema, BaseResponseSchema


class PaymentCreate(BaseSchema):
    order_id: UUID
    amount: Decimal
    method: str
    cash_received: Decimal | None = None


class PaymentResponse(BaseResponseSchema):
    company_id: UUID
    order_id: UUID
    amount: Decimal
    method: str
    status: str
    provider_tx_id: str | None
    cash_received: Decimal | None
    change_given: Decimal | None
    fiscal_code: str | None


# ── Payment gateway settings (per-company) ────────────────────────────────────

class GatewaySettingsUpdate(BaseSchema):
    payme_enabled: bool = False
    payme_merchant_id: str | None = None
    payme_key: str | None = None

    click_enabled: bool = False
    click_merchant_id: str | None = None
    click_service_id: str | None = None
    click_secret_key: str | None = None

    uzum_enabled: bool = False
    uzum_store_id: str | None = None
    uzum_key: str | None = None


class GatewaySettingsResponse(BaseSchema):
    payme_enabled: bool
    payme_merchant_id: str | None
    # payme_key intentionally omitted from response (write-only)

    click_enabled: bool
    click_merchant_id: str | None
    click_service_id: str | None
    # click_secret_key intentionally omitted

    uzum_enabled: bool
    uzum_store_id: str | None
