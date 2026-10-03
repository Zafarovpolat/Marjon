import { test, expect } from "@playwright/test";

// Clients V1 browser oracle for Settings → Клиенты.
// Runs against the :5278 review runtime with route-mocked auth + counterparties
// + transactions, so it needs no backend data and mutates no database.
// POST/PATCH/DELETE are mocked in-memory: writes never leave the browser.
const BASE_URL = process.env.CLIENTS_BROWSER_BASE_URL || "http://127.0.0.1:5278";
test.use({ baseURL: BASE_URL });

const FIXTURE_USER = {
  id: "u0000000-0000-0000-0000-000000000001",
  email: "visual-fixture@marjon.local",
  full_name: "Visual Fixture",
  role_slugs: ["owner"],
  auth_scope: "app",
  company_id: "c0000000-0000-0000-0000-000000000001",
  company_name: "MARJON",
  is_active: true,
};
const FIXTURE_COMPANY = {
  id: "c0000000-0000-0000-0000-000000000001",
  name: "MARJON", currency: "UZS", timezone: "Asia/Tashkent",
};

const SHOTS = "C:\\Users\\zahongir\\Marjon-visual\\clients";

let page;
let counterparties;
let txns;
let emptyNext = false;

test.describe("Settings → Клиенты — counterparty directory V1", () => {
  test.beforeAll(async ({ browser }) => {
    const fs = await import("node:fs");
    fs.mkdirSync(SHOTS, { recursive: true });
    counterparties = [
      { id: "c1", full_name: "Real Client", phone: "+998901112233", balance: 15000, type: "client" },
      { id: "s1", full_name: "Real Supplier", phone: "+998902223344", balance: 0, type: "supplier" },
      { id: "s2", full_name: "Second Supplier", phone: "+998903334455", balance: 0, type: "supplier" },
      { id: "e2", full_name: "Second Employee", phone: "+998904445566", balance: 0, type: "employee" },
      { id: "o2", full_name: "Second Other", phone: "+998905556677", balance: 0, type: "other" },
      { id: "l1", full_name: "Legacy Row", phone: "23423423423", balance: 0, type: "other" },
    ];
    txns = [
      { id: "t1", date: "2026-09-20T10:00:00", amount: 100000, direction: "income", comment: "Оплата" },
      { id: "t2", date: "2026-09-21T09:00:00", amount: 40000, direction: "expense", comment: "" },
    ];
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      localStorage.setItem("access_token", "clients-visual-fixture");
      localStorage.setItem("refresh_token", "clients-visual-fixture");
    });
    await page.route(/\/api\/v1\/auth\/me(\?|$)/, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE_USER),
    }));
    await page.route(/\/api\/v1\/companies\/me(\?|$)/, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE_COMPANY),
    }));
    await page.route(/\/api\/v1\/billing\/balance(\?|$)/, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ balance: 0 }),
    }));
    await page.route(/cbu\.uz\//, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify([{ Rate: "11801.2" }]),
    }));
    await page.route(/\/api\/v1\/crm\/counterparties(\?|$)/, async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        if (emptyNext) {
          emptyNext = false;
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: counterparties }) });
      }
      if (req.method() === "POST") {
        const body = JSON.parse(req.postData() || "{}");
        const created = { ...body, id: "new-1", name: body.full_name };
        counterparties.unshift(created);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
      }
      return route.fulfill({ status: 405, contentType: "application/json", body: "{}" });
    });
    await page.route(/\/api\/v1\/crm\/counterparties\/.+/, async (route) => {
      const req = route.request();
      const id = req.url().split("/").pop().split("?")[0];
      if (req.method() === "PATCH") {
        const body = JSON.parse(req.postData() || "{}");
        const ix = counterparties.findIndex((c) => c.id === id);
        counterparties[ix] = { ...counterparties[ix], ...body, name: body.full_name || counterparties[ix].full_name };
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(counterparties[ix]) });
      }
      if (req.method() === "DELETE") {
        counterparties = counterparties.filter((c) => c.id !== id);
        return route.fulfill({ status: 204, contentType: "application/json", body: "" });
      }
      return route.fulfill({ status: 405, contentType: "application/json", body: "{}" });
    });
    await page.route(/\/api\/v1\/finance\/counterparties\/.+\/transactions(\?|$)/, (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ items: txns, total: txns.length, page: 1, size: 200, pages: 1 }),
    }));
  });

  test.afterAll(async () => { await page.close(); });

  async function open() {
    await page.goto("/settings/clients");
    await page.locator(".settings-page").waitFor({ state: "visible", timeout: 30000 });
    await expect(page.getByRole("heading", { name: "Клиенты" })).toBeVisible();
  }

  test("loads real rows, heading, tabs; no demo data", async () => {
    await open();
    await expect(page.getByText("Настройки").first()).toBeVisible();
    await expect(page.getByText("Real Client")).toBeVisible();
    for (const fake of ["abduraxim", "Sardorga", "XIYNOVI", "Bozor"]) {
      await expect(page.getByText(fake, { exact: true })).toHaveCount(0);
    }
  });

  test("table columns: name, phone, status, history, actions; status neutral", async () => {
    await open();
    const headers = await page.locator("thead th").allTextContents();
    expect(headers.map((h) => h.trim())).toEqual([
      "ФИО", "Номер телефона", "Статус", "История транзакций", "Действия",
    ]);
    const row = page.locator("tbody tr", { hasText: "Real Client" });
    const cells = await row.locator("td").allTextContents();
    expect(cells[2].trim()).toBe("—");
    const actionsBox = await row.locator("td").last().boundingBox();
    const tableBox = await page.locator(".staff-table").boundingBox();
    expect(tableBox.x + tableBox.width - (actionsBox.x + actionsBox.width)).toBeLessThanOrEqual(32);
    await page.screenshot({ path: `${SHOTS}/A-list-1440.png`, fullPage: false });
  });

  test("empty list shows exactly Список пуст", async () => {
    emptyNext = true;
    await open();
    await expect(page.getByText("Список пуст", { exact: true })).toBeVisible();
  });

  test("tab switching filters by type", async () => {
    await open();
    await page.getByRole("button", { name: "Поставщики" }).click();
    await expect(page.getByText("Real Supplier")).toBeVisible();
    await expect(page.getByText("Real Client")).toHaveCount(0);
    await page.getByRole("button", { name: "Клиенты" }).click();
    await expect(page.getByText("Real Client")).toBeVisible();
  });

  test("search filters by name and phone", async () => {
    await open();
    await page.getByRole("searchbox", { name: "Поиск" }).fill("supplier");
    await expect(page.getByText("Real Client")).toHaveCount(0);
    await page.getByRole("button", { name: "Поставщики" }).click();
    await expect(page.getByText("Real Supplier")).toBeVisible();
  });

  test("add modal opens centered (Payment Methods primitive), validates name, saves normalized phone", async () => {
    await open();
    await page.getByRole("button", { name: /Добавить/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/ФИО/)).toBeVisible();
    // Centered modal shell, not a right drawer.
    await expect(page.locator(".settings-drawer.settings-modal-overlay")).toBeVisible();
    const geometry = await page.evaluate(() => {
      const modal = document.querySelector("form.settings-modal");
      const b = modal.getBoundingClientRect();
      return {
        w: Math.round(b.width), h: Math.round(b.height),
        cx: Math.round(b.left + b.width / 2), cy: Math.round(b.top + b.height / 2),
        vw: window.innerWidth, vh: window.innerHeight,
      };
    });
    expect(geometry.w).toBeGreaterThanOrEqual(480);
    expect(geometry.w).toBeLessThanOrEqual(560);
    expect(Math.abs(geometry.cx - geometry.vw / 2)).toBeLessThanOrEqual(8);
    expect(Math.abs(geometry.cy - geometry.vh / 2)).toBeLessThanOrEqual(60);
    // No Type dropdown (active tab owns the type); Staff split phone visible.
    await expect(dialog.locator(".staff-phone-field.staff-phone-field--split")).toBeVisible();
    await expect(dialog.locator(".staff-phone-country.staff-phone-country--pill")).toBeVisible();
    await expect(dialog.getByText("Тип контрагента")).toHaveCount(0);
    // STATUS_UI_PRESENT (local-only): Marjon custom select under phone.
    expect(await dialog.locator("select").count()).toBe(0);
    const statusTrigger = dialog.getByRole("combobox", { name: "Статус" });
    await expect(statusTrigger).toBeVisible();
    await expect(statusTrigger).toHaveText("Активный");
    await statusTrigger.click();
    const statusMenu = page.locator("body .settings-select__menu");
    await expect(statusMenu).toBeVisible();
    expect(await statusMenu.locator('[role="option"]').allTextContents()).toEqual(["Активный", "Не активный", "Не подтвержденный"]);
    await page.keyboard.press("Escape");
    await expect(statusMenu).toHaveCount(0);
    await expect(dialog).toBeVisible();
    // Phone country popover: fixed overlay, fully inside viewport, own scroll.
    const modalBoxBefore = await dialog.boundingBox();
    await dialog.locator(".staff-phone-country--pill").click();
    const menu = page.locator("body > .staff-phone-country-menu");
    await expect(menu).toBeVisible();
    const menuProof = await menu.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        w: Math.round(b.width),
        inView: b.top >= 0 && b.left >= 0 && b.bottom <= window.innerHeight + 1 && b.right <= window.innerWidth + 1,
        scrollable: el.scrollHeight > el.clientHeight + 1,
        maxH: s.maxHeight, overflowY: s.overflowY,
        count: el.querySelectorAll("button").length,
      };
    });
    expect(menuProof.count).toBe(8);
    expect(menuProof.inView).toBe(true);
    expect(menuProof.maxH).toBe("250px");
    expect(menuProof.overflowY).toBe("auto");
    // Last country reachable through the menu's own scroll.
    await menu.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(menu.getByRole("option", { name: /Америка/ })).toBeVisible();
    await menu.evaluate((el) => el.scrollTo(0, 0));
    // Modal stays stable: same height, no new internal scroll, footer visible.
    const modalBoxAfter = await dialog.boundingBox();
    expect(Math.abs(modalBoxAfter.height - modalBoxBefore.height)).toBeLessThanOrEqual(2);
    await expect(dialog.getByRole("button", { name: "Сохранить" })).toBeVisible();
    // Turkey updates the code; Escape closes menu-only; outside closes too.
    await menu.getByRole("option", { name: /Турция/ }).click();
    await expect(menu).toHaveCount(0);
    await expect(dialog.locator(".staff-phone-country--pill")).toContainText("+90");
    await dialog.locator(".staff-phone-country--pill").click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await dialog.locator(".staff-phone-country--pill").click();
    await expect(menu).toBeVisible();
    await dialog.locator(".settings-form__header h2").click();
    await expect(menu).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await dialog.locator(".staff-phone-country--pill").click();
    await menu.getByRole("option", { name: /Узбекистан/ }).click();
    await dialog.getByLabel("Номер телефона без кода страны").fill("901234567");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/ФИО/).fill("Browser Guy");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Browser Guy")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/B-list-after-add-1440.png`, fullPage: false });
  });

  test("V17 table deltas: UZ phone mask, centered status, ФИО header", async () => {
    await open();
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(400);
    // Exact visible headers (Клиенты tab has c1 + Browser Guy from add test).
    const headers = await page.locator(".settings-page thead th").allTextContents();
    expect(headers.map((h) => h.trim())).toEqual(["ФИО", "Номер телефона", "Статус", "История транзакций", "Действия"]);
    expect(await page.getByText("ФИО / Название").count()).toBe(0);
    // UZ mask display; raw canonical digits never shown as text.
    await expect(page.getByText("+998 (90) 111-22-33")).toBeVisible();
    expect(await page.getByText("+998901112233", { exact: true }).count()).toBe(0);
    // STATUS center: header X vs every row cell X, delta <= 2px.
    const centers = await page.evaluate(() => {
      const cx = (el) => { const b = el.getBoundingClientRect(); return b.x + b.width / 2; };
      return {
        h: cx(document.querySelector(".settings-page thead th:nth-child(3)")),
        rows: [...document.querySelectorAll(".settings-page tbody tr td:nth-child(3)")].map(cx),
      };
    });
    expect(centers.rows.length).toBeGreaterThanOrEqual(2);
    for (const x of centers.rows) expect(Math.abs(x - centers.h)).toBeLessThanOrEqual(2);
    // Title refinement: weight 600 + slightly smaller (28px @1440).
    const titleStyle = await page.evaluate(() => {
      const h1 = document.querySelector(".clients-directory-page .settings-title-group h1");
      const s = getComputedStyle(h1);
      return { weight: s.fontWeight, size: s.fontSize };
    });
    expect(titleStyle.weight).toBe("600");
    expect(titleStyle.size).toBe("28px");
    // Legacy dirty data untouched; raw-digit search still works.
    const tabsBar = page.locator(".staff-header__actions .staff-tabs");
    await tabsBar.getByRole("button", { name: "Другие" }).click();
    await expect(page.getByText("23423423423", { exact: true })).toBeVisible();
    await tabsBar.getByRole("button", { name: "Клиенты" }).click();
    await page.getByRole("searchbox", { name: "Поиск" }).fill("901112233");
    await expect(page.getByText("+998 (90) 111-22-33")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/F-table-v17-1440.png`, fullPage: false });
  });

  test("edit opens prefilled (Staff phone included) and patches", async () => {
    await open();
    const row = page.locator("tbody tr", { hasText: "Real Client" });
    await row.getByRole("button", { name: "Редактировать" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/ФИО/)).toHaveValue("Real Client");
    // Staff split phone prefills local digits with Staff masking.
    await expect(dialog.locator(".staff-phone-country--pill")).toContainText("+998");
    await expect(dialog.getByLabel("Номер телефона без кода страны")).toHaveValue("(90) 111-22-33");
    // Edit modal: same portaled country popover + custom status select.
    await dialog.locator(".staff-phone-country--pill").click();
    const editMenu = page.locator("body > .staff-phone-country-menu");
    await expect(editMenu).toBeVisible();
    expect(await editMenu.locator("button").count()).toBe(8);
    await page.keyboard.press("Escape");
    await expect(editMenu).toHaveCount(0);
    const editStatus = dialog.getByRole("combobox", { name: "Статус" });
    await expect(editStatus).toBeVisible();
    await expect(editStatus).toHaveText("Активный");
    await editStatus.click();
    const editStatusMenu = page.locator("body .settings-select__menu");
    await expect(editStatusMenu).toBeVisible();
    expect(await editStatusMenu.locator('[role="option"]').allTextContents()).toEqual(["Активный", "Не активный", "Не подтвержденный"]);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `${SHOTS}/C-edit-1440.png`, fullPage: false });
    await dialog.getByLabel(/ФИО/).fill("Real Client Jr");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Real Client Jr")).toBeVisible();
  });

  test("delete requires confirmation", async () => {
    await open();
    const row = page.locator("tbody tr", { hasText: "Real Supplier" });
    await page.getByRole("button", { name: "Поставщики" }).click();
    await row.getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByText("Удалить контрагента?")).toBeVisible();
    await page.getByRole("button", { name: "Да", exact: true }).click();
    await expect(page.getByText("Real Supplier")).toHaveCount(0);
  });

  test("history: same shell, no local back, topbar Back restores every source tab", async () => {
    await open();
    // Let the shell settle (sidebar rhythm/fonts) before geometry proof.
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(500);
    // Same Settings outer shell geometry as the directory.
    const shell = await page.evaluate(() => {
      const card = document.querySelector(".settings-page .settings-card");
      const cs = getComputedStyle(card);
      const b = card.getBoundingClientRect();
      return { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), radius: cs.borderRadius, padding: cs.padding };
    });
    // V12 accent bar captured on the directory BEFORE opening history.
    const dirBar = await page.evaluate(() => {
      const el = document.querySelector(".settings-page .settings-title-group .settings-accent-bar");
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const card = document.querySelector(".settings-page .settings-card").getBoundingClientRect();
      return { w: b.width, h: b.height, radius: s.borderRadius, bg: s.backgroundColor, dx: b.x - card.x, dy: b.y - card.y };
    });
    const row = page.locator("tbody tr", { hasText: "Real Client" });
    await row.getByRole("button", { name: /История транзакций/ }).click();
    // V11: redundant act/period/balance block removed; header keeps
    // eyebrow + name + phone, then the table region directly.
    await expect(page.locator(".client-statement-page .settings-title-group h1")).toBeVisible();
    await expect(page.getByText("Акт сверки")).toHaveCount(0);
    await expect(page.locator(".client-statement-subhead")).toHaveCount(0);
    await expect(page.locator(".client-statement-balance-line")).toHaveCount(0);
    // Identity row: name + formatted phone share one flex row (same band).
    const identity = await page.evaluate(() => {
      const box = document.querySelector(".client-statement-page .client-statement-identity");
      const h1 = box.querySelector("h1").getBoundingClientRect();
      const ph = box.querySelector(".client-statement-phone").getBoundingClientRect();
      return {
        flex: getComputedStyle(box).display,
        sideBySide: ph.x > h1.x,
        sameBand: ph.y < h1.y + h1.height - 4 && ph.y + ph.height > h1.y + 4,
        phone: box.querySelector(".client-statement-phone").textContent,
      };
    });
    expect(identity.flex).toBe("flex");
    expect(identity.sideBySide).toBe(true);
    expect(identity.sameBand).toBe(true);
    expect(identity.phone).toBe("+998 (90) 111-22-33");
    const historyShell = await page.evaluate(() => {
      const card = document.querySelector(".settings-page .settings-card");
      const cs = getComputedStyle(card);
      const b = card.getBoundingClientRect();
      return { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), radius: cs.borderRadius, padding: cs.padding };
    });
    // Geometry parity with the directory shell (task tolerance included).
    expect(Math.abs(historyShell.left - shell.left)).toBeLessThanOrEqual(3);
    expect(Math.abs(historyShell.right - shell.right)).toBeLessThanOrEqual(3);
    expect(Math.abs(historyShell.top - shell.top)).toBeLessThanOrEqual(3);
    expect(historyShell.radius).toBe(shell.radius);
    expect(historyShell.padding).toBe(shell.padding);
    // V12 accent-line parity: identical geometry AND identical card offset.
    // (dirBar was captured on the directory before opening history.)
    const histBar = await page.evaluate(() => {
      const el = document.querySelector(".settings-page .settings-title-group .settings-accent-bar");
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const card = document.querySelector(".settings-page .settings-card").getBoundingClientRect();
      return { w: b.width, h: b.height, radius: s.borderRadius, bg: s.backgroundColor, dx: b.x - card.x, dy: b.y - card.y };
    });
    expect(histBar.w).toBe(dirBar.w);
    expect(histBar.h).toBe(dirBar.h);
    expect(histBar.radius).toBe(dirBar.radius);
    expect(histBar.bg).toBe(dirBar.bg);
    expect(Math.abs(histBar.dx - dirBar.dx)).toBeLessThanOrEqual(1);
    expect(Math.abs(histBar.dy - dirBar.dy)).toBeLessThanOrEqual(1);
    expect(await page.locator(".client-statement-card").count()).toBe(0);
    // No local back button inside History content (topbar Back owns it).
    expect(await page.locator(".client-statement-page .settings-card").getByRole("button", { name: /Назад/ }).count()).toBe(0);
    expect(await page.locator(".topbar-back-slot button").count()).toBe(1);
    await expect(page.getByText("Оплата")).toBeVisible();
    await expect(page.getByText(/Обороты за период/)).toBeVisible();
    // Toolbar: slider modes left, Reports period picker right, no counterparty filter.
    const modes = await page.locator(".client-statement-right .staff-tabs.staff-tabs--slider").boundingBox();
    const picker = await page.locator(".client-statement-right .report-period-picker").boundingBox();
    expect(modes.x + modes.width).toBeLessThan(picker.x);
    expect(page.locator(".client-statement-right select")).toHaveCount(0);
    // Period button belongs to the toolbar: 22px radius.
    const periodRadius = await page.evaluate(() => getComputedStyle(document.querySelector(".client-statement-right .report-period-button")).borderRadius);
    expect(periodRadius).toContain("22px");
    await page.getByRole("button", { name: "Простой" }).click();
    await expect(page.getByText("20.09.2026")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/D-act-1440.png`, fullPage: false });
    // Topbar Back returns to the list with state preserved (per source tab).
    // NOTE: "Real Supplier" is deleted by the earlier delete test on this
    // shared page, so non-client legs use the surviving Second fixtures.
    // Tabs are scoped to the directory toolbar (Сотрудники also exists in
    // the sidebar nav). Indicator geometry is asserted for every leg.
    // NOTE: the edit test renames "Real Client" → "Real Client Jr" on this
    // shared page (full runs only), so the client leg reads the live name.
    const tabsBar = page.locator(".staff-header__actions .staff-tabs");
    for (const [tab, fixedName] of [["Клиенты", null], ["Поставщики", "Second Supplier"], ["Сотрудники", "Second Employee"], ["Другие", "Second Other"]]) {
      await page.goto("/settings/clients");
      await expect(page.getByRole("heading", { name: "Клиенты" })).toBeVisible();
      // Wait for real rows (not the Загрузка... skeleton) before reading names.
      await page.waitForFunction(() => {
        const first = document.querySelector("tbody tr td");
        return first && !first.textContent.includes("Загрузка");
      });
      if (tab !== "Клиенты") await tabsBar.getByRole("button", { name: tab }).click();
      const name = fixedName ?? (await page.locator("tbody tr td").first().textContent()).trim();
      const tabRow = page.locator("tbody tr", { hasText: name });
      await tabRow.getByRole("button", { name: /История транзакций/ }).click();
      await expect(page.locator(".client-statement-page .settings-title-group h1")).toHaveText(name);
      await page.locator(".topbar-back-slot button").click();
      await expect(page.getByText(name)).toBeVisible();
      await expect(tabsBar.getByRole("button", { name: tab })).toHaveClass(/is-active/);
      // Visual pill restored on the source tab: visible and centered under it
      // (compared against live geometry, never a stale pre-history snapshot).
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(300);
      const pillGeom = await tabsBar.evaluate((bar) => {
        const ind = bar.querySelector(".staff-tabs__indicator");
        const btn = bar.querySelector("button.is-active");
        const ib = ind.getBoundingClientRect();
        const bb = btn.getBoundingClientRect();
        return { iw: ib.width, cx: ib.x + ib.width / 2, bx: bb.x, bw: bb.width };
      });
      expect(pillGeom.iw).toBeGreaterThan(0);
      expect(Math.abs(pillGeom.cx - (pillGeom.bx + pillGeom.bw / 2))).toBeLessThanOrEqual(2);
    }
  });

  test("toolbar order: tabs left of search left of add, one baseline", async () => {
    await open();
    await page.evaluate(() => document.fonts?.ready);
    const pos = await page.evaluate(() => {
      const r = (s) => { const el = document.querySelector(s); const b = el.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height), left: Math.round(b.left), right: Math.round(b.right) }; };
      const add = [...document.querySelectorAll(".staff-header__actions button")].find((b) => b.textContent.includes("Добавить"));
      const ab = add.getBoundingClientRect();
      return {
        tabs: r(".staff-header__actions .staff-tabs"),
        search: r(".staff-header__actions .sidebar-search__field"),
        add: { top: Math.round(ab.top), h: Math.round(ab.height), left: Math.round(ab.left), right: Math.round(ab.right) },
      };
    });
    expect(pos.tabs.right).toBeLessThan(pos.search.left);
    expect(pos.search.right).toBeLessThan(pos.add.left);
    expect(pos.search.left - pos.tabs.right).toBeLessThanOrEqual(14);
    expect(pos.add.left - pos.search.right).toBeLessThanOrEqual(14);
    const cardRight = await page.evaluate(() => {
      const card = document.querySelector(".settings-page .settings-card");
      const cs = getComputedStyle(card);
      const b = card.getBoundingClientRect();
      return Math.round(b.right - parseFloat(cs.paddingRight));
    });
    expect(cardRight - pos.add.right).toBeLessThanOrEqual(8);
    expect(Math.abs(pos.tabs.top - pos.search.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(pos.search.top - pos.add.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(pos.tabs.h - 43)).toBeLessThanOrEqual(2);
    expect(Math.abs(pos.search.h - 42)).toBeLessThanOrEqual(2);
    expect(Math.abs(pos.add.h - 43)).toBeLessThanOrEqual(2);
    expect(pos.search.right - pos.search.left).toBeLessThanOrEqual(218);
    expect(pos.search.right - pos.search.left).toBeGreaterThanOrEqual(214);
  });

  test("mobile layout has no page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open();
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(over).toBe(false);
    // Country popover stays usable on 390: inside viewport, selectable.
    await page.getByRole("button", { name: /Добавить/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator(".staff-phone-country--pill").click();
    const menu = page.locator("body > .staff-phone-country-menu");
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(391);
    await menu.getByRole("option", { name: /Турция/ }).click();
    await expect(dialog.locator(".staff-phone-country--pill")).toContainText("+90");
    await expect(dialog.getByLabel("Статус", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/E-mobile-390.png`, fullPage: false });
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});
