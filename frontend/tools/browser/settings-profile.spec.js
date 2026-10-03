import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Real-browser oracle for Settings → Настройка профиля V1 (4 секции).
// Runs against the review runtime on :5281 and route-mocks auth/shell +
// the company profile, so it needs no backend writes and touches no database.
// Screenshots land outside the repository.
test.use({ baseURL: "http://127.0.0.1:5281" });

const SHOTS = "C:\\Users\\zahongir\\Marjon-visual\\profile-settings";

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
  slug: "marjon",
  name: "MARJON",
  country_code: null,
  timezone: "Asia/Tashkent",
  currency: "UZS",
  is_active: true,
  waiter_service_percent: 0,
  day_start_hour: 5,
  address: "Ташкент",
  phone: "+998901234567",
  inn: "123456789",
  logo: null,
  vat_rate: 12,
  service_fee: 0,
};

let page;
let failNextPatch = false;

test.describe("Settings → Настройка профиля V1 — 4 секции", () => {
  test.beforeAll(async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      localStorage.setItem("access_token", "profile-visual-fixture");
      localStorage.setItem("refresh_token", "profile-visual-fixture");
    });
    await page.route(/\/api\/v1\/auth\/me(\?|$)/, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE_USER),
    }));
    await page.route(/\/api\/v1\/companies\/me(\?|$)/, (route) => {
      if (route.request().method() === "PATCH") {
        if (failNextPatch) {
          failNextPatch = false;
          return route.fulfill({
            status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Ошибка сервера" }),
          });
        }
        const body = route.request().postDataJSON() || {};
        return route.fulfill({
          status: 200, contentType: "application/json", body: JSON.stringify({ ...FIXTURE_COMPANY, ...body }),
        });
      }
      return route.fulfill({
        status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE_COMPANY),
      });
    });
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
    await page.locator(".company-profile-page").waitFor({ state: "visible", timeout: 30000 });
    await page.locator(".company-profile-nav button").first().waitFor({ state: "visible", timeout: 30000 });
  }

  async function navLabels() {
    return page.locator(".company-profile-nav button span").allInnerTexts();
  }

  async function noPageOverflow() {
    return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  }

  test("MENU — ровно 4 секции, удалённые отсутствуют", async () => {
    await open();
    expect((await navLabels()).map((t) => t.trim())).toEqual([
      "Основные данные",
      "Основные настройки",
      "Другие настройки",
      "Настройка профиля",
    ]);
  });

  test("BASIC — точные поля, без лишних", async () => {
    await open();
    const content = page.locator(".company-profile-content");
    await expect(content.getByText("Лого компании")).toBeVisible();
    await expect(content.getByText("Лого профиля")).toBeVisible();
    await expect(content.getByPlaceholder("Название компании")).toBeVisible();
    await expect(content.getByPlaceholder("Введите адрес")).toBeVisible();
    await expect(content.getByPlaceholder("123456789")).toBeVisible();
    await expect(content.getByRole("button", { name: /Очистить все отчеты/ })).toBeVisible();
    await expect(content.getByText("Телефон", { exact: true })).toHaveCount(0);
    await expect(content.getByText("Валюта", { exact: true })).toHaveCount(0);
  });

  test("MAIN — 7 полей, каждая секция со своим контентом", async () => {
    await open();
    await page.locator(".company-profile-nav button", { hasText: "Основные настройки" }).click();
    const content = page.locator(".company-profile-content");
    for (const label of [
      "Начало дня",
      "Пароль для удаления блюд",
      "Пароль для удаления блюд после пречека",
      "Пароль при смене официанта",
      "Пароль для восстановления заказа",
      "Цена доставки",
      "НДС с сервису (%)",
    ]) {
      await expect(content.getByText(label, { exact: true }).first()).toBeVisible();
    }
    // Контент basic больше не виден — плейсхолдер убран.
    await expect(content.getByText("Лого компании")).toHaveCount(0);
    await expect(content.getByPlaceholder("Название компании")).toHaveCount(0);
  });

  test("OTHER — 3 типа заказа, без Telegram и нижних параметров", async () => {
    await open();
    await page.locator(".company-profile-nav button", { hasText: "Другие настройки" }).click();
    const content = page.locator(".company-profile-content");
    await expect(content.getByText("На стол")).toBeVisible();
    await expect(content.getByText("На вынос")).toBeVisible();
    await expect(content.getByText("Доставка")).toBeVisible();
    await expect(content.getByText(/Telegram/i)).toHaveCount(0);
    await expect(content.getByText("Другие параметры")).toHaveCount(0);
  });

  test("PROFILE — два поля пароля и Сохранить, mismatch без мутаций", async () => {
    await open();
    await page.locator(".company-profile-nav button", { hasText: "Настройка профиля" }).click();
    const content = page.locator(".company-profile-content");
    await expect(content.getByPlaceholder("Введите новый пароль")).toBeVisible();
    await expect(content.getByPlaceholder("Повторите новый пароль")).toBeVisible();
    await content.getByPlaceholder("Введите новый пароль").fill("Password1");
    await content.getByPlaceholder("Повторите новый пароль").fill("Password2");
    await content.getByRole("button", { name: "Сохранить" }).click();
    await expect(content.getByText("Пароли не совпадают.")).toBeVisible();
  });

  test("RESPONSIVE — нет горизонтального переполнения 1440/1024/390", async () => {
    await open();
    expect(await noPageOverflow()).toBe(true);
    await page.screenshot({ path: path.join(SHOTS, "profile-1440.png"), fullPage: true });
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.locator(".company-profile-page")).toBeVisible();
    expect(await noPageOverflow()).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".company-profile-nav button").first()).toBeVisible();
    expect(await noPageOverflow()).toBe(true);
    await page.screenshot({ path: path.join(SHOTS, "profile-390.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("V2 NAV — active как sidebar: turquoise фон, белый текст, без синей кромки", async () => {
    await open();
    const active = page.locator(".company-profile-nav button.is-active");
    await expect(active).toHaveCount(1);
    expect(await active.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(31, 201, 201)");
    expect(await active.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
    expect(await active.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");
    // Только один активный; остальные — нейтральные, не turquoise.
    await page.locator(".company-profile-nav button", { hasText: "Другие настройки" }).click();
    await expect(page.locator(".company-profile-nav button.is-active")).toHaveCount(1);
    const inactive = page.locator(".company-profile-nav button:not(.is-active)").first();
    expect(await inactive.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(31, 201, 201)");
    await inactive.hover();
    await page.waitForTimeout(350);
    expect(await inactive.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(29, 181, 181, 0.08)");
    await expect(page.locator(".company-profile-nav button.is-active")).toHaveCount(1);
  });

  test("V2 IDENTITY — лого профиля первое, имя рядом, truthful initial", async () => {
    await open();
    const profileBlock = page.locator(".company-profile-identity");
    const companyBlock = page.locator(".company-profile-content .company-profile-logo-panel:not(.company-profile-identity)");
    const profileBox = await profileBlock.boundingBox();
    const companyBox = await companyBlock.boundingBox();
    expect(profileBox.y).toBeLessThan(companyBox.y);
    const nameInput = page.getByPlaceholder("Введите имя профиля");
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue("Visual Fixture");
    // V5: заголовок над логотипом; Очистить для профиля скрыта.
    const titleBox = await profileBlock.locator(".company-profile-identity-title").boundingBox();
    const logoBox = await profileBlock.locator(".company-profile-upload").boundingBox();
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(logoBox.y + 1);
    await expect(profileBlock.getByRole("button", { name: "Очистить" })).toHaveCount(0);
    await expect(profileBlock.getByText("Отображается в боковом меню")).toHaveCount(0);
    await expect(profileBlock.getByText("Требуется backend")).toHaveCount(0);
  });

  test("V4 NAV — радиус 22px и мягкий transition без transform", async () => {
    await open();
    const button = page.locator(".company-profile-nav button").first();
    expect(await button.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("22px");
    const transition = await button.evaluate((el) => getComputedStyle(el).transition);
    expect(transition).toContain("background-color");
    expect(transition).toContain("0.18s");
    expect(transition).not.toContain("transform");
    // Hover/active переходы не ломают выбор.
    await button.hover();
    await expect(page.locator(".company-profile-nav button.is-active")).toHaveCount(1);
    expect(await button.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("22px");
  });

  test("V4 IDENTITY — company-блок цел, 390 стекается чисто", async () => {
    await open();
    const companyBlock = page.locator(".company-profile-content .company-profile-logo-panel:not(.company-profile-identity)");
    await expect(companyBlock.getByText("Лого компании")).toBeVisible();
    await expect(companyBlock.locator(".company-profile-upload")).toBeVisible();
    // V5: панель секций #f4f7fc, имя заметно шире прежних ~430px.
    expect(await page.locator(".company-profile-nav").evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe("rgb(244, 247, 252)");
    const nameWidth = await page.getByPlaceholder("Введите имя профиля").evaluate((el) => el.getBoundingClientRect().width);
    expect(nameWidth).toBeGreaterThan(500);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".company-profile-page")).toBeVisible();
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".company-profile-identity-row")).flexDirection === "column",
    );
    const titleBox = await page.locator(".company-profile-identity-title").boundingBox();
    const logoBox = await page.locator(".company-profile-identity .company-profile-upload").boundingBox();
    const rowNameBox = await page.getByPlaceholder("Введите имя профиля").boundingBox();
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(logoBox.y + 1);
    expect(logoBox.y + logoBox.height).toBeLessThanOrEqual(rowNameBox.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.getByPlaceholder("Введите имя профиля")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("V5 NAV — фон #f4f7fc, иконки Lucide-ряда, радиус/анимация intact", async () => {
    await open();
    expect(await page.locator(".company-profile-nav").evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe("rgb(244, 247, 252)");
    const icons = page.locator(".company-profile-nav button svg");
    await expect(icons).toHaveCount(4);
    for (const label of ["Основные данные", "Основные настройки", "Другие настройки", "Настройка профиля"]) {
      await expect(page.locator(".company-profile-nav button", { hasText: label }).locator("svg")).toHaveCount(1);
    }
    expect(await page.locator(".company-profile-nav button").first().evaluate((el) => getComputedStyle(el).borderRadius))
      .toBe("22px");
  });

  test("V2 ACCOUNT — в шапке меню имя, без owner · MARJON", async () => {
    await open();
    await page.locator(".sidebar-user--button").click();
    const head = page.locator(".sidebar-account__head-meta");
    await expect(head.locator("strong")).toHaveText("Visual Fixture");
    await expect(head.locator("span")).toHaveCount(0);
    await expect(head).not.toContainText("MARJON");
  });

  test("V2 HEADER — паритет с Printers: акцент, X, H1 600/28", async () => {
    await open();
    const accent = page.locator(".company-profile-content .settings-accent-bar");
    const accentBox = await accent.boundingBox();
    expect(Math.round(accentBox.width)).toBe(8);
    expect(Math.round(accentBox.height)).toBe(54);
    expect(await accent.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(22, 198, 200)");
    const h1 = page.locator(".company-profile-content .settings-title-group h1");
    expect(await h1.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("600");
    expect(parseFloat(await h1.evaluate((el) => getComputedStyle(el).fontSize))).toBeLessThanOrEqual(28);
    const eyebrowX = await page.locator(".company-profile-content .settings-title-group p").evaluate((el) => el.getBoundingClientRect().x);
    const h1X = await h1.evaluate((el) => el.getBoundingClientRect().x);
    expect(Math.abs(eyebrowX - h1X)).toBeLessThanOrEqual(2);
    // Паритет против accepted Printers-шапки (стандартный settings-header).
    await page.route(/\/api\/v1\/printers(\?|$)/, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }),
    }));
    await page.goto("/settings/printers");
    await page.locator(".settings-page .settings-accent-bar").first().waitFor({ state: "visible", timeout: 30000 });
    const refBox = await page.locator(".settings-page .settings-accent-bar").first().boundingBox();
    expect(Math.round(refBox.width)).toBe(Math.round(accentBox.width));
    expect(Math.abs(refBox.height - accentBox.height)).toBeLessThanOrEqual(2);
  });

  test("V2 BUTTONS — Save teal 22px, Cancel белая 22px, Navy нет", async () => {
    await open();
    const save = page.locator(".company-profile-header .company-profile-save");
    expect(await save.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(31, 201, 201)");
    expect(await save.evaluate((el) => getComputedStyle(el).borderColor)).toBe("rgb(31, 201, 201)");
    expect(await save.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("22px");
    expect(await save.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
    const cancel = page.locator(".company-profile-header .company-profile-cancel");
    expect(await cancel.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
    expect(await cancel.evaluate((el) => getComputedStyle(el).borderColor)).toBe("rgb(31, 201, 201)");
    expect(await cancel.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("22px");
    const saveH = await save.evaluate((el) => el.getBoundingClientRect().height);
    const cancelH = await cancel.evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(saveH - cancelH)).toBeLessThanOrEqual(2);
    // Disabled-состояние остаётся понятным (сохранение Других настроек отключено).
    await page.locator(".company-profile-nav button", { hasText: "Другие настройки" }).click();
    await expect(page.locator(".company-profile-header .company-profile-save")).toBeDisabled();
  });

  test("V3 SUCCESS — 4с виден, к 5с анимированно исчезает из DOM", async () => {
    await open();
    await page.getByPlaceholder("Название компании").fill("MARJON V3");
    await page.locator(".company-profile-header .company-profile-save").click();
    const banner = page.locator(".company-profile-content .company-profile-alert.is-success");
    await expect(banner).toContainText("Профиль сохранён.");
    await expect(banner).not.toHaveClass(/is-leaving/);
    await page.waitForTimeout(4000);
    await expect(banner).toBeVisible();
    await expect(banner).not.toHaveClass(/is-leaving/);
    await expect(banner).toHaveClass(/is-leaving/, { timeout: 3000 });
    await expect(banner).toHaveCount(0, { timeout: 3000 });
  });

  test("V3 SUCCESS — failed Save и Cancel без залипшего успеха", async () => {
    await open();
    failNextPatch = true;
    await page.getByPlaceholder("Название компании").fill("MARJON FAIL");
    await page.locator(".company-profile-header .company-profile-save").click();
    await expect(page.locator(".company-profile-content .company-profile-alert.is-error")).toBeVisible();
    await expect(page.locator(".company-profile-content .company-profile-alert.is-success")).toHaveCount(0);
    await page.getByPlaceholder("Название компании").fill("MARJON V3 OK");
    await page.locator(".company-profile-header .company-profile-save").click();
    await expect(page.locator(".company-profile-content .company-profile-alert.is-success")).toBeVisible();
    await page.locator(".company-profile-header .company-profile-cancel").click();
    await expect(page.locator(".company-profile-content .company-profile-alert.is-success")).toHaveCount(0);
  });

  test("V3 NAME — грязное имя честно помечается, sidebar и reload держат сервер", async () => {
    await open();
    await page.getByPlaceholder("Введите имя профиля").fill("Жахонгир Бахтиёров");
    await page.getByPlaceholder("Название компании").fill("MARJON");
    await page.locator(".company-profile-header .company-profile-save").click();
    await expect(page.locator(".company-profile-content .company-profile-alert.is-success"))
      .toContainText("Имя профиля требует backend и не сохранено");
    await page.locator(".sidebar-user--button").click();
    await expect(page.locator(".sidebar-account__head-meta strong")).toHaveText("Visual Fixture");
    await page.keyboard.press("Escape");
    await page.reload();
    await page.locator(".company-profile-page").waitFor({ state: "visible", timeout: 30000 });
    await expect(page.getByPlaceholder("Введите имя профиля")).toHaveValue("Visual Fixture");
  });

  test("V3 PHOTO — замена работает, sidebar аватар синкается, имя не мешает", async () => {
    await open();
    await page.locator(".company-profile-identity input[type='file']").setInputFiles({
      name: "avatar.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    await expect(page.locator(".company-profile-identity img[alt='Лого профиля']"))
      .toHaveAttribute("src", /^data:image\/png/);
    await page.getByPlaceholder("Введите имя профиля").fill("Жахонгир");
    await page.locator(".company-profile-header .company-profile-save").click();
    await expect(page.locator(".company-profile-content .company-profile-alert.is-success")).toBeVisible();
    await expect(page.locator(".sidebar-user-logo")).toHaveAttribute("src", /^data:image\/png/);
  });
});
