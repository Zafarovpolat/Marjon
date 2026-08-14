import { toFiniteNumber } from "./analyticsData";

// Демо/симуляционные заготовки OWNER-дашборда. Ретейнятся как в исходнике
// (мёртвый код, не вызывается в живом рендере). Вынесено из OwnerDashboard.jsx (FE-07B).
// Реальные данные и truth-гарды не затрагиваются: функции остаются невызванными.

export const DEMO_PLACE_SETTINGS = [
  { id: "demo-place-hall", name: "Зал" },
  { id: "demo-place-terrace", name: "Терраса" },
  { id: "demo-place-delivery", name: "Доставка" },
  { id: "demo-place-pickup", name: "Самовывоз" },
];

export const DEMO_TOP_PRODUCTS = [
  { product_id: "demo-top-1", name: "Плов", quantity_sold: 42, revenue: 1_890_000 },
  { product_id: "demo-top-2", name: "Шашлык", quantity_sold: 36, revenue: 1_620_000 },
  { product_id: "demo-top-3", name: "Лагман", quantity_sold: 31, revenue: 1_085_000 },
  { product_id: "demo-top-4", name: "Манты", quantity_sold: 28, revenue: 980_000 },
  { product_id: "demo-top-5", name: "Салат микс", quantity_sold: 24, revenue: 720_000 },
];

export function roundedMoney(value) {
  return Math.round((Number(value) || 0) / 1000) * 1000;
}

export function hasRows(rows) {
  return Array.isArray(rows) && rows.length > 0;
}

export function hasPositiveAmount(rows = [], fields = ["amount", "total", "value", "revenue"]) {
  return rows.some((row) => fields.some((field) => Math.abs(toFiniteNumber(row?.[field])) > 0));
}

export function hasBalanceRows(rows = []) {
  return rows.some((row) => Math.abs(toFiniteNumber(row.closing_balance ?? row.closingBalance ?? row.balance)) > 0);
}

export function simulatedRevenueAmount(index, days) {
  const weekdayWeight = [0.82, 0.96, 1.08, 1.2, 1.34, 1.52, 1.16][index % 7];
  const progress = days > 1 ? index / (days - 1) : 0;
  const trend = 1 + progress * 0.22;
  const wave = 1 + Math.sin(progress * Math.PI * 2) * 0.12;
  return Math.round((1_850_000 * weekdayWeight * trend * wave) / 1000) * 1000;
}

export function buildSimulatedDashboard(sales = []) {
  const current = sales.at(-1) || { revenue: 0 };
  const prev = sales.at(-2) || current;
  const revenue = Math.max(1_500_000, roundedMoney(current.revenue));
  const prevRevenue = Math.max(1, roundedMoney(prev.revenue || revenue * 0.92));
  const orders = Math.max(14, Math.round(revenue / 115_000));
  const activeOrders = Math.max(3, Math.round(orders * 0.16));
  const avgCheck = Math.round(revenue / Math.max(orders, 1));
  const cashTotal = roundedMoney(revenue * 0.42);
  const nonCashTotal = Math.max(0, revenue - cashTotal);
  const cardTotal = roundedMoney(nonCashTotal * 0.46);
  const clickTotal = roundedMoney(nonCashTotal * 0.28);
  const paymeTotal = roundedMoney(nonCashTotal * 0.18);
  const otherPaymentTotal = Math.max(0, nonCashTotal - cardTotal - clickTotal - paymeTotal);
  const incomeTotal = roundedMoney(revenue * 1.08);
  const expenseTotal = roundedMoney(revenue * 0.34);

  return {
    today_revenue: revenue,
    today_orders: orders,
    avg_check: avgCheck,
    active_orders: activeOrders,
    cash_total: cashTotal,
    non_cash_total: nonCashTotal,
    income_total: incomeTotal,
    expense_total: expenseTotal,
    payment_methods: [
      { name: "cash", amount: cashTotal },
      { name: "card", amount: cardTotal },
      { name: "click", amount: clickTotal },
      { name: "payme", amount: paymeTotal },
      { name: "Другие оплаты", amount: otherPaymentTotal },
    ],
    order_locations: [
      { name: "Зал", count: Math.round(orders * 0.48) },
      { name: "Терраса", count: Math.round(orders * 0.22) },
      { name: "Доставка", order_type: "delivery", count: Math.round(orders * 0.18) },
      { name: "Самовывоз", order_type: "takeaway", count: Math.max(1, orders - Math.round(orders * 0.88)) },
    ],
    avg_check_segments: [
      { name: "Зал", avg_check: roundedMoney(avgCheck * 1.06), orders_count: Math.round(orders * 0.48) },
      { name: "Терраса", avg_check: roundedMoney(avgCheck * 1.12), orders_count: Math.round(orders * 0.22) },
      { name: "Доставка", order_type: "delivery", avg_check: roundedMoney(avgCheck * 0.94), orders_count: Math.round(orders * 0.18) },
      { name: "Самовывоз", order_type: "takeaway", avg_check: roundedMoney(avgCheck * 0.82), orders_count: Math.max(1, orders - Math.round(orders * 0.88)) },
    ],
    income_breakdown: [
      { name: "Продажи зал", amount: roundedMoney(incomeTotal * 0.46) },
      { name: "Продажи доставка", amount: roundedMoney(incomeTotal * 0.24) },
      { name: "Терминал и карты", amount: roundedMoney(incomeTotal * 0.20) },
      { name: "Прочие поступления", amount: Math.max(0, incomeTotal - roundedMoney(incomeTotal * 0.90)) },
    ],
    expense_breakdown: [
      { name: "Закупка продуктов", amount: roundedMoney(expenseTotal * 0.52) },
      { name: "Зарплата смены", amount: roundedMoney(expenseTotal * 0.22) },
      { name: "Хоз. расходы", amount: roundedMoney(expenseTotal * 0.16) },
      { name: "Доставка и упаковка", amount: Math.max(0, expenseTotal - roundedMoney(expenseTotal * 0.90)) },
    ],
    previous_revenue: prevRevenue,
  };
}

