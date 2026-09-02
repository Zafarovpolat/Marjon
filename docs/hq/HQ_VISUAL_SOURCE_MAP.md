# MARJON HQ visual source map

## Dashboard

Legacy visual source: `D:\\Программы\\Marjon\\frontend` at `/admin.html`.

The legacy Dashboard establishes the visual composition:

- five compact summary cards across the top;
- a filter/action strip below the cards;
- a large analytics surface with a right-hand summary rail;
- a latest-transactions table below the analytics area;
- the approved HQ shell, sidebar, header, spacing rhythm, colors, radii, and typography.

The legacy Dashboard does **not** establish data truth. Its visible turnover, organization count, work/payment cards, chart, warehouse totals, and `demo-marjon-*` transactions are demonstration content and must not be copied into the canonical HQ frontend.

Current recovery rule:

- preserve the legacy geometry and visual hierarchy;
- render only values supported by canonical endpoints;
- when a visual slot has no canonical contract, show a truthful unavailable/empty state or omit it according to the approved screen contract;
- do not invent trends, periods, chart series, totals, or transaction rows;
- retain the real HQ finance transactions contract and its honest empty state.

The uncommitted three-card Organization KPI experiment is not part of the legacy composition and is not an approved visual source.
