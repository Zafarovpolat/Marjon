# MARJON WEB API CONTRACT V1

| Field | Frozen value |
|---|---|
| Status | **FROZEN FOR FRONTEND REMEDIATION** |
| Actors | `SUPER_ADMIN`, `OWNER` |
| Frontend baseline | `ed646b48565ff2ed8eaae57c6ed8fab0af0fb616` |
| Backend baseline | `7a00751b52c12c8ce86738d3e7575c7054acb787` |
| RBAC | **WEB RBAC CONTRACT V1 FROZEN** |
| API prefix | `/api/v1` unless stated otherwise |

## 1. Purpose, authority, and scope

This document is the authoritative frontend-to-backend contract for Marjon Web Launch V1. It freezes the truthful Web behavior for the HQ `SUPER_ADMIN` client and the company `OWNER` client. It is an implementation contract, not a product-code change and not a promise that every existing backend route must be exposed in Web V1.

The sources of truth, in descending order, are:

1. `docs/web-rbac-contract-v1.md`;
2. current backend routes, guards, services, and Pydantic schemas;
3. current generated FastAPI OpenAPI baseline;
4. accepted backend tests;
5. current frontend request paths, payloads, field access, and routes;
6. the accepted WEB FUNCTIONAL/API CONTRACT AUDIT V1 findings.

When a frontend assumption conflicts with the backend, the backend wins. This document never creates an endpoint, response field, permission, tenant relationship, or business rule by analogy. ZimZim and other competitor behavior are not sources for this contract.

## 2. Contract status model

| Status | Exact meaning |
|---|---|
| `REAL_FROZEN` | The current backend contract exists and is authoritative for the retained Web function. |
| `FRONTEND_FIX` | The backend is sufficient, but the current frontend consumes or presents it incorrectly. |
| `BACKEND_GAP` | A retained Launch V1 function genuinely needs a backend capability that does not exist. |
| `DEFERRED` | Intentionally outside this Web V1 contract. Existing code does not make it a Launch promise. |
| `REMOVE_FROM_WEB` | The current frontend surface must not exist in Web Launch V1. |
| `READ_ONLY` | Web may read the resource, but mutation is not part of the relevant actor's contract. |
| `UNUSED` | A backend capability exists but is not a current Web V1 consumer or launch requirement. |

## 3. Global data-truth contract

Production Web never invents business data.

| Backend/client state | Required Web state |
|---|---|
| Request not started | `INITIAL`; no success or empty claim. |
| In flight | `LOADING`; retain only explicitly stale-labelled prior data, otherwise show a loader. |
| 2xx with records | `SUCCESS_DATA`; render only authoritative response data. |
| 2xx with an empty collection | `SUCCESS_EMPTY`; a truthful empty state. |
| 2xx with a real numeric zero | Render `0`; zero is not the same as unavailable. |
| 401 | End/refresh the invalid session according to the auth flow; never render protected data. |
| 403 | `FORBIDDEN_403`; never convert to an empty list. |
| 404 | `NOT_FOUND_404`; use privacy-safe wording and do not infer foreign-resource existence. |
| 409 | `CONFLICT_409`; preserve the prior UI truth and require refresh/retry as appropriate. |
| 422 | `VALIDATION_422`; bind backend validation to the form without claiming success. |
| Network failure | `NETWORK_ERROR`; never convert to `0`, `[]`, or cached demo data. |
| 5xx | `SERVER_ERROR`; never show successful business output. |

Forbidden production fallbacks include API error to zero, empty array, fake rows, local-only success, demo totals, or a business-looking report. Sample data is permitted only inside an explicitly labelled visual template preview; it is never a business record.

## 4. Actor and client boundary

| Actor | Web client | Session | Backend identity |
|---|---|---|---|
| `SUPER_ADMIN` | Web HQ | `auth_scope=hq_admin` | Current DB user must still have `is_superadmin=true`; `require_hq_admin`. |
| `OWNER` | Web APP | `auth_scope=app` | Active non-superadmin company user with exactly one canonical same-company non-system role, exact slug `owner`; `require_web_owner`/exact compatibility alias. |

OWNER operates only in the current database `company_id` and its valid branches. SUPER_ADMIN and OWNER are distinct identities. Menus and route visibility are not authorization.

The following are `REMOVE_FROM_WEB`: `/login/staff`, PIN-login Web flow, `/waiter*`, `/kitchen`, manager/cashier/waiter/kitchen/monoblock Web homes, legacy `admin` mapping into the OWNER shell, and a superadmin wildcard in the APP permission map. Backend operational roles and OWNER staff-assignment controls remain; **role is not client**. Cashier and waiter remain available for future Desktop/other accepted clients, not Web V1.

## 5. Common transport, pagination, date, identity, and money rules

### 5.1 Page envelope

Generic paginated routes return:

```text
{ items: T[], total: int, page: int, size: int, pages: int }
```

`page` is one-based. `size` is normally `1..200`. Non-paginated compatibility routes explicitly return either a bare array or `{items, count}`/`{items}` as documented below. Frontend must not guess one shape from another.

### 5.2 Filters and dates

