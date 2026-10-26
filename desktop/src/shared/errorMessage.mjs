const FIELD_LABELS = { branch_id: 'Филиал', table_id: 'Стол', product_id: 'Блюдо', quantity: 'Количество', persons_count: 'Количество гостей' }

function parts(value, depth = 0) {
  if (depth > 5 || value == null) return []
  if (typeof value === 'string') return value.trim() && value !== '[object Object]' ? [value.trim()] : []
  if (typeof value === 'number') return Number.isFinite(value) ? [String(value)] : []
  if (Array.isArray(value)) return value.flatMap(item => parts(item, depth + 1))
  if (typeof value !== 'object') return []
  if (typeof value.msg === 'string') {
    const field = Array.isArray(value.loc) ? value.loc[value.loc.length - 1] : null
    const label = FIELD_LABELS[field]
    if (field === 'table_id' && String(value.type).startsWith('uuid')) return ['Не удалось определить стол. Обновите список столов и выберите стол заново.']
    if (field === 'branch_id' && (value.type === 'missing' || String(value.type).startsWith('uuid'))) return ['Не выбран филиал. Повторно войдите в филиал терминала.']
    return [label ? `${label}: ${value.msg}` : value.msg]
  }
  for (const key of ['detail', 'message', 'error']) {
    const messages = parts(value[key], depth + 1)
    if (messages.length) return messages
  }
  return []
}

/** Only render text, never a validation object or raw request data. */
export function displayMessage(value, fallback = 'Не удалось выполнить действие.') {
  return [...new Set(parts(value))].slice(0, 5).join('; ') || fallback
}

export function errorMessage(error, fallback = 'Не удалось выполнить действие.') {
  return displayMessage(error?.response?.data?.detail ?? error?.response?.data?.message ?? error, fallback)
}
