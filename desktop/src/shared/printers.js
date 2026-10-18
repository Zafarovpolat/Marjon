// Выбор чекового принтера для печати.
//
// Приоритет:
//   1) принтер, закреплённый за сотрудником в веб-админке (карточка сотрудника,
//      поле «Принтер») — приходит как user.printer_id;
//   2) иначе — чековый принтер филиала, как было раньше.
//
// Отдельная функция, потому что этот выбор нужен в пяти местах (касса,
// официант, история, отчёты, пакетная печать) и везде должен совпадать:
// расхождение здесь означает «чек ушёл не на тот принтер».
export function pickReceiptPrinter(list, { printerId, branchId } = {}) {
  const all = Array.isArray(list) ? list : []
  // Привязка сотрудника главнее типа: если владелец явно выбрал принтер,
  // печатаем на него, даже если он помечен как кухонный.
  if (printerId) {
    const bound = all.find((printer) => printer.id === printerId)
    if (bound) return bound
  }
  return all.find((printer) => printer.printer_type === 'receipt' && printer.branch_id === branchId) || null
}