- Send only query parameters declared by the route.
- `date` is one calendar date; `date_from` and `date_to` are inclusive calendar bounds where the service uses `func.date(...)`.
- A DateRangePicker is valid only for an endpoint with both range parameters.
- Generic CRUD filters are exact allow-listed field names. `search`, `sort`, `page`, `size`, `date_from`, and `date_to` are not interchangeable with `limit`, `offset`, `from`, `to`, or a speculative `date` alias.
- Optional omitted filters mean “no filter”; they do not mean an empty result.

### 5.3 IDs and relations

UUID fields are authoritative relations. Display labels are presentation only. Frontend sends `company_id`, `branch_id`, `user_id`, `role_slug`, `product_id`, `category_id`, `unit_id`, `payment_type_id`, `counterparty_id`, `printer_id`, and other relation fields exactly where the schema requires them; it never submits a label in place of an ID. Every tenant-sensitive relation is revalidated by the backend. A foreign relation must be denied/not found safely.

### 5.4 Money

- Backend domain money uses `Decimal`; company transaction compatibility output explicitly serializes `amount` as a JSON number (`float`).
- Generated Pydantic/OpenAPI decimal schemas are the wire authority. The frontend service layer must accept only finite decimal-compatible JSON values and must not round or reinterpret them during mapping.
- There is no minor-unit integer contract and no global fixed decimal precision promised by this document beyond backend validation/storage.
- Currency is not embedded in report rows. Company currency comes from `GET /companies/me`; current Launch report presentation uses the source currency (normally `UZS`).
- Formatting, grouping, and locale symbols are frontend responsibilities and must not change numeric meaning.
- `null` means unavailable/not related, never zero.
- There is no authoritative exchange-rate endpoint in the retained contract. Hardcoded `12650` and any other invented FX rate are forbidden. USD conversion is `DEFERRED`; show source currency only. A future retained conversion is a `BACKEND_GAP` until an authoritative rate source exists.

## 6. OWNER analytics and dashboard

All routes in this section require exact OWNER and are current-company scoped.

| Function | Method/path | Query | Response | Status/decision |
|---|---|---|---|---|
| Dashboard KPIs | `GET /analytics/dashboard` | optional `date` | `{today_revenue: Decimal, today_orders: int, avg_check: Decimal, active_orders: int}` | `REAL_FROZEN` |
| Sales series | `GET /analytics/sales` | required `date_from`, `date_to` | bare `SalesReport[]`: `{date, orders_count, revenue, avg_check}` | `REAL_FROZEN` |
| Top products | `GET /analytics/products/top` | `limit=20`, optional `date_from`, `date_to` | bare `TopProduct[]`: `{product_id,name,quantity_sold,revenue}` | `REAL_FROZEN` |
| User activity rank | `GET /analytics/users/top` | `limit=20`, optional `date_from`, `date_to` | bare `{rank,user_id,user_name,sessions,avg_session_seconds,total_session_seconds}[]` | `UNUSED` |

Dashboard cards map directly: revenue to `today_revenue`, order count to `today_orders`, average check to `avg_check`, active orders to `active_orders`. Charts use only returned `SalesReport` and `TopProduct` rows and their applied ranges. Product, employee, place, and transaction widgets may independently use their real APIs, but one widget failure must not erase successful independent widgets.

The current income and expense percentage comparisons are not backend data. They must be removed/hidden (`FRONTEND_FIX`). An authoritative previous-period comparison is a future `BACKEND_GAP`; no arbitrary comparison or fixed percentage is allowed.

## 7. Z-report

`GET /analytics/z-report?date=YYYY-MM-DD` requires exact OWNER and is current-company scoped. `date` is required. Response:

```text
date
shift_opened_at: string|null
shift_closed_at: string|null
is_closed: bool
orders_count: int
cancelled_orders_count: int
payments_count: int
fiscal_receipts_count: int
gross_sales: Decimal
discounts_total: Decimal
service_fee_total: Decimal
tax_total: Decimal
refunds_total: Decimal
net_sales: Decimal
cash_total: Decimal
cash_received_total: Decimal
change_given_total: Decimal
non_cash_total: Decimal
avg_check: Decimal
payment_methods: {method: string, amount: Decimal, count: int}[]
```

Status is `FRONTEND_FIX`. `ZReportPage` must replace its hardcoded cashier/users/cashbox/payment rows and invented totals with this response. Backend numeric zeros are real zeros; nullable shift timestamps remain unavailable. Printing must use the same authoritative response. Failed loading must not print a fake financial document.

## 8. OWNER finance

### 8.1 Company transactions

All paths below require exact OWNER and current-company scope.

| Operation | Method/path | Exact request/filter | Exact response | Status |
|---|---|---|---|---|
| List | `GET /finance/transactions` | optional `date_from`, `date_to`, `direction` | `{items, count}`; item `{id,date,amount,direction,payment_type_id,counterparty_id,category_id,finance_template_id,comment,user_id,payment_type_name:null,counterparty_name:null,category_name:null}` | `REAL_FROZEN` |
| Create | `POST /finance/transactions` | JSON fields actually consumed: `amount` required positive canonical money; `direction` default `income`; optional `comment`, `category_id`, `payment_type_id`, `counterparty_id`, `finance_template_id`. Optional `Idempotency-Key` header. | one compatibility transaction item | `REAL_FROZEN` with exact payload |
| Update | `PATCH /finance/transactions/{tx_id}` | persisted mutable fields only: `amount`, `direction`, `comment`, `category_id`, `finance_template_id` | one compatibility transaction item | `FRONTEND_FIX` |
| Delete/archive/restore | none for company compatibility transactions | none | none | `UNSUPPORTED BY CURRENT CONTRACT`; do not expose as working |

