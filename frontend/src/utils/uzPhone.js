// Телефонные утилиты Узбекистана (+998) для веб-панели.
// Зеркалит desktop/src/shared/phone.js 1:1, чтобы логин филиала, введённый в
// вебе, совпадал байт-в-байт с тем, что десктоп шлёт в /auth/branch-login
// (каноничный вид +998XXXXXXXXX). Фронт не может импортировать из desktop/,
// поэтому логика продублирована намеренно.

// Оставляет только 9 локальных цифр номера (отбрасывает код страны 998).
export function extractPhoneDigits(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("998")) d = d.slice(3);
  return d.slice(0, 9);
}

// Форматирует цифры в маску: +998 XX XXX-XX-XX
export function formatPhone(digits) {
  const d = typeof digits === "string" && /^\d*$/.test(digits) ? digits : extractPhoneDigits(digits);
  let out = "+998";
  if (d.length > 0) out += " " + d.slice(0, 2);
  if (d.length > 2) out += " " + d.slice(2, 5);
  if (d.length > 5) out += "-" + d.slice(5, 7);
  if (d.length > 7) out += "-" + d.slice(7, 9);
  return out;
}

// Полный номер в формате бэкенда: +998XXXXXXXXX (или '' если пусто).
export function fullPhone(digits) {
  const d = extractPhoneDigits(digits);
  return d ? "+998" + d : "";
}

// Готов ли номер (9 локальных цифр).
export function isPhoneComplete(digits) {
  return extractPhoneDigits(digits).length === 9;
}
