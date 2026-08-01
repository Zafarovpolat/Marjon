#!/usr/bin/env node
/**
 * Вынос данных и чистых хелперов из монолита admin/AdminApp.jsx.
 *
 * В файле 12 570 строк и 271 объявление верхнего уровня: демо-фикстуры,
 * localStorage-хелперы и React-компоненты вперемешку. Демо-данные и хелперы
 * (~3.7k строк) ни от чего в компонентах не зависят — их можно вынести
 * механически, не меняя поведения.
 *
 * Инструмент не «режет по строкам на глаз»:
 *   1) находит границы объявлений верхнего уровня;
 *   2) помечает те, что содержат JSX (компоненты) — они остаются;
 *   3) строит граф зависимостей по идентификаторам и ИТЕРАТИВНО исключает
 *      кандидатов, которые ссылаются на компоненты (прямо или транзитивно);
 *   4) считает, какие внешние импорты нужны вынесенному куску;
 *   5) сохраняет исходный порядок объявлений — для const-инициализации это
 *      критично.
 *
 *   node tools/extract-admin-data.mjs [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..", "src", "admin", "AdminApp.jsx");
const OUT = path.resolve(__dirname, "..", "src", "admin", "adminData.js");
const APPLY = process.argv.includes("--apply");

const source = fs.readFileSync(SRC, "utf8");
const lines = source.split("\n");

// ── 1. Границы объявлений верхнего уровня ────────────────────────────────────
const declRe = /^(?:export\s+)?(?:default\s+)?(function|const|class)\s+([A-Za-z_$][\w$]*)/;
const decls = [];
lines.forEach((l, i) => {
  const m = declRe.exec(l);
  if (m) decls.push({ start: i, name: m[2], kind: m[1] });
});
decls.forEach((d, i) => { d.end = i + 1 < decls.length ? decls[i + 1].start : lines.length; });
decls.forEach((d) => { d.body = lines.slice(d.start, d.end).join("\n"); });

const importEnd = decls.length ? decls[0].start : 0;
const header = lines.slice(0, importEnd).join("\n");

// ── 2. Компоненты (содержат JSX) ─────────────────────────────────────────────
const jsxRe = /<[A-Za-z][\w.]*[\s/>]|<\/[A-Za-z]/;
for (const d of decls) d.isComponent = jsxRe.test(d.body);

// Хуки React тянут за собой состояние компонента — оставляем на месте.
const hookRe = /\buse(State|Effect|Memo|Callback|Ref|Context|LayoutEffect|Reducer)\s*\(/;
for (const d of decls) d.usesHooks = hookRe.test(d.body);

const byName = new Map(decls.map((d) => [d.name, d]));

// ── 3. Зависимости ───────────────────────────────────────────────────────────
const idRe = /\b[A-Za-z_$][\w$]*\b/g;
function refsOf(d) {
  // Убираем строки и комментарии, чтобы не ловить имена из текста.
  const clean = d.body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const out = new Set();
  for (const m of clean.matchAll(idRe)) if (m[0] !== d.name && byName.has(m[0])) out.add(m[0]);
  return out;
}
for (const d of decls) d.refs = refsOf(d);

// Кандидаты: без JSX и без хуков.
const candidates = new Set(decls.filter((d) => !d.isComponent && !d.usesHooks).map((d) => d.name));

// Итеративно выкидываем тех, кто ссылается на невынесенное.
let changed = true;
while (changed) {
  changed = false;
  for (const name of [...candidates]) {
    for (const r of byName.get(name).refs) {
      if (!candidates.has(r)) { candidates.delete(name); changed = true; break; }
    }
  }
}

const extracted = decls.filter((d) => candidates.has(d.name));
const kept = decls.filter((d) => !candidates.has(d.name));

// ── 4. Какие внешние импорты нужны вынесенному ───────────────────────────────
const importedNames = new Map();   // имя -> строка импорта
for (const line of header.split("\n")) {
  const m = /^import\s+(.+?)\s+from\s+["']([^"']+)["']/.exec(line.trim());
  if (!m) continue;
  const spec = m[1].trim();
  const names = [];
  const braces = /\{([^}]*)\}/.exec(spec);
  if (braces) braces[1].split(",").forEach((p) => { const n = p.split(" as ").pop().trim(); if (n) names.push(n); });
  const def = spec.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
  if (def) names.push(def);
  for (const n of names) importedNames.set(n, line.trim());
}
const neededImports = new Set();
const extractedText = extracted.map((d) => d.body).join("\n");
const cleanExtracted = extractedText
  .replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, "``");
for (const [name, line] of importedNames) {
  if (new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`).test(cleanExtracted)) neededImports.add(line);
}

// ── Отчёт ────────────────────────────────────────────────────────────────────
const cntLines = (arr) => arr.reduce((a, d) => a + (d.end - d.start), 0);
console.log(`объявлений всего        : ${decls.length} (${lines.length} строк)`);
console.log(`компоненты (JSX/хуки)   : ${decls.filter((d) => d.isComponent || d.usesHooks).length}`);
console.log(`выносим                 : ${extracted.length} декл., ${cntLines(extracted)} строк`);
console.log(`остаётся в AdminApp     : ${kept.length} декл., ${cntLines(kept)} строк`);
console.log(`импорты для нового файла: ${[...neededImports].join(" | ") || "(нет)"}`);

if (!APPLY) { console.log("\n(сухой прогон; для записи добавьте --apply)"); process.exit(0); }

// ── 5. Запись ────────────────────────────────────────────────────────────────
const banner = `/**
 * Демо-данные, справочники и чистые хелперы админки.
 *
 * Вынесено из AdminApp.jsx механически (tools/extract-admin-data.mjs): это
 * объявления без JSX и без React-хуков, не зависящие от компонентов ни прямо,
 * ни транзитивно. Порядок объявлений сохранён — от него зависит инициализация
 * const. Поведение не менялось.
 */
`;
const bodyOut = extracted.map((d) => d.body.replace(/\s+$/, "")).join("\n\n");
const exportsOut = `\nexport {\n${extracted.map((d) => `  ${d.name},`).join("\n")}\n};\n`;
fs.writeFileSync(OUT, banner + [...neededImports].join("\n") + (neededImports.size ? "\n\n" : "\n") + bodyOut + "\n" + exportsOut, "utf8");

// AdminApp: убираем вынесенное, добавляем импорт
const removeRanges = extracted.map((d) => [d.start, d.end]).sort((a, b) => b[0] - a[0]);
let out = [...lines];
for (const [s, e] of removeRanges) out.splice(s, e - s);
const importLine = `import {\n${extracted.map((d) => `  ${d.name},`).join("\n")}\n} from "./adminData";`;
// вставляем после последнего import в шапке
let lastImport = 0;
out.forEach((l, i) => { if (/^import\s/.test(l) && i < 40) lastImport = i; });
out.splice(lastImport + 1, 0, importLine);
fs.writeFileSync(SRC, out.join("\n"), "utf8");
console.log(`\nзаписано: ${path.relative(process.cwd(), OUT)} и обновлён AdminApp.jsx`);