Create currently does **not** consume client `date`; the backend assigns the transaction timestamp. Update does not persist `date`, `payment_type_id`, or `counterparty_id`. Although the compatibility update validates submitted payment/counterparty references, it does not assign them. These fields must be removed, disabled, or clearly read-only in edit mode. Preserving full edit for those fields is a `BACKEND_GAP`; local merging is forbidden.

The list's three `*_name` fields are deliberately null. V1 reference labels are joined by ID against canonical dictionaries:

- `payment_type_id` → `GET /finance/payment-types` or the compatibility `GET /settings/payment-methods`;
- `category_id` → `GET /finance/transaction-categories?kind=income|expense`;
- `counterparty_id` → `GET /finance/counterparties` or `GET /crm/counterparties`;
- `finance_template_id` → `GET /finance/finance-templates`.

No speculative populated name fields are part of `TransactionResponse`.

### 8.2 Transaction categories

Exact OWNER/current company:

- `GET /finance/transaction-categories?kind=income|expense` → `{items:[{id,name,kind,status,parent_id}]}`;
- `POST /finance/transaction-categories` consumes `name`, `kind`, `status`, `parent_id`, `source_template_id` and returns one compact item;
- `GET /finance/transaction-categories/{id}` → compact item;
- `PATCH /finance/transaction-categories/{id}` supports `name`, `kind`, `parent_id`, `status`;
- `DELETE /finance/transaction-categories/{id}` → `204`.

These are `REAL_FROZEN`. A failed delete/update does not mutate local rows.

### 8.3 Finance dictionaries

`/finance/payment-types`, `/finance/finance-templates`, and `/finance/counterparties` use paginated generic CRUD. Reads are the narrow canonical company-APP reference exception in the frozen RBAC contract; writes require `finance:manage` and OWNER has that capability. List supports `page`, `size`, `search`, `sort`, and the route-specific filters. Exact schemas:

- Payment type create: `name`, optional `type`, `sort=0`, `status=true`, optional `source_template_id`; update: optional `name,type,sort,status`; response additionally has scope/tenant fields and mirrors `sort_order`/`is_active`.
- Finance template create: `name`, optional `payload`, `source_template_id`; update: optional `name,payload`.
- Counterparty create: `full_name`, optional `phone`, `balance=0`, `type=client`; update: optional `full_name,phone,type`; balance is not an update field.

### 8.4 History

- `GET /finance/finance-history`: exact OWNER; query `page=1`, `size=20`, optional `ref_id`, `date_from`, `date_to`; paginated `FinanceHistoryResponse`.
- `GET /finance/finance-history/{history_id}`: exact OWNER; one company-scoped row.
- `GET /finance/counterparties/{counterparty_id}/transactions`: exact OWNER; query `page=1`, `size=20`, optional `date_from`, `date_to`; paginated typed `TransactionResponse`. The active client-history affordance can use this real endpoint and is `FRONTEND_FIX`.

`FinanceHistoryResponse` fields are `id,created_at,updated_at,status,ref_id,date,scope_kind,company_id,organization_id,new_amount,old_amount,type,user_id,comment`. General finance-history reads are `UNUSED` until a retained screen is explicitly connected; counterparty transaction history is already a truthful replacement for the active client-history control. Neither endpoint is permission to invent a statement.

## 9. OWNER reports

All routes require exact OWNER and current-company scope. Unless stated otherwise, `date_from` and `date_to` are optional inclusive date filters and the response is a bare array.

| Screen/API | Response fields and valid columns | Unsupported current UI columns | Status/decision |
|---|---|---|---|
| Orders — `GET /reports/orders` | `order_id,order_number,created_at,status,table_number?,waiter_name?,items_count,total_amount` | goods, service, delivery, client, courier, separate place price, discount, order type, unreturned dish details | `FRONTEND_FIX`: remove/relabel unsupported columns |
| Tables — `GET /reports/tables` | `table_number,orders_count,revenue,avg_check` | service, discount, place, dishes, date, payment method, waiter | `FRONTEND_FIX` |
| Waiters — `GET /reports/waiters` | `waiter_id?,name,orders_count,orders_total,dishes_count` | takeaway, service, waiter-service, percentage/payout | `FRONTEND_FIX` |
| Dishes — `GET /reports/dishes` | `product_id,name,unit,quantity,price,amount,cost,profit,status` | any extra invented metadata | `REAL_FROZEN` after exact mapping |
| Cancelled dishes — `GET /reports/cancelled` | `date,time,order_number,table_number?,name,quantity,price,waiter_name?,unit` | comment, cancellation type/reason, chef, author | `FRONTEND_FIX` |
| Debtors/creditors — `GET /reports/debt-credit` | query optional `date_from,date_to,counterparty_id,export`; fields `counterparty_id,counterparty_name,opening_balance,debit,credit,closing_balance` | single `date`, status, category, phone, owner, due date, operation rows, USD/FX fields | `FRONTEND_FIX`; source currency only |
| Products — `GET /reports/products` | optional `date_from,date_to,branch_id,export`; `product_id,product_name,qty,avg_price,total,cost,profit` | not currently retained | `UNUSED` |
| Product counts — `GET /reports/products-count` | optional `date_from,date_to,branch_id,export`; `product_id,product_name,income_qty,expense_qty,balance_qty` | not currently retained | `UNUSED`; Inventory semantics are not expanded by this row |

