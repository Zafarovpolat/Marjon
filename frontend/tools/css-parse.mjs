/**
 * Разбор CSS с учётом строк и комментариев — общая основа для инструментов.
 *
 * Отдельным модулем, потому что наивный посимвольный подсчёт скобок уже дважды
 * приводил к порче: в файле есть селекторы вида input[pattern="[0-9]{4}"], и
 * фигурные скобки внутри кавычек принимались за границы блоков. Один раз это
 * развалило стили целиком (18 из 24 экранов), причём проверка, написанная с тем
 * же дефектом, подтвердила «корректность». Реализация должна быть одна.
 */

/** Если в позиции i начинается строка или комментарий — вернуть индекс за ними. */
export function skipLiteral(s, i) {
  const c = s[i];
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < s.length) {
      if (s[j] === "\\") { j += 2; continue; }
      if (s[j] === c) return j + 1;
      j++;
    }
    return s.length;
  }
  if (c === "/" && s[i + 1] === "*") {
    const j = s.indexOf("*/", i + 2);
    return j === -1 ? s.length : j + 2;
  }
  return -1;
}

/** Индекс символа ch вне строк и комментариев. */
export function findTop(s, ch, from = 0) {
  let i = from;
  while (i < s.length) {
    const k = skipLiteral(s, i);
    if (k !== -1) { i = k; continue; }
    if (s[i] === ch) return i;
    i++;
  }
  return -1;
}

/** Индекс «}», парной к «{» в позиции open. */
export function matchBrace(s, open) {
  let depth = 0, i = open;
  while (i < s.length) {
    const k = skipLiteral(s, i);
    if (k !== -1) { i = k; continue; }
    if (s[i] === "{") depth++;
    else if (s[i] === "}") { depth--; if (!depth) return i; }
    i++;
  }
  return -1;
}

/**
 * Плоский список объявлений с ТОЧНЫМИ позициями в исходном тексте.
 *
 * Позиции нужны, чтобы удалять объявления хирургически, не переписывая файл
 * целиком: перезапись меняет форматирование и делает дифф нечитаемым, а любые
 * различия, кроме удалённых строк, невозможно проверить глазами.
 *
 * Для каждого объявления: медиа-контекст, селектор (по одному на запись —
 * запятые раскрыты), свойство, значение без флага, признак !important,
 * порядковый номер и границы [start, end) вместе с завершающей «;».
 */
