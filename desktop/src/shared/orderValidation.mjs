export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''))
}

/** Refuse synthetic/stale seating IDs before sending an order to the kitchen. */
export function validateOrderCreate(data) {
  if (!isUuid(data?.branch_id)) throw new Error('Не выбран филиал. Повторно войдите в филиал терминала.')
  if (data.table_id != null && !isUuid(data.table_id)) throw new Error('Не удалось определить стол. Обновите список столов и выберите стол заново.')
  return data
}

// Company-wide monoblocks and staff may legitimately have no branch_id.
// A real table identifies its branch through the authenticated halls response.
// For unseated orders only a unique company branch is safe to infer.
export async function resolveOrderCreate(data, { loadHalls, loadBranches }) {
  if (data?.table_id != null && !isUuid(data.table_id)) {
    return validateOrderCreate({ ...data, branch_id: data.branch_id || 'invalid' })
  }
  if (isUuid(data?.branch_id)) return validateOrderCreate(data)
  let branchId
  if (data?.table_id) {
    const response = await loadHalls()
    const list = Array.isArray(response) ? response : response?.items || []
    const matches = list.filter(hall => hall.tables?.some(table => String(table.id) === String(data.table_id)))
    if (matches.length !== 1 || !isUuid(matches[0].branch_id)) {
      throw new Error('Не удалось определить филиал стола. Обновите список столов и выберите стол заново.')
    }
    branchId = matches[0].branch_id
  } else {
    const response = await loadBranches()
    const list = (Array.isArray(response) ? response : response?.items || []).filter(b => b.is_active !== false)
    if (list.length !== 1 || !isUuid(list[0].id)) {
      throw new Error('Для заказа без стола нужно выбрать филиал терминала: в организации несколько филиалов.')
    }
    branchId = list[0].id
  }
  return validateOrderCreate({ ...data, branch_id: branchId })
}
