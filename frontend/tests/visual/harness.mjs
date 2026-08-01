/**
 * Общая основа для инструментов визуальной проверки.
 *
 * Список экранов, вход в приложение и подготовка браузера живут ЗДЕСЬ, а не
 * копируются в каждый скрипт. В этой работе уже дважды выходило боком, когда
 * одна и та же логика существовала в двух экземплярах: копия отставала от
 * оригинала и начинала врать. Снимок скриншотов и снимок вычисленных стилей
 * обязаны ходить по одним и тем же экранам, иначе их выводы несопоставимы.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  // /store — это алиас: в App.jsx он рендерит тот же <OrdersPage/>, что и
  // /orders, и кадр получался побайтово дублирующим. Берём вместо него экран
  // с другой вёрсткой.
  ["reports-tables", "/reports/tables"],

  // ── Расширение покрытия ───────────────────────────────────────────────────
  // 18 экранов из 78 маршрутов — слишком узкая сеть для правок, меняющих
  // каскад глобально (например @layer): поломка на непокрытом экране прошла бы
  // незамеченной. Ниже добрано по представителю на каждый крупный раздел.
  ["reports-dishes", "/reports/dishes"],
  ["reports-waiters", "/reports/waiters"],
  ["reports-cancelled", "/reports/cancelled-dishes"],
  ["reports-debtors", "/reports/debtors-creditors"],
  ["nomenclature-menu", "/nomenclature/menu"],
  ["nomenclature-raw", "/nomenclature/raw-materials"],
  ["nomenclature-semi", "/nomenclature/semi-finished"],
  ["nomenclature-cats", "/nomenclature/dish-categories"],
  ["finance-operations", "/finance/operations"],
  ["finance-expense-cat", "/finance/expense-categories"],
  ["finance-debtors", "/finance/debtors-creditors"],
  ["warehouse-inventory", "/warehouse/inventory"],
  ["warehouse-writeoff", "/warehouse/write-off"],
  ["warehouse-transfer", "/warehouse/transfer"],
  ["stock-incoming", "/stock-report/incoming"],
  ["stock-stock", "/stock-report/stock"],
  ["users-attendance", "/users/attendance"],
  ["users-cashier", "/users/cashier"],
  // /users/login-history сознательно НЕ снимаем: экран показывает записи о
  // входах, а сам харнесс логинится через API — каждый прогон дописывает
  // строку, таблица сдвигается, и сравнение «front с самим собой» давало
  // ложное расхождение. Наблюдатель меняет наблюдаемое.
  ["settings-place", "/settings/place"],
  ["settings-units", "/settings/units"],
  ["settings-payment", "/settings/payment-methods"],
  ["settings-profile", "/settings/profile"],
  ["settings-clients", "/settings/clients"],
  ["settings-chef-receipt", "/settings/chef-receipt"],
  ["reviews", "/reviews"],
];

export { ROUTES };

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

export { ADMIN_SECTIONS };

const DETERMINISM = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`;

export { DETERMINISM };

/**
 * Свойства, которые вообще встречаются в проекте с !important.
 * Считываются из самих стилей, а не выписываются руками: список меняется вместе
 * с кодом, и захардкоженный вариант неизбежно бы отстал.
 */
export const WATCHED_PROPS = (() => {
  const dir = path.resolve(__dirname, "..", "..", "src");
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".css")) files.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  const props = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/([-a-zA-Z]+)\s*:\s*[^;{}]*?!\s*important/gi)) {
      const p = m[1].toLowerCase();
      if (!p.startsWith("--")) props.add(p);
    }
  }
  return [...props].sort();
})();

export async function login(api, phone = "+998900078779", password = "102938") {
  const res = await fetch(`${api}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  if (!res.ok) throw new Error(`login ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("в ответе нет access_token");
  return data;
}

export async function prepareContext(browser, tokens, frozenAt = "2026-07-14T18:00:00+05:00") {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "ru-RU",
    timezoneId: "Asia/Tashkent",
    reducedMotion: "reduce",
  });
  await ctx.route("**/*", (route) => {
    const url = route.request().url();
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com|google-analytics|googletagmanager/.test(url)) return route.abort();
    return route.continue();
  });
  await ctx.addInitScript(
    ({ access, refresh, at }) => {
      try {
        localStorage.setItem("access_token", access);
        localStorage.setItem("refresh_token", refresh || access);
        localStorage.setItem("admin_access_token", access);
        localStorage.setItem("admin_refresh_token", refresh || access);
      } catch { /* приватный режим */ }
      try {
        const _D = Date;
        const FIXED = new _D(at).getTime();
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
    { access: tokens.access_token, refresh: tokens.refresh_token, at: frozenAt }
  );
  return ctx;
}

export async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.addStyleTag({ content: DETERMINISM }).catch(() => {});
  await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true)).catch(() => {});
  await page.waitForTimeout(500);
}
