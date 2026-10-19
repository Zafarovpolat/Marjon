import { formatMoney, formatNumber } from "../../api/client";
import { buildRealKpis, normalizeMetricRows } from "./analyticsData";

// Deterministic visual preview only. Never used as an API fallback or persisted.
// Hours are retained verbatim: existing KPI dialogs have tables, not charts.
const HOURS = ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];
const hourly = (values) => values.map((value, index) => ({ hour: HOURS[index], value }));
const rows = (values) => values.map(([name, amount, percent]) => ({ name, amount, percent }));

export const dashboardPreviewData = {
  date: "2026-10-05",
  dateLabel: "05.10.2026",
  revenue: {
    total: 12450000,
    orders: 246,
    averageCheck: 50610,
    hourly: hourly([100000, 150000, 300000, 1200000, 2100000, 1600000, 3000000, 4000000]),
    top: rows([
      ["Плов", 3250000, 26.1], ["Шашлык", 2480000, 19.9],
      ["Супы", 1720000, 13.8], ["Салаты", 1140000, 9.2], ["Напитки", 980000, 7.9],
    ]),
  },
  orders: {
    total: 246,
    averageMinutes: 18,
    cancelled: 12,
    hourly: hourly([2, 3, 5, 20, 40, 32, 60, 84]),
    top: rows([
      ["Плов", 52, 21.1], ["Шашлык", 38, 15.4], ["Лагман", 27, 11.0],
      ["Цезарь", 24, 9.8], ["Чай", 22, 8.9],
    ]),
  },
  average: {
    total: 50610,
    max: 420000,
    min: 12000,
    hourly: hourly([50000, 50000, 60000, 60000, 52500, 50000, 50000, 47620]),
    top: rows([
      ["Стол 5", 128000], ["Стол 12", 96000], ["Стол 3", 84000],
      ["Стол 8", 76000], ["Стол 1", 68000],
    ]),
  },
  income: {
    total: 12450000,
    hourly: hourly([100000, 150000, 300000, 1200000, 2100000, 1600000, 3000000, 4000000]),
    breakdown: rows([
      ["Наличные", 7280000, 58.5], ["Банковская карта", 4650000, 37.3], ["QR / Онлайн", 520000, 4.2],
    ]),
  },
  expense: {
    total: 3420000,
    hourly: hourly([80000, 70000, 120000, 350000, 700000, 550000, 900000, 650000]),
    breakdown: rows([["Операционные", 2180000, 63.7], ["Закупка", 1240000, 36.3]]),
    top: rows([
      ["Закупка продуктов", 1240000, 36.3], ["Зарплата", 980000, 28.7],
      ["Коммунальные", 420000, 12.3], ["Аренда", 380000, 11.1], ["Прочие", 400000, 11.6],
    ]),
  },
};

export function buildDashboardPreviewKpis() {
  const data = dashboardPreviewData;
  const previewLabel = `Предпросмотр · ${data.dateLabel}.`;
  const kpis = buildRealKpis({
    today_revenue: data.revenue.total,
    today_orders: data.orders.total,
    avg_check: data.average.total,
    income_total: data.income.total,
    expense_total: data.expense.total,
  }, [], data.date);
  const tables = [
    { rows: data.revenue.top, labelColumn: "Категория", valueColumn: "Выручка" },
    { rows: data.orders.top, labelColumn: "Блюдо", valueColumn: "Заказы", formatValue: formatNumber },
    {
      // Reuse the existing average-check index definition (amount / average).
      rows: normalizeMetricRows(data.average.top, data.average.total),
      labelColumn: "Стол", valueColumn: "Средний чек", shareColumn: "Индекс",
    },
    { rows: data.income.breakdown, labelColumn: "Источник", valueColumn: "Приход" },
    { rows: data.expense.top, labelColumn: "Статья расходов", valueColumn: "Сумма" },
  ];
  const descriptions = [
    `${previewLabel} Заказов: ${formatNumber(data.revenue.orders)}. Средний чек: ${formatMoney(data.revenue.averageCheck)}.`,
    `${previewLabel} Среднее время заказа: ${data.orders.averageMinutes} мин. Отменённые: ${data.orders.cancelled}.`,
    `${previewLabel} Максимальный: ${formatMoney(data.average.max)}. Минимальный: ${formatMoney(data.average.min)}.`,
    `${previewLabel} Поступления по способам оплаты.`,
    `${previewLabel} ${data.expense.breakdown.map((row) => `${row.name}: ${formatMoney(row.amount)} (${row.percent}%)`).join(". ")}.`,
  ];
  const values = [data.revenue.total, data.orders.total, data.average.total, data.income.total, data.expense.total];

  return kpis.map((kpi, index) => ({
    ...kpi,
    // DEV-only fixture keeps its populated design examples, not live Finance state.
    comingSoon: false,
    hideDescription: false,
    suffix: index === 1 ? "" : "UZS",
    value: formatNumber(values[index]),
    description: descriptions[index],
    table: { formatValue: formatMoney, shareColumn: "Доля", ...tables[index] },
  }));
}
