#!/usr/bin/env node
/**
 * Вынос модуля из react-overrides.css в отдельный файл.
 *
 * Зачем. Бандл kafe собирает 15 стилей в ОДИН каскад, и у каждого свойства
 * оказывается слишком много конкурентов — из-за этого аудит !important может
 * доказать безопасность снятия лишь для 2–3 % флагов. Потолок снимается не
 * настройкой аудита, а сокращением числа конкурентов, то есть распилом.
 *
 * Как. Файл разбирается в дерево (правила и вложенные @media/@supports), а не
 * режется построчно: правило внутри медиазапроса нельзя просто перенести — его
 * надо обернуть в тот же @media, иначе оно начнёт применяться всегда.
 * Порядок правил внутри модуля сохраняется.
 *
 * ВАЖНО про порядок. Вынесенные правила переезжают в конец каскада (новый файл
 * подключается сразу после исходного). Между собой их порядок не меняется, но
 * относительно НЕ вынесенных правил — меняется. Если конкурирующее правило
 * имело равную специфичность, победитель может поменяться. Поэтому результат
 * обязателен к проверке скриншот-диффом (workflow visual).
 *
 *   node tools/extract-css-module.mjs --match "\\.dashboard" --out styles/modules/dashboard.css [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STYLES = path.resolve(__dirname, "..", "src", "styles");
const SRC = path.join(STYLES, "react-overrides.css");

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const MATCH = new RegExp(arg("match", "\\.dashboard"));
const OUT = path.resolve(__dirname, "..", "src", arg("out", "styles/modules/dashboard.css"));
const APPLY = process.argv.includes("--apply");

const css = fs.readFileSync(SRC, "utf8");

// ── Разбор в дерево ──────────────────────────────────────────────────────────
function matchBrace(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") d++;
    else if (s[i] === "}") { d--; if (!d) return i; }
  }
  return -1;
}

/** Узлы: {type:'comment'|'atrule'|'rule'|'raw', ...} */
function parse(text) {
  const nodes = [];
  let i = 0;
  while (i < text.length) {
    // комментарий
    if (text.startsWith("/*", i)) {
      const j = text.indexOf("*/", i + 2);
      const end = j === -1 ? text.length : j + 2;
      nodes.push({ type: "comment", text: text.slice(i, end) });
      i = end;
      continue;
    }
    // пробелы
    const ws = /^\s+/.exec(text.slice(i));
    if (ws) { nodes.push({ type: "raw", text: ws[0] }); i += ws[0].length; continue; }

    const brace = text.indexOf("{", i);
    const semi = text.indexOf(";", i);
    if (brace === -1) { nodes.push({ type: "raw", text: text.slice(i) }); break; }
    // @import/@charset и подобное без блока
    if (text[i] === "@" && semi !== -1 && semi < brace) {
      nodes.push({ type: "raw", text: text.slice(i, semi + 1) });
      i = semi + 1;
      continue;
    }
    const close = matchBrace(text, brace);
    if (close === -1) { nodes.push({ type: "raw", text: text.slice(i) }); break; }
    const prelude = text.slice(i, brace).trim();
    const inner = text.slice(brace + 1, close);
    if (prelude.startsWith("@")) {
      // Рекурсия — только в УСЛОВНЫЕ группирующие at-rules: внутри них лежат
      // обычные правила. У @page/@font-face/@keyframes внутри ОБЪЯВЛЕНИЯ либо
      // кадры, и разбор их как правил приводил к потере блока целиком
      // (round-trip терял «@page { size: A4; margin: 12mm; }» внутри @media print).
      if (/^@(media|supports|container|layer|document)\b/i.test(prelude)) {
        nodes.push({ type: "atrule", prelude, children: parse(inner) });
      } else {
        nodes.push({ type: "opaque", text: text.slice(i, close + 1) });
      }
    } else {
      nodes.push({ type: "rule", selector: prelude, body: inner });
    }
    i = close + 1;
  }
  return nodes;
}

function serialize(nodes, indent = "") {
  let out = "";
  for (const n of nodes) {
    if (n.type === "comment") out += indent + n.text + "\n";
    else if (n.type === "raw") out += n.text.includes("\n") ? "" : n.text;
    else if (n.type === "opaque") out += indent + n.text + "\n";
    else if (n.type === "rule") out += `${indent}${n.selector} {${n.body}}\n`;
    else if (n.type === "atrule") out += `${indent}${n.prelude} {\n${serialize(n.children, indent + "  ")}${indent}}\n`;
  }
  return out;
}

/** Делит дерево на (вынести, оставить). Комментарий уезжает вместе с правилом,
 *  к которому он прилегает сверху, — иначе пояснения теряют смысл. */
function split(nodes) {
  const take = [], keep = [];
  let pendingComments = [];
  for (const n of nodes) {
    if (n.type === "comment") { pendingComments.push(n); continue; }
    if (n.type === "raw") continue;
    if (n.type === "opaque") { keep.push(...pendingComments, n); pendingComments = []; continue; }
    if (n.type === "rule") {
      if (MATCH.test(n.selector)) { take.push(...pendingComments, n); }
      else { keep.push(...pendingComments, n); }
      pendingComments = [];
      continue;
    }
    if (n.type === "atrule") {
      const [t, k] = split(n.children);
      if (t.length) take.push(...pendingComments, { ...n, children: t });
      if (k.length) keep.push(...(t.length ? [] : pendingComments), { ...n, children: k });
      if (!t.length && !k.length) keep.push(...pendingComments);
      pendingComments = [];
      continue;
    }
  }
  keep.push(...pendingComments);
  return [take, keep];
}

const tree = parse(css);
const [take, keep] = split(tree);

const countRules = (ns) => ns.reduce((a, n) => a + (n.type === "rule" ? 1 : n.type === "atrule" ? countRules(n.children) : 0), 0);
const countImp = (ns) => ns.reduce((a, n) => a + (n.type === "rule" ? (n.body.match(/!\s*important/gi) || []).length : n.type === "atrule" ? countImp(n.children) : 0), 0);

console.log(`шаблон           : ${MATCH}`);
console.log(`выносим          : ${countRules(take)} правил, ${countImp(take)} !important`);
console.log(`остаётся         : ${countRules(keep)} правил, ${countImp(keep)} !important`);
console.log(`цель             : ${path.relative(process.cwd(), OUT)}`);

if (!APPLY) { console.log("\n(сухой прогон; для записи добавьте --apply)"); process.exit(0); }

const banner = `/**
 * Стили дашборда, вынесенные из react-overrides.css.
 *
 * Вынос механический (tools/extract-css-module.mjs): отобраны правила, чей
 * селектор содержит .dashboard*, порядок между ними сохранён, правила внутри
 * медиазапросов перенесены вместе со своим @media.
 *
 * Файл подключается сразу ПОСЛЕ react-overrides.css, поэтому по каскаду эти
 * правила остаются сильнее остальных оверрайдов — как и было.
 */
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, banner + serialize(take), "utf8");
fs.writeFileSync(SRC, serialize(keep), "utf8");
console.log(`\nзаписано: ${path.relative(process.cwd(), OUT)}; react-overrides.css перезаписан`);
