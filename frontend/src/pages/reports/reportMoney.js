// Формат денежной суммы для страниц отчётов (локаль ru-RU, валюта UZS).
// Идентичен ранее продублированному локальному formatMoney в отчётах
// по заказам/столам/официантам и displayAmount в дебиторах/кредиторах.
export function formatMoney(value) {
  return `${new Intl.NumberFormat("ru-RU").format(Number(value))} UZS`;
}