Default product decision: align/simplify the frontend. The unsupported metadata above is not launch-critical and is not a backend gap. Cancelled-report extra metadata and detailed report columns become `BACKEND_GAP` only if a later explicit product decision retains them.

## 10. Dishes and product catalog

The OWNER catalog uses `/inventory`, not HQ `/products` nomenclature.

| Operation | Contract | Status |
|---|---|---|
| Categories list | `GET /inventory/categories` → bare `CategoryResponse[]` | `REAL_FROZEN` |
| Category create | `POST /inventory/categories`; `{name,slug,parent_id?,sort_order}` → `CategoryResponse` | `REAL_FROZEN` |
| Category update/delete | no OWNER route | unsupported; do not expose as persisted |
| Product list/get | `GET /inventory/products`, `GET /inventory/products/{id}` → bare list/one `ProductResponse` | `REAL_FROZEN` |
| Product create | `POST /inventory/products` → `ProductResponse` | `REAL_FROZEN` |
| Product update | `PATCH /inventory/products/{id}` → server `ProductResponse` | `REAL_FROZEN` with schema-only payload |
| Product delete | `DELETE /inventory/products/{id}` → `204` | `REAL_FROZEN` |
| Images | `POST /inventory/upload-image`; `POST /inventory/products/{id}/photo` | `REAL_FROZEN` where used |

Product create fields are `name,category_id?,subcategory_id?,product_type,printer_id?,description?,price,cost_price?,image_url?,is_active,unit,barcode?,sku?,sort_order,ingredients[]`. Each ingredient relation is `{ingredient_id,quantity>0}`. Product update supports only `name,description,category_id,subcategory_id,product_type,printer_id,price,cost_price,image_url,is_active,is_available,sort_order,ingredients`. In particular, update does not promise `unit`, `barcode`, or `sku` mutation. Post-mutation UI must use the returned `ProductResponse`.

Product response fields include IDs and optional presentation names: `company_id,category_id?,subcategory_id?,product_type,printer_id?,name,description?,image_url?,price,cost_price?,tax_rate,unit,barcode?,sku?,is_active,is_available,sort_order,category_name?,subcategory_name?,printer_name?,ingredients_count,stock?,ingredients`. `stock=null` means unavailable; it must not be rendered as zero.

## 11. Raw materials, semi-products, inventory, and warehouse boundary

Raw-material and semi-product backend routes exist, including `/inventory/ingredients` and `/inventory/semi-products`, but Web V1 inventory semantics are not frozen. Ingredient `category` is free text and is not a relation to `/inventory/categories`. Therefore raw categories, semi-product categories, recipes/production, stock, write-offs, waste, inventory checks, and related pages are `DEFERRED`.

Warehouse endpoints including `GET /warehouse/purchases` and `GET /warehouse/transfers` exist and are company-filtered in their service, but the current legacy router uses broad `get_current_user`, and its final Web role/workflow semantics are explicitly outside frozen RBAC. They are not OWNER Launch promises. All `/warehouse/*`, `/stock-report/*`, raw, semi, stock, write-off, waste, and inventory screens must be hidden or render an explicit unavailable/deferred state. They must not call mismatched endpoints, crash, synthesize rows, or expose mutations.

OWNER has catalog permissions but does not have `inventory:stock:read` or `inventory:stock:write`. Existing explicitly capability-guarded operational warehouse/inventory document routes remain backend compatibility paths for deferred roles; they do not extend OWNER Web V1. Inventory Core and Warehouse Core implementation belongs to a later ownership stage.

## 12. OWNER users and HR

### 12.1 Company user delegation

All `/auth/users` operations below require exact OWNER and current-company/protected-target checks:

- `GET /auth/users` → bare `CompanyUserResponse[]`;
- `POST /auth/users` request `{email,password,phone?,role_slug,role_name?}` → `CompanyUserResponse`;
- `PATCH /auth/users/{user_id}` request optional `{name,email,phone,password,role_slug,role_name,is_active}` → response;
- `DELETE /auth/users/{user_id}` → `204`, soft deactivation;
- `PATCH /auth/users/{user_id}/pin` body `{pin: 4..8 digits}` → `204` is a retained staff-management API but not a Web PIN-login client contract.

`CompanyUserResponse` contains base fields plus `email,name?,phone?,is_active,is_superadmin,company_id,role_slugs[],avatar_url?,auth_scope,role_slug?`. OWNER may assign only the frozen operational slug set. It cannot mutate self, OWNER, superadmin, foreign, or ambiguous protected targets.

### 12.2 HR employee

`/hr/*` requires exact OWNER and current-company scope. Employee contract:

- `GET /hr/employees` → bare `EmployeeResponse[]`;
- `POST /hr/employees` exact body `{user_id,branch_id,position,hire_date,salary_type='fixed',salary_amount=0}`;
- `PATCH /hr/employees/{employee_id}` supports `position,branch_id,salary_type,salary_amount`;
- `DELETE /hr/employees/{employee_id}` → `204`.

