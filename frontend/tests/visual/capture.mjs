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
import { ROUTES, ADMIN_SECTIONS, DETERMINISM, login, prepareContext, settle } from "./harness.mjs";

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





async function main() {
  console.log(`время заморожено на: ${FREEZE}`);
  fs.mkdirSync(OUT, { recursive: true });
  const tokens = await login(API);

  const browser = await chromium.launch({ args: ["--font-render-hinting=none", "--disable-lcd-text"] });
  const ctx = await prepareContext(browser, tokens, FREEZE);

  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [js] ${String(e).slice(0, 160)}`));

  // Неудачные ответы API — главная причина, по которой экран рендерит заглушку
  // вместо данных (дашборд грузит 13 эндпоинтов через Promise.all: падает один —
  // пустеет весь экран). Без этого лога причина не видна: скриншот молча
  // показывает «недоступен». Каждый URL печатаем один раз.
  const seenBad = new Set();
  page.on("response", (r) => {
    const s = r.status();
    const u = r.url().replace(/^https?:\/\/[^/]+/, "");
    // Экраны дашборда грузятся Promise.all без .catch у первых шести вызовов —
    // печатаем их статусы всегда, иначе причина пустого экрана не видна.
    const watched = /\/analytics\/|\/pos\/orders|\/hr\/employees|\/inventory\/products/.test(u);
    if (s < 400 && !watched) return;
    const k = `${s} ${u.split("?")[0]}`;
    if (seenBad.has(k)) return;
    seenBad.add(k);
    console.log(`  [api ${s}] ${u.slice(0, 120)}`);
  });
  // Запрос, не получивший ответа (обрыв, блокировка), события response НЕ
  // порождает — без этого слушателя такая ошибка невидима.
  page.on("requestfailed", (r) => {
    const u = r.url().replace(/^https?:\/\/[^/]+/, "");
    if (!u.startsWith("/api/")) return;
    const k = `FAIL ${u.split("?")[0]}`;
    if (seenBad.has(k)) return;
    seenBad.add(k);
    console.log(`  [api ОБРЫВ] ${u.slice(0, 110)} — ${r.failure()?.errorText || "?"}`);
  });


  const shoot = async (name) => {
    await settle(page);
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
