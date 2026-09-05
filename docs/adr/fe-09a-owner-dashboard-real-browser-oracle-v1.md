# ADR: Bounded Real-Browser UI Oracle (OWNER Dashboard) — Web V1

- **Status:** PROPOSED (awaiting user acceptance of the real-browser oracle foundation stage)
- **Scope:** a small Chromium-only Playwright oracle for the OWNER Dashboard, under `frontend/tools/browser/`
- **Relationship to `fe-08c-hq-css-monolith-v1.md`:** ADDENDUM — does NOT rewrite or supersede it. `fe-08c` remains in force for the HQ monolith.

## Context — the previous decision and why it was right then

`fe-08c` (ACCEPTED) rejected a real-browser oracle for the FE-08 scope. That was
correct for its goal: proving that a **reordered / retro-split** of the frozen,
file-wide-scattered HQ CSS monolith (`admin/styles.css`) stayed identical across
the combinatorial pseudo-state space. A browser oracle proves the *current*
file's states but cannot prove a *reordered* file identical under a strict
zero-regression bar, so it added cost with no V1 benefit. The jsdom
`css:verify` oracle (computed styles at 390/768/1280/1440 on static DOM) was
kept as the deterministic guard.

## What changed now

OWNER Dashboard is under **active UI/UX completion**, and CSS ownership work
(migrating accepted Dashboard rules out of the legacy `react-overrides.css` into
`styles/owner/dashboard.css`) has reached the rules that carry `:hover`,
`:focus`, `:focus-within`, and modal/backdrop/stacking behavior. **OWNER
Dashboard CSS Ownership Phase 2 was correctly STOPPED** precisely because the
jsdom oracle *cannot* evaluate those pseudo-states after a source-order change
(`fe-08c` itself documents this jsdom limitation: `:hover` ~247, `:focus*` ~126
rules unverifiable). This is a genuinely new need: to safely retire legacy
Dashboard CSS we must be able to prove real pseudo-state and modal cascade.

## Decision

Introduce a **bounded** real-browser oracle:

- **Engine:** Chromium only, via `@playwright/test` (devDependency). No Cypress/
  Puppeteer, no cloud/SaaS, no extra browsers.
- **Scope:** the accepted OWNER Dashboard — resting surfaces, genuine
  `:hover`/`:focus`/`:focus-within`, and the KPI detail modal / full-viewport
  backdrop / stacking — at 390/768/1280/1440.
- **Runtime:** asserts against the existing local runtime (frontend `:5173`
  proxying `/api` → backend `:8000`, DB `marjon_authoritative`). It does **not**
  start, modify, or seed the backend/DB.
- **Script:** `npm run test:browser` (supplements, does not rename, the existing
  `test:admin` / `test:unit` / `css:verify`).

## What this does NOT do / replace

- Does **not** replace the jsdom `css:verify` oracle (kept for fast, broad,
  deterministic selector/structure checks).
- Does **not** authorize an HQ monolith retro-split — `fe-08c` still governs.
- Does **not** introduce Preview/Demo fixtures, fake sales/orders, or a seed
  generator; the healthy empty canonical Dashboard is the reference.
- Does **not** regenerate the historical CSS baseline (the accepted 36 nav-link
  drift from `70670cf` is untouched).
- Does **not** commit browser binaries (Playwright installs them to the user
  cache; only `package.json`/lock/config/spec are versioned).

## Consequences

**Positive:** future OWNER Dashboard CSS ownership migrations become provable
(real pseudo-state + modal cascade); regressions are caught deterministically.

**Negative (accepted):** one devDependency (Chromium browser via Playwright) and
a local-runtime requirement for `test:browser`. Bounded to OWNER Dashboard for
now; broader coverage is a later, deliberate expansion.