`EmployeeResponse` is `id,created_at,updated_at,company_id,user_id,branch_id,position,hire_date,salary_type,salary_amount,name?,phone?,email?`. `user_id` must identify the intended existing same-company staff user, and `branch_id` must identify an own-company branch. The current `/staff` behavior that associates a new employee with the current OWNER is forbidden. Backend is already sufficient: select/create the staff user first and submit its real ID. This is `FRONTEND_FIX`, not a backend gap.

HR shifts, attendance, salary-related routes, and login history exist and are exact OWNER/current-company guarded; only screens that map their exact schemas may use them. `StaffActivityPage` must distinguish error from empty.

## 13. Units

`GET /units` and `GET /units/{id}` are authenticated global-reference reads. Generic list parameters are `page,size,search,sort` plus `status`; response is paginated `UnitResponse` with `id,created_at,updated_at,name,short_name?,sort,status,sort_order,is_active`.

Only SUPER_ADMIN/HQ may `POST /units`, `PATCH /units/{id}`, or `DELETE /units/{id}`. Create supports `name,short_name?,sort,status`; update supports the optional equivalents, with `sort_order`/`is_active` accepted aliases. OWNER status is `READ_ONLY`; owner mutation controls must be removed/disabled, and a 403 must never become local success.

## 14. OWNER settings

| Family | Read | Write | Exact persisted fields/decision | Status |
|---|---|---|---|---|
| Company profile | `GET /companies/me` | `PATCH /companies/me`; logo POST/DELETE; branch APIs | update only `name,country_code,timezone,currency,address,phone,inn,vat_rate,service_fee`; unknown fields are 422 | `REAL_FROZEN` |
| Clients/counterparties | `GET /crm/counterparties`, `GET /crm/counterparties/{id}` | POST/PATCH/DELETE same family | create `name|full_name,phone,balance,type|kind`; update only `full_name/name,phone,type/kind`; response `{id,name,full_name,phone,balance,type,kind}` | `FRONTEND_FIX`: remove editable status/comment; balance not mutable |
| Places/halls | `GET /halls` → bare array | `POST/PATCH/DELETE /halls...` | create `branch_id?,name,description?,condition?,percent?,pricing_type?,payment_type_id?`; update additionally supports `is_active`; response includes those persisted fields plus `tables[]` | `FRONTEND_FIX`: submit/read `pricing_type` and `is_active` exactly; do not lose status |
| Payment methods | paginated `GET /finance/payment-types` | POST/PATCH/DELETE same family | `name,type,sort|sort_order,status|is_active`; response returns both naming conventions plus scope fields | `FRONTEND_FIX`: current form omits status; send/read the real boolean |
| Units | `GET /units` | HQ-only mutations | see section 13 | `READ_ONLY` for OWNER |
| Printers | `GET /printers`, `GET /printers/{id}` | POST/PATCH/DELETE | see section 15 | `FRONTEND_FIX` for exact mapping |
| Receipt template | `GET /settings/receipt-template` | `PATCH` | typed known keys plus allowed evolving extra keys; optional optimistic `version` | `REAL_FROZEN` |
| Kitchen receipt | `GET /settings/kitchen-receipt-template` | `PATCH` | same template contract, independent version | `REAL_FROZEN` |
| Legacy branch compatibility | `GET /settings/places` → `{items}` | POST/PATCH/DELETE | company branch fields `name,address,city,is_active`; delete deactivates | `UNUSED`; the active Places screen uses `/halls` |
| Legacy organization compatibility | `GET/PATCH /settings/organization` | exact OWNER patch | patch persists only `name,currency,timezone,country_code`; compatibility response contains fixed legacy `vat_rate/service_fee` values | `UNUSED`; authoritative profile is `/companies/me` |

A UI field is editable only when the listed backend accepts and persists it. Client `status/comment`, arbitrary place fields, and any other local-only property must be removed/read-only, not merged into a successful response. Hall create defaults active; `is_active` is an update field. Payment-method status is supported, but the current mapper must actually submit it.

## 15. Printers, receipt persistence, and printing

Printer create fields: `branch_id?`, `name`, `printer_type` (`receipt|kitchen|bar|label`), `connection_type` (`network|usb|serial`), `ip_address?`, `port=9100`, `device_path?`, `paper_width=80`, `zone?`, `settings={}`. When `branch_id` is omitted the backend may resolve only an unambiguous main/sole branch. Update supports all configurable fields except `branch_id`, plus `is_active`. Create does not accept/persist `is_active`; a new printer follows the backend active default, and status is editable only after creation. Response includes `company_id,branch_id` and masks sensitive `settings` values.

Frontend must preserve IP and port as separate fields and submit exact names. `host` is a compatibility alias for `ip_address`; split `ip_address:port` local-only storage is not authoritative. Printer management requires exact OWNER through the compatibility admin guard; list is a canonical APP read.

| Operation | Contract | Status |
|---|---|---|
| Reachability | `GET /printers/ping?ip=&port=9100` → `{reachable,ip,port,message}`; no print | `UNUSED`/optional settings diagnostic |
| Test job | `POST /printers/test` `{printer_id}` → `PrintJobResponse` | `UNUSED` until explicitly wired |
| Explicit receipt/kitchen | `POST /printers/print/receipt|kitchen` `{order_id,printer_id,copies}` → one job | `REAL_FROZEN` backend capability |
| Web compatibility print | `POST /printers/print/orders/{order_id}/receipt|kitchen`, empty body → `PrintJobResponse[]`; active branch-printer auto-selection | `REAL_FROZEN` for current receipt service |
| Job polling/done and printer WebSocket | existing operational client paths | `UNUSED` in OWNER Web; operational clients deferred |

