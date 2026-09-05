# MARJON HQ architecture guardrails

## Sources of truth

- `D:\\Программы\\Marjon` is a read-only visual reference.
- `D:\\Программы\\Marjon-hq-admin` owns the HQ frontend implementation.
- `D:\\Программы\\Marjon-backend-integration` owns canonical backend behavior and data contracts.
- Visual recovery must not copy demo data, local authentication bypasses, or legacy domain logic.

## Target frontend boundaries

New and recovered code moves incrementally toward this structure:

```text
src/admin/
  app/                 application composition and routing
  shell/               sidebar, header, profile, global layout
  features/<feature>/  screen components, feature API adapter, tests, styles
  shared/api/          transport-only primitives
  shared/ui/           reusable presentational components
  shared/hooks/        cross-feature React behavior
  shared/utils/        pure helpers
  shared/styles/       tokens, base, accessibility and responsive foundations
```

This is an incremental boundary, not authorization for a big-bang rewrite. A file moves only while its feature is being recovered or repaired.

## Non-negotiable rules

1. The legacy application defines visual composition, not business truth.
2. Production components never call `adminApi` directly. Calls belong in `*Api.js` adapters or the transitional `hqService.js` facade.
3. Backend DTOs are validated or normalized before UI rendering.
4. Counts use canonical server totals. The UI must not infer a platform total from a page length.
5. Loading, empty, authoritative zero, forbidden, and error are distinct states.
6. Demo metrics, demo transactions, random values, hardcoded credentials, and local auth bypasses are forbidden.
7. New `!important` declarations are forbidden. Existing cascade layers must be used deliberately.
8. The legacy `styles.css` monolith must not grow beyond its locked baseline. New feature styles live with the feature and are imported explicitly.
9. Visual recovery and architectural movement should be reviewable as separate commits whenever practical.
10. Backend, OWNER, mobile, desktop, and the legacy visual reference stay unchanged unless a phase explicitly expands scope.

## Per-feature recovery sequence

1. Capture the legacy screen and interactive states.
2. Audit the canonical endpoint, authorization scope, pagination, filters, and error shapes.
3. Define the feature boundary and view model.
4. Recover layout and interaction without copying demo behavior.
5. Implement loading, empty, zero, error, and forbidden states.
6. Run focused tests, the full admin suite, build, architecture checks, and browser checks.
7. Obtain visual approval before the phase commit.

## Definition of done

- No known critical or important defect remains in the phase scope.
- No console error or unexpected failed request remains.
- No new `!important`, fake data, credential, or direct transport access is introduced.
- Relevant unit, component, contract, responsive, keyboard, and reduced-motion checks pass.
- `git diff --check` and production build pass.
- The user has visually approved the result.
