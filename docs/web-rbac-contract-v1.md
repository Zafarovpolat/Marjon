# MARJON WEB RBAC CONTRACT V1

| Field | Frozen value |
|---|---|
| Status | **FROZEN** |
| Scope | **WEB LAUNCH V1** |
| Accepted implementation commit | `241eae81dfa065afe29aed4f6a1d4bacdbff8203` |
| Security acceptance | **BI-06 FINAL RE-AUDIT PASSED** |
| Frozen actors | `SUPER_ADMIN`, `OWNER` |

## 1. Purpose and authority

This document is the authoritative Web Launch V1 authorization contract for Marjon. It freezes only these actor/client combinations:

- `SUPER_ADMIN` in the Web HQ client, operating on system/HQ resources;
- `OWNER` in the Web APP client, operating inside the owner's company and all valid branches of that company.

The backend is the authorization authority. A frontend route, hidden button, token claim, submitted UUID, or cached identity never grants authority by itself. Where this document and a client assumption differ, this contract and the accepted backend implementation prevail.

This freeze does **not** define final authorization semantics for `manager`, `cashier`, `waiter`, `kitchen`, `courier`, `warehouse`, or `monoblock`. Existing records and narrowly guarded operational endpoints may remain, but those roles are deferred and are not part of the Web V1 contract.

## 2. Frozen security invariants

1. Authentication and authorization are separate checks.
2. Session scope, current database identity, company membership, canonical role, capability, tenant relationship, and branch ownership are independently validated where applicable.
3. `SUPER_ADMIN` and `OWNER` are different identities. Neither identity implies the other.
4. An HQ session cannot act as an APP identity, and an APP session cannot act as an HQ identity.
5. Authorization fails closed for missing, stale, ambiguous, legacy, foreign-tenant, or otherwise inconsistent identity state.
6. Client-supplied `company_id`, `org_id`, `branch_id`, `role_id`, `user_id`, and relation/resource UUIDs are selectors, not authorization evidence.
7. A denial must not disclose a foreign tenant's resource existence. Foreign or unrelated resources use privacy-safe denial/not-found behavior.

## 3. SUPER_ADMIN identity contract

`SUPER_ADMIN` is the accepted Web HQ identity. Access requires all of the following at request time:

- a valid signed access token;
- an active current user loaded from the database;
- token/session claim `auth_scope=hq_admin`;
- current database value `User.is_superadmin=true`.

The static database flag alone is insufficient, and an `app` token held by the same user is insufficient. HQ authentication is issued only through the HQ login flow after checking the current database flag. Refresh and subsequent guarded requests re-evaluate current authority; removal of `is_superadmin` revokes or downgrades stale HQ privilege rather than preserving it through an old token.

`SUPER_ADMIN` is not an OWNER role, is not represented by a company `Role` row, and does not gain APP authority merely by having a `company_id`.

### 3.1 Accepted HQ capability families

The accepted implementation gives HQ authority only through routes guarded by `require_hq_admin` and through their service-level scope checks. This is not an unrestricted "everything" grant. The active families include:

- company creation and HQ company administration;
- organizations, organization accounts, and offline-job administration;
- HQ finance dictionaries, transactions, and history under HQ finance routes, with organization/resource scope validation;
- HQ storage and administrative reporting;
- HQ nomenclature/catalog administration, including guarded writes for units, categories, products, and orders where exposed;
- handbook and department administration;
- marketing, field-service, task/approval, rating, and admin-settings workflows;
- explicitly HQ-only administrative reports and subscription-plan creation.

Every HQ family remains limited by its actual route, method, schema, organization/resource relationship checks, and accepted backend behavior. This list does not authorize a new route by analogy.

## 4. OWNER identity contract

`OWNER` is the accepted Web APP company administrator identity. Access requires all of the following at request time:

- a valid signed access token with `auth_scope=app`;
- an active current user loaded from the database;
- a non-null current `company_id`;
- `User.is_superadmin=false`;
- exactly one canonical company role assignment;
- that role belongs to the user's current company;
- that role is non-system;
- that role has the exact slug `owner`.

OWNER identity fails closed for zero roles, multiple roles, a foreign-company role, a system role, the legacy `admin` slug, an unknown slug, or any ambiguous assignment. `require_company_admin` is a compatibility name for the exact frozen `require_web_owner` guard; it does not admit `admin` or `manager`.

OWNER authority covers the owner's own company and **all valid branches belonging to that company**. It does not cover a foreign company or a foreign branch.

