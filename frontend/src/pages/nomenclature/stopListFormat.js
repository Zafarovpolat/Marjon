// Стоп-лист V2.1: scoped форматтер/парсер количеств (только презентация).
// Группировка тысяч обычным пробелом (`1 212`), десятичные — запятой
// (`1 212,5`, конечные нули обрезаются). API-данные не мутируют:
// PATCH шлёт нормализованную dot-строку без группировки.
// Денежный формат проекта не тронут.
const GROUP_SPACE = " ";

function splitAmount(text) {
  const normalized = String(text ?? "").trim().replace(/[\s   ]/g, "");
  const match = normalized.match(/^(-)?(\d*)([.,])?(\d*)$/);
  if (!match) return null;
  return { sign: match[1] || "", int: match[2] || "", sep: match[3] || "", frac: match[4] || "" };
}

function groupInt(intPart) {
  const digits = intPart.replace(/^0+(?=\d)/, "") || "0";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SPACE);
}

// Презентация Decimal-совместимого значения. null/undefined/NaN → "".
// Примеры: 1212 → "1 212"; "1212.5" → "1 212,5"; "1212.500" → "1 212,5".
export function formatQuantity(value) {
  if (value == null) return "";
  const parts = splitAmount(value);
  if (!parts) return "";
  if (!parts.int && !parts.frac) return "";
  const frac = parts.frac.replace(/0+$/, "");
  const head = groupInt(parts.int);
  return frac ? `${parts.sign}${head},${frac}` : `${parts.sign}${head}`;
}

// Строгий разбор пользовательского ввода в каноническую dot-строку.
// Правила (под NUMERIC(12,3) и ProductLimitUpdate gt=0):
// цифры + пробелы-разделители + максимум ОДИН ./, ; > 0; ≤3 знаков дроби;
// целая часть ≤9 цифр; без букв, экспоненты и минуса.
// Успех: { ok: true, normalized: "1212.5" }; провал: { ok: false }.
export function parseQuantityInput(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false };
  if (/[eE]/.test(text)) return { ok: false };
  const compact = text.replace(/[\s   ]/g, "");
  if (!/^\d*([.,]\d*)?$/.test(compact) || compact === "." || compact === ",") return { ok: false };
  const withDot = compact.replace(",", ".");
  if ((withDot.match(/\./g) || []).length > 1) return { ok: false };
  const [intRaw = "", fracRaw = ""] = withDot.split(".");
  const intPart = intRaw.replace(/^0+(?=\d)/, "") || "0";
  if (intPart.length > 9) return { ok: false };
  if (fracRaw.length > 3) return { ok: false };
  const frac = fracRaw.replace(/0+$/, "");
  const normalized = frac ? `${intPart}.${frac}` : intPart;
  if (Number(normalized) <= 0 || !Number.isFinite(Number(normalized))) return { ok: false };
  return { ok: true, normalized };
}

// Живая маска ввода: группирует тысячи ПРЯМО ВО ВРЕМЯ печати
// (`2323` → `2 323`) с точным восстановлением каретки.
// Маппинг каретки — по количеству значащих символов (цифры + первый
// разделитель): группировочные пробелы позицию не сдвигают.
// Backspace по пробелу, выделение/замена всего значения, paste —
// работают естественно. Буквы отбрасываются сразу (состояние их не хранит).
// Возвращает { text, caret } для контролируемого input.
export function applyLiveMask(value, caretPos) {
  const raw = String(value ?? "");
  const caret = Math.max(0, Math.min(Number.isFinite(caretPos) ? caretPos : raw.length, raw.length));
  // Сколько значащих символов было до каретки (цифры + первый разделитель).
  let target = 0;
  let sepKept = false;
  for (let i = 0; i < caret; i += 1) {
    const ch = raw[i];
    if (ch >= "0" && ch <= "9") target += 1;
    else if ((ch === "." || ch === ",") && !sepKept) { sepKept = true; target += 1; }
  }
  // Чистим всю строку: цифры + максимум один разделитель.
  let intRaw = "";
  let fracRaw = null;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      if (fracRaw === null) intRaw += ch;
      else fracRaw += ch;
    } else if ((ch === "." || ch === ",") && fracRaw === null) {
      fracRaw = "";
    }
  }
  intRaw = intRaw.slice(0, 12);
  if (fracRaw !== null) fracRaw = fracRaw.slice(0, 6);
  if (intRaw === "" && fracRaw === null) return { text: "", caret: 0 };
  const text = groupInt(intRaw === "" ? "0" : intRaw) + (fracRaw !== null ? `,${fracRaw}` : "");
  // Ставим каретку после того же количества значащих символов.
  let pos = 0;
  let counted = 0;
  while (pos < text.length && counted < target) {
    if (text[pos] !== GROUP_SPACE) counted += 1;
    pos += 1;
  }
  return { text, caret: pos };
}

// Канонический лимит из черновика ввода.
// Пусто/ноль/мусор → null, иначе нормализованная dot-строка для PATCH.
export function parseStopListLimit(value) {
  const parsed = parseQuantityInput(value);
  return parsed.ok ? parsed.normalized : null;
}
