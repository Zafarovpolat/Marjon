#!/usr/bin/env node
/**
 * Перевод каскада с !important на @layer.
 *
 * ЗАЧЕМ. В проекте 11 059 !important. Удалять их поштучно бесполезно: три
 * независимые проверки (модель каскада, скриншоты, вычисленные стили) показали,
 * что оставшиеся флаги несущие — они реально решают споры между правилами.
 * Значит, вопрос не «как удалить», а «чем заменить механизм».
 *
 * ИДЕЯ. Делить объявления НЕ по файлам, а по важности:
 *
 *     @layer base, overrides;
 *     @layer base      { ...все обычные объявления... }
 *     @layer overrides { ...все важные, но уже без флага... }
 *
 * Слой overrides объявлен позже, поэтому бьёт base — ровно ту работу и делал
 * !important. Внутри каждого слоя специфичность и порядок исходные, значит
 * отношения между правилами не меняются.
 *
 * ПОЧЕМУ ЭТО НЕ ТА ЖЕ ПОПЫТКА, ЧТО РАНЬШЕ. Прошлый заход раскладывал по слоям
 * ЦЕЛЫЕ ФАЙЛЫ: тогда низкоспецифичное правило из позднего файла начинало бить
 * высокоспецифичное из раннего — 5228 перестановок. Деление по важности не
 * переставляет ничего, потому что повторяет уже существующую границу.
 *
 * ГДЕ ЭКВИВАЛЕНТНОСТЬ ВСЁ-ТАКИ ЛОМАЕТСЯ (проверено отдельно, оба чисты):
 *   1) inline-стили. Сегодня !important в таблице стилей бьёт style="...",
 *      после перевода — наоборот. В проекте 29 inline-стилей; ни один не спорит
 *      за то же свойство с важным правилом (единственная пара — таблица блюд —
 *      это не спор: JSX задаёт переменную, CSS её читает через var()).
 *   2) Работающие анимации. !important бьёт анимацию, обычное объявление — нет.
 *      Пересечений «тот же селектор анимируется и имеет важное на том же
 *      свойстве» — ноль.
 *
 * ЧТО ОСТАЁТСЯ ВНЕ СЛОЁВ: @charset и @import (обязаны идти в начале файла),
 * а также @keyframes, @font-face, @property и подобные — они не участвуют в
 * каскаде селекторов, и вынос их наружу сохраняет плоский порядок «побеждает
 * последнее объявление с тем же именем».
 *
 *   node tools/layer-split.mjs           # сухой прогон, только цифры
 *   node tools/layer-split.mjs --apply   # запись
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skipLiteral, matchBrace } from "./css-parse.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "src");
const APPLY = process.argv.includes("--apply");

/** At-правила, которые остаются вне слоёв. */
const UNLAYERED = /^@(-\w+-)?(charset|import|namespace|font-face|property|keyframes|counter-style|font-feature-values|page|viewport)\b/i;
/** Обязаны стоять в самом начале файла. */
const TOP = /^@(charset|import)\b/i;

// ── Разбор в дерево ──────────────────────────────────────────────────────────

/** Отделяет ведущие комментарии от селектора/прелюдии, чтобы не дублировать их. */
function splitLeadingComments(text) {
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue; }
    if (text[i] === "/" && text[i + 1] === "*") {
      const j = text.indexOf("*/", i + 2);
      if (j === -1) break;
      i = j + 2;
      continue;
    }
    break;
  }
  return [text.slice(0, i).trim(), text.slice(i).trim()];
}

/**
 * Дерево узлов: правила, блочные at-правила, одиночные at-правила, комментарии.
 *
 * Скобки считаются с учётом строк и комментариев (общий css-parse), а «;»
 * ищется ещё и вне круглых скобок — иначе url(data:image/svg+xml;base64,...)
 * разорвёт объявление пополам.
 */
