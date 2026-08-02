#!/usr/bin/env node
/**
 * Снимает ВЫЧИСЛЕННЫЕ стили всех элементов на всех экранах.
 *
 * Зачем это сильнее прежних подходов. Модель каскада в important-audit.mjs
 * приходится делать консервативной: она не знает настоящего DOM и при любом
 * сомнении считает правила конкурентами — отсюда потолок в 2–3 % снимаемых
 * флагов. Скриншоты честнее, но видят только то, что попало в кадр, и не
 * различают «сдвинулось на пиксель» и «поменялось свойство у скрытого блока».
 *
 * Здесь ответ даёт сам движок браузера: для каждого элемента берётся
 * getComputedStyle по всем свойствам, которые вообще встречаются в проекте с
 * !important. Снимок делается до и после снятия флагов. Совпало — флаг был не
 * нужен, и это уже не догадка. Не совпало — видно КОНКРЕТНЫЙ элемент и
 * КОНКРЕТНОЕ свойство, а значит понятно, какому правилу флаг вернуть.
 *
 * Ограничение, о котором надо помнить: покрыты только те состояния, что
 * отрисованы на снимаемых экранах. Ховер, фокус, открытые модалки и ветки,
 * зависящие от данных, сюда не попадают.
 *
 *   node dump-styles.mjs --base-url http://127.0.0.1:4173 --api ... --out styles/head.json.gz
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { chromium } from "playwright";
import { ROUTES, ADMIN_SECTIONS, WATCHED_PROPS, login, prepareContext, settle, gotoAdminSection } from "./harness.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg("base-url", "http://127.0.0.1:4173");
const API = arg("api", "http://127.0.0.1:8000/api/v1");
const OUT = path.resolve(arg("out", "styles.json.gz"));

/** Собирается ВНУТРИ страницы: обходит все элементы и снимает нужные свойства. */
function collectInPage(props) {
  const nodes = document.querySelectorAll("*");
  const desc = [];
  const vals = [];
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    // Описатель нужен, чтобы по расхождению было понятно, о каком элементе речь.
    const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 4).join(".");
    desc.push(el.tagName.toLowerCase() + (cls ? "." + cls : ""));
    const cs = getComputedStyle(el);
    const row = [];
    for (const p of props) row.push(cs.getPropertyValue(p));
    vals.push(row.join(""));
  }
  return { desc, vals };
}

async function main() {
  const tokens = await login(API);
  const browser = await chromium.launch({ args: ["--font-render-hinting=none", "--disable-lcd-text"] });
  const ctx = await prepareContext(browser, tokens);
  const page = await ctx.newPage();

  const result = { props: WATCHED_PROPS, screens: {} };

  const grab = async (name) => {
    await settle(page);
    result.screens[name] = await page.evaluate(collectInPage, WATCHED_PROPS);
    console.log(`  ✓ ${name}: ${result.screens[name].vals.length} элементов`);
  };

  for (const [name, route] of ROUTES) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await grab(name);
    } catch (e) { console.log(`  ✗ ${name}: ${String(e).slice(0, 120)}`); }
  }
  for (const [name, group, item] of ADMIN_SECTIONS) {
    try {
      if (!(await gotoAdminSection(page, BASE, group, item))) {
        console.log(`  – ${name}: пункт «${group} → ${item}» не найден`);
        continue;
      }
      await grab(name);
    } catch (e) { console.log(`  ✗ ${name}: ${String(e).slice(0, 120)}`); }
  }

  await browser.close();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // Данные крупные и очень однообразные — жмём, иначе артефакт десятки мегабайт.
  fs.writeFileSync(OUT, zlib.gzipSync(Buffer.from(JSON.stringify(result)), { level: 9 }));
  const n = Object.keys(result.screens).length;
  console.log(`\nснято экранов: ${n}, файл ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} МБ -> ${OUT}`);
  if (!n) { console.error("ни одного экрана — сравнивать нечего"); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