export function parseDeclarations(css) {
  const out = [];
  let order = 0;

  function walk(from, to, ctx) {
    let i = from;
    while (i < to) {
      const k = skipLiteral(css, i);
      if (k !== -1 && css[i] === "/") { i = k; continue; }
      if (/\s/.test(css[i])) { i++; continue; }

      const brace = findTop(css, "{", i);
      if (brace === -1 || brace >= to) break;
      const semi = findTop(css, ";", i);
      if (css[i] === "@" && semi !== -1 && semi < brace) { i = semi + 1; continue; }

      const close = matchBrace(css, brace);
      if (close === -1 || close > to) break;
      const prelude = css.slice(i, brace).trim();

      if (prelude.startsWith("@")) {
        if (/^@(media|supports|container|layer|document)\b/i.test(prelude)) {
          walk(brace + 1, close, ctx.concat(prelude.replace(/\s+/g, " ")));
        }
        // @keyframes/@font-face/@page — внутри объявления или кадры, не правила
        i = close + 1;
        continue;
      }

      const selectors = splitTop(prelude, ",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
      // Границы каждого объявления внутри тела правила
      let p = brace + 1;
      for (const seg of splitTopWithPos(css, brace + 1, close, ";")) {
        const raw = css.slice(seg.start, seg.end);
        const colon = findTop(raw, ":");
        if (colon > 0) {
          const prop = raw.slice(0, colon).trim().toLowerCase();
          let value = raw.slice(colon + 1).trim();
          const important = /!\s*important\s*$/i.test(value);
          value = value.replace(/!\s*important\s*$/i, "").trim();
          if (prop && !prop.startsWith("--") && !prop.startsWith("/*")) {
            for (const selector of selectors) {
              out.push({
                order: order++,
                media: ctx.join(" && "),
                selector, prop, value, important,
                ruleStart: brace + 1, ruleEnd: close,
                start: seg.start, end: seg.endWithSemi,
              });
            }
          }
        }
        p = seg.endWithSemi;
      }
      i = close + 1;
    }
  }

  walk(0, css.length, []);
  return out;
}

/**
 * Диапазоны правил с ПУСТЫМ телом — чтобы удалить их структурно.
 *
 * Регулярным выражением это делать нельзя, и это проверено на практике.
 * Попытка вида /(^|\})([^{}]*)\{\s*\}/ не знает про кавычки: в селекторе
 * `input[pattern="[0-9]{4}"]` она принимает «}» из «{4}» за конец предыдущего
 * блока и вырезает кусок селектора, оставляя незакрытую кавычку — файл после
 * этого разбирается лишь до середины. Плюс `[^{}]*` захватывает комментарий
 * перед правилом и удаляет его заодно.
 *
 * Возвращает [start, end) от начала селектора (комментарии перед ним НЕ
 * трогаются) до закрывающей скобки включительно.
 */
export function findEmptyRuleRanges(css) {
  const ranges = [];

  function walk(from, to) {
    let i = from;
    while (i < to) {
      // комментарии и пробелы пропускаем, не считая их частью селектора
      if (css.startsWith("/*", i)) {
        const j = css.indexOf("*/", i + 2);
        i = j === -1 ? to : j + 2;
        continue;
      }
      if (/\s/.test(css[i])) { i++; continue; }

      const selStart = i;
      const brace = findTop(css, "{", i);
      if (brace === -1 || brace >= to) break;
      const semi = findTop(css, ";", i);
      if (css[i] === "@" && semi !== -1 && semi < brace) { i = semi + 1; continue; }

      const close = matchBrace(css, brace);
      if (close === -1 || close > to) break;
      const prelude = css.slice(selStart, brace).trim();
      const inner = css.slice(brace + 1, close);

      if (prelude.startsWith("@")) {
        if (/^@(media|supports|container|layer|document)\b/i.test(prelude)) {
          walk(brace + 1, close);
          // Медиа-блок, где не осталось ничего, кроме пробелов и комментариев,
          // сам по себе бесполезен — но удалять его вместе с комментариями
          // рискованно, поэтому оставляем: пустой @media безвреден.
        }
      } else if (!inner.trim()) {
        ranges.push({ start: selStart, end: close + 1 });
      }
      i = close + 1;
    }
  }

  walk(0, css.length);
  return ranges;
}

/** split по разделителю вне скобок/строк (для :is(a,b), url(...)). */
export function splitTop(s, sep) {
  const parts = [];
  let buf = "", depth = 0, i = 0;
  while (i < s.length) {
    const k = skipLiteral(s, i);
    if (k !== -1) { buf += s.slice(i, k); i = k; continue; }
    const c = s[i];
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === sep && depth === 0) { parts.push(buf); buf = ""; i++; continue; }
    buf += c; i++;
  }
  parts.push(buf);
  return parts;
}

/** То же, но возвращает позиции сегментов в исходной строке. */
function splitTopWithPos(css, from, to, sep) {
  const segs = [];
  let start = from, depth = 0, i = from;
  while (i < to) {
    const k = skipLiteral(css, i);
    if (k !== -1 && k <= to) { i = k; continue; }
    const c = css[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === sep && depth === 0) {
      segs.push({ start, end: i, endWithSemi: i + 1 });
      start = i + 1;
    }
    i++;
  }
  if (start < to && css.slice(start, to).trim()) {
    segs.push({ start, end: to, endWithSemi: to });   // последнее объявление без «;»
  }
  return segs;
}