`PrintJobResponse` is `id,created_at,updated_at,company_id,printer_id,job_type,ref_id?,status,error?,copies`. Its status is the server truth. `window.print()` is only **preview/browser print** and must never be labelled “sent to printer/server”. Template preview may use explicit sample receipt content, clearly labelled preview; real server printing uses the endpoints above.

## 16. SUPER_ADMIN HQ dashboard and finance

All HQ routes require an `hq_admin` session and current DB `is_superadmin=true`.

### 16.1 Dashboard

- `GET /admin-reports/dashboard-kpis` returns real `organizations`, `branches`, `revenue`, and `employees`. These four are `REAL_FROZEN`.
- The same untyped response currently returns hardcoded backend placeholders `subscriptions:0` and `cashboxes:0`; those two fields are not launch KPIs and are `DEFERRED`. Do not render them as authoritative business zero.
- `GET /organizations?page=1&size=5&status=active` is the real organizations preview.
- `GET /hq/finance/transactions?page=&size=&...` is the real HQ transaction feed.
- Turnover charts and warehouse/cost/debt cards have no confirmed matching HQ dashboard source and must show explicit unavailable state, not zero (`DEFERRED`).

### 16.2 HQ finance transactions

`GET /hq/finance/transactions` returns paginated typed `TransactionResponse`. Query is `page=1`, `size=20`, optional `sort,date_from,date_to`, plus exact filters `direction,payment_type_id,counterparty_id,category_id,finance_template_id,organization_id`. The frontend must retain returned rows and use authoritative top-level fields; dropping valid rows into successful-empty is `FRONTEND_FIX`.

HQ also has typed create/get/update/delete, `/pay`, dictionary CRUD, and finance-history reads under `/hq/finance/*`, all organization/resource scoped. These are `REAL_FROZEN` only where the active HQ finance UI already uses them; unconsumed operations are `UNUSED`, not automatic launch requirements. `TransactionResponse` has no `status`; the UI must not default it to `PAID`.

## 17. SUPER_ADMIN organizations

`GET /organizations` is paginated and supports `page,size,search` plus exact filters `status,organization_status_id,country_id,region_id,district_id,is_main,is_solvent,is_billing_autoblock`. `OrganizationDirectoryResponse` contains the base fields plus real nullable `owner_name`, nullable `admin_name`, and nullable `branches_count`. Unknown branch count stays null; it must not become zero.

Details and generic CRUD exist at `/organizations/{id}`/`/organizations`; organization statuses have generic CRUD at `/organization-statuses`. Organization fields are the current `OrganizationCreate/Update/Response` schemas: identity/type, tariff/working days, main flag, virtual cash-register fields, handbook IDs, installation/tax/solvency flags, storage/online-menu/billing/face flags, status/taplink/status relation, plus response `cash_balance`. List/details currently consumed are `REAL_FROZEN`. Backend mutations that the current HQ Web deliberately marks unavailable are `UNUSED`; this freeze does not enable them.

## 18. SUPER_ADMIN nomenclature and handbook

HQ nomenclature reads:

- `/products`: paginated `NomProductResponse` with `photo,name,category_id,price,unit_id,status,is_used,is_archived` plus base fields;
- `/categories`: paginated `NomCategoryResponse` with `name,sort,status` plus base fields;
- `/orders`: paginated organization-scoped `NomOrderResponse` with `name,payment_id,items?,price,comment?,status,organization_id?` plus base fields;
- `/units`: paginated `UnitResponse` as section 13.

Frontend must join `category_id` and `unit_id` against real dictionaries; it must not invent “Без категории”, “Штук”, a warehouse assignment, organization/product fixtures, or totals. Order `price` is authoritative even when item-derived totals differ. These reads are `REAL_FROZEN`; existing but currently unused HQ mutations/archive operations are `UNUSED`.

HQ handbook generic CRUD paths are `/countries`, `/regions`, `/districts`; list returns the standard page envelope. Schemas are:

- country: `name,status`;
- region: `name,country_id,status`;
- district: `name,region_id,status`.

Reads are `FRONTEND_FIX`: the current frontend fetches real rows but must stop discarding them or inventing unsupported `code`, phone code, currency, country/region names, district counts. Labels are joined through `country_id`/`region_id`. Mutations exist under HQ guards but are `UNUSED` unless a retained editor is intentionally connected.

## 19. SUPER_ADMIN employees

There is no confirmed HQ employee-management endpoint matching the current HQ employee screen. Company `/hr/employees` is OWNER/current-company scope and is not a substitute. The screen is not required for this Launch V1 freeze; status is `DEFERRED`, with an explicit unavailable state. No cross-tenant aggregation, placeholder employees, or invented API is permitted. A future HQ employee-management product decision may create a `BACKEND_GAP` in a later stage.

## 20. Web screen-to-API matrix

