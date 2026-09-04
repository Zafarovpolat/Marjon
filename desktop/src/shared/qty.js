/**
 * Формат количества порций для показа на экранах.
 * Бэкенд отдаёт Decimal («1.50000», «2.000»), поэтому округляем до двух знаков
 * и печатаем без хвостовых нулей: 1.50000 → «1.5», 2.000 → «2», 0.25 → «0.25».
 */
export function formatQty(value) {
  if (value == null || value === '') return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return String(Math.round(num * 100) / 100)
}