## 5. Exact OWNER capability allow-list

The following list is exact and mirrors `DEFAULT_ROLE_PERMISSIONS["owner"]` at the accepted implementation commit. It is a ceiling, not a wildcard.

| Capability | Resource | Action | Scope | Contract note |
|---|---|---|---|---|
| `inventory:products:create` | inventory products | create | company | Product/catalog authority; not stock authority. |
| `inventory:products:read` | inventory products | read | company | Own-company product/catalog reads. |
| `inventory:products:update` | inventory products | update | company | Own-company product/catalog updates. |
| `inventory:categories:create` | inventory categories | create | company | Category/catalog authority. |
| `inventory:categories:read` | inventory categories | read | company | Own-company category reads. |
| `hr:employees:read` | HR employees | read | company | Web OWNER route guard also applies. |
| `hr:employees:write` | HR employees | write | company | Web OWNER route guard also applies. |
| `analytics:dashboard` | analytics dashboard | access | company | Web OWNER route guard also applies. |
| `analytics:reports` | analytics reports | access | company | Web OWNER route guard also applies. |
| `audit:read` | audit log/history | read | company | Web OWNER route guard also applies. |
| `fiscal:receipts:manage` | fiscal receipts/settings | manage | company | Sensitive settings use exact OWNER. |
| `subscriptions:manage` | subscription | manage | company | Current subscription and mutations use exact OWNER. |
| `printers:manage` | printer configuration | manage | company | Own-company printers; branch relationships remain validated. |
| `printers:print` | print operation | print | branch | Only a branch belonging to the current company. |
| `rbac:users:manage` | company users | manage | company | Subject to the delegation and protected-target ceilings below. |
| `companies:manage` | company profile | manage | company | Own company only. |
| `companies:branches:manage` | company branches | manage | company | Own-company branches only. |
| `finance:manage` | company finance | manage | company | Sensitive Web finance routes also require exact OWNER where specified. |
| `finance:read` | company finance | read | company | Own-company finance only. |
| `pos:orders:create` | POS orders | create | branch | Frozen capability entry; branch must belong to own company. |
| `pos:orders:read` | POS orders | read | branch | Frozen capability entry; branch must belong to own company. |
| `pos:orders:update` | POS orders | update | branch | Frozen capability entry; branch must belong to own company. |
| `pos:orders:cancel` | POS orders | cancel | branch | Frozen capability entry; branch must belong to own company. |

Capability rows coexist with exact identity guards. Possession of one of these capability strings does not convert another role into OWNER and does not bypass an exact `require_web_owner` route.

## 6. OWNER authority ceiling

The OWNER ceiling is enforced both by the exact role identity and by an effective-permission ceiling. Stale or historical database links cannot expand OWNER beyond the allow-list above.

OWNER cannot:

- assign or create `SUPER_ADMIN`, `hq_admin`, a system role, or an unknown role;
- set or obtain `is_superadmin`, mint an HQ session, or act through HQ routes;
- self-escalate or mutate a protected OWNER/SUPER_ADMIN identity;
- create privileged/custom roles or directly mutate `RolePermission` links;
- use direct role-assignment APIs to bypass the guarded company-user workflow;
- cross company boundaries or use a foreign branch/resource relationship;
- use stale permission rows to obtain a capability outside the frozen OWNER list;
- acquire `inventory:stock:read` or `inventory:stock:write` through this V1 contract.

The legacy company role slug `admin` is retained only for database compatibility. It is excluded from authoritative APP identities and is reconciled to an empty default permission set.

## 7. OWNER delegation contract

OWNER may create or update company staff through the guarded `/auth/users` workflow only, subject to protected-target, self, tenant, ambiguity, and role ceilings. The exact assignable slug set is:

- `manager`
- `cashier`
- `waiter`
- `kitchen`
- `monoblock`
- `courier`
- `warehouse`

Direct `/rbac/user-roles` assignment is fail closed for OWNER. Assignability means only that the staff identity may be provisioned; it does **not** freeze or promise that role's product permissions, client access, screens, or workflow semantics.

## 8. Route authorization matrix

The matrix records the accepted authorization shape. It is descriptive of the accepted implementation and does not create routes or permissions.