function parseNodes(s) {
  const out = [];
  let buf = "";
  let i = 0;
  let paren = 0;
  while (i < s.length) {
    const k = skipLiteral(s, i);
    if (k !== -1) { buf += s.slice(i, k); i = k; continue; }
    const c = s[i];
    if (c === "(") paren++;
    else if (c === ")") paren = Math.max(0, paren - 1);

    if (c === "{" && !paren) {
      const close = matchBrace(s, i);
      const end = close === -1 ? s.length - 1 : close;
      const [comments, prelude] = splitLeadingComments(buf);
      buf = "";
      if (comments) out.push({ type: "comment", text: comments });
      out.push({ type: prelude.startsWith("@") ? "at" : "rule", prelude, body: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (c === ";" && !paren) {
      const [comments, stmt] = splitLeadingComments(buf);
      buf = "";
      if (comments) out.push({ type: "comment", text: comments });
      if (stmt) out.push({ type: "stmt", text: stmt + ";" });
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  const [comments, rest] = splitLeadingComments(buf);
  if (comments) out.push({ type: "comment", text: comments });
  if (rest) out.push({ type: "raw", text: rest });
  return out;
}

/** Объявления блока. Возвращает null, если внутри вложенное правило. */
function parseDecls(body) {
  const out = [];
  let i = 0, start = 0, paren = 0;
  while (i < body.length) {
    const k = skipLiteral(body, i);
    if (k !== -1) { i = k; continue; }
    const c = body[i];
    if (c === "(") paren++;
    else if (c === ")") paren = Math.max(0, paren - 1);
    else if (c === "{" && !paren) return null;      // вложенность — не трогаем
    else if (c === ";" && !paren) { out.push(body.slice(start, i)); start = i + 1; }
    i++;
  }
  if (body.slice(start).trim()) out.push(body.slice(start));
  return out;
}

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ");
const isImportant = (t) => /!\s*important\b/i.test(stripComments(t));
/** Убирает флаг, сохраняя остальной текст объявления. */
const dropFlag = (t) => t.replace(/!\s*important\s*/i, "").replace(/\s+$/, "");

/**
 * Единственная работа, которую слои сделать НЕ могут: перебить inline-стиль.
 *
 * Обычное объявление в слое проигрывает атрибуту style, а важное — выигрывает.
 * Поэтому там, где разметка задаёт значение прямо в элементе, а таблица стилей
 * обязана его перекрыть, флаг остаётся. Это не поблажка, а ровно тот случай,
 * ради которого !important и существует.
 *
 * Список закрытый и выведен из ИЗМЕРЕНИЯ, а не из осторожности: сравнение
 * вычисленных стилей до и после нашло ровно один такой элемент — кнопку
 * профиля в боковом меню. JSX задаёт ей background #041c18, таблица стилей
 * перекрывает на #0b1f3f (или #ffffff у свёрнутого меню). Без флага побеждал бы
 * inline, и цвет менялся бы на 42 экранах.
 *
 * Ранняя проверка этот случай пропустила, потому что я искал селекторы по
 * догадке об именах классов — по названию константы SIDEBAR_PROFILE_PANEL_BG, —
 * а элемент зовётся .sidebar-user--button. Нашёл только прогон в браузере.
 */
const KEEP_FLAG = [
  { last: /(^|[.:])sidebar-user(\b|--)/, prop: /^background(-color|-image)?$/ },
  { last: /(^|[.:])sidebar-account__menu\b/, prop: /^background(-color|-image)?$/ },

  // Второй случай оказался тоньше первого: inline-стиль ставит не разметка, а
  // БИБЛИОТЕКА во время работы. Chart.js при каждом пересчёте пишет холсту
  // style.width и style.height. Правило `.admin-chart canvas { height: 374px }`
  // было важным и эти значения перекрывало; без флага побеждает библиотека, и
  // высота холста становится 382px вместо 374px — график перерисовывается в
  // другом масштабе.
  //
  // Мой разбор inline-стилей смотрел только на style={{...}} в JSX и про
  // библиотеки не подумал вовсе. Нашлось единственным способом, каким такое
  // вообще находится, — сравнением вычисленных стилей в живом браузере.
  { last: /(^|[.\s])canvas$|(^|[.:])chart-canvas\b/, prop: /^(width|height|min-width|min-height|max-width|max-height|display|box-sizing)$/ },
];

/** Последний «кусок» селектора — то, на что правило нацелено. */
const lastCompound = (sel) => sel.trim().split(/[\s>+~]+/).filter(Boolean).pop() || "";

/** Нужно ли сохранить флаг у этого объявления. */
function mustKeepFlag(prelude, decl) {
  const prop = (decl.split(":")[0] || "").trim().toLowerCase();
  return prelude.split(",").some((sel) => {
    const lc = lastCompound(sel);
    if (lc.includes("::")) return false;               // псевдоэлемент — не сам элемент
    if (/__(?!menu\b)/.test(lc)) return false;         // потомок вроде __avatar или __arrow
    return KEEP_FLAG.some((r) => r.last.test(lc) && r.prop.test(prop));
  });
}

// ── Сборка одной половины ────────────────────────────────────────────────────

/**
 * Рендерит поддерево, оставляя объявления только нужной важности.
 * Пустые правила и опустевшие at-блоки не выводятся.
 */
function render(nodes, wantImportant, depth = 0) {
  const pad = "  ".repeat(depth);
  const parts = [];
  for (const n of nodes) {
    if (n.type === "comment") {
      // Комментарии оставляем только в base, чтобы не задваивать текст.
      if (!wantImportant) parts.push(pad + n.text);
      continue;
    }
    if (n.type === "stmt" || n.type === "raw") {
      // @import и @charset уже вынесены в шапку файла. Если пропустить эту
      // проверку, они задвоятся и вторая копия окажется ВНУТРИ @layer, где
      // недопустима. Числовые сверки этого не ловят: @import — не объявление.
      if (UNLAYERED.test(n.text || "")) continue;
      if (!wantImportant) parts.push(pad + (n.text || ""));
      continue;
    }
    if (n.type === "at" && UNLAYERED.test(n.prelude)) continue;   // вынесены отдельно
    if (n.type === "at") {
      const inner = render(parseNodes(n.body), wantImportant, depth + 1);
      if (inner.trim()) parts.push(`${pad}${n.prelude} {\n${inner}\n${pad}}`);
      continue;
    }
    // Обычное правило
    const decls = parseDecls(n.body);
    if (decls === null) { if (!wantImportant) parts.push(`${pad}${n.prelude} {${n.body}}`); continue; }
    const keep = [];
    for (const d of decls) {
      if (!d.trim()) continue;
      const imp = isImportant(d);
      if (imp !== wantImportant) continue;
      // Флаг снимаем у всех, кроме документированных исключений: только он
      // умеет перебивать inline-стиль, слой этого не может.
      const text = wantImportant && !mustKeepFlag(n.prelude, d) ? dropFlag(d) : d;
      keep.push(text.trim());
    }
    if (!keep.length) continue;
    parts.push(`${pad}${n.prelude} {\n${keep.map((d) => `${pad}  ${d};`).join("\n")}\n${pad}}`);
  }
  return parts.join("\n");
}

/**
 * Собирает узлы, которые обязаны остаться вне слоёв.
 *
 * `wrappers` — цепочка объемлющих at-правил. Она нужна, потому что @keyframes
 * может лежать ВНУТРИ @media, и тогда набор кадров существует только на своей
 * ширине экрана. Первая версия выносила такие блоки на верхний уровень, и
 * анимация начинала существовать всегда — тихое изменение поведения. В проекте
 * ровно один такой блок (в react-overrides.css внутри @media (max-width:
 * 1024px)), и найден он был не рассуждением, а отдельной проверкой на
 * вложенность.
 */
function collectUnlayered(nodes, top, outside, wrappers = []) {
  const wrap = (text) =>
    wrappers.reduceRight((inner, prelude) => `${prelude} {\n${inner}\n}`, text);
  for (const n of nodes) {
    if (n.type === "stmt" && TOP.test(n.text)) { top.push(n.text); continue; }
    if (n.type === "at" && UNLAYERED.test(n.prelude)) {
      // @import и @charset обязаны стоять в начале файла, поэтому обёртку для
      // них не восстанавливаем — но их и не бывает внутри блоков.
      if (TOP.test(n.prelude)) top.push(`${n.prelude} {${n.body}}`);
      else outside.push(wrap(`${n.prelude} {${n.body}}`));
      continue;
    }
    if (n.type === "at") collectUnlayered(parseNodes(n.body), top, outside, [...wrappers, n.prelude]);
  }
}

// ── Проход по файлам ─────────────────────────────────────────────────────────

const files = [
  ...fs.readdirSync(path.join(ROOT, "styles")).filter((f) => f.endsWith(".css")).map((f) => `styles/${f}`),
  ...fs.readdirSync(path.join(ROOT, "styles", "modules")).filter((f) => f.endsWith(".css")).map((f) => `styles/modules/${f}`),
  "admin/styles.css",
];

let totalFlags = 0, totalBefore = 0, totalAfter = 0, skipped = [];
const rows = [];

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const flags = (stripComments(src).match(/!\s*important/gi) || []).length;
  const nodes = parseNodes(src);

  const top = [], outside = [];
  collectUnlayered(nodes, top, outside);
  const base = render(nodes, false);
  const over = render(nodes, true);

  const out = [
    ...top,
    "",
    "/* Каскад держится на слоях: overrides объявлен после base и потому бьёт",
    "   его. Порядок и специфичность внутри слоёв исходные. Флаги важности не",
    "   используются — см. tools/layer-split.mjs. */",
    "@layer base, overrides;",
    "",
    ...(outside.length ? [outside.join("\n\n"), ""] : []),
    ...(base.trim() ? ["@layer base {", base, "}", ""] : []),
    ...(over.trim() ? ["@layer overrides {", over, "}", ""] : []),
  ].join("\n");

  const left = (stripComments(out).match(/!\s*important/gi) || []).length;
  if (left) skipped.push(`${rel}: осталось ${left} флагов`);

  totalFlags += flags;
  totalBefore += src.length;
  totalAfter += out.length;
  if (flags || src.length > 2000) {
    rows.push([rel, flags, (src.length / 1024).toFixed(0), (out.length / 1024).toFixed(0)]);
  }
  if (APPLY) fs.writeFileSync(abs, out, "utf8");
}

console.log("файл".padEnd(34) + "флагов".padStart(8) + "  было КБ".padStart(10) + "  стало КБ".padStart(11));
for (const [f, n, b, a] of rows) console.log(f.padEnd(34) + String(n).padStart(8) + String(b).padStart(10) + String(a).padStart(11));
console.log("-".repeat(63));
console.log("ИТОГО".padEnd(34) + String(totalFlags).padStart(8) + (totalBefore / 1024).toFixed(0).padStart(10) + (totalAfter / 1024).toFixed(0).padStart(11));
console.log(`\nразмер: ${((totalAfter / totalBefore - 1) * 100).toFixed(1)} %`);
if (skipped.length) { console.log("\nНЕ ВСЕ ФЛАГИ СНЯТЫ:"); skipped.forEach((s) => console.log("  " + s)); }
console.log(APPLY ? "\nзаписано" : "\n(сухой прогон; для записи добавьте --apply)");
