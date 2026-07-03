# Audit: Receipt System Frontend

## Checked Files

- `frontend/src/App.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/pages/SectionPage.jsx`
- `frontend/src/pages/OrdersPage.jsx`
- `frontend/src/pages/WaiterPage.jsx`
- `frontend/src/pages/KitchenPage.jsx`
- `frontend/src/context/OrgContext.jsx`
- `frontend/src/api/client.js`
- `frontend/package.json`

## Current State

- Stack is React + Vite + JSX + CSS + Axios. No TypeScript or Tailwind is present.
- `api/client.js` already exports the configured Axios instance `api`, JWT attachment, refresh-token retry, and helpers like `formatMoney`.
- `OrgContext.jsx` already provides organization defaults and cached values: `name`, `logo`, `currency`, `timezone`, `vat_rate`, `service_fee`, `address`, `phone`.
- `Sidebar.jsx` already contains menu links for `/settings/receipt` and `/settings/chef-receipt`.
- `App.jsx` already contains routes for `settings/receipt` and `settings/chef-receipt`, but both route to `SectionPage` placeholder cards.
- `SectionPage.jsx` is a generic tile/table placeholder page. It is not suitable for the receipt builder UI.
- `OrdersPage.jsx` currently loads `/pos/orders` by selected date and renders a simple table. There are no row actions, details drawer, or print actions.
- `WaiterPage.jsx` has table view, new order flow, orders list, and order detail view. It does not print customer or kitchen receipts.
- `KitchenPage.jsx` loads `/kitchen/orders`, updates item/order status, and polls every 2 seconds. It does not print manually or auto-print new kitchen orders.
- `package.json` dependencies are sufficient for this task; no new frontend dependency is required.

## Existing Endpoints In Use

- `GET /settings/organization`
- `PATCH /settings/organization`
- `GET /pos/orders`
- `POST /pos/orders`
- `PATCH /pos/orders/{orderId}/status`
- `GET /companies/me/branches`
- `POST /companies/me/branches`
- `GET /inventory/products`
- `GET /inventory/categories`
- `GET /kitchen/orders`
- `PATCH /kitchen/orders/items/status`

## New Endpoints Needed

- `GET /settings/receipt-template`
- `PATCH /settings/receipt-template`
- `GET /settings/kitchen-receipt-template`
- `PATCH /settings/kitchen-receipt-template`
- `POST /printers/print/test-receipt`
- `POST /printers/print/test-kitchen`
- `POST /printers/print/orders/{orderId}/receipt`
- `POST /printers/print/orders/{orderId}/kitchen`

## Fallback Storage Needed

- Customer receipt template: `localStorage.marjon_receipt_template`
- Kitchen receipt template: `localStorage.marjon_kitchen_receipt_template`

## Files To Create

- `frontend/src/pages/settings/ReceiptSettingsPage.jsx`
- `frontend/src/pages/settings/ChefReceiptSettingsPage.jsx`
- `frontend/src/components/receipt/ReceiptPreview.jsx`
- `frontend/src/components/receipt/ReceiptSectionEditor.jsx`
- `frontend/src/api/receipt.js`
- CSS for receipt UI, likely `frontend/src/styles/receipt.css`

## Files To Change

- `frontend/src/App.jsx`: import new settings pages and replace placeholder routes.
- `frontend/src/main.jsx`: import receipt CSS if a new CSS file is added.
- `frontend/src/pages/OrdersPage.jsx`: add row actions, details panel, and print buttons.
- `frontend/src/pages/WaiterPage.jsx`: add print buttons to order detail view.
- `frontend/src/pages/KitchenPage.jsx`: add manual print button and auto-print-on-new-order behavior.

## Integration Notes

- The print API must fail softly: settings pages and print buttons should show error/success state without breaking the page.
- Template loading/saving should prefer API but always fall back to localStorage if API is unavailable.
- Kitchen auto-print must remember printed order ids in component state/ref and not print the same order repeatedly during polling.
- Existing `Sidebar`, `Topbar`, and `DashboardLayout` should not be structurally changed.
