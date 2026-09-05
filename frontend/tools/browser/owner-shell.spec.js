import { test, expect } from "@playwright/test";

// OWNER white-shell oracle: sidebar + topbar recolored navy → white with navy
// foreground, turquoise active, readable widgets, and NO white-on-white.
// Serial + single shared login.

const OWNER_PHONE = "907778778";
const OWNER_PASSWORD = "102938";
const WHITE = "rgb(255, 255, 255)";
const TURQUOISE = "rgb(29, 181, 181)";

test.describe.configure({ mode: "serial" });

test.describe("OWNER white shell", () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto("/login");
    await page.locator(".login-pro-input-wrap--phone input").fill(OWNER_PHONE);
    await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
    await page.locator(".login-pro-submit").click();
    await page.locator(".dashboard-shell").waitFor({ state: "visible", timeout: 30000 });
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
  });

  test.afterAll(async () => { await page.close(); });

  const css = (sel, prop) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

  test("desktop @1280: white surfaces, navy foreground, turquoise active", async () => {
    await expect(page.locator(".dashboard-sidebar")).toHaveCSS("background-color", WHITE);
    await expect(page.locator(".dashboard-topbar")).toHaveCSS("background-color", WHITE);

    // inactive nav readable (navy-ish, not white)
    const navColor = await css(".sidebar-link:not(.is-active)", "color");
    expect(navColor).toContain("11, 31, 63");
    expect(navColor).not.toBe(WHITE);

    // active nav keeps turquoise + white
    await expect(page.locator(".sidebar-link.is-active").first()).toHaveCSS("background-color", TURQUOISE);
    await expect(page.locator(".sidebar-link.is-active").first()).toHaveCSS("color", WHITE);

    // brand + widgets readable (not white)
    expect(await css(".brand-title", "color")).toContain("11, 31, 63");
    expect(await css(".topbar-balance-amount", "color")).toContain("11, 31, 63");
    for (const sel of [".mj-datepicker__trigger", ".topbar-info-widget--rate", ".topbar-notification"]) {
      const c = await css(sel, "color");
      expect(c, `${sel} foreground`).not.toBe(WHITE);
    }

    // NO white-on-white across representative shell elements
    const whiteOnWhite = await page.evaluate((white) => {
      const sels = [".dashboard-sidebar", ".dashboard-topbar", ".brand-title", ".brand-subtitle",
        ".sidebar-link:not(.is-active)", ".sidebar-user", ".mj-datepicker__trigger",
        ".topbar-info-widget--rate", ".topbar-notification", ".topbar-balance-amount"];
      const bad = [];
      for (const s of sels) {
        const el = document.querySelector(s);
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.backgroundColor === white && cs.color === white) bad.push(s);
      }
      return bad;
    }, WHITE);
    expect(whiteOnWhite).toEqual([]);
  });

  test("white shell across OWNER routes", async () => {
    for (const route of ["/", "/reports/z-report", "/finance", "/settings"]) {
      await page.goto(route);
      await page.locator(".dashboard-shell").waitFor({ state: "visible" });
      await expect(page.locator(".dashboard-sidebar"), route).toHaveCSS("background-color", WHITE);
      await expect(page.locator(".dashboard-topbar"), route).toHaveCSS("background-color", WHITE);
    }
  });

  test("responsive: topbar white + no overflow; sidebar white on desktop", async () => {
    for (const w of [390, 768, 1280, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto("/");
      await page.locator(".dashboard-shell").waitFor({ state: "visible" });
      await expect(page.locator(".dashboard-topbar"), `topbar @${w}`).toHaveCSS("background-color", WHITE);
      // workspace surface is the flat cool #E9F0FA at every breakpoint (cards stay white)
      await expect(page.locator(".dashboard-content"), `workspace @${w}`).toHaveCSS("background-color", "rgb(233, 240, 250)");
      if (w >= 1025) {
        await expect(page.locator(".dashboard-sidebar"), `sidebar @${w}`).toHaveCSS("background-color", WHITE);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `overflow @${w}`).toBeLessThanOrEqual(1);
    }
  });

  test("submenu + account dropdown readable on white (no white-on-white)", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // Reports submenu auto-opens on a child route → inactive sibling links visible
    await page.goto("/reports/z-report");
    await page.locator(".dashboard-shell").waitFor({ state: "visible" });
    const sub = page.locator(".sidebar-submenu__link:not(.is-active)").first();
    await expect(sub).toBeVisible();
    // color now animates (160ms) on the active/inactive flip → poll until settled
    await expect.poll(async () => sub.evaluate((el) => getComputedStyle(el).color)).toContain("11, 31, 63");
    const subColor = await sub.evaluate((el) => getComputedStyle(el).color);
    expect(subColor).not.toBe(WHITE);

    // open the account dropdown → name must be navy on the white menu
    await page.locator(".sidebar-user--button, .sidebar-user").first().click();
    const nameEl = page.locator(".sidebar-account__menu .sidebar-account__head-meta strong").first();
    await expect(nameEl).toBeVisible();
    expect(await nameEl.evaluate((el) => getComputedStyle(el).color)).toContain("11, 31, 63");

    // logout ("Выйти") must be readable danger red, not cyan-on-white
    const danger = page.locator(".sidebar-account__menu .sidebar-account__item--danger").first();
    if (await danger.count()) {
      const dc = await danger.evaluate((el) => getComputedStyle(el).color);
      expect(dc).toContain("229, 72, 77");
    }
  });

  test("junction wedge gone + submenu not navy + profile role readable", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/reports/z-report");
    await page.locator(".owner-reports-page").waitFor({ state: "visible" });
    await expect(page.locator(".dashboard-sidebar")).toHaveCSS("background-color", WHITE);

    // shell/main/body are white → no navy shows through the rounded corners (no dark wedge)
    await expect(page.locator(".dashboard-shell")).toHaveCSS("background-color", WHITE);
    await expect(page.locator(".dashboard-main")).toHaveCSS("background-color", WHITE);

    // expanded submenu container + open parent are NOT a navy block
    const navy = "rgb(11, 31, 63)";
    const submenuBg = await page.locator(".sidebar-submenu").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(submenuBg).not.toBe(navy);
    const parentBg = await page.locator(".sidebar-nav-item.has-submenu.is-open").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(parentBg).not.toBe(navy);

    // profile role sub-text readable slate (not near-white)
    const roleColor = await page.locator(".sidebar-user__meta span").first().evaluate((el) => getComputedStyle(el).color);
    expect(roleColor).toContain("83, 109, 142");
  });

  test("polish: flat workspace bg + no resting shadow on balance/logo", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    // workspace surface is flat cool #E9F0FA (cards/sidebar/topbar stay white)
    await expect(page.locator(".dashboard-content")).toHaveCSS("background-color", "rgb(233, 240, 250)");
    await expect(page.locator(".dashboard-content")).toHaveCSS("background-image", "none");
    await expect(page.locator(".dashboard-sidebar")).toHaveCSS("background-color", WHITE);
    await expect(page.locator(".dashboard-topbar")).toHaveCSS("background-color", WHITE);
    // topbar has no bottom border; main is solid white; top-left curve 24px
    await expect(page.locator(".dashboard-topbar")).toHaveCSS("border-bottom-width", "0px");
    await expect(page.locator(".dashboard-main")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.locator(".dashboard-content")).toHaveCSS("border-top-left-radius", "24px");
    // resting shadows removed on balance amount, Баланс button, and brand mark
    await expect(page.locator(".topbar-balance-amount").first()).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".topbar-pay-button").first()).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".brand-mark").first()).toHaveCSS("box-shadow", "none");
  });

  test("overlapping rounded balance controls + borderless sidebar + right-nudged cluster", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });

    // TWO individually-rounded controls that visually join (per reference): the
    // parent no longer clips — transparent, no border, overflow VISIBLE.
    await expect(page.locator(".topbar-balance-pill")).toHaveCSS("overflow-x", "visible");
    await expect(page.locator(".topbar-balance-pill")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.locator(".topbar-balance-pill")).toHaveCSS("border-top-width", "0px");
    // "0 UZS": its own complete light control — full radius, own border, navy text.
    // Right border removed so the seam vanishes under the overlapping Баланс button.
    await expect(page.locator(".topbar-balance-amount")).toHaveCSS("border-top-left-radius", "12px");
    await expect(page.locator(".topbar-balance-amount")).toHaveCSS("border-bottom-right-radius", "12px");
    await expect(page.locator(".topbar-balance-amount")).toHaveCSS("border-top-width", "1px");
    await expect(page.locator(".topbar-balance-amount")).toHaveCSS("border-left-width", "1px");
    await expect(page.locator(".topbar-balance-amount")).toHaveCSS("border-bottom-width", "1px");
    await expect(page.locator(".topbar-balance-amount")).toHaveCSS("border-right-width", "0px");
    await expect(page.locator(".topbar-balance-amount")).toHaveCSS("background-color", "rgba(246, 248, 252, 0.96)");
    // OLD compact proportions restored: tight padding (committed 14/12 @1280),
    // no inflated right padding.
    await expect(page.locator(".topbar-balance-amount")).toHaveCSS("padding-right", "12px");
    const amtColor = await page.locator(".topbar-balance-amount").evaluate((el) => getComputedStyle(el).color);
    expect(amtColor).toContain("11, 31, 63");
    // "Баланс": FULL radius on ALL FOUR corners — left edge must curve, not be flat
    await expect(page.locator(".topbar-pay-button")).toHaveCSS("border-top-left-radius", "12px");
    await expect(page.locator(".topbar-pay-button")).toHaveCSS("border-bottom-left-radius", "12px");
    await expect(page.locator(".topbar-pay-button")).toHaveCSS("border-top-right-radius", "12px");
    await expect(page.locator(".topbar-pay-button")).toHaveCSS("border-bottom-right-radius", "12px");
    await expect(page.locator(".topbar-pay-button")).toHaveCSS("background-color", "rgb(29, 181, 181)");
    // small controlled overlap; turquoise button stacked ABOVE the amount
    const stack = await page.evaluate(() => {
      const a = document.querySelector(".topbar-balance-amount");
      const p = document.querySelector(".topbar-pay-button");
      const ar = a.getBoundingClientRect(), pr = p.getBoundingClientRect();
      return { overlap: Math.round(ar.right - pr.left), az: +getComputedStyle(a).zIndex, pz: +getComputedStyle(p).zIndex };
    });
    expect(stack.overlap).toBeGreaterThanOrEqual(4);  // subtle join (old proportions)
    expect(stack.overlap).toBeLessThanOrEqual(8);     // subtle, not deep
    expect(stack.pz).toBeGreaterThan(stack.az);    // Баланс sits over the junction
    // no resting shadow on either control
    await expect(page.locator(".topbar-balance-amount")).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".topbar-pay-button")).toHaveCSS("box-shadow", "none");

    // sidebar has no right border (clean meet with workspace) and no ::after divider
    await expect(page.locator(".dashboard-sidebar")).toHaveCSS("border-right-width", "0px");
    const afterContent = await page.locator(".dashboard-sidebar").evaluate((el) => getComputedStyle(el, "::after").content);
    expect(["none", "normal", ""]).toContain(afterContent);

    // left topbar cluster nudged right off the edge; back + date move together, no overflow
    await expect(page.locator(".topbar-left")).toHaveCSS("padding-left", "10px");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("balance semantics: 0 UZS is a display field, Баланс is the only button", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });

    // DOM semantics: amount is a non-button display element; Баланс is a real button
    const dom = await page.evaluate(() => {
      const a = document.querySelector(".topbar-balance-amount");
      const p = document.querySelector(".topbar-pay-button");
      return { amountTag: a.tagName, amountRole: a.getAttribute("role"), payTag: p.tagName };
    });
    expect(dom.amountTag).not.toBe("BUTTON");
    expect(dom.amountRole).not.toBe("button");
    expect(dom.payTag).toBe("BUTTON");

    // amount is non-interactive: default cursor, and identical at rest vs hover
    const amt = page.locator(".topbar-balance-amount");
    await expect(amt).toHaveCSS("cursor", "default");
    const rest = await amt.evaluate((el) => { const c = getComputedStyle(el); return { s: c.boxShadow, bg: c.backgroundColor, t: c.transform }; });
    await amt.hover();
    await page.waitForTimeout(200);
    const hov = await amt.evaluate((el) => { const c = getComputedStyle(el); return { s: c.boxShadow, bg: c.backgroundColor, t: c.transform }; });
    expect(hov.s).toBe(rest.s);   // no hover shadow
    expect(hov.bg).toBe(rest.bg); // no hover background change
    expect(hov.t).toBe(rest.t);   // no transform
    expect(rest.s).toBe("none");  // no resting shadow either

    // Баланс is the interactive control: pointer cursor + a hover shadow appears
    const pay = page.locator(".topbar-pay-button");
    await expect(pay).toHaveCSS("cursor", "pointer");
    const payRest = await pay.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(payRest).toBe("none");
    await pay.hover();
    await page.waitForTimeout(200);
    const payHov = await pay.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(payHov).not.toBe("none");
  });

  test("Back button: compact light nav control (navy arrow, no lift, turquoise focus)", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/finance"); // a child route so Back is meaningful
    await page.locator(".dashboard-shell").waitFor({ state: "visible" });
    const back = page.locator(".topbar-back-slot .dashboard-back-button--topbar-3d");
    await expect(back).toBeVisible();
    // light surface, subtle border, radius ~12, no resting shadow (not a primary button)
    await expect(back).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(back).toHaveCSS("border-radius", "12px");
    await expect(back).toHaveCSS("box-shadow", "none");
    // arrow readable navy (not black, not white), calmer optical size
    const arrow = back.locator("svg").first();
    const arrowColor = await arrow.evaluate((el) => getComputedStyle(el).color);
    expect(arrowColor).toContain("11, 31, 63");
    await expect(arrow).toHaveCSS("width", "18px");
    // near-square control, roughly the topbar control height
    const box = await back.evaluate((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    expect(box.h).toBeGreaterThanOrEqual(34);
    expect(box.h).toBeLessThanOrEqual(48);
    expect(Math.abs(box.w - box.h)).toBeLessThanOrEqual(2);
  });

  test("card icons: unified geometry; KPI per-card premium tints, summary turquoise/coral", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });

    const geom = async (sel) => page.locator(sel).first().evaluate((el) => {
      const cs = getComputedStyle(el);
      const svg = el.querySelector("svg");
      const scs = svg ? getComputedStyle(svg) : {};
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), radius: cs.borderTopLeftRadius, svgW: scs.width, stroke: scs.strokeWidth };
    });
    const kpi = await geom(".premium-kpi__icon");
    const sum = await geom(".warehouse-summary-item__icon");
    // unified box + optical size + stroke; KPI rounded-square 18px, summary 12px
    for (const g of [kpi, sum]) {
      expect(g.w).toBe(42);
      expect(g.h).toBe(42);
      expect(g.svgW).toBe("19px");
      expect(g.stroke).toBe("2px");
    }
    // KPI icon is a crisp rounded SQUARE (equal w/h, 14px radius); summary 12px
    expect(kpi.radius).toBe("14px");
    expect(sum.radius).toBe("12px");

    // KPI: 5 distinct premium tints
    await expect(page.locator(".premium-kpi--revenue .premium-kpi__icon")).toHaveCSS("background-color", "rgba(16, 185, 129, 0.12)");
    await expect(page.locator(".premium-kpi--orders .premium-kpi__icon")).toHaveCSS("background-color", "rgba(59, 130, 246, 0.12)");
    await expect(page.locator(".premium-kpi--avg .premium-kpi__icon")).toHaveCSS("background-color", "rgba(139, 92, 246, 0.12)");
    await expect(page.locator(".premium-kpi--tables .premium-kpi__icon")).toHaveCSS("background-color", "rgba(245, 158, 11, 0.14)");
    await expect(page.locator(".premium-kpi--expense .premium-kpi__icon")).toHaveCSS("background-color", "rgba(244, 63, 94, 0.12)");

    // right-summary cards keep their turquoise/coral system (unchanged)
    const turq = "rgba(29, 181, 181, 0.12)";
    const coral = "rgba(224, 106, 90, 0.12)";
    await expect(page.locator(".warehouse-summary-item--income .warehouse-summary-item__icon")).toHaveCSS("background-color", turq);
    await expect(page.locator(".warehouse-summary-item--expense .warehouse-summary-item__icon")).toHaveCSS("background-color", coral);
    await expect(page.locator(".warehouse-summary-item--creditor .warehouse-summary-item__icon")).toHaveCSS("background-color", coral);
    await expect(page.locator(".warehouse-summary-item--debtor .warehouse-summary-item__icon")).toHaveCSS("background-color", turq);
  });

  test("reports subcategory panel: wider inside 280px sidebar, hierarchy, no clip", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/reports/z-report");
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });

    // sidebar width UNCHANGED at exactly 280px
    const sbW = await page.locator(".dashboard-sidebar").evaluate((el) => Math.round(el.getBoundingClientRect().width));
    expect(sbW).toBe(280);

    // panel is a structured group: 1px turquoise hairline, disciplined radius,
    // depth provided by a decorative ::after layer (panel box-shadow is none)
    const sub = page.locator(".sidebar-submenu").first();
    await expect(sub).toHaveCSS("border-top-width", "1px");
    await expect(sub).toHaveCSS("box-shadow", "none");
    const afterFilter = await sub.evaluate((el) => getComputedStyle(el, "::after").filter);
    expect(afterFilter).toContain("blur");
    await expect(sub).toHaveCSS("border-top-left-radius", "12px");

    // panel is a wide block fully inside the 280px sidebar, with a clean outer margin
    const geo = await page.evaluate(() => {
      const sb = document.querySelector(".dashboard-sidebar").getBoundingClientRect();
      const s = document.querySelector(".sidebar-submenu").getBoundingClientRect();
      return { w: Math.round(s.width), outL: Math.round(s.left - sb.left), outR: Math.round(sb.right - s.right),
        inside: s.left >= sb.left - 0.5 && s.right <= sb.right + 0.5 };
    });
    expect(geo.w).toBeGreaterThanOrEqual(248);
    expect(geo.inside).toBe(true);
    expect(geo.outL).toBeLessThanOrEqual(16);
    expect(geo.outL).toBeGreaterThanOrEqual(4);

    // active child is SECONDARY to the turquoise parent: light tint, navy text, weight 600
    const active = page.locator(".sidebar-submenu__link.is-active").first();
    await expect(active).toHaveCSS("background-color", "rgba(29, 181, 181, 0.12)");
    await expect(active).toHaveCSS("font-weight", "600");
    const aColor = await active.evaluate((el) => getComputedStyle(el).color);
    expect(aColor).toContain("11, 31, 63");
    // inactive child transparent + muted navy
    const inactive = page.locator(".sidebar-submenu__link:not(.is-active)").first();
    await expect(inactive).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    // long labels no longer clip (wrap instead of ellipsis)
    const clipped = await page.evaluate(() => Array.from(document.querySelectorAll(".sidebar-submenu__link"))
      .filter((l) => l.scrollWidth > l.clientWidth + 1).length);
    expect(clipped).toBe(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("sidebar motion + icon cleanup + soft submenu shadow", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/reports/z-report");
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });

    // A. consistent motion: main nav and submenu links share the SAME transition
    const mainTrans = await page.locator(".sidebar-link").first().evaluate((el) => getComputedStyle(el).transitionDuration);
    const subTrans = await page.locator(".sidebar-submenu__link").first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(subTrans).toBe(mainTrans);
    expect(subTrans).not.toBe("0s");        // submenu links animate (were instant before)

    // main active: strong turquoise, no transform/layout movement
    const act = page.locator(".sidebar-link.is-active").first();
    await expect(act).toHaveCSS("background-color", TURQUOISE);
    await expect(act).toHaveCSS("transform", "none");

    // C. submenu inactive icon: no box (transparent bg, no shadow), muted slate glyph
    const inLink = page.locator(".sidebar-submenu__link:not(.is-active)").first();
    const icon = inLink.locator(".sidebar-submenu__icon");
    await expect(icon).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(icon).toHaveCSS("box-shadow", "none");

    // D. submenu hover: light turquoise row, icon turns turquoise, STILL no dark icon box,
    // plus a gentle rightward nudge (translateX ~3px)
    await inLink.hover();
    await page.waitForTimeout(240);
    const hov = await inLink.evaluate((el) => {
      const c = getComputedStyle(el);
      const ic = el.querySelector(".sidebar-submenu__icon");
      const icc = getComputedStyle(ic);
      const svg = ic.querySelector("svg");
      return { rowBg: c.backgroundColor, iconBg: icc.backgroundColor, iconBox: icc.boxShadow,
        iconColor: svg ? getComputedStyle(svg).color : icc.color, transform: c.transform };
    });
    expect(hov.rowBg).toBe("rgba(29, 181, 181, 0.08)");
    expect(hov.iconBg).toBe("rgba(0, 0, 0, 0)"); // no dark square on hover
    expect(hov.iconBox).toBe("none");
    expect(hov.iconColor).toBe("rgb(29, 181, 181)"); // turquoise, not white/invisible
    expect(hov.transform).toBe("matrix(1, 0, 0, 1, 3, 0)"); // translateX(3px) nudge

    // main inactive link also nudges on hover; transition includes transform
    const mainIn = page.locator(".sidebar-link:not(.is-active)").first();
    expect(await mainIn.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("transform");
    await mainIn.hover();
    await page.waitForTimeout(240);
    expect(await mainIn.evaluate((el) => getComputedStyle(el).transform)).toBe("matrix(1, 0, 0, 1, 3, 0)");

    // chevron on the open parent is rotated 90°
    const chev = await page.locator(".sidebar-nav-item.has-submenu.is-open .sidebar-link__chevron").first().evaluate((el) => getComputedStyle(el).transform);
    expect(chev).toBe("matrix(0, 1, -1, 0, 0, 0)");

    // F. panel: turquoise hairline border (#4FE1E5); depth via a decorative ::after
    // blurred layer (panel's own box-shadow is none, so no cascade can touch it)
    const panel = page.locator(".sidebar-submenu").first();
    await expect(panel).toHaveCSS("border-top-width", "1px");
    await expect(panel).toHaveCSS("border-top-color", "rgb(79, 225, 229)");
    await expect(panel).toHaveCSS("border-top-left-radius", "12px");
    await expect(panel).toHaveCSS("box-shadow", "none");
    const after = await panel.evaluate((el) => { const a = getComputedStyle(el, "::after"); return { content: a.content, bg: a.backgroundColor, filter: a.filter, z: a.zIndex, radius: a.borderTopLeftRadius }; });
    expect(after.content).toBe('""');            // the shadow layer exists
    expect(after.filter).toContain("blur");      // soft
    expect(after.z).toBe("-1");                  // behind the panel
    expect(after.bg).toBe("rgba(15, 35, 60, 0.2)");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("submenu panel border + shadow are 100% stable across child states", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/reports/z-report");
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    const panel = () => page.locator(".sidebar-submenu").first().evaluate((el) => {
      const c = getComputedStyle(el);
      const a = getComputedStyle(el, "::after");
      return { border: c.borderTopColor, w: c.borderTopWidth, radius: c.borderTopLeftRadius, shadow: c.boxShadow,
        aBg: a.backgroundColor, aFilter: a.filter, aZ: a.zIndex, aBottom: a.bottom, aHeight: a.height, aLeft: a.left, aRight: a.right };
    });
    const initial = await panel();
    // exact expected values: panel has NO box-shadow; depth is the invariant ::after layer
    expect(initial.border).toBe("rgb(79, 225, 229)");
    expect(initial.w).toBe("1px");
    expect(initial.radius).toBe("12px");
    expect(initial.shadow).toBe("none");
    expect(initial.aBg).toBe("rgba(15, 35, 60, 0.2)");
    expect(initial.aFilter).toContain("blur");
    expect(initial.aZ).toBe("-1");

    // hover a child → panel + shadow layer unchanged
    await page.locator(".sidebar-submenu__link", { hasText: "заказам" }).first().hover();
    await page.waitForTimeout(240);
    expect(await panel()).toEqual(initial);

    // click that child (route active) → unchanged
    await page.locator(".sidebar-submenu__link", { hasText: "заказам" }).first().click();
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    expect(await panel()).toEqual(initial);

    // hover a different child → still unchanged
    await page.locator(".sidebar-submenu__link", { hasText: "столам" }).first().hover();
    await page.waitForTimeout(240);
    expect(await panel()).toEqual(initial);

    // box-shadow must NOT be in the panel's transition (never animates)
    const trans = await page.locator(".sidebar-submenu").first().evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(trans).not.toContain("box-shadow");
  });

  test("submenu open/close animates (collapsed hidden, open visible, chevron turns)", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // dashboard: Отчёты closed → hidden (opacity 0, max-height 0), chevron not rotated
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    const closed = await page.evaluate(() => {
      const it = document.querySelector(".sidebar-nav-item.has-submenu:not(.is-open)");
      const sm = it.querySelector(".sidebar-submenu"); const c = getComputedStyle(sm);
      const chev = it.querySelector(".sidebar-link__chevron");
      return { opacity: c.opacity, maxH: c.maxHeight, hasTransformTransition: c.transitionProperty.includes("transform"),
        chev: chev ? getComputedStyle(chev).transform : "none" };
    });
    expect(closed.opacity).toBe("0");
    expect(closed.maxH).toBe("0px");
    expect(closed.hasTransformTransition).toBe(true);
    expect(closed.chev).not.toBe("matrix(0, 1, -1, 0, 0, 0)"); // not rotated when closed

    // open route: visible + settled translateY(0), chevron rotated 90
    await page.goto("/reports/z-report");
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    const open = await page.evaluate(() => {
      const it = document.querySelector(".sidebar-nav-item.has-submenu.is-open");
      const sm = it.querySelector(".sidebar-submenu"); const c = getComputedStyle(sm);
      const chev = it.querySelector(".sidebar-link__chevron");
      return { opacity: c.opacity, transform: c.transform, chev: getComputedStyle(chev).transform };
    });
    expect(parseFloat(open.opacity)).toBeGreaterThan(0.95);
    expect(open.transform).toBe("none"); // settled open: no transform (translateY resolved to none)
    expect(open.chev).toBe("matrix(0, 1, -1, 0, 0, 0)");      // rotate(90deg)
  });

  test("balance modal: full-shell dim, viewport-centered card, compact header", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    await page.locator(".topbar-pay-button").click();
    const ov = page.locator(".balance-payment-modal");
    await ov.waitFor({ state: "visible" });

    // overlay: fixed, full viewport, above the sidebar (z>180), soft dim
    await expect(ov).toHaveCSS("position", "fixed");
    await expect(ov).toHaveCSS("background-color", "rgba(15, 35, 60, 0.34)");
    const z = await ov.evaluate((el) => parseInt(getComputedStyle(el).zIndex, 10));
    expect(z).toBeGreaterThan(180); // above the fixed sidebar (z:180)
    const full = await ov.evaluate((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    expect(full.w).toBe(1280);

    // the whole shell is dimmed uniformly — the overlay covers the sidebar too
    const coversSidebar = await page.evaluate(() => {
      const sb = document.querySelector(".dashboard-sidebar").getBoundingClientRect();
      const el = document.elementFromPoint(Math.round(sb.x + sb.width / 2), Math.round(sb.y + 200));
      const ov = document.querySelector(".balance-payment-modal");
      return ov.contains(el) || el === ov;
    });
    expect(coversSidebar).toBe(true);

    // card centered on the viewport (both axes)
    const c = await page.evaluate(() => {
      const d = document.querySelector(".balance-payment-dialog").getBoundingClientRect();
      return { dx: Math.abs((d.x + d.width / 2) - window.innerWidth / 2), dy: Math.abs((d.y + d.height / 2) - window.innerHeight / 2) };
    });
    expect(c.dx).toBeLessThanOrEqual(1);
    expect(c.dy).toBeLessThanOrEqual(1);

    // compact header (trimmed ~40% from the old ~109px)
    const headH = await page.locator(".balance-payment-dialog__head").evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(headH).toBeLessThanOrEqual(80);

    // no horizontal overflow while open
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    // close it (backdrop mousedown) so later tests start clean
    await ov.dispatchEvent("mousedown");
    await expect(ov).toHaveCount(0);
  });

  test("balance modal: centered with no overflow at 390/768/1280/1440", async () => {
    for (const w of [390, 768, 1280, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto("/");
      await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
      await page.locator(".topbar-pay-button").click();
      const ov = page.locator(".balance-payment-modal");
      await ov.waitFor({ state: "visible" });
      const r = await page.evaluate((vw) => {
        const o = document.querySelector(".balance-payment-modal").getBoundingClientRect();
        const d = document.querySelector(".balance-payment-dialog").getBoundingClientRect();
        return { ovW: Math.round(o.width), dx: Math.abs((d.x + d.width / 2) - vw / 2),
          inside: d.left >= -0.5 && d.right <= vw + 0.5,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      }, w);
      expect(r.ovW, `overlay full @${w}`).toBe(w);
      expect(r.dx, `centered @${w}`).toBeLessThanOrEqual(1);
      expect(r.inside, `inside @${w}`).toBe(true);
      expect(r.overflow, `overflow @${w}`).toBeLessThanOrEqual(1);
      await ov.dispatchEvent("mousedown");
      await expect(ov).toHaveCount(0);
    }
  });

  test("accordion is deterministic: one category open at a time", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    const openCount = () => page.locator(".sidebar-nav-item.has-submenu.is-open").count();
    const open = async (label) => { await page.locator(".sidebar-link--button", { hasText: label }).first().click(); await page.waitForTimeout(320); };
    await open("Отчеты"); expect(await openCount()).toBe(1);
    await open("Сотрудники"); expect(await openCount()).toBe(1); // Отчёты closed, Staff open
    await open("Меню"); expect(await openCount()).toBe(1);
    await open("Меню"); expect(await openCount()).toBe(0); // same-parent toggle closes
    // route-active parent opens deterministically on direct navigation
    await page.goto("/reports/z-report");
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
    expect(await openCount()).toBe(1);
    const openKey = await page.locator(".sidebar-nav-item.has-submenu.is-open .sidebar-link--button").first().textContent();
    expect(openKey).toContain("Отч");
  });

  test("submenu panel is not clipped by the sidebar-nav on the sides", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const route of ["/reports/z-report", "/settings/clients", "/users/cashier"]) {
      await page.goto(route);
      await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const nav = document.querySelector(".sidebar-nav");
        const panel = document.querySelector(".sidebar-nav-item.has-submenu.is-open .sidebar-submenu");
        const navR = nav.getBoundingClientRect(); const pR = panel.getBoundingClientRect();
        return { overL: Math.round(navR.left - pR.left), overR: Math.round(pR.right - (navR.left + nav.clientWidth)) };
      });
      expect(r.overL, `left clip @${route}`).toBeLessThanOrEqual(0);   // panel within nav → not clipped
      expect(r.overR, `right clip @${route}`).toBeLessThanOrEqual(0);
    }
  });

  test("shadow invariant + icons clean across Staff & Settings categories", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const panelSig = () => page.locator(".sidebar-nav-item.has-submenu.is-open .sidebar-submenu").first().evaluate((el) => {
      const c = getComputedStyle(el); const a = getComputedStyle(el, "::after");
      return JSON.stringify({ box: c.boxShadow, border: c.borderTopColor, aBg: a.backgroundColor, aFilter: a.filter, aZ: a.zIndex });
    });
    // Staff: shadow layer identical to Reports' and stateless; icons have no box
    await page.goto("/users/cashier");
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    const staffBase = await panelSig();
    await page.goto("/users/manager");
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    expect(await panelSig()).toBe(staffBase); // child change → panel depth unchanged
    // icons: no dark box on submenu icons
    const iconBox = await page.locator(".sidebar-nav-item.has-submenu.is-open .sidebar-submenu__icon").first().evaluate((el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, shadow: c.boxShadow }; });
    expect(iconBox.bg).toBe("rgba(0, 0, 0, 0)");
    expect(iconBox.shadow).toBe("none");

    // Settings (long panel): same border color + panel box-shadow none
    await page.goto("/settings/units");
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    const settings = await page.locator(".sidebar-nav-item.has-submenu.is-open .sidebar-submenu").first().evaluate((el) => { const c = getComputedStyle(el); return { box: c.boxShadow, border: c.borderTopColor }; });
    expect(settings.box).toBe("none");
    expect(settings.border).toBe("rgb(79, 225, 229)");
  });

  test("motion parity: active Отчёты (has-submenu) matches a normal active item", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // a normal (non-submenu) item active — its resting active box-shadow
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    const normalActive = page.locator(".sidebar-link.is-active").first();
    const normalShadow = await normalActive.evaluate((el) => getComputedStyle(el).boxShadow);
    const normalTrans = await normalActive.evaluate((el) => getComputedStyle(el).transitionProperty + "|" + getComputedStyle(el).transitionDuration);

    // the has-submenu parent "Отчёты" active on a child route
    await page.goto("/reports/z-report");
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    const reportsActive = page.locator(".sidebar-nav-item.has-submenu .sidebar-link.is-active").first();
    const reportsShadow = await reportsActive.evaluate((el) => getComputedStyle(el).boxShadow);
    const reportsTrans = await reportsActive.evaluate((el) => getComputedStyle(el).transitionProperty + "|" + getComputedStyle(el).transitionDuration);

    // identical resting active shadow AND identical transition system
    expect(reportsShadow).toBe(normalShadow);
    expect(reportsTrans).toBe(normalTrans);
  });

  test("open parent button wears the same turquoise border as its panel", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const route of ["/reports/z-report", "/users/cashier", "/settings/clients"]) {
      await page.goto(route);
      await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
      await page.waitForTimeout(250);
      const parent = page.locator(".sidebar-nav-item.has-submenu.is-open > .sidebar-link").first();
      await expect(parent, `parent border @${route}`).toHaveCSS("border-top-color", "rgb(79, 225, 229)");
      await expect(parent, `parent border w @${route}`).toHaveCSS("border-top-width", "1px");
      const panel = page.locator(".sidebar-nav-item.has-submenu.is-open .sidebar-submenu").first();
      await expect(panel, `panel border @${route}`).toHaveCSS("border-top-color", "rgb(79, 225, 229)");
      // no overlay/mask layer on the open parent near the chevron (clean right side)
      const layers = await parent.evaluate((el) => {
        const c = getComputedStyle(el);
        const aft = getComputedStyle(el, "::after");
        return { afterContent: aft.content, mask: c.maskImage, bgImage: c.backgroundImage };
      });
      expect(layers.afterContent, `open parent ::after @${route}`).toBe("none");
      expect(layers.mask, `open parent mask @${route}`).toBe("none");
      expect(layers.bgImage, `open parent bg-image @${route}`).toBe("none");
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("account panel: smooth centered entrance + chevron rotates, single shadow", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    await page.locator(".sidebar-user--button").first().click();
    const menu = page.locator(".sidebar-account__menu").first();
    await menu.waitFor({ state: "visible" });
    await page.waitForTimeout(240);
    const m = await menu.evaluate((el) => { const c = getComputedStyle(el); return { anim: c.animationName, dur: c.animationDuration, shadowLayers: c.boxShadow.split(/,(?![^(]*\))/).length }; });
    expect(m.anim).toBe("owner-account-menu-in");     // entrance animation present
    expect(parseFloat(m.dur)).toBeGreaterThan(0.1);
    expect(m.shadowLayers).toBeLessThanOrEqual(2);    // single/soft, not a stack of shadows
    // horizontally centered in the sidebar (translateX(-50%) preserved through the animation)
    const centered = await page.evaluate(() => {
      const mr = document.querySelector(".sidebar-account__menu").getBoundingClientRect();
      const sr = document.querySelector(".dashboard-sidebar").getBoundingClientRect();
      return Math.abs((mr.x + mr.width / 2) - (sr.x + sr.width / 2));
    });
    expect(centered).toBeLessThanOrEqual(2);
    // trigger chevron: closed → points right (no rotation), open → points up (rotate -90°)
    const arrowOpen = await page.locator(".sidebar-account.is-open .sidebar-user__arrow").first().evaluate((el) => getComputedStyle(el).transform);
    expect(arrowOpen).toBe("matrix(0, -1, 1, 0, 0, 0)"); // rotate(-90deg) → points up
    // language trigger is one clean control — no inner gray capsule around the code
    const lc = await page.locator(".sidebar-account__lang-current").first().evaluate((el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, borderW: c.borderTopWidth }; });
    expect(lc.bg).toBe("rgba(0, 0, 0, 0)");   // transparent, no dark/gray pill
    expect(lc.borderW).toBe("0px");
    await expect(page.locator(".sidebar-account__lang-current-flag img")).toHaveAttribute("src", /flag/i);
    // sidebar padding is exactly 10px 6px 15px
    await expect(page.locator(".dashboard-sidebar")).toHaveCSS("padding", "10px 6px 15px");
    // closed state → chevron points right (no rotation)
    await page.locator(".sidebar-user--button").first().click(); // close
    await page.waitForTimeout(300);
    const arrowClosed = await page.locator(".sidebar-user__arrow").first().evaluate((el) => getComputedStyle(el).transform);
    expect(arrowClosed === "none" || arrowClosed === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);
  });

  test("profile menu: readable text, white language popup, flag sync, smooth close", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    await page.locator(".sidebar-user--button").first().click();
    await page.locator(".sidebar-account__menu").waitFor({ state: "visible" });
    await page.waitForTimeout(240);

    // rows are readable navy (not near-white on white), logout is danger red
    const itemColor = await page.locator(".sidebar-account__item:not(.sidebar-account__item--danger)").first().evaluate((el) => getComputedStyle(el).color);
    expect(itemColor).toContain("11, 31, 63");
    const danger = await page.locator(".sidebar-account__item--danger").first().evaluate((el) => getComputedStyle(el).color);
    expect(danger).toContain("229, 72, 77");

    // language trigger shows the selected flag + code (driven by state)
    const startCode = (await page.locator(".sidebar-account__lang-current").first().innerText()).trim();
    const startFlag = await page.locator(".sidebar-account__lang-current-flag img").first().getAttribute("src");
    expect(startFlag).toBeTruthy();

    // open the language popup → white surface (not the old dark navy slab)
    await page.locator(".sidebar-account__lang-trigger").click();
    await page.locator(".sidebar-account__lang-panel").waitFor({ state: "visible" });
    await page.waitForTimeout(180);
    await expect(page.locator(".sidebar-account__lang-panel")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const langItemColor = await page.locator(".sidebar-account__lang-panel button").first().evaluate((el) => getComputedStyle(el).color);
    expect(langItemColor).toContain("11, 31, 63");

    // select a different language → trigger flag + code update immediately
    const target = startCode === "EN" ? "UZ" : "EN";
    await page.locator(".sidebar-account__lang-panel button", { hasText: target }).first().click();
    await page.waitForTimeout(200);
    expect((await page.locator(".sidebar-account__lang-current").first().innerText()).trim()).toContain(target);
    const newFlag = await page.locator(".sidebar-account__lang-current-flag img").first().getAttribute("src");
    expect(newFlag).not.toBe(startFlag);

    // reopen → selection persisted
    await page.locator(".sidebar-user--button").first().click(); // close
    await page.waitForTimeout(300);
    await page.locator(".sidebar-user--button").first().click(); // reopen
    await page.locator(".sidebar-account__menu").waitFor({ state: "visible" });
    await page.waitForTimeout(240);
    expect((await page.locator(".sidebar-account__lang-current").first().innerText()).trim()).toContain(target);

    // smooth close: the menu runs an exit animation before unmounting (not instant)
    await page.locator(".sidebar-user--button").first().click();
    await page.waitForTimeout(40);
    expect(await page.locator(".sidebar-account__menu.is-closing").count()).toBe(1);
    const outAnim = await page.locator(".sidebar-account__menu").first().evaluate((el) => getComputedStyle(el).animationName).catch(() => "gone");
    expect(outAnim).toBe("owner-account-menu-out");
    await page.waitForTimeout(320);
    expect(await page.locator(".sidebar-account__menu").count()).toBe(0);
  });

  test("sidebar search sits under brand, above Дашборд; active radius 24px", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });

    // placement: brand → search → first nav item, no overlap
    const rects = await page.evaluate(() => {
      const g = (s) => { const el = document.querySelector(s); const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
      const sbTop = document.querySelector(".dashboard-sidebar").getBoundingClientRect().top;
      return { sbTop, brand: g(".sidebar-brand"), search: g(".sidebar-search"), firstNav: g(".sidebar-nav .sidebar-link") };
    });
    expect(rects.search.top).toBeGreaterThanOrEqual(rects.brand.bottom - 1); // below brand
    expect(rects.firstNav.top).toBeGreaterThanOrEqual(rects.search.bottom - 1); // above first nav
    // search is close to Dashboard (small gap ≈ 6px, not a wide void)
    expect(rects.firstNav.top - rects.search.bottom).toBeLessThanOrEqual(9);
    // brand block vertically centered between sidebar top edge and the search bar
    const topGap = rects.brand.top - rects.sbTop;
    const bottomGap = rects.search.top - rects.brand.bottom;
    expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(3);

    // visual: field is the light recessed shell (new spec), placeholder "Поиск"
    const field = page.locator(".sidebar-search__field");
    await expect(field).toHaveCSS("background-color", "rgba(15, 35, 60, 0.055)");
    await expect(field).toHaveCSS("border-top-left-radius", "12px");
    await expect(field).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".sidebar-search__input")).toHaveAttribute("placeholder", "Поиск");
    // accessible focus state on the field (bg animates to white over 160ms → poll until settled)
    await page.locator(".sidebar-search__input").focus();
    await expect.poll(async () => field.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
    const focusShadow = await field.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(focusShadow).not.toBe("none");

    // active button radius = 24px (Дашборд active on "/")
    await expect(page.locator(".sidebar-link.is-active").first()).toHaveCSS("border-top-left-radius", "24px");
    // inactive stays not-24
    const inactiveR = await page.locator(".sidebar-link:not(.is-active)").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    expect(inactiveR).not.toBe("24px");

    // active/open parent also 24px on a child route
    await page.goto("/reports/z-report");
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await expect(page.locator(".sidebar-nav-item.has-submenu.is-open > .sidebar-link")).toHaveCSS("border-top-left-radius", "24px");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("sidebar navigation search: query, keyboard, child nav, clear, empty", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    const input = page.locator(".sidebar-search__input");
    const labels = () => page.locator(".sidebar-search__result-label").allInnerTexts();

    // query results derive from the nav tree
    await input.fill("касс"); await page.waitForTimeout(160);
    expect(await labels()).toContain("Кассир");
    await input.fill("заказ"); await page.waitForTimeout(160);
    expect(await labels()).toContain("Отчёт по заказам");
    await input.fill("фин"); await page.waitForTimeout(160);
    expect(await labels()).toContain("Финансы");

    // empty state (not an error)
    await input.fill("zzzzz"); await page.waitForTimeout(160);
    await expect(page.locator(".sidebar-search__empty-title")).toHaveText("Ничего не найдено");

    // clear X resets query + closes results
    await input.fill("касс"); await page.waitForTimeout(120);
    await expect(page.locator(".sidebar-search__clear")).toBeVisible();
    await page.locator(".sidebar-search__clear").click();
    await page.waitForTimeout(100);
    expect(await input.inputValue()).toBe("");
    expect(await page.locator(".sidebar-search__results").count()).toBe(0);

    // keyboard: type child → ArrowDown + Enter navigates + opens correct parent + closes
    await input.fill("касс"); await page.waitForTimeout(160);
    await input.press("Enter");
    await page.waitForTimeout(500);
    expect(page.url()).toContain("/users/cashier");
    const openParent = await page.locator(".sidebar-nav-item.has-submenu.is-open .sidebar-link--button").first().innerText();
    expect(openParent).toContain("Сотрудники");
    expect(await page.locator(".sidebar-search__results").count()).toBe(0); // closed
    expect(await input.inputValue()).toBe(""); // query cleared

    // Escape clears an open query
    await input.fill("мен"); await page.waitForTimeout(140);
    await input.press("Escape");
    await page.waitForTimeout(100);
    expect(await input.inputValue()).toBe("");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("right summary cards match top KPI hover motion (lift + shadow, no jitter)", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    const read = (el) => { const c = getComputedStyle(el); return { transform: c.transform, shadow: c.boxShadow, dur: c.transitionDuration }; };

    // KPI hover reference
    const kpi = page.locator(".premium-kpi").first();
    await kpi.hover(); await page.waitForTimeout(300);
    const kpiHover = await kpi.evaluate(read);
    await page.mouse.move(5, 5); await page.waitForTimeout(200);
    expect(kpiHover.transform).toBe("matrix(1, 0, 0, 1, 0, -2)"); // KPI lifts -2px

    // summary resting captured, then hover
    const sum = page.locator(".warehouse-summary-item").first();
    const rest = await sum.evaluate(read);
    expect(rest.transform).toBe("none"); // resting unchanged (no lift at rest)
    await sum.hover(); await page.waitForTimeout(300);
    const hov = await sum.evaluate(read);
    // motion matches KPI: same lift, same shadow, same transition duration
    expect(hov.transform).toBe(kpiHover.transform);
    expect(hov.shadow).toBe(kpiHover.shadow);
    expect(hov.dur).toBe(kpiHover.dur);

    // no sibling/layout jitter: a neighbor card does not move while one is hovered
    const jitter = await page.evaluate(() => {
      const cards = document.querySelectorAll(".warehouse-summary-item");
      const b = cards[1].getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y) };
    });
    await page.locator(".warehouse-summary-item").nth(0).hover();
    await page.waitForTimeout(250);
    const jitter2 = await page.evaluate(() => {
      const cards = document.querySelectorAll(".warehouse-summary-item");
      const b = cards[1].getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y) };
    });
    expect(jitter2).toEqual(jitter);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("topbar is ~15% shorter on desktop; controls centered, no gap/overflow", async () => {
    // desktop compact bucket (1025–1440): 64 → 54 (~15.6%)
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    const h1280 = await page.locator(".dashboard-topbar").evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(h1280).toBe(54);
    // large bucket (≥1440): 86 → 73 (~15%)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    const h1440 = await page.locator(".dashboard-topbar").evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(h1440).toBe(73);
    const reduction = (86 - h1440) / 86;
    expect(reduction).toBeGreaterThanOrEqual(0.13);
    expect(reduction).toBeLessThanOrEqual(0.17);

    // controls vertically centered, clean topbar→content junction, no overflow
    const probe = await page.evaluate(() => {
      const t = document.querySelector(".dashboard-topbar").getBoundingClientRect();
      const c = document.querySelector(".dashboard-content").getBoundingClientRect();
      const mid = t.top + t.height / 2;
      const bell = document.querySelector(".topbar-notification").getBoundingClientRect();
      return { gap: Math.round(c.top - t.bottom), bellOff: Math.round((bell.top + bell.height / 2) - mid),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(Math.abs(probe.gap)).toBeLessThanOrEqual(1);
    expect(Math.abs(probe.bellOff)).toBeLessThanOrEqual(1);
    expect(probe.overflow).toBeLessThanOrEqual(1);

    // mobile bar unchanged (stays 54, not mechanically shrunk)
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/");
    await page.locator(".dashboard-shell").waitFor({ state: "visible" });
    const hMobile = await page.locator(".dashboard-topbar").evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(hMobile).toBe(54);

    // sidebar width + balance geometry untouched
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".premium-kpi").first().waitFor({ state: "visible" });
    expect(await page.locator(".dashboard-sidebar").evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(280);
    await expect(page.locator(".topbar-pay-button")).toHaveCSS("border-top-left-radius", "12px");
    await expect(page.locator(".topbar-balance-amount")).toHaveCSS("border-right-width", "0px");
  });

  test("sidebar respects prefers-reduced-motion", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/reports/z-report");
    await page.locator(".sidebar-submenu").first().waitFor({ state: "visible" });
    const dur = await page.locator(".sidebar-submenu__link").first().evaluate((el) => getComputedStyle(el).transitionDuration);
    // near-instant when reduced motion is requested
    expect(dur.split(",").every((d) => parseFloat(d) <= 0.02)).toBe(true);
    await page.emulateMedia({ reducedMotion: null });
  });
});
