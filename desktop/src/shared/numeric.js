/**
 * Ввод чисел на терминале с экранной клавиатурой.
 *
 * Почему не `type="number"`: браузер санитайзит значение number-поля по
 * правилам floating-point, поэтому набор «0.» превращается в пустую строку
 * (а «5.» — тоже), и дробную порцию/скидку набрать невозможно. Плюс
 * `setSelectionRange` на number-поле бросает InvalidStateError, из-за чего
 * экранная клавиатура срывалась на первом же нажатии.
 *
 * Поэтому все числовые поля — `type="text"` + `inputMode` + `data-keyboard="num"`,
 * а значение чистим здесь: только цифры и один разделитель.
 */

/** Оставляет цифры и один десятичный разделитель (запятая → точка). */
export function sanitizeDecimal(raw, maxDecimals = 2) {
  let s = String(raw ?? '').replace(/,/g, '.').replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  if (dot !== -1) {
    const head = s.slice(0, dot)
    const tail = s.slice(dot + 1).replace(/\./g, '')
    s = `${head}.${maxDecimals >= 0 ? tail.slice(0, maxDecimals) : tail}`
  }
  return s
}

/** Оставляет только цифры (целые суммы: цена, получено). */
export function sanitizeInt(raw) {
  return String(raw ?? '').replace(/[^\d]/g, '')
}

/** Строка из поля → число. Пустое/мусор → 0. */
export function parseNum(raw) {
  const n = Number(String(raw ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
