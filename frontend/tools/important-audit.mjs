#!/usr/bin/env node
/**
 * important-audit.mjs — какие `!important` можно снять БЕЗ изменения картинки.
 *
 * Инструмент не «удаляет и надеется». Он моделирует настоящий каскад CSS
 * (importance → specificity → порядок) и для каждого `!important` отвечает на
 * вопрос: изменится ли победитель для свойства, если снять флаг?
 *
 * Правило безопасности. Пусть D — объявление с !important (селектор S,
 * свойство P). Для каждого другого объявления D' с тем же P, которое может
 * попасть в тот же элемент:
 *   • D' без !important: сейчас D выигрывает по важности. После снятия
 *     сравнение идёт по specificity/порядку — D обязан всё равно выигрывать.
 *   • D' с !important: если сейчас выигрывает D, то после снятия выиграет D'
 *     → картинка меняется, снимать нельзя.
 * Если ни одного конфликтующего D' нет — снимать безопасно всегда.
 *
 * Пересечение селекторов определяется не на глаз: берём правый (ключевой)
 * компаунд и сверяем с реально встречающимися в JSX наборами классов. Если
 * доказать непересечение нельзя — считаем, что пересекаются (в минус себе).
 *
 * Запуск:
 *   node tools/important-audit.mjs            # отчёт по всем бандлам
 *   node tools/important-audit.mjs --bundle admin
 *   node tools/important-audit.mjs --bundle admin --apply   # снять безопасные
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..", "src");

/** Порядок загрузки = порядок import в точке входа. Каскад зависит от него. */
const BUNDLES = {
  kafe: {
    entry: "main.jsx",
    files: [
      "styles/marjon-tokens.css", "styles/brand.css", "styles/dashboard.css",
      "styles/topbar-widgets.css", "styles/forms.css", "styles/tables.css",
      "styles/staff-pos.css", "styles/responsive.css", "styles/app.css",
      "styles/dashboard-curve.css", "styles/loader.css",
      "styles/react-overrides.css", "styles/receipt.css", "styles/auth.css",
      "styles/login-extras.css",
    ],
  },
  admin: { entry: "admin/main.jsx", files: ["admin/styles.css"] },
};

// ── Разбор CSS ───────────────────────────────────────────────────────────────

/** Убирает комментарии, сохраняя длину строки (чтобы не сбить нумерацию). */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * Плоский список объявлений в порядке следования.
 * Вложенность @media учитывается: медиа не даёт specificity, но объявления
 * внутри разных медиа-условий не обязаны конкурировать — храним условие.
 */
function parseDeclarations(css, fileIndex, fileName) {
  const clean = stripComments(css);
  const out = [];
  let i = 0;
  let order = 0;
  const atStack = [];

  while (i < clean.length) {
    const ch = clean[i];

    if (ch === "@") {
      const braceAt = clean.indexOf("{", i);
      const semiAt = clean.indexOf(";", i);
      if (semiAt !== -1 && (braceAt === -1 || semiAt < braceAt)) { i = semiAt + 1; continue; }
      if (braceAt === -1) break;
      const prelude = clean.slice(i, braceAt).trim();
      atStack.push({ prelude, close: matchBrace(clean, braceAt) });
      i = braceAt + 1;
      continue;
    }

    if (ch === "}") {
      while (atStack.length && atStack[atStack.length - 1].close === i) atStack.pop();
      i++;
      continue;
    }

    const braceAt = clean.indexOf("{", i);
    if (braceAt === -1) break;
    const nextClose = clean.indexOf("}", i);
    if (nextClose !== -1 && nextClose < braceAt) { i = nextClose + 1; continue; }

    const selectorRaw = clean.slice(i, braceAt).trim();
    const close = matchBrace(clean, braceAt);
    if (close === -1) break;
    const body = clean.slice(braceAt + 1, close);

    if (selectorRaw && !selectorRaw.startsWith("@")) {
      // Медиа-контекст: только @media/@supports влияют на применимость.
      const media = atStack.map((a) => a.prelude).filter((p) => /^@(media|supports|container)/.test(p)).join(" && ");
      const line = clean.slice(0, braceAt).split("\n").length;
      for (const selector of splitTop(selectorRaw, ",")) {
        const sel = selector.trim();
        if (!sel) continue;
        for (const decl of splitTop(body, ";")) {
          const d = decl.trim();
          if (!d) continue;
          const colon = d.indexOf(":");
          if (colon <= 0) continue;
          const prop = d.slice(0, colon).trim().toLowerCase();
          const value = d.slice(colon + 1).trim();
          if (!prop || prop.startsWith("--")) continue;
          out.push({
            fileIndex, fileName, order: order++, line,
            selector: sel, media, prop,
            important: /!\s*important\s*$/i.test(value),
            specificity: specificity(sel),
            pseudoEl: pseudoElementOf(sel),
            key: keyCompound(sel),
          });
        }
      }
    }
    i = close + 1;
  }
  return out;
}

