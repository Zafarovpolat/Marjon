"""BE-05: canonical role-slug allowlist for company-level staff roles.

Previously `AuthService.create_company_user()` / `update_company_user()`
(and `RBACService.create_role()`) accepted ANY string as `role_slug` and
silently created a brand-new `Role` row for it on first use — with zero
permissions ever attached (nothing populated `RolePermission` anywhere in
the codebase). This module is the single source of truth for which slugs
are valid; see `RBACService.get_or_create_company_role()` for enforcement
and `rbac/permissions.py`'s `DEFAULT_ROLE_PERMISSIONS` for what each slug
grants by default.

Platform-level roles (`superadmin`, `hq_admin`) are deliberately NOT part
of `COMPANY_ROLE_SLUGS` — those aren't `Role` rows at all, they're the
`User.is_superadmin` flag combined with the JWT's `auth_scope` claim
(see BE-01, `auth/dependencies.py::require_hq_admin`).
"""
from __future__ import annotations

COMPANY_ROLE_SLUGS: frozenset[str] = frozenset({
    "owner", "admin", "manager", "cashier", "waiter",
    "kitchen", "monoblock", "courier", "warehouse",
})

PLATFORM_ROLE_SLUGS: frozenset[str] = frozenset({"superadmin", "hq_admin"})

# Frozen BI-06 Web identities.  The remaining canonical company roles are
# retained for existing operational assignments, but their final semantics are
# intentionally deferred to the Staff Mobile/Desktop RBAC wave.
WEB_OWNER_ROLE_SLUG = "owner"
# ``admin`` is a retained legacy database slug whose historical wildcard
# cannot be classified safely in this wave.  Keep the record/assignment, but
# do not accept it as an authoritative APP identity.
LEGACY_AMBIGUOUS_ROLE_SLUGS: frozenset[str] = frozenset({"admin"})
APP_COMPANY_ROLE_SLUGS: frozenset[str] = (
    COMPANY_ROLE_SLUGS - LEGACY_AMBIGUOUS_ROLE_SLUGS
)

# Confirmed by the production Web staff editor. Operational-role semantics
# remain deferred; this set is only the OWNER delegation ceiling.
OWNER_ASSIGNABLE_ROLE_SLUGS: frozenset[str] = frozenset({
    "manager", "cashier", "waiter", "kitchen", "monoblock", "courier", "warehouse",
})
