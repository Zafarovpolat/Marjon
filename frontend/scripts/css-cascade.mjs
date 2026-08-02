/**
 * Кто побеждает в каскаде — вместо поиска подстроки в файле.
 *
 * ЗАЧЕМ. Структурные проверки админки раньше искали в CSS буквальный текст:
 *
 *     assert.match(css, /\.admin-sidebar\s*{[\s\S]*?border-right:\s*0\s*!important;/)
 *
 * У такой проверки три беды. Она ломается от любой перестановки файла, хотя
 * поведение не изменилось. Она не отличает победившее объявление от
 * перекрытого: `[\s\S]*?` найдёт первое совпадение где угодно ниже по файлу.
 * И она намертво привязана к механизму: перевод каскада на @layer уронил 35
 * проверок разом, не сломав при этом ни одного экрана.
 *
 * Здесь вместо текста считается результат: для пары «селектор + свойство»
 * возвращается объявление, которое реально выигрывает — по правилам каскада
 * (слой, затем специфичность, затем порядок).
 *
 * ГРАНИЦА ПРИМЕНИМОСТИ. Победитель считается среди объявлений с ИМЕННО ТАКИМ
 * селектором. Настоящий каскад разрешает спор между РАЗНЫМИ селекторами,
 * подошедшими к одному элементу, — этого здесь нет и быть не может без DOM.
 * Полную картину даёт сравнение вычисленных стилей в браузере
 * (tests/visual/dump-styles.mjs); эта проверка дешёвая и ловит другое —
 * что нужное объявление вообще существует и не перекрыто своим же собратом.
 */
import { skipLiteral, matchBrace } from "../tools/css-parse.mjs";

const norm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").split(/\s+/).join(" ").trim();

/** Специфичность (id, класс/атрибут/псевдокласс, элемент/псевдоэлемент). */
export function specificity(sel) {
  const s = sel.replace(/\[[^\]]*\]/g, "[]");
  const a = (s.match(/#[-\w]+/g) || []).length;
  const pseudoEl = (s.match(/::[-\w]+/g) || []).length;
  const s2 = s.replace(/::[-\w]+/g, " ");
  const zero = /^(where|is|not|has|matches|any)$/;
  const b =
    (s2.match(/\.[-\w]+/g) || []).length +
    (s2.match(/\[\]/g) || []).length +
    (s2.match(/:[-\w]+/g) || []).filter((p) => !zero.test(p.slice(1))).length;
  const c = pseudoEl + (s2.match(/(?:^|[\s>+~(])([a-zA-Z][-\w]*)/g) || []).length;
  return a * 10000 + b * 100 + c;
}

/** Разбирает CSS в плоский список объявлений с контекстом, слоем и позицией. */
export function parse(css) {
  const out = [];
  let order = 0;

  const walk = (text, ctx, layer) => {
    let i = 0, buf = "", paren = 0;
    while (i < text.length) {
      const k = skipLiteral(text, i);
      if (k !== -1) { buf += text.slice(i, k); i = k; continue; }
      const c = text[i];
      if (c === "(") paren++;
      else if (c === ")") paren = Math.max(0, paren - 1);

      if (c === "{" && !paren) {
        const close = matchBrace(text, i);
        const end = close === -1 ? text.length - 1 : close;
        const head = norm(buf);
        const body = text.slice(i + 1, end);
        buf = "";
        i = end + 1;
        if (/^@layer\b/.test(head)) walk(body, ctx, head.replace(/^@layer\s*/, "").trim());
        else if (/^@(keyframes|font-face|property|counter-style)/.test(head)) continue;
        else if (head.startsWith("@")) walk(body, [...ctx, head], layer);
        else {
          for (const raw of splitTop(body, ";")) {
            const d = raw.replace(/\/\*[\s\S]*?\*\//g, " ").trim();
            if (!d) continue;
            const ci = findColon(d);
            if (ci === -1) continue;
            const prop = d.slice(0, ci).trim().toLowerCase();
            let value = d.slice(ci + 1).trim();
            const important = /!\s*important\b/i.test(value);
            value = norm(value.replace(/!\s*important/i, ""));
            for (const sel of splitTop(head, ",")) {
              const s = norm(sel);
              if (s) out.push({ ctx: ctx.join(" "), layer, sel: s, prop, value, important, order: order++ });
            }
          }
        }
        continue;
      }
      if (c === ";" && !paren) { buf = ""; i++; continue; }
      buf += c;
      i++;
    }
  };

  walk(css, [], null);
  return out;
}

function findColon(d) {
  let i = 0, paren = 0;
  while (i < d.length) {
    const k = skipLiteral(d, i);
    if (k !== -1) { i = k; continue; }
    if (d[i] === "(") paren++;
    else if (d[i] === ")") paren--;
    else if (d[i] === ":" && !paren) return i;
    i++;
  }
  return -1;
}

function splitTop(s, sep) {
  const out = [];
  let i = 0, start = 0, paren = 0, brack = 0;
  while (i < s.length) {
    const k = skipLiteral(s, i);
    if (k !== -1) { i = k; continue; }
    const c = s[i];
    if (c === "(") paren++;
    else if (c === ")") paren--;
    else if (c === "[") brack++;
    else if (c === "]") brack--;
    else if (c === sep && !paren && !brack) { out.push(s.slice(start, i)); start = i + 1; }
    i++;
  }
  out.push(s.slice(start));
  return out;
}

/**
 * Победитель для пары «селектор + свойство».
 *
 * Порядок слоёв берётся из объявления `@layer a, b;` в самом файле, а не
 * задаётся константой: иначе проверка перестанет соответствовать реальности,
 * если слои когда-нибудь переименуют или добавят третий.
 */
export function cascade(css) {
  const decls = parse(css);
  const m = /@layer\s+([^;{]+);/.exec(css.replace(/\/\*[\s\S]*?\*\//g, " "));
  const order = m ? m[1].split(",").map((x) => x.trim()) : [];
  const rank = (l) => (l == null ? order.length + 1 : order.indexOf(l) + 1);

  return {
    layerOrder: order,
    /** Побеждающее объявление или null. `media` — точный текст @media, если нужен. */
    winner(sel, prop, media = "") {
      const cands = decls.filter(
        (d) => d.sel === norm(sel) && d.prop === prop.toLowerCase() && d.ctx === norm(media)
      );
      if (!cands.length) return null;
      cands.sort((x, y) =>
        (x.important ? 1 : 0) - (y.important ? 1 : 0) ||
        rank(x.layer) - rank(y.layer) ||
        specificity(x.sel) - specificity(y.sel) ||
        x.order - y.order
      );
      return cands[cands.length - 1];
    },
    /** Все объявления свойства (для переменных, у которых селектор не важен). */
    find(prop, value = null) {
      return decls.filter((d) => d.prop === prop.toLowerCase() && (value == null || d.value === norm(value)));
    },
  };
}
