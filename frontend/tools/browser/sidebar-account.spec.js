import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Real-browser oracle for the OWNER sidebar account area:
// bottom profile card, popup open animation, popup header, menu audit.
// Runs against :5281 with route mocks (no backend writes, no DB).
test.use({ baseURL: "http://127.0.0.1:5281" });

const SHOTS = "C:\\Users\\zahongir\\Marjon-visual\\sidebar-account";

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

let page;
let mockDisplayName = "Visual Fixture";

test.describe("Sidebar account area refinement", () => {
  test.beforeAll(async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      localStorage.setItem("access_token", "account-visual-fixture");
      localStorage.setItem("refresh_token", "account-visual-fixture");
    });
    await page.route(/\/api\/v1\/auth\/me(\?|$)/, (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ...FIXTURE_USER, full_name: mockDisplayName }),
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
  });

  test.afterAll(async () => { await page.close(); });

  async function open() {
    await page.goto("/settings/profile");
    await page.locator(".dashboard-sidebar").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(400);
  }

  async function openAccountMenu() {
    await page.locator(".sidebar-user--button").click();
    await page.locator(".sidebar-account__menu").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(() => {
      const menu = document.querySelector(".sidebar-account__menu");
      if (!menu) return false;
      return getComputedStyle(menu).opacity === "1";
    }, null, { timeout: 10000 });
  }

  async function noOverflow() {
    return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  }

  test("CARD — нижняя карточка #F4F7FC", async () => {
    await open();
    const card = page.locator(".sidebar-user--button");
    expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(244, 247, 252)");
  });

  test("POPUP — раскрывается как категория: геометрия фиксирована, без scale", async () => {
    await open();
    await openAccountMenu();
    const menu = page.locator(".sidebar-account__menu");
    expect(await menu.evaluate((el) => getComputedStyle(el).animationName)).toBe("owner-account-menu-in");
    // Исходное центрирование: меню отцентровано относительно карточки (±2px).
    const box = await menu.boundingBox();
    const cardBox = await page.locator(".sidebar-user--button").boundingBox();
    const menuCenter = box.x + box.width / 2;
    const cardCenter = cardBox.x + cardBox.width / 2;
    expect(Math.abs(menuCenter - cardCenter)).toBeLessThanOrEqual(2);
    expect(box.y + box.height).toBeLessThanOrEqual(cardBox.y + 12);
    await page.screenshot({ path: path.join(SHOTS, "account-popup-1440.png") });
  });

  test("HEADER — аватар как нижняя карточка: паритет ≤1px, стрелки нет", async () => {
    await open();
    await openAccountMenu();
    const head = page.locator(".sidebar-account__head");
    await expect(head.locator("svg")).toHaveCount(0);
    await expect(head.locator("strong")).toHaveText("Visual Fixture");
    const upper = await page.locator(".sidebar-account__head .sidebar-user__avatar").boundingBox();
    const lower = await page.locator(".sidebar-user--button .sidebar-user__avatar").boundingBox();
    expect(Math.abs(upper.width - lower.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(upper.height - lower.height)).toBeLessThanOrEqual(1);
    const upperStyle = await page.locator(".sidebar-account__head .sidebar-user__avatar").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderRadius, border: cs.borderWidth, shadow: cs.boxShadow, bg: cs.backgroundColor };
    });
    const lowerStyle = await page.locator(".sidebar-user--button .sidebar-user__avatar").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderRadius, border: cs.borderWidth, shadow: cs.boxShadow, bg: cs.backgroundColor };
    });
    expect(upperStyle).toEqual(lowerStyle);
  });

  test("NAME WIDTH — текст занимает всю ширину, раннее обрезание убрано", async () => {
    await open();
    await openAccountMenu();
    const dims = await page.evaluate(() => {
      const r = (sel) => document.querySelector(sel).getBoundingClientRect().toJSON();
      const strong = document.querySelector(".sidebar-account__head-meta strong");
      return {
        menu: r(".sidebar-account__menu"),
        head: r(".sidebar-account__head"),
        meta: r(".sidebar-account__head-meta"),
        strong: r(".sidebar-account__head-meta strong"),
        scroll: strong.scrollWidth,
        text: strong.textContent,
      };
    });
    // Мета заканчивается у правого края шапки (только её padding), без 24px-трека стрелки.
    expect(dims.head.x + dims.head.width - (dims.meta.x + dims.meta.width)).toBeLessThanOrEqual(2);
    // Короткое значение влезает целиком, без ellipsis.
    expect(dims.scroll).toBeLessThanOrEqual(dims.strong.width + 1);
    expect(dims.text).toBe("Visual Fixture");
  });

  test("NAME WIDTH — proof values: email, имя, длинное значение", async () => {
    async function measureName(displayName) {
      mockDisplayName = displayName;
      await page.reload();
      await page.locator(".dashboard-sidebar").waitFor({ state: "visible", timeout: 30000 });
      await page.waitForTimeout(400);
      await page.locator(".sidebar-user--button").click();
      await page.locator(".sidebar-account__menu").waitFor({ state: "visible", timeout: 10000 });
      return page.evaluate(() => {
        const strong = document.querySelector(".sidebar-account__head-meta strong");
        const head = document.querySelector(".sidebar-account__head");
        const hr = head.getBoundingClientRect();
        const sr = strong.getBoundingClientRect();
        const cs = getComputedStyle(strong);
        return {
          text: strong.textContent,
          fits: strong.scrollWidth <= sr.width + 1,
          truncated: strong.scrollWidth > sr.width + 1,
          ellipsis: cs.textOverflow,
          withinHead: sr.x + sr.width <= hr.x + hr.width + 1,
        };
      });
    }
    // Фикстура без full_name: fallback показывает email (26 символов legitimately
    // обрезается у реальной границы — безопасно, без вылезания).
    let m = await measureName(null);
    expect(m.text).toBe("visual-fixture@marjon.local");
    expect(m.withinHead).toBe(true);
    expect(m.ellipsis).toBe("ellipsis");
    m = await measureName("admin@marjon.uz");
    expect(m.fits).toBe(true);
    m = await measureName("Жахонгир Бахтиёров");
    expect(m.fits).toBe(true);
    // Заведомо длинное значение: безопасный ellipsis у реальной границы.
    m = await measureName("Жахонгир Бахтиёров Администратор Ресторана Маржон Плюс");
    expect(m.truncated).toBe(true);
    expect(m.ellipsis).toBe("ellipsis");
    expect(m.withinHead).toBe(true);
    mockDisplayName = "Visual Fixture";
  });

  test("MENU — профиль + поддержка + магазин + выход; отзывов нет", async () => {
    await open();
    await openAccountMenu();
    const labels = await page.locator(".sidebar-account__menu .sidebar-account__item span").allInnerTexts();
    expect(labels.map((t) => t.trim())).toEqual(["Настройка профиля", "Тех. поддержка", "Магазин", "Выйти"]);
    await expect(page.locator(".sidebar-account__menu").getByText("Отзывы")).toHaveCount(0);
  });

  test("BRAND — лого больше без border, MARJON жирнее", async () => {
    await open();
    const mark = page.locator(".dashboard-sidebar:not(.is-collapsed) .brand-mark");
    await expect.poll(async () => mark.evaluate((el) => getComputedStyle(el).width), { timeout: 10000 }).toBe("52px");
    await expect.poll(async () => mark.evaluate((el) => getComputedStyle(el).height), { timeout: 10000 }).toBe("52px");
    const logo = page.locator(".dashboard-sidebar:not(.is-collapsed) .brand-mark .marjon-logo");
    await expect.poll(async () => logo.evaluate((el) => getComputedStyle(el).width), { timeout: 10000 }).toBe("52px");
    expect(await logo.evaluate((el) => getComputedStyle(el).borderWidth)).toBe("0px");
    expect(await page.locator(".brand-title").evaluate((el) => getComputedStyle(el).fontWeight)).toBe("800");
  });

  test("BRAND STRESS — 20× collapse/expand без border-flash и jerk", async () => {
    await open();
    const toggle = page.locator(".brand-mark--button");
    let worstBorder = "0px";
    let minW = Infinity;
    let maxW = -Infinity;
    for (let i = 0; i < 20; i++) {
      await toggle.click();
      const mid = await page.locator(".dashboard-sidebar .brand-mark").evaluate((el) => {
        const cs = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return { border: cs.borderWidth, shadow: cs.boxShadow, bg: cs.backgroundColor, w: box.width, h: box.height };
      });
      if (mid.border !== "0px") worstBorder = mid.border;
      minW = Math.min(minW, mid.w);
      maxW = Math.max(maxW, mid.w);
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(350);
      const collapsed = await page.locator(".dashboard-sidebar.is-collapsed").count();
      const markBox = await page.locator(".dashboard-sidebar .brand-mark").boundingBox();
      minW = Math.min(minW, markBox.width);
      maxW = Math.max(maxW, markBox.width);
      if (collapsed > 0) {
        // eslint-disable-next-line no-await-in-loop
        await expect(page.locator(".brand-title")).not.toBeVisible();
      } else {
        // eslint-disable-next-line no-await-in-loop
        await expect(page.locator(".brand-title")).toBeVisible();
      }
    }
    expect(worstBorder).toBe("0px");
    expect(maxW - minW).toBeLessThanOrEqual(2);
    // Финал: развёрнуто, лого 52, текст на месте.
    const collapsedEnd = await page.locator(".dashboard-sidebar.is-collapsed").count();
    if (collapsedEnd > 0) await toggle.click();
    await expect(page.locator(".brand-title")).toBeVisible();
    await expect.poll(
      async () => page.locator(".dashboard-sidebar:not(.is-collapsed) .brand-mark").evaluate((el) => getComputedStyle(el).width),
      { timeout: 10000 },
    ).toBe("52px");
  });

  test("RESPONSIVE 1024 — структура меню цела (drawer скрыт layout-приложением)", async () => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.waitForTimeout(400);
    await open();
    expect(await noOverflow()).toBe(true);
    // На этой ширине сайдбар скрыт самим layout (12px), поэтому меню
    // открываем программно и проверяем состав/стили, а не видимость.
    await page.evaluate(() => document.querySelector(".sidebar-user--button").click());
    await page.locator(".sidebar-account__menu").waitFor({ state: "attached", timeout: 10000 });
    const labels = await page.locator(".sidebar-account__menu .sidebar-account__item span").allInnerTexts();
    expect(labels.map((t) => t.trim())).toEqual(["Настройка профиля", "Тех. поддержка", "Магазин", "Выйти"]);
    expect(await page.locator(".sidebar-user--button").evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe("rgb(244, 247, 252)");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("RESPONSIVE 390 — мобильный путь в профиль без overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await open();
    await expect(page.locator(".mobile-bottom-nav__bar")).toBeVisible();
    // Кнопка «Ещё» имеет aria-label «Дополнительные разделы».
    // SupportWidget перекрывает её — клик принудительный (pre-existing overlap, не предмет задачи).
    await page.getByRole("button", { name: "Дополнительные разделы" }).click({ force: true });
    const drawerProfile = page.locator(".mobile-drawer-item--user");
    await expect(drawerProfile).toBeVisible();
    await drawerProfile.click();
    await page.waitForURL("**/settings/profile", { timeout: 15000 });
    expect(await noOverflow()).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});
