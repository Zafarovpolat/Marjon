from __future__ import annotations
from datetime import date
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from app.shared.base_schema import BaseResponseSchema
from app.shared.phone import normalize_branch_login
from app.modules.auth.schemas import _validate_password


class OrganizationStatusCreate(BaseModel):
    name: str
    sort: int = 0
    status: bool = True


class OrganizationStatusUpdate(BaseModel):
    name: str | None = None
    sort: int | None = None
    status: bool | None = None


class OrganizationStatusResponse(BaseResponseSchema):
    name: str
    sort: int
    status: bool


class OrganizationBase(BaseModel):
    name: str
    type: str = "restaurant"
    tariff_price: Decimal = Decimal(0)
    working_days: int = 0
    is_main: bool = False
    virtual_cash_register_number: str | None = None
    virtual_cash_register_ip_address: str | None = None
    country_id: UUID | None = None
    region_id: UUID | None = None
    district_id: UUID | None = None
    installation_date: date | None = None
    tin: str | None = None
    is_solvent: bool = True
    enabled_storage_integration: bool = False
    online_menu: bool = False
    status: str = "active"
    taplink: str | None = None
    is_billing_autoblock: bool = False
    is_face_detection_required: bool = False
    organization_status_id: UUID | None = None


class OrganizationCreate(OrganizationBase):
    # ORG-BRIDGE-01: optional real-client provisioning alongside the
    # directory row. When provision_owner is set, company_slug/owner_phone/
    # owner_password are required — the same Company+Branch+owner-User
    # onboarding as the public self-registration flow (AuthService.register),
    # just triggered from the HQ panel instead of the client signing up
    # themselves. owner_phone (not email) is the login credential: the
    # owner-facing web app's login screen (LoginPage.jsx) only has a phone
    # field — a user provisioned with email only could never actually sign
    # in. owner_email stays optional (contact info only).
    provision_owner: bool = False
    company_slug: str | None = Field(None, min_length=1, max_length=100, pattern=r"^[a-z0-9_-]+$")
    owner_phone: str | None = None
    owner_email: EmailStr | None = None
    owner_password: str | None = None

    @field_validator("owner_phone")
    @classmethod
    def normalize_owner_phone(cls, v: str | None) -> str | None:
        if not v:
            return v
        normalized = normalize_branch_login(v)
        if not normalized.startswith("+998"):
            raise ValueError("Укажите номер телефона в формате +998XXXXXXXXX (9 цифр после кода страны)")
        return normalized

    @field_validator("owner_password")
    @classmethod
    def check_owner_password(cls, v: str | None) -> str | None:
        return _validate_password(v) if v else v

    @model_validator(mode="after")
    def check_provisioning_fields(self) -> "OrganizationCreate":
        if self.provision_owner and not (self.company_slug and self.owner_phone and self.owner_password):
            raise ValueError("provision_owner requires company_slug, owner_phone and owner_password")
        return self


class OrganizationUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    tariff_price: Decimal | None = None
    working_days: int | None = None
    is_main: bool | None = None
    virtual_cash_register_number: str | None = None
    virtual_cash_register_ip_address: str | None = None
    country_id: UUID | None = None
    region_id: UUID | None = None
    district_id: UUID | None = None
    installation_date: date | None = None
    tin: str | None = None
    is_solvent: bool | None = None
    enabled_storage_integration: bool | None = None
    online_menu: bool | None = None
    status: str | None = None
    taplink: str | None = None
    is_billing_autoblock: bool | None = None
    is_face_detection_required: bool | None = None
    organization_status_id: UUID | None = None


class OrganizationResponse(OrganizationBase, BaseResponseSchema):
    cash_balance: Decimal
    company_id: UUID | None = None


class OrganizationDirectoryResponse(OrganizationResponse):
    """BE-15: GET /organizations' list view — adds aggregate fields the
    admin org-directory table (AdminApp.jsx's "org-list"/org-directory
    views) expects on top of the plain OrganizationResponse fields.

    owner_name/admin_name are real: derived from user_organizations linking
    an HQ account (Role.company_id IS NULL, slug owner/admin) to this org —
    null if none is linked, never a placeholder string.

    branches_count is always null. Organization (the HQ admin-panel's
    tenant concept) has no relationship to Branch anywhere in the schema —
    Branch only links to Company (the owner/kafe app's tenant concept),
    and nothing bridges the two. Returning a fabricated 0 here would be
    exactly the "fictional number instead of unknown data" BE-17 warns
    against; the admin frontend already falls back to 0 when this is
    absent/null (`r.branches_count || r.branch_count || 0`), so this is
    the correct behavior until/unless that architectural gap is closed.
    """
    owner_name: str | None = None
    admin_name: str | None = None
    branches_count: int | None = None


class AccountCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=150, pattern=r"^[a-zA-Z0-9_.@-]+$")
    password: str
    name: str
    email: str | None = None  # если не задан — генерируется из username
    role_slug: str = "admin"
    is_active: bool = True
    organization_ids: list[UUID] = Field(default_factory=list)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _validate_password(v)


class AccountUpdate(BaseModel):
    password: str | None = None
    name: str | None = None
    role_slug: str | None = None
    is_active: bool | None = None
    organization_ids: list[UUID] | None = None

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str | None) -> str | None:
        return _validate_password(v) if v else v


class AccountResponse(BaseResponseSchema):
    username: str | None
    name: str | None
    email: str
    is_active: bool
    role_slug: str | None = None
    organization_ids: list[UUID] = Field(default_factory=list)


class OfflineJobCreate(BaseModel):
    type: str
    organization_id: UUID
    payload: dict | None = None
    idempotency_key: str | None = None


class OfflineJobResponse(BaseResponseSchema):
    type: str
    organization_id: UUID
    status: str
    error: str | None
    payload: dict | None
    idempotency_key: str | None