function matchBrace(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** split, не разрывающий скобки и строки (для :is(a,b), url(...), "a,b"). */
function splitTop(s, sep) {
  const parts = []; let buf = ""; let depth = 0; let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { buf += c; if (c === quote && s[i - 1] !== "\\") quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; buf += c; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === sep && depth === 0) { parts.push(buf); buf = ""; continue; }
    buf += c;
  }
  parts.push(buf);
  return parts;
}

/** Специфичность [id, class/attr/pseudo-class, element/pseudo-element]. */
function specificity(sel) {
  let s = sel.replace(/\\./g, "");
  // :not()/:is()/:where() — учитываем содержимое, :where() даёт 0
  s = s.replace(/:where\([^)]*\)/g, " ");
  const inner = [...s.matchAll(/:(?:not|is|has)\(([^)]*)\)/g)].map((m) => m[1]);
  s = s.replace(/:(?:not|is|has)\([^)]*\)/g, " ");

  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes =
    (s.match(/\.[\w-]+/g) || []).length +
    (s.match(/\[[^\]]+\]/g) || []).length +
    (s.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g) || []).length;
  const elements =
    (s.match(/(?:^|[\s>+~])([a-zA-Z][\w-]*)/g) || []).length +
    (s.match(/::[\w-]+/g) || []).length;

  let acc = [ids, classes, elements];
  for (const part of inner) {
    const sub = specificity(part);
    acc = [acc[0] + sub[0], acc[1] + sub[1], acc[2] + sub[2]];
  }
  return acc;
}

const cmpSpec = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

function pseudoElementOf(sel) {
  const m = sel.match(/::([\w-]+)/);
  if (m) return m[1];
  const legacy = sel.match(/(?:^|[^:]):(before|after|first-line|first-letter)\b/i);
  return legacy ? legacy[1].toLowerCase() : null;
}

