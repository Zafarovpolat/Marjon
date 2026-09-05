import { test, expect } from "@playwright/test";

// Real-browser (Chromium) oracle for the accepted OWNER Dashboard — proves the
// pseudo-state (:hover/:focus/:focus-within) and modal/backdrop cascade that the
// jsdom css:verify oracle cannot evaluate. Reference = accepted HEAD 67f533f.
// Requires the local runtime already up (frontend :5173 → backend :8000).
// It asserts what CURRENTLY exists; it must not encode a redesign.

const OWNER_PHONE = "907778778"; // +998 90 777 87 78 (prefix rendered separately)
const OWNER_PASSWORD = "102938";

// Accepted computed styles captured from HEAD 67f533f (Chromium).
const ACCEPTED = {
  chartShadowResting: "rgba(15, 35, 60, 0.04) 0px 1px 6px 0px",
  chartShadowHover: "rgba(15, 35, 60, 0.07) 0px 8px 20px 0px",
  warehouseShadowResting: "rgba(15, 35, 60, 0.06) 0px 3px 10px 0px",
  warehouseShadowHover: "rgba(16, 24, 40, 0.08) 0px 6px 16px 0px",
  lowerCardShadow: "rgba(15, 35, 60, 0.05) 0px 2px 8px 0px",
  kpiTransformResting: "matrix(1, 0, 0, 1, 0, 0)",
  kpiTransformHover: "matrix(1, 0, 0, 1, 0, -2)",
};

async function loginOwner(page) {
  await page.goto("/login");
  await page.locator(".login-pro-input-wrap--phone input").fill(OWNER_PHONE);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.locator(".login-pro-submit").click();
  await page.waitForURL("**/");
  await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
}

