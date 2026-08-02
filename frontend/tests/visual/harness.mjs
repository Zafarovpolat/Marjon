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

/**
 * Экраны админки: [имя кадра, группа меню, пункт внутри группы].
 *
 * Раньше здесь были только названия ГРУПП — «Организации», «Склад» и так далее.
 * Но клик по группе её лишь раскрывает, никуда не переходя, поэтому все шесть
 * кадров оказывались одной и той же страницей дашборда. Это вскрылось на
 * сравнении картинок: шесть «разных» экранов разошлись на в точности одинаковое
 * число пикселей. Админка при этом фактически не проверялась вовсе — а в ней
 * половина всех стилей проекта.
 *
 * Теперь указывается конкретный пункт, и кадры действительно разные. Набор
 * подобран по самым крупным экранам админки.
 */
const ADMIN_SECTIONS = [
  ["admin-dashboard", null, null],
  ["admin-org-list", "Организации", "Организация"],
  ["admin-storage-income", "Склад", "Приход товаров"],
  ["admin-storage-journal", "Склад", "Журнал приходов"],
  ["admin-storage-inventory", "Склад", "Инвентаризация"],
  ["admin-nom-product", "Номенклатура", "Продукт"],
  ["admin-nom-orders", "Номенклатура", "Заказы"],
  ["admin-handbook-countries", "Справочник", "Страны"],
  ["admin-service-employees", "Услуга", "Сотрудники"],
  ["admin-bank-transactions", "Банк", "Транзакции банка"],
  ["admin-finance-operations", "Финансы", "Денежные операции"],
  ["admin-finance-history", "Финансы", "История изменений"],
];

/**
 * Переход к экрану админки. Возвращает false, если пункт не найден, — тогда
 * кадр не снимается, и недобор кадров валит прогон. Молча пропустить экран
 * нельзя: сравнение отчиталось бы «расхождений нет», ничего не сравнив.
 */
export async function gotoAdminSection(page, baseUrl, group, item) {
  if (group === null) {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
    return true;
  }
  // Названия пунктов присутствуют в разметке НЕСКОЛЬКО раз: у свёрнутого меню
  // есть всплывающее подменю, которое всегда есть в DOM и просто скрыто.
  // Поэтому `.first()` регулярно указывал на невидимую копию, и клик уходил в
  // таймаут. Берём первое ВИДИМОЕ совпадение, перебирая явно.
  const clickVisible = async (text) => {
    const loc = page.getByText(text, { exact: true });
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 8000 });
        return true;
      }
    }
    return false;
  };
  const isShown = async (text) => {
    const loc = page.getByText(text, { exact: true });
    const n = await loc.count();
    for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible().catch(() => false)) return true;
    return false;
  };

  // Группу раскрываем ТОЛЬКО если нужный пункт ещё не виден: клик по уже
  // раскрытой группе её схлопывает. Из-за этого второй подряд экран одной
  // группы («Склад → Приход товаров», затем «Склад → Журнал приходов») не
  // открывался.
  if (!(await isShown(item))) {
    if (!(await clickVisible(group))) return false;
    await page.waitForTimeout(300);   // подменю раскрывается не мгновенно
  }
  return clickVisible(item);
}

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
 * Свойства, которые вообще объявляются в стилях проекта.
 *
 * Раньше здесь брались только свойства, помеченные !important, — и это чуть не
 * обесценило всю проверку. После перевода каскада на @layer флагов не осталось,
 * список стал пустым, а сравнение бодро отчиталось «расхождений 0», сравнив
 * ноль свойств. Отчёт выглядел как успех, хотя не проверялось ничего.
 *
 * Вывод общий: нельзя строить проверку на признаке, который сам является
 * предметом правки. Полный список от этого избавляет и заодно ловит побочные
 * сдвиги вёрстки, до которых важным свойствам дела не было.
 *
 * Считывается из самих стилей, а не выписывается руками: список меняется
 * вместе с кодом, захардкоженный неизбежно отстал бы.
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
    const text = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
    for (const m of text.matchAll(/(?:^|[;{])\s*(-{0,2}[a-zA-Z][-a-zA-Z0-9]*)\s*:/g)) {
      const p = m[1].toLowerCase();
      if (!p.startsWith("--")) props.add(p);
    }
  }
  const out = [...props].sort();
  // Страховка от повторения той же ошибки: пустой или подозрительно короткий
  // список — это сломанный инструмент, а не хорошая новость.
  if (out.length < 50) {
    throw new Error(
      `наблюдаемых свойств всего ${out.length} — так сравнение стилей ничего не проверит; почини сбор списка`
    );
  }
  return out;
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
