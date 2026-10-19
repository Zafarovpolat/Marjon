// OWNER web calendar only. Do not share device-local assumptions with desktop.
export const WEB_TIMEZONE = "Asia/Tashkent";

export function parseWebInstant(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  let raw = String(value ?? "").trim();
  if (!raw) return null;
  const legacy = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})\s*\/\s*(\d{2}):(\d{2})$/);
  if (legacy) raw = `${legacy[3]}-${legacy[2]}-${legacy[1]}T${legacy[4]}:${legacy[5]}:00Z`;
  else if (/^\d{4}-\d{2}-\d{2}[T ]/.test(raw) && !/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) raw = `${raw.replace(" ", "T")}Z`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function webFormat(value, options = {}) {
  const date = parseWebInstant(value);
  return date ? new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: WEB_TIMEZONE }).format(date) : "";
}

export function webDayKey(value = new Date()) {
  const date = parseWebInstant(value);
  if (!date) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: WEB_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function webTime(value = new Date()) {
  return webFormat(value, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function webDateTime(value) {
  const day = webFormat(value, { day: "2-digit", month: "2-digit", year: "numeric" });
  return day ? `${day} / ${webTime(value)}` : "";
}

// Calendar widgets do local Date arithmetic on selected DATE-ONLY values.
// Only their notion of TODAY is derived from the fixed web timezone.
export function webCalendarToday() {
  const [year, month, day] = webDayKey().split("-").map(Number);
  return new Date(year, month - 1, day);
}