| Route/method family | Accepted actor | Backend guard | Tenant/resource scope | V1 status |
|---|---|---|---|---|
| HQ/Admin route families | SUPER_ADMIN | `require_hq_admin` | System, HQ, or validated organization/resource | Frozen |
| HQ finance `/hq/finance/*` | SUPER_ADMIN | `require_hq_admin` | Validated organization and related resources | Frozen |
| Web OWNER restaurant transactions and transaction mutations | OWNER | `require_web_owner` | Current company | Frozen |
| Web OWNER finance history and counterparty transaction history | OWNER | `require_web_owner` | Current company and related counterparty/resource | Frozen |
| Finance reference/dictionary GET/list | Canonical company APP identity | `require_company_app_user` | Current company only | Narrow reference exception; not OWNER identity |
| Finance reference/dictionary mutations | Capability-bearing canonical APP identity | `require_permission("finance:manage")` or stricter exact guard | Current company only | Capability guarded |
| Analytics dashboard/report routes | OWNER | `require_web_owner` | Current company | Frozen |
| Audit log/entity history | OWNER | `require_web_owner` | Current company | Frozen |
| HR employees, shifts, attendance, salary and login history | OWNER | `require_web_owner` | Current company | Frozen |
| Administrative company reports | OWNER | `require_web_owner` | Current company | Frozen |
| Company staff listing/create/update/archive/restore | OWNER | `require_web_owner` / compatibility alias | Current company; protected targets excluded | Frozen |
| Company/profile/branch mutations | OWNER | `require_web_owner` / compatibility alias | Current company and own branches | Frozen |
| Subscription create/current | OWNER | `require_web_owner` | Current company | Frozen |
| Subscription-plan creation | SUPER_ADMIN | `require_hq_admin` | HQ/system | Frozen |
| Fiscal settings GET/PUT | OWNER | `require_web_owner` | Current company | Frozen |
| Fiscal receipt reference reads | Canonical company APP identity | `require_company_app_user` | Current company | Existing operational read; not OWNER identity |
| Role creation, direct assignment, and permission mutation | None through OWNER Web V1 | Fail-closed service/route rules | No bypass via client IDs | Frozen deny |
| Product/category catalog operations | OWNER for guarded writes; canonical APP for existing reads | Exact OWNER alias or APP identity as implemented | Current company | Product/catalog portion frozen |
| Inventory stock reads/writes | Operational capability only | `require_permission("inventory:stock:read/write")` | Current company and validated relations | Inventory Core deferred; OWNER denied by ceiling |
| Warehouse/inventory document writes | Operational capability only | `require_permission("inventory:stock:write")` | Current company, branch, warehouse, and related resources | Existing guarded path; product semantics deferred |
| Kitchen WebSocket | Canonical company APP identity | Signed token plus `ensure_company_app_identity` | Current company and owned branch | Security boundary accepted; role workflow deferred |
| Printer WebSocket | Canonical company APP identity | Signed token plus `ensure_company_app_identity` | Current company and owned branch | Security boundary accepted; role workflow deferred |

## 9. Tenant and relation contract

For every tenant-sensitive operation, the current database user determines the company authority. A request cannot select a different tenant by sending a different identifier.

- Company A cannot read, update, delete, attach, or invoke resources owned by Company B.
- A body, query, or path `company_id` is validated against the current identity or ignored as authority.
- Organization, branch, warehouse, product, ingredient, counterparty, employee, role, user, and other relation UUIDs must resolve inside the authorized tenant and relationship graph.
- Nested resources inherit and revalidate the parent tenant boundary.
- A foreign resource is rejected using privacy-safe semantics; the API must not confirm its existence merely because its UUID was guessed.

## 10. Branch contract

OWNER Web V1 authority is company-wide and therefore applies to every branch whose current database `company_id` equals the OWNER's current company. No separate fixed branch assignment is required for OWNER.

Every branch reference supplied in a path, query, body, nested object, WebSocket connection, print operation, or POS relationship must still be validated. A branch owned by another company is always denied. A valid own-company branch does not weaken any additional resource or capability guard.

## 11. Finance boundary

- HQ finance is available only to `SUPER_ADMIN` through an HQ-scoped session and is further constrained by organization/resource relationships.
- Sensitive restaurant finance transactions, mutations, history, and counterparty transaction history exposed to the Web owner are exact-OWNER operations in the current company.
- A generic canonical APP identity is not sufficient for OWNER-sensitive finance operations.
- Tenant-scoped finance dictionary/reference reads may be available to a canonical APP identity where the accepted implementation exposes them. This narrow read access supports shared operational references and does not imply OWNER identity or finance mutation authority.
- Finance dictionary/reference mutations require `finance:manage` or a stricter exact guard.
- Client-supplied counterparty, transaction, category, company, or organization identifiers never override tenant and relationship checks.

