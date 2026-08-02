#!/usr/bin/env node
/**
 * Бюджет `!important`: запрещает РОСТ количества флагов.
 *
 * С переводом каскада на @layer (tools/layer-split.mjs) бюджет по всем файлам
 * равен нулю, так что теперь это фактически полный запрет: любой новый флаг
 * валит сборку. Механизм оставлен прежним намеренно — если где-то флаг всё же
 * окажется оправдан, его можно внести в бюджет осознанно, одной строкой и
 * с объяснением в коммите, а не размывать правило.
 *
 * Почему не stylelint с `declaration-no-important`. Правило умеет только
 * «запрещено везде» — на текущей базе это 11 630 ошибок, то есть шум, который
 * все начнут игнорировать. Просьба была «существующее — предупреждение, новое —
 * ошибка», а такого режима у правила нет: ему нужен базлайн. Этот файл и есть
 * базлайн — по числу флагов на каждый CSS-файл.
 *
 * Поведение:
 *   • стало БОЛЬШЕ, чем в бюджете → ошибка (кто-то добавил !important);
 *   • стало МЕНЬШЕ → успех и подсказка обновить бюджет (--update);
 *   • новый CSS-файл с флагами → ошибка, пока его не внесли в бюджет осознанно.
 *
 *   node tools/important-budget.mjs           # проверка (CI)
 *   node tools/important-budget.mjs --update  # зафиксировать текущие числа
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..", "src");
const BUDGET = path.resolve(__dirname, "important-budget.json");
const UPDATE = process.argv.includes("--update");

function collect(dir, acc = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { collect(p, acc); continue; }
    if (!e.name.endsWith(".css")) continue;
    const rel = path.relative(SRC, p).split(path.sep).join("/");
    // Комментарии вырезаем: иначе объяснительная записка в шапке файла, где
    // само слово упоминается, засчитывается как флаг.
    const text = fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
    acc[rel] = (text.match(/!\s*important/gi) || []).length;
  }
  return acc;
}

const current = collect(SRC);
const total = Object.values(current).reduce((a, b) => a + b, 0);

if (UPDATE) {
  fs.writeFileSync(BUDGET, JSON.stringify({ total, files: current }, null, 2) + "\n", "utf8");
  console.log(`бюджет обновлён: ${total} !important в ${Object.keys(current).length} файлах`);
  process.exit(0);
}

if (!fs.existsSync(BUDGET)) {
  console.error(`нет файла бюджета ${path.relative(process.cwd(), BUDGET)} — создайте его: node tools/important-budget.mjs --update`);
  process.exit(1);
}

const budget = JSON.parse(fs.readFileSync(BUDGET, "utf8"));
const grown = [];
const shrunk = [];
for (const [file, n] of Object.entries(current)) {
  const allowed = budget.files[file];
  if (allowed === undefined) {
    if (n > 0) grown.push(`${file}: новый файл с ${n} !important (внесите в бюджет осознанно)`);
    continue;
  }
  if (n > allowed) grown.push(`${file}: ${allowed} → ${n}  (+${n - allowed})`);
  else if (n < allowed) shrunk.push(`${file}: ${allowed} → ${n}  (−${allowed - n})`);
}

console.log(`!important сейчас: ${total}, в бюджете: ${budget.total}`);
if (shrunk.length) {
  console.log("\nстало меньше (хорошо):");
  for (const s of shrunk) console.log(`  ${s}`);
  console.log("  → зафиксируйте: node tools/important-budget.mjs --update");
}
if (grown.length) {
  console.error("\nПОЯВИЛИСЬ НОВЫЕ !important:");
  for (const g of grown) console.error(`  ${g}`);
  console.error("\nНовые флаги не принимаются: правьте специфичность или порядок правил.");
  console.error("Если флаг действительно необходим — обновите бюджет отдельным коммитом с обоснованием.");
  process.exit(1);
}
console.log("роста нет");
