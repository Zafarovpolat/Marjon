import { test, expect } from "@playwright/test";

// OWNER notification center oracle. Empty-first: healthy empty + calm deferred
// low-stock note (no red infra block). Cancelled orders are real, derived from
// GET /reports/orders (status "cancelled"). Serial + single shared login.

const OWNER_PHONE = "907778778";
const OWNER_PASSWORD = "102938";

const CANCELLED_FIXTURE = [
  { order_id: "o1", order_number: "184", created_at: "2026-08-18T16:42:00Z", status: "cancelled", table_number: "7", total_amount: 120000 },
  { order_id: "o2", order_number: "185", created_at: "2026-08-18T17:03:00Z", status: "completed", table_number: "3", total_amount: 90000 },
];

test.describe.configure({ mode: "serial" });

test.describe("OWNER notification center", () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto("/login");
    await page.locator(".login-pro-input-wrap--phone input").fill(OWNER_PHONE);
    await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
    await page.locator(".login-pro-submit").click();
    await page.locator(".dashboard-shell").waitFor({ state: "visible", timeout: 30000 });
  });

  test.afterAll(async () => { await page.close(); });

  test("healthy empty: no red infra block, calm deferred note", async () => {
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    await page.locator(".topbar-notification").click();
    const popover = page.locator(".stock-alert-popover.owner-notif");
    await expect(popover).toBeVisible();
    // legacy red infrastructure block must be gone
    await expect(page.getByText("Остатки недоступны до завершения Inventory Core.")).toHaveCount(0);
    // healthy empty + calm deferred note (target the empty-title specifically —
    // the header summary reuses the same phrase, so scope to avoid ambiguity)
    await expect(page.locator(".owner-notif__empty-title")).toHaveText("Новых уведомлений нет");
    await expect(page.locator(".owner-notif__deferred")).toBeVisible();
    await expect(page.locator(".owner-notif__item--cancel")).toHaveCount(0);
  });

  test("cancelled orders: real fields rendered (test-only fixture)", async () => {
    await page.route("**/reports/orders**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(CANCELLED_FIXTURE),
    }));
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    await page.locator(".topbar-notification").click();
    await expect(page.locator(".stock-alert-popover.owner-notif")).toBeVisible();

    // only the cancelled order becomes a notification (completed one does not)
    const rows = page.locator(".owner-notif__item--cancel");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Заказ №184 отменён");
    await expect(rows.first()).toContainText("Стол 7");
    // bell badge reflects the real count
    await expect(page.locator(".topbar-notification__badge")).toHaveText("1");

    await page.unroute("**/reports/orders**");
  });
});