/** Правый (ключевой) компаунд — он определяет, на какой элемент падает правило. */
function keyCompound(sel) {
  const parts = sel.trim().split(/\s*[\s>+~]\s*/).filter(Boolean);
  const last = parts[parts.length - 1] || sel;
  const base = last.replace(/::[\w-]+.*$/, "").replace(/:(?!:)[\w-]+(?:\([^)]*\))?/g, "");
  return {
    tag: (base.match(/^([a-zA-Z][\w-]*)/) || [])[1]?.toLowerCase() || null,
    ids: new Set(base.match(/#[\w-]+/g) || []),
    classes: new Set((base.match(/\.[\w-]+/g) || []).map((c) => c.slice(1))),
    universal: base.trim() === "*" || base.trim() === "",
  };
}

// ── Классы, реально встречающиеся вместе (из JSX) ────────────────────────────

/**
 * Доказательства из настоящей разметки (JSX + html): какие классы встречаются
 * на одном элементе, на каких тегах живёт класс, что за элемент несёт id.
 * Без этого пришлось бы считать пересекающимися, например, `#root` и
 * `.admin-login__submit` — а это заведомо разные элементы.
 */
function collectDomEvidence(dir, extraFiles = []) {
  const pairs = new Set();           // "classA|classB" — встречаются вместе
  const classTags = new Map();       // class -> Set(tag)
  const idInfo = new Map();          // id    -> { tags:Set, classes:Set }

  const tokensOf = (raw) => raw
    .replace(/\$\{[^}]*\}/g, " ")
    .split(/[\s"'`?:&|()+,{}]+/)
    .map((t) => t.trim())
    .filter((t) => /^[a-zA-Z][\w-]*$/.test(t));

  const scan = (src) => {
    // Открывающие теги: <tag ...атрибуты...>
    for (const m of src.matchAll(/<([a-zA-Z][\w.-]*)((?:[^<>{]|\{[^{}]*\})*)>/g)) {
      const tag = m[1].toLowerCase();
      const attrs = m[2] || "";
      const cm = attrs.match(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})/)
             || attrs.match(/class\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      const im = attrs.match(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      const classes = cm ? tokensOf(cm[1] ?? cm[2] ?? cm[3] ?? cm[4] ?? "") : [];
      const isHtmlTag = /^[a-z]/.test(tag);   // React-компоненты (<Foo>) — не теги
      for (const c of classes) {
        if (isHtmlTag) {
          if (!classTags.has(c)) classTags.set(c, new Set());
          classTags.get(c).add(tag);
        }
      }
      for (let i = 0; i < classes.length; i++)
        for (let j = i + 1; j < classes.length; j++)
          pairs.add(classes[i] < classes[j] ? `${classes[i]}|${classes[j]}` : `${classes[j]}|${classes[i]}`);
      if (im) {
        const id = (im[1] ?? im[2] ?? "").trim();
        if (id) {
          if (!idInfo.has(id)) idInfo.set(id, { tags: new Set(), classes: new Set() });
          if (isHtmlTag) idInfo.get(id).tags.add(tag);
          classes.forEach((c) => idInfo.get(id).classes.add(c));
        }
      }
    }
    // className вне разобранных тегов (переносы строк) — только пары классов.
    for (const m of src.matchAll(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})/g)) {
      const t = tokensOf(m[1] ?? m[2] ?? m[3] ?? m[4] ?? "");
      for (let i = 0; i < t.length; i++)
        for (let j = i + 1; j < t.length; j++)
          pairs.add(t[i] < t[j] ? `${t[i]}|${t[j]}` : `${t[j]}|${t[i]}`);
    }
  };

  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/node_modules|dist|__snapshots__/.test(e.name)) walk(p); continue; }
      if (!/\.(jsx?|tsx?|html)$/.test(e.name)) continue;
      scan(fs.readFileSync(p, "utf8"));
    }
  };
  walk(dir);
  for (const f of extraFiles) if (fs.existsSync(f)) scan(fs.readFileSync(f, "utf8"));

  return { pairs, classTags, idInfo };
}

/**
 * Могут ли два правила попасть в ОДИН элемент?
 * Где разметка даёт ответ — опираемся на неё; где данных нет — считаем «да»
 * (ошибка в свою пользу: лишний раз не снимем флаг).
 */
function mayShareElement(a, b, ev) {
  if (a.pseudoEl !== b.pseudoEl) return false;               // ::after ≠ сам элемент
  const A = a.key, B = b.key;
  if (A.universal || B.universal) return true;
  if (A.tag && B.tag && A.tag !== B.tag) return false;        // div vs span

  // id — конкретный единственный элемент. Он совпадает с правилом по классу
  // только если этот элемент реально несёт такой класс.
  const idSide = (X, Y) => {
    for (const raw of X.ids) {
      const id = raw.slice(1);
      const info = ev.idInfo.get(id);
      if (Y.classes.size) {
        if (!info) return false;                              // про id ничего не знаем → это не он
        for (const c of Y.classes) if (info.classes.has(c)) return true;
        return false;
      }
      if (Y.tag) {
        if (!info || !info.tags.size) return false;
        return info.tags.has(Y.tag);
      }
    }
    return null;                                              // решения нет
  };

  if (A.ids.size && B.ids.size) {
    for (const id of A.ids) if (!B.ids.has(id)) return false; // #x vs #y
    return true;
  }
  if (A.ids.size !== B.ids.size) {
    const r = A.ids.size ? idSide(A, B) : idSide(B, A);
    if (r !== null) return r;
  }

  if (A.classes.size && B.classes.size) {
    for (const c of A.classes) if (B.classes.has(c)) return true;   // общий класс
    for (const c1 of A.classes) for (const c2 of B.classes) {       // встречаются вместе?
      const k = c1 < c2 ? `${c1}|${c2}` : `${c2}|${c1}`;
      if (ev.pairs.has(k)) return true;
    }
    return false;
  }

  // Класс против голого тега: смотрим, на каких тегах этот класс живёт.
  const classVsTag = (C, T) => {
    for (const c of C.classes) {
      const tags = ev.classTags.get(c);
      if (!tags || !tags.size) return true;                   // нет данных → осторожно
      if (tags.has(T.tag)) return true;
    }
    return false;
  };
  if (A.classes.size && B.tag && !B.classes.size) return classVsTag(A, B);
  if (B.classes.size && A.tag && !A.classes.size) return classVsTag(B, A);

  return true;
}

