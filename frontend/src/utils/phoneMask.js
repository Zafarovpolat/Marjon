// Маска узбекского номера для полей «Логин» — одна на весь продукт.
//
// Раньше маска жила внутри LoginPage (веб-логин владельца), а кухонный экран
// и настройки филиала вводили номер как обычный текст: в одном месте поле
// показывает «90 123-45-67», в другом — сырые цифры. Здесь одна реализация,
// её и импортируют все экраны входа.
//
// В состоянии всегда лежат только 9 локальных цифр: код страны +998
// рисуется отдельным префиксом и никогда не участвует в редактировании.

const LOCAL_LEN = 9;

// Оставляет 9 локальных цифр. Код 998 снимается только у полного
// международного номера (12 цифр = 998 + 9), иначе локальный номер, который
// сам начинается с 998, обрезался бы при наборе.
export function getLocalPhoneDigits(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const body = digits.length >= 12 && digits.startsWith("998") ? digits.slice(3) : digits;
  return body.slice(0, LOCAL_LEN);
}

// Показ: «90 123-45-67» по мере набора.
export function formatLocalPhone(raw) {
  const local = getLocalPhoneDigits(raw);

  if (local.length <= 2) return local;
  if (local.length <= 5) return `${local.slice(0, 2)} ${local.slice(2)}`;
  if (local.length <= 7) return `${local.slice(0, 2)} ${local.slice(2, 5)}-${local.slice(5)}`;
  return `${local.slice(0, 2)} ${local.slice(2, 5)}-${local.slice(5, 7)}-${local.slice(7)}`;
}

// Полный номер для API: пусто — пусто, иначе каноничный +998XXXXXXXXX.
export function toFullPhone(localDigits) {
  const local = getLocalPhoneDigits(localDigits);
  return local ? `+998${local}` : "";
}

export function isLocalPhoneComplete(localDigits) {
  return getLocalPhoneDigits(localDigits).length === LOCAL_LEN;
}