## 12. Inventory and warehouse boundary

Inventory Core and Warehouse Core role semantics are **not frozen** by this contract.

OWNER has product/category catalog capabilities listed in section 5 but does not have `inventory:stock:read` or `inventory:stock:write`. Existing stock and warehouse-document writes are guarded by explicit `inventory:stock:write` capability checks and tenant/relation validation. A pre-existing operational `warehouse` assignment may therefore reach those narrowly guarded endpoints under the accepted backend, but that fact does not freeze the role's final UI, client, workflow, or business semantics.

No future inventory authority may be inferred from product naming, a frontend screen, the ability to assign the `warehouse` slug, or an existing default permission row.

## 13. WebSocket boundary

Kitchen and printer WebSockets do not rely on a client-provided company or branch alone. Before connection acceptance they require:

- a valid signed APP token;
- a current active database user;
- a non-superadmin company identity;
- exactly one canonical, same-company, non-system APP role;
- a branch that belongs to the current user's company.

These checks freeze the transport security boundary only. They do not freeze the final kitchen, printer, or staff-role product semantics.

## 14. Deferred role register

| Role | Freeze status | Client/product direction | V1 statement |
|---|---|---|---|
| `manager` | Deferred | Staff Web/Desktop to be decided | Assignable by OWNER; semantics not frozen. |
| `cashier` | Deferred | Desktop/POS future | Assignable by OWNER; semantics not frozen. |
| `waiter` | Deferred | Staff Mobile/Desktop future | Assignable by OWNER; semantics not frozen. |
| `kitchen` | Deferred | Kitchen product/client not frozen | Assignable by OWNER; only accepted security boundaries apply. |
| `courier` | Deferred | Delivery client to be decided | Assignable by OWNER; semantics not frozen. |
| `warehouse` | Deferred | Inventory/Warehouse client not frozen | Assignable by OWNER; existing explicit capability guards are not a final product contract. |
| `monoblock` | Deferred | POS/Desktop future | Assignable by OWNER; semantics not frozen. |

No permission promise may be derived from historical `DEFAULT_ROLE_PERMISSIONS` entries for these deferred roles.

## 15. Client boundary

A role and a client are separate dimensions.

| Actor | Frozen client | Frozen session scope | Status |
|---|---|---|---|
| SUPER_ADMIN | Web HQ | `hq_admin` | Frozen |
| OWNER | Web APP | `app` | Frozen |
| OWNER mobile | None | None | Reserved/future; not frozen |
| Operational staff roles | None | Existing compatibility only | Mobile/Desktop/product semantics deferred |

The frontend may hide unavailable controls for usability, but the backend must continue to reject unauthorized direct calls. Client routing is never a replacement for a backend guard.

## 16. Change control

This contract may be changed only by an explicit follow-up security/RBAC work item that includes:

1. an intentional contract revision;
2. backend guard and service changes, if required;
3. tenant and privilege regression tests;
4. PostgreSQL acceptance where persistence/constraint behavior is relevant;
5. OpenAPI and route-integrity review;
6. an independent security acceptance review;
7. a new accepted implementation commit recorded in the revised contract.

Adding a UI screen, role label, permission seed, route, or client-side check alone cannot extend this frozen authority. New roles and clients are denied or treated as deferred until explicitly accepted.

## 17. Implementation sources of truth

This freeze was checked against the accepted implementation, including:

- `backend/app/modules/auth/dependencies.py` for APP, OWNER, and HQ identity guards;
- `backend/app/modules/auth/service.py` for login/refresh and protected company-user mutations;
- `backend/app/modules/rbac/constants.py` for canonical, legacy, and OWNER-assignable role slugs;
- `backend/app/modules/rbac/permissions.py` for the exact OWNER allow-list and reconciliation;
- `backend/app/modules/rbac/dependencies.py` and `service.py` for capability evaluation and the OWNER ceiling;
- active finance, analytics, audit, HR, reports, subscriptions, fiscal, companies, auth, inventory, kitchen, and printers routes/services;
- the accepted BI-06 PostgreSQL, tenant-isolation, authorization, OpenAPI, and full test gates at commit `241eae81dfa065afe29aed4f6a1d4bacdbff8203`.

The implementation commit remains the executable reference. This document intentionally freezes its accepted Web V1 security meaning without freezing unrelated future product behavior.