test.describe("OWNER dashboard real-browser oracle", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginOwner(page);
  });

  // ---- PLACEHOLDER_VIEWPORTS ----
  const viewports = [
    { name: "390", width: 390, height: 844, gap: "12px", marginTop: "12px" },
    { name: "768", width: 768, height: 1024, gap: "12px", marginTop: "12px" },
    { name: "1280", width: 1280, height: 900, gap: "16px", marginTop: "16px" },
    { name: "1440", width: 1440, height: 900, gap: "16px", marginTop: "20px" },
  ];

  for (const vp of viewports) {
    test(`resting layout + surfaces @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // Deterministic resting state: park the pointer off every card and drop
      // focus, so no stray :hover/:focus-within contaminates the measurement.
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.activeElement && document.activeElement.blur());

      // page loads, no fatal error screen
      await expect(page.locator(".dashboard-shell")).toBeVisible();
      await expect(page.locator(".premium-kpi").first()).toBeVisible();
      await expect(page.getByText("Dashboard недоступен")).toHaveCount(0);

      // EMPTY states present (healthy empty company)
      await expect(page.locator(".owner-empty").first()).toBeVisible();
      await expect(page.getByText("Продаж пока нет").first()).toBeVisible();

      // accepted resting surfaces (viewport-independent)
      await expect(page.locator(".premium-chart")).toHaveCSS("border-radius", "16px");
      await expect(page.locator(".premium-chart")).toHaveCSS("box-shadow", ACCEPTED.chartShadowResting);
      await expect(page.locator(".warehouse-summary-item").first()).toHaveCSS("border-radius", "13px");
      await expect(page.locator(".warehouse-summary-item").first()).toHaveCSS("box-shadow", ACCEPTED.warehouseShadowResting);
      await expect(page.locator(".owner-top-sales-card")).toHaveCSS("border-radius", "16px");
      await expect(page.locator(".owner-top-sales-card")).toHaveCSS("box-shadow", ACCEPTED.lowerCardShadow);
      await expect(page.locator(".recent-orders-card")).toHaveCSS("border-radius", "16px");
      await expect(page.locator(".premium-kpi").first()).toHaveCSS("border-radius", "16px");

      // accepted composition spacing (per-breakpoint)
      await expect(page.locator(".owner-widgets")).toHaveCSS("gap", vp.gap);
      await expect(page.locator(".owner-widgets")).toHaveCSS("margin-top", vp.marginTop);

      // no horizontal overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
  // ---- PLACEHOLDER_INTERACTION ----
  test("hover + focus pseudo-states (real engine)", async ({ page }) => {
    // KPI hover lifts (translateY -2) with the accepted elevated shadow
    const kpi = page.locator(".premium-kpi").first();
    await expect(kpi).toHaveCSS("transform", ACCEPTED.kpiTransformResting);
    await kpi.hover();
    await expect(kpi).toHaveCSS("transform", ACCEPTED.kpiTransformHover);

    // Right-summary card hover now matches the KPI motion: lift (translateY -2),
    // elevated shadow, gentle turquoise border.
    const wh = page.locator(".warehouse-summary-item").first();
    await wh.hover();
    await expect(wh).toHaveCSS("transform", ACCEPTED.kpiTransformHover);
    await expect(wh).toHaveCSS("box-shadow", ACCEPTED.warehouseShadowHover);
    await expect(wh).toHaveCSS("border-top-color", "rgba(29, 181, 181, 0.3)");

    // Revenue Analytics hover: no lift, soft shadow step-up only
    const chart = page.locator(".premium-chart");
    await chart.hover();
    await expect(chart).toHaveCSS("transform", "none");
    await expect(chart).toHaveCSS("box-shadow", ACCEPTED.chartShadowHover);

    // Genuine keyboard focus on a KPI button
    await kpi.focus();
    expect(await kpi.evaluate((el) => el === document.activeElement)).toBe(true);

    // focus-within: focus a descendant control inside the chart, chart keeps the
    // same calm surface treatment as hover (accepted :focus-within == :hover)
    const chartControl = page.locator(".premium-chart a, .premium-chart button").first();
    await chartControl.focus();
    await expect(chart).toHaveCSS("box-shadow", ACCEPTED.chartShadowHover);
  });

  test("KPI detail modal — full-viewport backdrop over whole shell, centred, closes", async ({ page }) => {
    await page.locator(".premium-kpi").first().click();
    const backdrop = page.locator(".kpi-info-backdrop");
    await expect(backdrop).toBeVisible();

    const geo = await page.evaluate(() => {
      const bd = document.querySelector(".kpi-info-backdrop");
      const side = document.querySelector(".dashboard-sidebar");
      const top = document.querySelector(".dashboard-topbar");
      const win = document.querySelector(".kpi-info-window");
      const r = bd.getBoundingClientRect();
      const cs = getComputedStyle(bd);
      const covers = (el) => {
        if (!el) return null;
        const e = el.getBoundingClientRect();
        return r.left <= e.left + 1 && r.top <= e.top + 1 && r.right >= e.right - 1 && r.bottom >= e.bottom - 1;
      };
      const winRect = win.getBoundingClientRect();
      return {
        full: Math.round(r.width) === window.innerWidth && Math.round(r.height) === window.innerHeight && r.left === 0 && r.top === 0,
        position: cs.position, zIndex: cs.zIndex,
        blur: (cs.backdropFilter || cs.webkitBackdropFilter || ""),
        parentIsBody: bd.parentElement === document.body,
        coversSidebar: covers(side), coversTopbar: covers(top),
        winCenterOffset: Math.abs((winRect.left + winRect.width / 2) - window.innerWidth / 2),
      };
    });

    expect(geo.full).toBe(true);              // covers entire viewport
    expect(geo.position).toBe("fixed");
    expect(geo.zIndex).toBe("99999");
    expect(geo.blur).toContain("blur");
    expect(geo.parentIsBody).toBe(true);      // portaled to document.body
    expect(geo.coversSidebar).toBe(true);     // sidebar under backdrop
    expect(geo.coversTopbar).toBe(true);      // topbar under backdrop
    expect(geo.winCenterOffset).toBeLessThanOrEqual(2); // modal centred over viewport

    // title/date group centred within the payment-table head (3-col grid)
    const headCols = await page.locator(".kpi-info-window__head--payment-table").evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns
    );
    expect(headCols.split(" ").length).toBe(3);

    // close works
    await page.locator(".kpi-info-window__close").click();
    await expect(backdrop).toHaveCount(0);
  });

  // Fine-grained accepted surface-refinement values (the e2b383d-controlled
  // resting geometry/border/elevation + KPI density). Asserted at one clean
  // desktop width so the CSS-ownership migration can be proven byte-for-byte.
  test("surface-refinement detail @ 1280", async ({ page }) => {
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());

    // inner revenue Max/Min/Avg stat cells — flat, 11px, hairline border
    const cell = page.locator(".premium-chart .revenue-stat-grid div").first();
    await expect(cell).toHaveCSS("border-radius", "11px");
    await expect(cell).toHaveCSS("border-top-width", "1px");
    await expect(cell).toHaveCSS("border-top-color", "rgba(15, 35, 60, 0.07)");
    await expect(cell).toHaveCSS("box-shadow", "none");

    // KPI resting border + accepted desktop density
    const kpi = page.locator(".premium-kpi").first();
    await expect(kpi).toHaveCSS("border-top-width", "1px");
    await expect(kpi).toHaveCSS("border-top-color", "rgba(15, 35, 60, 0.08)");
    await expect(kpi).toHaveCSS("min-height", "152px");
    await expect(kpi).toHaveCSS("padding-top", "15px");

    // Revenue Analytics resting border + controlled transition
    const chart = page.locator(".premium-chart");
    await expect(chart).toHaveCSS("border-top-width", "1px");
    await expect(chart).toHaveCSS("border-top-color", "rgba(15, 35, 60, 0.08)");
    await expect(chart).toHaveCSS("transition", "box-shadow 0.17s, border-color 0.17s");

    // right-summary resting border
    const wh = page.locator(".warehouse-summary-item").first();
    await expect(wh).toHaveCSS("border-top-width", "1px");
    await expect(wh).toHaveCSS("border-top-color", "rgba(15, 35, 60, 0.09)");
  });



});