| Actor | Web route/section | Status | Read API | Write API | Auth | Launch V1 remediation |
|---|---|---|---|---|---|---|
| OWNER | `/` dashboard | `FRONTEND_FIX` | analytics APIs; real supporting widgets | none | exact OWNER | remove fake deltas; isolate widget states |
| OWNER | `/reports/z-report` | `FRONTEND_FIX` | `/analytics/z-report` | none | exact OWNER | connect response and print only it |
| OWNER | `/reports/{orders,tables,waiters,dishes,cancelled-dishes,debtors-creditors}` | `FRONTEND_FIX` | matching `/reports/*` | none | exact OWNER | exact columns/filters only |
| OWNER | `/finance/transactions`, `/finance/operations` | `FRONTEND_FIX` | `/finance/transactions` + dictionaries | POST/PATCH exact subset | exact OWNER | exact payload, references, state safety |
| OWNER | finance category screens | `REAL_FROZEN` | transaction-category API | POST/PATCH/DELETE | exact OWNER | service-layer mapping later |
| OWNER | `/nomenclature/dishes`, `/menu` | `REAL_FROZEN` | `/inventory/products`, `/inventory/categories` | guarded product/category operations | exact OWNER for writes | schema/server-response truth |
| OWNER | raw/semi/category variants | `DEFERRED` | existing backend reads are not frozen UI semantics | none in Web V1 | not frozen | hide/unavailable |
| OWNER | `/warehouse/*`, `/stock-report/*` | `DEFERRED` | no frozen OWNER Web API | none | not frozen | hide/unavailable |
| OWNER | `/users/*` staff-role management | `REAL_FROZEN` | `/auth/users` | guarded user/PIN/deactivation APIs | exact OWNER | keep role/client distinction |
| OWNER | `/staff` | `FRONTEND_FIX` | `/hr/employees`, users, branches | `/hr/employees` with selected `user_id` | exact OWNER | never bind employee to OWNER |
| OWNER | settings clients/places/payment/profile | `FRONTEND_FIX` | exact settings/company APIs | exact fields only | exact OWNER for writes | remove lossy/local-only fields |
| OWNER | settings units | `READ_ONLY` | `/units` | none | authenticated read | disable mutation |
| OWNER | settings printers/receipts | `FRONTEND_FIX` | printer/template APIs | exact printer/template APIs | OWNER writes | preserve host/port/version truth |
| OWNER | `/login/staff`, PIN login, `/waiter*`, `/kitchen` and role homes | `REMOVE_FROM_WEB` | none for Web V1 | none | not a frozen Web actor | remove routes/surfaces |
| SUPER_ADMIN | HQ dashboard | `FRONTEND_FIX` | dashboard KPIs, organizations, HQ transactions | none | HQ | real fields; unavailable is not zero |
| SUPER_ADMIN | HQ organizations | `REAL_FROZEN` reads | `/organizations`, details/statuses | existing unused CRUD | HQ | exact nullable fields |
| SUPER_ADMIN | HQ nomenclature | `REAL_FROZEN` reads | `/products,/categories,/orders,/units` | existing unused operations | HQ | join IDs; no fixtures |
| SUPER_ADMIN | HQ handbook | `FRONTEND_FIX` | `/countries,/regions,/districts` | unused CRUD | HQ | render returned rows/relations |
| SUPER_ADMIN | HQ bank/finance | `FRONTEND_FIX` | `/hq/finance/transactions` | retained finance APIs only | HQ | stop dropping rows/defaulting PAID |
| SUPER_ADMIN | HQ employees | `DEFERRED` | none matching | none | HQ | explicit unavailable state |

## 21. Frontend remediation matrix

| Issue | Current frontend behavior | Authoritative contract | Action | Stage |
|---|---|---|---|---|
| Z-report | hardcoded financial document | `/analytics/z-report` | `CONNECT_REAL_API`, `REMOVE_FAKE` | Critical truth remediation |
| Dashboard deltas | arbitrary income/expense comparisons | no previous-period fields | `REMOVE_FAKE` | Critical truth remediation |
| Dashboard resilience | one request can collapse unrelated widgets | independent endpoint states | `ADD_STATE_SAFETY` | FE service/state work |
| Finance write | visible fields exceed persisted subset | section 8 exact create/update | `REMOVE_UNSUPPORTED_FIELD`, `FIX_MAPPING` | Critical truth remediation |
| Finance references | null names/fallback labels | dictionary join by UUID | `FIX_MAPPING` | FE-05 service layer |
| Finance filters | UI range/date not always mapped | exact `date_from/date_to/direction` | `FIX_MAPPING` | FE-05/FE-06 |
| Report tables | invented/mislabelled columns and zeros | section 9 schemas | `REMOVE_UNSUPPORTED_FIELD`, `FIX_MAPPING` | Critical truth remediation |
| Debt FX | hardcoded 12650 and single `date` | source currency; date range | `REMOVE_FAKE`, `FIX_MAPPING` | Critical truth remediation |
| Raw/semi | incomplete pages/crash risk | deferred | `DISABLE_DEFERRED`, `ADD_STATE_SAFETY` | Critical truth remediation |
| Warehouse/stock | incomplete/mismatched semantics | deferred, OWNER no stock permissions | `DISABLE_DEFERRED` | Critical truth remediation |
| Staff create | employee linked to current OWNER | explicit selected staff `user_id` | `FIX_MAPPING` | FE-06 request/form safety |
| OWNER units | local mutation may appear successful | global HQ-only writes | `MAKE_READ_ONLY` | Critical truth remediation |
| Client settings/history | editable status/comment; history not connected | status/comment are not fields; real counterparty transaction history exists | `REMOVE_UNSUPPORTED_FIELD`, `CONNECT_REAL_API` | FE-05/FE-06 |
| Payment method | status can be lost | `status`/`is_active` aliases persist | `FIX_MAPPING` | FE-06 |
| Printer | split host/port lost | `ip_address`, `port` | `FIX_MAPPING` | FE-06 |
| Browser print | labelled as server print | browser preview distinct from job API | `FIX_MAPPING` | Critical truth remediation |
| HQ dashboard | unavailable cards look zero | only real supported KPIs | `REMOVE_FAKE` | Critical truth remediation |
| HQ handbook/bank | fetched rows discarded | real paged responses | `FIX_MAPPING` | Critical truth remediation |
| HQ employees | active empty-looking screen | no matching contract | `DISABLE_DEFERRED` | Critical truth remediation |
| Operational Web routes | role surfaces remain mounted | OWNER/SUPER_ADMIN only | `REMOVE_WEB_SURFACE` | Critical truth remediation |
| API duplication | page-local transport/mapping | this contract | `SERVICE_LAYER_LATER` | FE-05 |

