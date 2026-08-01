/**
 * Попиксельное сравнение двух наборов скриншотов.
 *
 *   node compare.mjs --base shots/base --head shots/head --diff shots/diff [--threshold 0.02]
 *
 * threshold — доля различающихся пикселей, ниже которой расхождение считается
 * шумом рендеринга (сглаживание текста). По умолчанию 0.02% от площади кадра.
 * Экран, который есть только в одном наборе, — это тоже регрессия (страница
 * перестала открываться), и она попадает в отчёт.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const BASE = path.resolve(arg("base", "shots/base"));
const HEAD = path.resolve(arg("head", "shots/head"));
const DIFF = path.resolve(arg("diff", "shots/diff"));
const THRESHOLD = Number(arg("threshold", "0.0002"));   // 0.02% пикселей

const pngs = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".png")) : []);

fs.mkdirSync(DIFF, { recursive: true });
const baseFiles = pngs(BASE), headFiles = pngs(HEAD);
const all = [...new Set([...baseFiles, ...headFiles])].sort();

if (!all.length) { console.error("нет скриншотов для сравнения"); process.exit(1); }

let failed = 0;
const rows = [];
for (const f of all) {
  const bp = path.join(BASE, f), hp = path.join(HEAD, f);
  if (!fs.existsSync(bp)) { rows.push([f, "только в head (новый экран)", "—"]); continue; }
  if (!fs.existsSync(hp)) { rows.push([f, "ПРОПАЛ в head", "—"]); failed++; continue; }

  const a = PNG.sync.read(fs.readFileSync(bp));
  const b = PNG.sync.read(fs.readFileSync(hp));
  if (a.width !== b.width || a.height !== b.height) {
    rows.push([f, `размер изменился ${a.width}x${a.height} -> ${b.width}x${b.height}`, "—"]);
    failed++; continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1, includeAA: false });
  const ratio = n / (a.width * a.height);
  if (ratio > THRESHOLD) {
    fs.writeFileSync(path.join(DIFF, f), PNG.sync.write(diff));
    rows.push([f, `РАСХОЖДЕНИЕ ${n} px`, `${(ratio * 100).toFixed(4)}%`]);
    failed++;
  } else {
    rows.push([f, "совпадает", n ? `${(ratio * 100).toFixed(4)}%` : "0%"]);
  }
}

const w = Math.max(...rows.map((r) => r[0].length), 8);
console.log(`\n${"экран".padEnd(w)}  результат`);
console.log("-".repeat(w + 40));
for (const [f, s, p] of rows) console.log(`${f.padEnd(w)}  ${s}${p !== "—" ? `  (${p})` : ""}`);
console.log(`\nвсего: ${all.length}, расхождений: ${failed}`);

if (failed) {
  console.error(`\nВИЗУАЛЬНЫЕ РАСХОЖДЕНИЯ: ${failed}. Картинки различий — в артефакте сборки (${DIFF}).`);
  process.exit(1);
}
console.log("визуальных отличий нет");
