# ADR: HQ CSS Monolith Decision — Web V1

- **Status:** ACCEPTED (Marjon Web V1)
- **Scope:** `frontend/src/admin/styles.css` (SUPER_ADMIN / HQ bundle)
- **Supersedes:** the FE-08C goal of splitting HQ CSS into domain-owned files (for V1)
- **Decided after:** FE-08C audit → FE-08D-HQ (normalization attempt) → FE-08D-HQ-ORACLE (oracle expansion) → FE-08D-HQ re-audit (Outcome B) → independent read-only reviews (all BLOCKER 0 / HIGH 0 / MEDIUM 0)

## Context

FE-08C intended to establish HQ domain-owned CSS (dashboard / organizations /
finance / storage / etc.), mirroring the OWNER ownership work accepted in FE-08B.
Investigation of `frontend/src/admin/styles.css` established:

- ~24,568 lines, ~3,150 non-keyframe rule blocks, two cascade layers
  (`@layer marjon-base`, `@layer marjon-important`); **0 unlayered rules**, so
  source order is the equal-specificity tiebreaker.
- **0 actual `!important` declarations** (priority is expressed via `@layer`).
- **0 intra-block duplicate declarations**; only **3** provably-redundant
  far-apart duplicate blocks → provably-safe automatic cleanup ≈ **0.1%**.
- Every major HQ domain's selectors are scattered **file-wide** (iterative
  historical "final pass" overrides), e.g. `login` 57→19108, `shell` 173→24553,
  `sidebar` 71→24562, `dashboard` 644→23690, `organizations` 248→19437,
  `finance` 10758→21125, `storage` 6213→23324, `orders` 7966→19801,
  `employees` 9433→19858.
- OWNER and HQ CSS bundles are **fully isolated** (HQ loads only
  `admin/styles.css`; the OWNER bundle shares none of it).
- The visual oracle (`npm run css:verify`) was expanded to **41 HQ states**
  (incl. `is-sidebar-collapsed`, `is-collapsed`, `.is-open`, `is-active`,
  notifications dropdown), covering ~320 class-driven-state rules.
- The oracle engine (jsdom + `el.matches` on static DOM) **cannot** evaluate
  pseudo-state styling (`:hover` ~247, `:focus`/`:focus-visible` ~126,
  `:active`/`:disabled` ~24) → those rules' cascade outcomes are unprovable.
- A real-browser oracle was **rejected** for V1: the blocker to a domain split
  is order-dependent, file-wide **scatter that requires reordering**, which is
  orthogonal to pseudo-state proof — a browser oracle proves the *current*
  file's states but cannot prove a *reordered* file identical across the
  combinatorial state space under a strict zero-regression bar.

Meaningful HQ domain extraction would require **reordering** scattered,
order-dependent rules, which cannot be proven visually-equivalent and therefore
raises real regression risk for no production benefit.

## Decision

For Marjon Web V1, keep `frontend/src/admin/styles.css` as **one intentional,
bundle-isolated HQ stylesheet (a monolith)**. Accept:

- **A. OWNER / global CSS ownership** (FE-08B) — ACCEPTED.
- **B. OWNER ↔ HQ CSS bundle isolation** — ACCEPTED (no shared CSS files).
- **C. HQ CSS** — remains a single stylesheet.
- **D. HQ domain split** — DEFERRED.
- **E. Reason** — safe mechanical retro-splitting cannot be proven under the
  accepted zero-regression requirement (file-wide scatter + order dependence +
  ~397 pseudo-state rules unverifiable by the current oracle).

## Consequences

**Positive**
- Zero visual-regression risk from a forced/mechanical split.
- Preserves the accepted, working HQ cascade.
- Avoids architecture-for-architecture's-sake churn on legacy CSS.
- Keeps OWNER/HQ bundle isolation intact.

**Negative (accepted technical debt)**
- HQ CSS remains a large single file.
- HQ domain ownership is not ideal for maintainability.
- The maintainability debt persists until a future HQ redesign.

## Future action

During **Full Marjon Web UI/UX Completion / HQ redesign**, author new HQ styles
with **domain ownership from the start** (per-domain files), rather than
retroactively reordering the current legacy cascade.

## ⚠️ Directive for future agents (Claude / Codex)

**DO NOT retro-split, "normalize by domain", or broadly refactor
`frontend/src/admin/styles.css` during FE-08 / FE-09 or routine technical
refactors.** This monolith is intentional for Web V1. Only a new, dedicated
decision backed by stronger evidence (e.g., a real-browser oracle proven to
unblock safe reordering) may supersede this ADR. Removing the 3 known
duplicate blocks is the only provably-safe change and is not worth the risk in
isolation.
