/**
 * Снимает эталонные скриншоты экранов для сравнения «до/после».
 *
 * Задача — поймать визуальные регрессии при чистке CSS (снятие !important),
 * поэтому важна ПОВТОРЯЕМОСТЬ: любые различия между двумя прогонами, не
 * вызванные правкой стилей, дают ложную тревогу. Отсюда меры ниже:
 *   • фиксированный viewport и deviceScaleFactor;
 *   • анимации/переходы отключены, caret скрыт;
 *   • внешние шрифты (Google Fonts) блокируются — иначе один прогон успевает
 *     их получить, другой нет, и различается вся типографика;
 *   • Date заморожен, Math.random детерминирован — иначе «сегодня» и случайные
 *     идентификаторы плывут между прогонами;
 *   • вход выполняется через API с подстановкой токенов в localStorage,
 *     а не кликами по форме: быстрее и не зависит от вёрстки логина.
 *
 *   node capture.mjs --base-url http://127.0.0.1:4173 --api http://127.0.0.1:8000/api/v1 --out shots/head
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};

const BASE = arg("base-url", "http://127.0.0.1:4173");
const API = arg("api", "http://127.0.0.1:8000/api/v1");
const OUT = path.resolve(arg("out", "shots"));
const PHONE = arg("phone", "+998900078779");
const PASSWORD = arg("password", "102938");
// Дата «замораживается» НА ДАТУ СИДА. backend/seed.py жёстко использует
// TODAY = 2026-07-14, поэтому при любой другой дате все экраны с фильтром по
// дню («Заказы за …», отчёты, журналы) рендерятся пустыми — и сравнение
// перестаёт что-либо проверять на реальных данных. Значение общее для обоих
// прогонов, так что детерминизм сохраняется.
const FREEZE = arg("freeze", "2026-07-14T18:00:00+05:00");

/** Экраны основного приложения. Список намеренно широкий, но не все 88 маршрутов:
 *  берём по одному представителю каждого раздела — этого достаточно, чтобы
 *  заметить сдвиг общей вёрстки, и CI не растягивается на десятки минут. */
const ROUTES = [
  ["login", "/login"],
  ["dashboard", "/"],
  ["orders", "/orders"],
  ["menu", "/menu"],
  ["staff", "/staff"],
  ["analytics", "/analytics"],
  ["finance-transactions", "/finance/transactions"],
  ["finance-income-cat", "/finance/income-categories"],
  ["nomenclature-dishes", "/nomenclature/dishes"],
  ["warehouse-incoming", "/warehouse/incoming"],
  ["warehouse-balance", "/warehouse/balance"],
  ["reports-orders", "/reports/orders"],
  ["reports-z", "/reports/z-report"],
  ["settings", "/settings"],
  ["settings-receipt", "/settings/receipt"],
  ["settings-printers", "/settings/printers"],
  ["users-waiter", "/users/waiter"],
  ["store", "/store"],
];

/** Разделы админки: навигация внутри неё на состоянии, а не на маршрутах,
 *  поэтому переключаемся кликом по пункту меню (по видимому тексту). */
const ADMIN_SECTIONS = [
  ["admin-dashboard", null],
  ["admin-organizations", "Организации"],
  ["admin-storage", "Склад"],
  ["admin-nomenclature", "Номенклатура"],
  ["admin-handbook", "Справочник"],
  ["admin-finance", "Финансы"],
];

const DETERMINISM = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`;

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("в ответе нет access_token");
  return data;
}

async function main() {
  console.log(`время заморожено на: ${FREEZE}`);
  fs.mkdirSync(OUT, { recursive: true });
  const tokens = await login();

  const browser = await chromium.launch({ args: ["--font-render-hinting=none", "--disable-lcd-text"] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "ru-RU",
    timezoneId: "Asia/Tashkent",
    reducedMotion: "reduce",
  });

  // Внешние ресурсы (шрифты/аналитика) — мимо: они делают прогоны несравнимыми.
  await ctx.route("**/*", (route) => {
    const url = route.request().url();
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com|google-analytics|googletagmanager/.test(url)) {
      return route.abort();
    }
    return route.continue();
  });

  await ctx.addInitScript(
    ({ access, refresh, frozenAt }) => {
      try {
        localStorage.setItem("access_token", access);
        localStorage.setItem("refresh_token", refresh || access);
        localStorage.setItem("admin_access_token", access);
        localStorage.setItem("admin_refresh_token", refresh || access);
      } catch { /* приватный режим — не критично */ }
      // Замораживаем время и случайность: иначе «сегодня» и сгенерированные id
      // отличаются между прогонами и дают ложные диффы.
      // Всё в try/catch и через globalThis: если подмена почему-то не пройдёт,
      // страница должна остаться рабочей — иначе сломаем сам прогон.
      try {
        const _D = Date;
        const FIXED = new _D(frozenAt).getTime();
        const Frozen = class extends _D {
          constructor(...a) { super(...(a.length ? a : [FIXED])); }
          static now() { return FIXED; }
        };
        Frozen.UTC = _D.UTC; Frozen.parse = _D.parse;
        globalThis.Date = Frozen;
      } catch { /* оставляем настоящий Date */ }
      try {
        let seed = 42;
        Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      } catch { /* неважно */ }
    },
    { access: tokens.access_token, refresh: tokens.refresh_token, frozenAt: FREEZE }
  );

  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [js] ${String(e).slice(0, 160)}`));

  const settle = async () => {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.addStyleTag({ content: DETERMINISM }).catch(() => {});
    // .ready резолвится FontFaceSet — его нельзя сериализовать через evaluate,
    // поэтому возвращаем булево.
    await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true)).catch(() => {});
    await page.waitForTimeout(500);
  };

  const shoot = async (name) => {
    await settle();
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
    console.log(`  ✓ ${name}`);
  };

  for (const [name, route] of ROUTES) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await shoot(name);
    } catch (e) {
      console.log(`  ✗ ${name}: ${String(e).slice(0, 140)}`);
    }
  }

  for (const [name, label] of ADMIN_SECTIONS) {
    try {
      if (label === null) {
        await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
      } else {
        const item = page.getByText(label, { exact: true }).first();
        if (!(await item.count())) { console.log(`  – ${name}: пункт «${label}» не найден`); continue; }
        await item.click({ timeout: 5000 });
      }
      await shoot(name);
    } catch (e) {
      console.log(`  ✗ ${name}: ${String(e).slice(0, 140)}`);
    }
  }

  await browser.close();
  // Если экран не снялся в ОБОИХ прогонах, сравнение его просто не увидит и
  // отчитается «расхождений нет» — ложное спокойствие. Поэтому недобор кадров
  // сам по себе считается провалом.
  const expected = ROUTES.length + ADMIN_SECTIONS.length;
  const n = fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).length;
  if (n < expected) {
    console.error(`снято ${n} из ${expected} экранов — часть страниц не открылась, проверка неполная`);
    process.exit(1);
  }
  console.log(`снято скриншотов: ${n} -> ${OUT}`);
  if (!n) { console.error("НИ ОДНОГО скриншота — проверка бессмысленна"); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