## 22. Backend gap register

| Feature | Current frontend need | Current backend | Exact gap | Launch necessary? | Future owner | Next action |
|---|---|---|---|---|---|---|
| Finance full transaction edit | edit date/payment/counterparty | company PATCH does not persist them | typed company update semantics for those fields and balance/history correctness | **No**; make fields read-only now | Backend Finance | `BACKEND_GAP_LATER` only after product approval |
| Dashboard comparisons | prior-period percentages | current/current-range values only | authoritative comparison period and delta fields/semantics | **No**; hide now | Backend Analytics/Product | define product semantics first |
| Detailed report metadata | legacy extra columns | compact truthful schemas | only specifically retained metadata | **No**; remove columns | Product + Backend Reports | individual later contracts |
| HQ employee management | HQ-wide employee screen | no matching endpoint/scope | deliberate HQ directory/management scope and schema | **No** in this freeze | Product + Backend HR/Security | keep deferred |
| Cancelled-report extras | reason/comment/chef/author | not returned | deliberate event metadata model | **No**; remove columns | Product + Backend Reports | later decision |
| FX conversion | USD display | no authoritative rate source | dated currency/rate source and rounding rules | **No**; UZS/source only | Product + Backend Finance | keep conversion deferred |

Inventory Core, Warehouse Core, OFD, future Billing, Mobile, and Desktop implementation are intentionally not gaps in this Web-only register.

## 23. Unused/deferred backend capabilities

Existence is not exposure. Current Web-relevant but unconsumed capabilities include analytics user ranking; counterparty transaction history; finance history; reports products/products-count; halls/tables; printer ping/test and explicit printer jobs; subscription, fiscal, and audit routes; selected organization/nomenclature CRUD; accounts/offline jobs; and other HQ administration endpoints. They remain `UNUSED` unless explicitly classified elsewhere.

Subscription, fiscal, and audit authority remains exactly as frozen in WEB RBAC CONTRACT V1. Billing/OFD product behavior is not expanded here. Printer WebSocket/job polling and operational kitchen paths remain future operational-client concerns.

## 24. Mutation-truth contract

Every retained mutation must:

1. disable duplicate submit while pending;
2. construct an exact backend-supported payload;
3. show success only after a successful response;
4. replace business state from the backend response or an authoritative re-fetch;
5. leave prior truth intact on failure and present the error;
6. honor `409` concurrency/idempotency conflicts and `422` validation;
7. never merge unsent/ignored form fields into returned business rows.

`204` operations remove/deactivate the row only after success or after a verifying re-fetch. A success toast before completion, local-only archive/restore, or failed request that changes business UI is forbidden.

## 25. Validation and change control

This contract was cross-checked against backend routers, schemas, services, RBAC guards, accepted tests, and current frontend consumers at the baselines in the header. The accepted generated OpenAPI baseline is **244 paths / 423 operations**. The accepted test suite independently pins `len(app.openapi()["paths"]) == 244`. Between accepted implementation commit `241eae81dfa065afe29aed4f6a1d4bacdbff8203` and this document's backend baseline, the only repository change is `docs/web-rbac-contract-v1.md`; therefore there is no route/schema/service drift from the accepted generated contract.

The local documentation runtime used for this freeze did not have the project FastAPI dependencies installed, and this stage prohibits installing/updating dependencies. A fresh `app.openapi()` import was therefore not used as substitute evidence. The baseline count, accepted OpenAPI tests, route/source inspection, and code-identity check are the authoritative no-drift evidence for this documentation-only freeze.

The consistency review rejects:

- invented endpoints or response fields;
- wrong methods, actor guards, or tenant scope;
- unsupported/local-only mutations;
- false `REAL_FROZEN` claims;
- accidental Inventory/Warehouse freeze;
- operational staff roles as Web clients;
- API error converted to empty/zero/success;
- demo/fallback business truth.

Any revision requires an explicit contract change, corresponding implementation/tests where needed, OpenAPI review, tenant/security acceptance, and a newly recorded baseline. Frontend implementation alone cannot expand this contract.