export function buildSimulatedFinanceTransactions(selectedDate) {
  return [
    { id: "demo-fin-1", date: selectedDate, direction: "income", payment_type_name: "Наличные", counterparty_name: "Гости зала", category_name: "Продажи зал", amount: 1_240_000, comment: "Демо приход" },
    { id: "demo-fin-2", date: selectedDate, direction: "income", payment_type_name: "Terminal", counterparty_name: "Гости террасы", category_name: "Терминал и карты", amount: 980_000, comment: "Демо приход" },
    { id: "demo-fin-3", date: selectedDate, direction: "expense", payment_type_name: "Наличные", counterparty_name: "Bozor", category_name: "Закупка продуктов", amount: 640_000, comment: "Демо расход" },
    { id: "demo-fin-4", date: selectedDate, direction: "expense", payment_type_name: "CLICK", counterparty_name: "Logistika", category_name: "Доставка и упаковка", amount: 210_000, comment: "Демо расход" },
  ];
}

export function buildSimulatedWarehouseReports() {
  return {
    incomes: [
      { product_name: "Говядина", provider_name: "Fresh Meat", storage_name: "Основной склад", total: 1_840_000 },
      { product_name: "Рис лазер", provider_name: "Bozor", storage_name: "Кухня", total: 620_000 },
      { product_name: "Овощи", provider_name: "Green Market", storage_name: "Кухня", total: 410_000 },
    ],
    consumption: [
      { product_name: "Говядина", receiver: "Кухня", storage_name: "Основной склад", total: 780_000 },
      { product_name: "Напитки", receiver: "Бар", storage_name: "Бар", total: 360_000 },
      { product_name: "Упаковка", receiver: "Доставка", storage_name: "Основной склад", total: 190_000 },
    ],
    balances: [
      { ingredient_name: "Говядина", warehouse_name: "Основной склад", quantity: 24, cost_price: 78_000 },
      { ingredient_name: "Рис", warehouse_name: "Кухня", quantity: 38, cost_price: 15_000 },
    ],
    debtCredit: [
      { counterparty_name: "Fresh Meat", closing_balance: -2_150_000, status: "К оплате" },
      { counterparty_name: "Green Market", closing_balance: -760_000, status: "К оплате" },
      { counterparty_name: "VIP клиент", closing_balance: 940_000, status: "Ожидается" },
      { counterparty_name: "Кейтеринг", closing_balance: 520_000, status: "Ожидается" },
    ],
    stock: [
      { ingredient_name: "Говядина", warehouse_name: "Основной склад", quantity: 24, cost_price: 78_000 },
      { ingredient_name: "Рис", warehouse_name: "Кухня", quantity: 38, cost_price: 15_000 },
      { ingredient_name: "Овощи", warehouse_name: "Кухня", quantity: 45, cost_price: 9_000 },
      { ingredient_name: "Напитки", warehouse_name: "Бар", quantity: 66, cost_price: 12_000 },
    ],
  };
}

export function buildSimulatedRecentOrders(selectedDate) {
  return [
    { id: "demo-order-1", order_number: "10428", created_at: `${selectedDate}T20:45:00`, table_number: "12", total_amount: 286_000, status: "completed" },
    { id: "demo-order-2", order_number: "10427", created_at: `${selectedDate}T20:31:00`, table_number: "7", total_amount: 194_000, status: "ready" },
    { id: "demo-order-3", order_number: "10426", created_at: `${selectedDate}T20:10:00`, order_type: "Доставка", total_amount: 342_000, status: "completed" },
    { id: "demo-order-4", order_number: "10425", created_at: `${selectedDate}T19:48:00`, table_number: "3", total_amount: 128_000, status: "in_progress" },
    { id: "demo-order-5", order_number: "10424", created_at: `${selectedDate}T19:22:00`, order_type: "Самовывоз", total_amount: 96_000, status: "completed" },
  ];
}



