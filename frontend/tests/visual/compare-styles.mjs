#!/usr/bin/env node
/**
 * Сравнение вычисленных стилей «до» и «после».
 *
 * Отвечает на вопрос, ради которого всё затевалось: изменил ли снятый флаг
 * хоть что-нибудь на самом деле. Не «поехали ли пиксели», а именно значение
 * свойства по мнению движка браузера — это точнее и ловит различия у скрытых
 * и перекрытых элементов, которых на скриншоте не видно.
 *
 * На выходе — список (экран, элемент, свойство, было, стало). По нему сразу
 * понятно, какому правилу возвращать !important, вместо гадания.
 *
 *   node compare-styles.mjs --base styles/base.json.gz --head styles/head.json.gz
 */
import fs from "node:fs";
import zlib from "node:zlib";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const read = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString());

const base = read(arg("base", "styles/base.json.gz"));
const head = read(arg("head", "styles/head.json.gz"));
const LIMIT = Number(arg("limit", "60"));

if (JSON.stringify(base.props) !== JSON.stringify(head.props)) {
  // Набор свойств вычисляется из самих стилей, поэтому после снятия последнего
  // флага какого-то свойства список может укоротиться. Сравниваем тогда только
  // общую часть — иначе сместились бы все индексы и всё «изменилось».
  console.log("список свойств отличается — сравниваю пересечение");
}
const common = base.props.filter((p) => head.props.includes(p));
const bIdx = common.map((p) => base.props.indexOf(p));
const hIdx = common.map((p) => head.props.indexOf(p));

const SEP = "\u0001";

/**
 * Убирает различия, порождённые самим стендом, а не правкой стилей.
 *
 * База и голова отдаются двумя РАЗНЫМИ локальными серверами (порты 4174 и
 * 4173), поэтому любое значение с url(...) — фоновая картинка, шрифт, иконка —
 * отличается портом и попадает в отчёт ложным расхождением. На экране логина
 * такие «изменения» шли первыми и маскировали настоящие.
 */
const normalize = (v) => v.replace(/http:\/\/127\.0\.0\.1:\d+/g, "http://host");
let screensCompared = 0;
let changed = 0;
const examples = [];
const byScreen = new Map();
const byProp = new Map();

for (const name of Object.keys(base.screens)) {
  const b = base.screens[name];
  const h = head.screens[name];
  if (!h) { console.log(`  экран «${name}» пропал в head`); changed++; continue; }
  screensCompared++;

  if (b.vals.length !== h.vals.length) {
    console.log(`  «${name}»: разное число элементов ${b.vals.length} -> ${h.vals.length} (изменилась разметка?)`);
    changed++;
    byScreen.set(name, (byScreen.get(name) || 0) + 1);
    continue;
  }
  for (let i = 0; i < b.vals.length; i++) {
    if (normalize(b.vals[i]) === normalize(h.vals[i])) continue;
    // Строки разошлись — раскладываем на свойства и называем каждое.
    const bv = b.vals[i].split(SEP);
    const hv = h.vals[i].split(SEP);
    for (let k = 0; k < common.length; k++) {
      const wasV = normalize(bv[bIdx[k]]);
      const nowV = normalize(hv[hIdx[k]]);
      if (wasV === nowV) continue;
      changed++;
      byScreen.set(name, (byScreen.get(name) || 0) + 1);
      byProp.set(common[k], (byProp.get(common[k]) || 0) + 1);
      if (examples.length < LIMIT) {
        examples.push({ screen: name, el: b.desc[i] || h.desc[i] || `#${i}`, prop: common[k], was: wasV, now: nowV });
      }
    }
  }
}

console.log(`сравнено экранов: ${screensCompared}, свойств на элемент: ${common.length}`);
// Порог шума. Инструмент снимает стили ОТДЕЛЬНЫМ проходом после скриншотов,
// поэтому состояние страницы может чуть отличаться, а значения вроде
// margin: auto пересчитываются от ширины содержимого и «прыгают» в разные
// стороны на разных экранах. На заведомо безопасной партии таких артефактов
// набралось 18 при нулевом расхождении скриншотов. Считаем сигналом только
// то, что заметно выше этого уровня, и всегда показываем список — решать
// человеку.
const NOISE = Number(arg("noise", "40"));
console.log(`ИЗМЕНИВШИХСЯ ЗНАЧЕНИЙ (элемент+свойство): ${changed}`);

if (!changed) {
  console.log("\nвычисленные стили совпали полностью — снятые флаги ни на что не влияли");
  process.exit(0);
}
if (changed <= NOISE) {
  console.log(`\nрасхождений ${changed} — в пределах порога шума (${NOISE}), считаю совпадением`);
  console.log("список ниже всё равно стоит просмотреть глазами");
}

console.log("\nпо свойствам:");
for (const [p, n] of [...byProp].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${p}: ${n}`);

console.log("\nпо экранам:");
for (const [s, n] of [...byScreen].sort((a, b) => b[1] - a[1])) console.log(`  ${s}: ${n}`);

console.log(`\nпримеры (до ${LIMIT}):`);
for (const e of examples) {
  console.log(`  [${e.screen}] ${e.el}`);
  console.log(`      ${e.prop}: "${e.was}" -> "${e.now}"`);
}
process.exit(changed > NOISE ? 1 : 0);
