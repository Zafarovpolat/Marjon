// Права сотрудника приходят из веб-админки (user.permissions).
// Правило: если объект прав не задан (старые/сид-аккаунты) — разрешаем всё.
// Если задан — действие запрещено только когда флаг явно false.
export function can(user, key) {
  const p = user?.permissions
  if (!p || typeof p !== 'object' || Object.keys(p).length === 0) return true
  return p[key] !== false
}

// Строгая проверка для ОПАСНЫХ действий (удаление/перенос блюда, смена стола,
// отмена заказа): разрешаем ТОЛЬКО когда право явно выдано в админке (=== true).
// В отличие от can(), пустой/незаданный объект прав здесь НЕ разрешает.
export function must(user, key) {
  const p = user?.permissions
  return !!(p && typeof p === 'object' && p[key] === true)
}