/** Кто выигрывает БЕЗ учёта важности: specificity, затем порядок. */
function beatsNormally(x, y) {
  const c = cmpSpec(x.specificity, y.specificity);
  if (c !== 0) return c > 0;
  if (x.fileIndex !== y.fileIndex) return x.fileIndex > y.fileIndex;
  return x.order > y.order;
}

// ── Флаги, защищённые тестами ────────────────────────────────────────────────

/**
 * scripts/*.test.mjs — рукописный набор регрессий, который фиксирует вёрстку
 * админки (211 проверок). Часть из них прямо требует наличия `!important`
 * в конкретном объявлении. Это выражение намерения: такие флаги трогать нельзя,
 * даже если модель каскада считает их снимаемыми. Тест здесь главнее модели —
 * его писали по факту сломанной вёрстки.
 *
 * Возвращает список правил { classes:Set, props:Set }: объявление защищено,
 * если его свойство указано в проверке и селектор упоминает тот же класс.
 */
function collectTestProtected(dir) {
  const rules = [];
  if (!fs.existsSync(dir)) return rules;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.test\.mjs$/.test(f)) continue;
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const line of src.split("\n")) {
      if (!/!\s*\\?s\*important|!important/.test(line)) continue;
      const props = new Set();
      // [^;{}] — критично: без запрета на «{» ленивый хвост перепрыгивает
      // через блок и в `.admin-content:has(...) { padding: 10px !important }`
      // свойством оказывается «content», а настоящее `padding` теряет защиту.
      for (const m of line.matchAll(/([-a-zA-Z]+)\s*:\s*(?:\\s\*)?[^;{}]*?!\s*(?:\\s\*)?important/g)) {
        const p = m[1].toLowerCase();
        if (!p.startsWith("--")) props.add(p);
      }
      const classes = new Set([...line.matchAll(/\\\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
      if (props.size) rules.push({ classes, props });
    }
  }
  return rules;
}

function isTestProtected(decl, rules) {
  for (const r of rules) {
    if (!r.props.has(decl.prop)) continue;
    if (!r.classes.size) return true;                 // проверка без классов — перестрахуемся
    for (const c of decl.key.classes) if (r.classes.has(c)) return true;
    // класс может стоять не в ключевом компаунде (напр. `.admin-shell .admin-main`)
    for (const c of r.classes) if (new RegExp(`\\.${c}(?![\\w-])`).test(decl.selector)) return true;
  }
  return false;
}

// ── Аудит ────────────────────────────────────────────────────────────────────

function auditBundle(name, ev) {
  const bundle = BUNDLES[name];
  const decls = [];
  bundle.files.forEach((rel, idx) => {
    const abs = path.join(SRC, rel);
    if (!fs.existsSync(abs)) return;
    decls.push(...parseDeclarations(fs.readFileSync(abs, "utf8"), idx, rel));
  });

  const byProp = new Map();
  for (const d of decls) {
    if (!byProp.has(d.prop)) byProp.set(d.prop, []);
    byProp.get(d.prop).push(d);
  }

  // Снятие флага — операция НАД ГРУППОЙ, а не над одним объявлением.
  // Внутри группы конкурентов (одно свойство + пересекающиеся селекторы +
  // одно медиа-условие) победитель определяется specificity и порядком. Если
  // ВСЕ участники группы помечены !important, то снятие флага у всех сразу
  // сохраняет ровно то же сравнение — победитель не меняется ни для одного
  // элемента. Это и есть доказуемо безопасный случай.
  //
  // Если в группе есть хоть одно обычное объявление, оно сейчас подавлено
  // важностью; снятие может вывести его вперёд — такие группы не трогаем.
  // Снятие флага — операция над МНОЖЕСТВОМ, и решения взаимозависимы.
  // Считаем неподвижную точку: сначала предполагаем, что снимаем у всех
  // важных, затем итеративно исключаем те, снятие которых меняет победителя.
  //
  // Объявление D (важное, снимаем) конфликтует с пересекающимся O того же
  // свойства, если:
  //   • O обычное и по specificity/порядку обошло бы D  → D сейчас держится
  //     только на важности, снимать нельзя;
  //   • O важное и флаг у него ОСТАЁТСЯ, а D сейчас побеждает O → после
  //     снятия O выйдет вперёд, снимать нельзя.
  // Пара «оба снимаем» безопасна: их взаимный порядок сохраняется.
  const safe = [], unsafe = [];
  for (const [, list] of byProp) {
    const imps = list.filter((d) => d.important && !isTestProtected(d, protectedRules));
    if (!imps.length) continue;
    const normals = list.filter((d) => !d.important);

    const strip = new Set(imps);
    const blocked = new Map();

    // Шаг 1: важные, которых обошло бы подавленное обычное правило.
    for (const d of imps) {
      for (const o of normals) {
        if (d.media !== o.media || !mayShareElement(d, o, ev)) continue;
        if (beatsNormally(o, d)) {
          strip.delete(d);
          blocked.set(d, `подавляет ${o.fileName}:${o.line} (${o.selector})`);
          break;
        }
      }
    }

    // Шаг 2: распространение. Если сосед сохраняет !important, а мы его
    // сейчас перебиваем — снимать у нас тоже нельзя.
    let changed = true;
    while (changed) {
      changed = false;
      for (const d of [...strip]) {
        for (const o of imps) {
          if (o === d || strip.has(o)) continue;
          if (d.media !== o.media || !mayShareElement(d, o, ev)) continue;
          if (beatsNormally(d, o)) {
            strip.delete(d);
            blocked.set(d, `уступит сохранённому !important ${o.fileName}:${o.line} (${o.selector})`);
            changed = true;
            break;
          }
        }
      }
    }

    for (const d of imps) (strip.has(d) ? safe : unsafe).push(strip.has(d) ? d : { ...d, reason: blocked.get(d) });
  }
  return { decls, safe, unsafe };
}

// ── Применение ───────────────────────────────────────────────────────────────

/** Снимает !important только у объявлений из набора safe (по файлу и позиции). */
function applyRemovals(bundleName, safe) {
  const byFile = new Map();
  for (const s of safe) {
    if (!byFile.has(s.fileName)) byFile.set(s.fileName, new Set());
    byFile.get(s.fileName).add(`${s.selector}||${s.prop}||${s.line}`);
  }
  let removed = 0;
  for (const [rel, keys] of byFile) {
    const abs = path.join(SRC, rel);
    const original = fs.readFileSync(abs, "utf8");
    const clean = stripComments(original);
    const out = original.split("");
    // Переразбираем и точечно вырезаем "!important" по позициям.
    const decls = parseDeclarationsWithPos(clean, rel);
    for (const d of decls) {
      if (!d.important) continue;
      if (!keys.has(`${d.selector}||${d.prop}||${d.line}`)) continue;
      for (let i = d.bangStart; i < d.bangEnd; i++) out[i] = "";
      removed++;
    }
    fs.writeFileSync(abs, out.join(""), "utf8");
  }
  return removed;
}

/** Как parseDeclarations, но с позициями "!important" в исходнике. */
function parseDeclarationsWithPos(clean, fileName) {
  const res = [];
  let i = 0;
  const atStack = [];
  while (i < clean.length) {
    const ch = clean[i];
    if (ch === "@") {
      const braceAt = clean.indexOf("{", i);
      const semiAt = clean.indexOf(";", i);
      if (semiAt !== -1 && (braceAt === -1 || semiAt < braceAt)) { i = semiAt + 1; continue; }
      if (braceAt === -1) break;
      atStack.push({ close: matchBrace(clean, braceAt) });
      i = braceAt + 1; continue;
    }
    if (ch === "}") { while (atStack.length && atStack[atStack.length - 1].close === i) atStack.pop(); i++; continue; }
    const braceAt = clean.indexOf("{", i);
    if (braceAt === -1) break;
    const nextClose = clean.indexOf("}", i);
    if (nextClose !== -1 && nextClose < braceAt) { i = nextClose + 1; continue; }
    const selectorRaw = clean.slice(i, braceAt).trim();
    const close = matchBrace(clean, braceAt);
    if (close === -1) break;
    if (selectorRaw && !selectorRaw.startsWith("@")) {
      const line = clean.slice(0, braceAt).split("\n").length;
      let cursor = braceAt + 1;
      for (const seg of splitTop(clean.slice(braceAt + 1, close), ";")) {
        const segStart = cursor;
        cursor += seg.length + 1;
        const colonRel = seg.indexOf(":");
        if (colonRel <= 0) continue;
        const prop = seg.slice(0, colonRel).trim().toLowerCase();
        if (!prop || prop.startsWith("--")) continue;
        const bang = seg.search(/!\s*important/i);
        if (bang === -1) continue;
        const m = seg.match(/!\s*important/i);
        const bangStart = segStart + bang;
        const bangEnd = bangStart + m[0].length;
        for (const selector of splitTop(selectorRaw, ",")) {
          const sel = selector.trim();
          if (sel) res.push({ selector: sel, prop, line, important: true, bangStart, bangEnd });
        }
      }
    }
    i = close + 1;
  }
  // Дедуп по позиции (селекторы через запятую делят одно объявление).
  const seen = new Set();
  return res.filter((d) => {
    const k = `${d.bangStart}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const only = args.includes("--bundle") ? args[args.indexOf("--bundle") + 1] : null;
const apply = args.includes("--apply");

const protectedRules = collectTestProtected(path.resolve(__dirname, "..", "scripts"));
const ev = collectDomEvidence(SRC, [path.resolve(__dirname, "..", "index.html"), path.resolve(__dirname, "..", "admin.html")]);
console.log(`Свидетельств из разметки: пар классов ${ev.pairs.size}, классов с тегами ${ev.classTags.size}, id ${ev.idInfo.size}\n`);

let grandSafe = 0, grandTotal = 0;
for (const name of Object.keys(BUNDLES)) {
  if (only && name !== only) continue;
  const { safe, unsafe } = auditBundle(name, ev);
  const total = safe.length + unsafe.length;
  grandSafe += safe.length; grandTotal += total;
  console.log(`── бандл «${name}» ──`);
  console.log(`  !important всего      : ${total}`);
  console.log(`  можно снять безопасно : ${safe.length}  (${total ? (100 * safe.length / total).toFixed(1) : 0}%)`);
  console.log(`  оставить (несущие)    : ${unsafe.length}`);
  const byReason = new Map();
  for (const u of unsafe) {
    const k = u.reason?.split(" ")[0] ?? "?";
    byReason.set(k, (byReason.get(k) || 0) + 1);
  }
  for (const [k, v] of byReason) console.log(`      ${k}: ${v}`);
  if (args.includes("--examples")) {
    console.log("  примеры несущих:");
    for (const u of unsafe.slice(0, 12))
      console.log(`    ${u.fileName}:${u.line}  {${u.selector}} ${u.prop}  ← ${u.reason}`);
  }
  if (apply) {
    const n = applyRemovals(name, safe);
    console.log(`  СНЯТО: ${n}`);
  }
  console.log();
}
console.log(`ИТОГО безопасно: ${grandSafe} из ${grandTotal}`);
