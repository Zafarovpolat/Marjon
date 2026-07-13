import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Chart, Filler, LineController, LineElement, LinearScale, PointElement, CategoryScale, Tooltip } from "chart.js";
import { Link, useOutletContext } from "react-router-dom";
import { api, formatMoney, formatNumber } from "../api/client";
import { formatDateLabel, todayInputValue, toDateInputValue } from "../utils/date";
import Icon from "../components/Icon";
import { PageLoader } from "../components/Loader";
import ReportDateRangePicker from "../components/ReportDateRangePicker";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

function dateSeed(value) {
  return value.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function seededFactor(seed, index, min = 0.82, max = 1.18) {
  const wave = Math.sin((seed + 17) * (index + 3)) * 10000;
  const normalized = wave - Math.floor(wave);
  return min + normalized * (max - min);
}

function inputDateToReportDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDateLabel(todayInputValue());
  }

  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function reportDateToInputDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    return todayInputValue();
  }

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function reportRangeEndingAt(days, endValue) {
  const end = new Date(`${endValue}T00:00:00`);
  const start = new Date(end);
  start.setDate(end.getDate() - Math.max(1, days) + 1);

  return {
    preset: "",
    start: inputDateToReportDate(toDateInputValue(start)),
    end: inputDateToReportDate(toDateInputValue(end)),
    startTime: "00:00",
    endTime: "00:00",
  };
}

function normalizeReportRange(range = {}) {
  const startInput = reportDateToInputDate(range.start);
  const endInput = reportDateToInputDate(range.end);
  const [dateFrom, dateTo] = startInput <= endInput ? [startInput, endInput] : [endInput, startInput];

  return {
    preset: range.preset || "",
    start: inputDateToReportDate(dateFrom),
    end: inputDateToReportDate(dateTo),
    startTime: "00:00",
    endTime: "00:00",
  };
}

function reportRangeToApiParams(range) {
  const normalized = normalizeReportRange(range);
  return {
    date_from: reportDateToInputDate(normalized.start),
    date_to: reportDateToInputDate(normalized.end),
  };
}

function reportRangeDays(range) {
  const normalized = normalizeReportRange(range);
  const start = new Date(`${reportDateToInputDate(normalized.start)}T00:00:00`);
  const end = new Date(`${reportDateToInputDate(normalized.end)}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function reportRangeLabel(range) {
  const normalized = normalizeReportRange(range);
  if (normalized.start === normalized.end) {
    return normalized.start;
  }

  return `${normalized.start} - ${normalized.end}`;
}

function formatDaysLabel(days) {
  const value = Math.max(1, Number(days) || 1);
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${value} день`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} дня`;
  }

  return `${value} дней`;
}

function clampAmount(value, max = Number.POSITIVE_INFINITY) {
  return Math.max(0, Math.min(Math.round(Number(value) || 0), max));
}

function normalizePaymentRows(rows = [], total = 0) {
  const revenue = Math.max(0, Number(total) || 0);
  return rows
    .map((row) => {
      const amount = clampAmount(row.amount);
      return {
        name: row.name,
        amount,
        percent: revenue > 0 ? Math.round((amount / revenue) * 100) : 0,
      };
    })
    .filter((row) => row.amount > 0 || row.name === "Другие оплаты");
}

function paymentMethodLabel(value) {
  const key = String(value || "").trim().toLowerCase();
  const labels = {
    cash: "Наличные",
    card: "Карта",
    click: "CLICK",
    payme: "Pay me",
    pay_me: "Pay me",
    paymego: "Pay me",
    uzum: "Uzum Bank",
    loyalty: "Лояльность",
    mixed: "Смешанная оплата",
  };

  return labels[key] || value || "Способ оплаты";
}

function demoPaymentRows(total, seed) {
  const revenue = Math.max(0, Number(total) || 0);
  const cash = clampAmount(Math.round((revenue * seededFactor(seed, 4, 0.27, 0.35)) / 10000) * 10000, revenue);
  const card = clampAmount(Math.round((revenue * seededFactor(seed, 15, 0.22, 0.29)) / 10000) * 10000, revenue - cash);
  const click = clampAmount(Math.round((revenue * seededFactor(seed, 16, 0.13, 0.19)) / 10000) * 10000, revenue - cash - card);
  const payme = clampAmount(Math.round((revenue * seededFactor(seed, 17, 0.10, 0.16)) / 10000) * 10000, revenue - cash - card - click);
  const uzum = clampAmount(Math.round((revenue * seededFactor(seed, 18, 0.06, 0.10)) / 10000) * 10000, revenue - cash - card - click - payme);
  const other = clampAmount(revenue - cash - card - click - payme - uzum);

  return normalizePaymentRows([
    { name: "Наличные", amount: cash },
    { name: "Карта", amount: card },
    { name: "CLICK", amount: click },
    { name: "Pay me", amount: payme },
    { name: "Uzum Bank", amount: uzum },
    { name: "Другие оплаты", amount: other },
  ], revenue);
}

function realPaymentRows(dash = {}, total = 0, seed = 1) {
  const revenue = Math.max(0, Number(total) || 0);
  const sourceRows = dash.payment_methods || dash.paymentMethods || dash.payment_breakdown || dash.paymentBreakdown;

  if (Array.isArray(sourceRows) && sourceRows.length) {
    return normalizePaymentRows(sourceRows.map((row) => {
      const rawName = row.name || row.label || row.method || row.payment_method || row.paymentMethod || row.type;
      return {
        name: paymentMethodLabel(rawName),
        amount: row.amount ?? row.total ?? row.revenue ?? row.value ?? 0,
      };
    }), revenue);
  }

  if (Array.isArray(sourceRows)) {
    return revenue > 0 ? normalizePaymentRows([{ name: "Не указано", amount: revenue }], revenue) : [];
  }

  const cash = clampAmount(dash.cash_total ?? dash.cash ?? 0, revenue);
  const nonCash = clampAmount(dash.non_cash_total ?? dash.card_total ?? dash.card ?? Math.max(0, revenue - cash), revenue - cash);

  if (cash > 0 || nonCash > 0) {
    const card = clampAmount(dash.card_total ?? Math.round(nonCash * 0.42), nonCash);
    const click = clampAmount(dash.click_total ?? dash.click ?? Math.round(nonCash * 0.25), nonCash - card);
    const payme = clampAmount(dash.payme_total ?? dash.pay_me_total ?? dash.payme ?? Math.round(nonCash * 0.20), nonCash - card - click);
    const other = clampAmount(nonCash - card - click - payme);

    return normalizePaymentRows([
      { name: "Наличные", amount: cash },
      { name: "Карта", amount: card },
      { name: "CLICK", amount: click },
      { name: "Pay me", amount: payme },
      { name: "Другие оплаты", amount: other },
    ], revenue);
  }

  return demoPaymentRows(revenue, seed);
}

const DEFAULT_PLACE_NAMES = ["Зал", "Бар", "Балкон", "Комната №1", "Кабина"];

function configuredPlaceNames(rows = []) {
  const names = rows
    .map((row) => String(row.name || row.label || row.title || "").trim())
    .filter(Boolean);

  return [...new Set(names)];
}

function orderLocationName(value, orderType, placeNames = []) {
  const type = String(orderType || "").trim().toLowerCase();
  if (type === "delivery" || type === "delivery_app") return "Доставка";
  if (type === "takeaway" || type === "pickup") return "Самовывоз";

  const raw = String(value || "").trim();
  if (!raw) return "Зал";

  const rawLower = raw.toLowerCase();
  const matchedPlace = placeNames.find((name) => rawLower.includes(String(name).toLowerCase()));
  if (matchedPlace) return matchedPlace;

  const [beforeComma] = raw.split(",");
  const cleaned = beforeComma.replace(/\s*(стол|table)\s*№?\s*\d+.*/i, "").trim();
  return cleaned || raw || "Зал";
}

function normalizeOrderRows(rows = [], total = 0, placeNames = []) {
  const ordersTotal = Math.max(0, Number(total) || 0);
  const configuredNames = configuredPlaceNames(placeNames);
  const amounts = new Map(configuredNames.map((name) => [name, 0]));

  rows.forEach((row) => {
    const rawName = row.name || row.label || row.place || row.table_number || row.tableNumber || row.location || row.type;
    const name = orderLocationName(rawName, row.order_type || row.orderType || row.type, configuredNames);
    const amount = clampAmount(row.count ?? row.orders ?? row.amount ?? row.total ?? row.value ?? 0);
    amounts.set(name, (amounts.get(name) || 0) + amount);
  });

  return [...amounts.entries()]
    .map(([name, amount]) => ({
      name,
      amount,
      percent: ordersTotal > 0 ? Math.round((amount / ordersTotal) * 100) : 0,
    }))
    .filter((row) => row.amount > 0 || configuredNames.includes(row.name));
}

function demoOrderRows(total, seed, placeNames = []) {
  const ordersTotal = Math.max(0, Number(total) || 0);
  const names = configuredPlaceNames(placeNames);
  const baseNames = names.length ? names : DEFAULT_PLACE_NAMES;
  const rows = [...baseNames, "Доставка", "Самовывоз"];
  const weights = rows.map((_, index) => seededFactor(seed, index + 21, 0.55, 1.35));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1;
  let used = 0;

  return normalizeOrderRows(rows.map((name, index) => {
    const amount = index === rows.length - 1
      ? Math.max(0, ordersTotal - used)
      : Math.max(0, Math.round((ordersTotal * weights[index]) / weightTotal));
    used += amount;
    return { name, count: amount };
  }), ordersTotal, baseNames);
}

function realOrderRows(dash = {}, total = 0, seed = 1, placeNames = []) {
  const sourceRows = dash.order_locations || dash.orderLocations || dash.place_orders || dash.placeOrders || dash.order_places || dash.orderPlaces;

  if (Array.isArray(sourceRows)) {
    return normalizeOrderRows(sourceRows, total, placeNames);
  }

  return demoOrderRows(total, seed, placeNames);
}

function normalizeMetricRows(rows = [], total = 0, keepZeroNames = []) {
  const base = Math.max(0, Number(total) || 0);
  const keep = new Set(keepZeroNames);

  return rows
    .map((row) => {
      const amount = clampAmount(row.amount ?? row.avg_check ?? row.avgCheck ?? row.value ?? 0);
      return {
        name: row.name || row.label || "Показатель",
        amount,
        percent: base > 0 ? Math.round((amount / base) * 100) : 0,
      };
    })
    .filter((row) => row.amount > 0 || keep.has(row.name));
}

function demoSplitRows(total, seed, labels, offset = 50) {
  const value = Math.max(0, Number(total) || 0);
  const weights = labels.map((_, index) => seededFactor(seed, offset + index, 0.45, 1.28));
  const weightTotal = weights.reduce((sum, item) => sum + item, 0) || 1;
  let used = 0;

  return normalizeMetricRows(labels.map((label, index) => {
    const amount = index === labels.length - 1
      ? Math.max(0, value - used)
      : Math.round((value * weights[index]) / weightTotal);
    used += amount;
    return { name: label, amount };
  }), value);
}

function demoAverageRows(avgCheck, seed, placeSettings = []) {
  const base = Math.max(0, Number(avgCheck) || 0);
  const places = configuredPlaceNames(placeSettings);
  const labels = (places.length ? places.slice(0, 5) : ["Зал", "Бар", "Балкон"]).concat(["Доставка", "Самовывоз"]);

  return normalizeMetricRows(labels.map((label, index) => ({
    name: label,
    amount: Math.round((base * seededFactor(seed, index + 70, 0.74, 1.24)) / 1000) * 1000,
  })), base);
}

function realAverageRows(dash = {}, avgCheck = 0, seed = 1, placeSettings = []) {
  const sourceRows = dash.avg_check_segments || dash.avgCheckSegments || dash.average_check_segments || dash.averageCheckSegments;
  const places = configuredPlaceNames(placeSettings);

  if (Array.isArray(sourceRows) && sourceRows.length) {
    const grouped = new Map();
    sourceRows.forEach((row) => {
      const name = orderLocationName(row.name || row.place || row.table_number || row.tableNumber || row.type, row.order_type || row.orderType || row.type, places);
      const count = Math.max(1, Number(row.orders_count ?? row.ordersCount ?? row.count ?? 1) || 1);
      const amount = Number(row.avg_check ?? row.avgCheck ?? row.amount ?? row.value ?? 0) || 0;
      const current = grouped.get(name) || { total: 0, count: 0 };
      grouped.set(name, { total: current.total + amount * count, count: current.count + count });
    });

    return normalizeMetricRows([...grouped.entries()].map(([name, row]) => ({
      name,
      amount: row.count ? row.total / row.count : 0,
    })), avgCheck);
  }

  return demoAverageRows(avgCheck, seed, placeSettings);
}

function groupFinanceRows(rows = [], direction) {
  const grouped = new Map();

  rows.forEach((row) => {
    const rowDirection = row.direction || row.type;
    if (rowDirection !== direction) return;

    const name = row.category_name || row.category || row.payment_type_name || row.paymentType || (direction === "expense" ? "Без категории" : "Приход");
    grouped.set(name, (grouped.get(name) || 0) + Number(row.amount || row.total || row.value || 0));
  });

  return [...grouped.entries()].map(([name, amount]) => ({ name, amount }));
}

function demoIncomeRows(total, seed) {
  return demoSplitRows(total, seed, ["Наличные", "Карта", "CLICK", "Pay me", "Прочий приход"], 80);
}

function realIncomeRows(dash = {}, total = 0, seed = 1, financeRows = []) {
  const sourceRows = dash.income_breakdown || dash.incomeBreakdown || dash.income_sources || dash.incomeSources;
  if (Array.isArray(sourceRows) && sourceRows.length) {
    return normalizeMetricRows(sourceRows.map((row) => ({
      name: row.name || row.label || row.category || row.type || "Приход",
      amount: row.amount ?? row.total ?? row.value ?? 0,
    })), total);
  }

  const financeIncome = groupFinanceRows(financeRows, "income");
  if (financeIncome.length) {
    return normalizeMetricRows(financeIncome, total);
  }

  const paymentRows = realPaymentRows(dash, total, seed);
  return paymentRows.length ? paymentRows : demoIncomeRows(total, seed);
}

function demoExpenseRows(total, seed) {
  return demoSplitRows(total, seed, ["Закупки", "Склад", "Персонал", "Операционные", "Доставка"], 90);
}

function realExpenseRows(dash = {}, total = 0, seed = 1, financeRows = []) {
  const sourceRows = dash.expense_breakdown || dash.expenseBreakdown || dash.expense_categories || dash.expenseCategories;
  if (Array.isArray(sourceRows) && sourceRows.length) {
    return normalizeMetricRows(sourceRows.map((row) => ({
      name: row.name || row.label || row.category || row.type || "Расход",
      amount: row.amount ?? row.total ?? row.value ?? 0,
    })), total);
  }

  const financeExpense = groupFinanceRows(financeRows, "expense");
  if (financeExpense.length) {
    return normalizeMetricRows(financeExpense, total);
  }

  return total > 0 ? demoExpenseRows(total, seed) : [];
}

function demoSales(days, endValue) {
  const seed = dateSeed(endValue);
  const normalizedDays = Math.max(1, Math.min(366, days));
  const sourceValues = normalizedDays > 7
    ? [1180000, 1460000, 1320000, 1750000, 1680000, 2120000, 1980000, 2240000, 2410000, 2190000, 2650000, 2880000, 2740000, 3160000, 3420000, 3290000, 3680000, 3510000, 3940000, 4280000, 4120000, 4570000, 4860000, 4620000, 4980000, 5320000, 5180000, 5740000, 6020000, 6350000]
    : [1850000, 2420000, 2180000, 3360000, 3820000, 3540000, 4680000];
  const values = normalizedDays <= sourceValues.length
    ? sourceValues.slice(-normalizedDays)
    : Array.from({ length: normalizedDays }, (_, index) => {
      const source = sourceValues[index % sourceValues.length];
      return Math.round((source * seededFactor(seed, index + 31, 0.9, 1.14)) / 10000) * 10000;
    });
  const endDate = new Date(`${endValue}T00:00:00`);
  return values.map((baseRevenue, index, list) => {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - list.length + index + 1);
    const revenue = Math.round((baseRevenue * seededFactor(seed, index)) / 10000) * 10000;
    const ordersCount = Math.max(1, Math.round(revenue / (65000 + seededFactor(seed, index + 8, -9000, 11000))));
    return {
      date: toDateInputValue(date),
      orders_count: ordersCount,
      revenue,
      avg_check: Math.round(revenue / ordersCount),
      is_demo: true,
    };
  });
}

function demoTopProductsForDate(selectedDate) {
  const seed = dateSeed(selectedDate);
  const products = [
    { product_id: "demo-lagmon", name: "Лагман", baseQuantity: 42, price: 40000 },
    { product_id: "demo-palov", name: "Плов", baseQuantity: 37, price: 50000 },
    { product_id: "demo-shashlik", name: "Шашлык", baseQuantity: 29, price: 60000 },
    { product_id: "demo-salat", name: "Салат микс", baseQuantity: 24, price: 30000 },
    { product_id: "demo-manti", name: "Манты", baseQuantity: 18, price: 45000 },
  ];

  return products
    .map((item, index) => {
      const quantity = Math.max(3, Math.round(item.baseQuantity * seededFactor(seed, index, 0.62, 1.34)));
      return {
        product_id: item.product_id,
        name: item.name,
        quantity_sold: quantity,
        revenue: quantity * item.price,
        is_demo: true,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

function demoDashboardFromSales(sales, selectedDate) {
  const seed = dateSeed(selectedDate);
  const selectedDay = sales.at(-1) || { revenue: 0, orders_count: 0, avg_check: 0 };
  return {
    today_revenue: selectedDay.revenue,
    today_orders: selectedDay.orders_count,
    avg_check: selectedDay.avg_check,
    active_orders: Math.max(0, Math.round(6 * seededFactor(seed, 11, 0.3, 1.8))),
  };
}

function pctChange(curr, prev) {
  if (!prev) return 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function noteClassFor(n) {
  if (n > 0) return "kpi-note--up";
  if (n < 0) return "kpi-note--down";
  return "kpi-note--neutral";
}

function signed(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function demoKpis(sales, selectedDate, placeSettings = []) {
  const seed = dateSeed(selectedDate);
  const day = sales.at(-1) || { revenue: 0, orders_count: 0, avg_check: 0 };
  const prev = sales.at(-2) || day;
  const activeOrders = Math.max(0, Math.round(6 * seededFactor(seed, 11, 0.3, 1.8)));
  const activeChange = Math.round(seededFactor(seed, 13, -2, 2));

  const revChange = pctChange(day.revenue, prev.revenue);
  const ordChange = day.orders_count - prev.orders_count;
  const avgChange = pctChange(day.avg_check, prev.avg_check);

  const plan = Math.round((day.revenue / seededFactor(seed, 3, 0.82, 0.98)) / 10000) * 10000;
  const cash = Math.round((day.revenue * seededFactor(seed, 4, 0.32, 0.46)) / 10000) * 10000;
  const card = Math.max(0, day.revenue - cash);
  const zal = Math.round(day.orders_count * seededFactor(seed, 5, 0.5, 0.66));
  const delivery = Math.round(day.orders_count * seededFactor(seed, 6, 0.18, 0.3));
  const pickup = Math.max(0, day.orders_count - zal - delivery);
  const occupancy = Math.round(seededFactor(seed, 7, 0.12, 0.62) * 100);
  const avgTime = Math.round(seededFactor(seed, 9, 16, 27));
  const moneyIncome = Math.round((day.revenue * seededFactor(seed, 12, 0.72, 0.9)) / 10000) * 10000;
  const moneyExpense = Math.round((day.revenue * seededFactor(seed, 14, 0.24, 0.38)) / 10000) * 10000;
  const incomeChange = pctChange(moneyIncome, Math.round((prev.revenue * 0.82) / 10000) * 10000);
  const expenseChange = pctChange(moneyExpense, Math.round((prev.revenue * 0.31) / 10000) * 10000);

  return [
    {
      className: "premium-kpi--revenue",
      icon: "bi-currency-exchange",
      badge: formatDateLabel(selectedDate),
      label: "Выручка за день",
      value: formatNumber(day.revenue),
      suffix: "UZS",
      note: `${signed(revChange)}% к вчерашнему дню`,
      noteClass: noteClassFor(revChange),
      progress: Math.max(8, Math.min(100, Math.round((day.revenue / Math.max(plan, 1)) * 100))),
      description: "Дневная выручка по всем закрытым заказам за выбранную дату.",
      details: [
        ["План на день", `${formatNumber(plan)} UZS`],
        ["Оплачено наличными", `${formatNumber(cash)} UZS`],
        ["Оплачено картой", `${formatNumber(card)} UZS`],
        ["Пиковый час", "13:00 - 14:00"],
      ],
      paymentRows: demoPaymentRows(day.revenue, seed),
      insight: revChange >= 0
        ? `Темп выше вчерашнего дня на ${Math.abs(revChange)}%.`
        : `Темп ниже вчерашнего дня на ${Math.abs(revChange)}%.`,
    },
    {
      className: "premium-kpi--orders",
      icon: "bi-receipt",
      badge: "Live",
      label: "Заказов",
      value: formatNumber(day.orders_count),
      note: `${signed(ordChange)} к вчерашнему дню`,
      noteClass: noteClassFor(ordChange),
      progress: Math.max(8, Math.min(100, Math.round((day.orders_count / Math.max(day.orders_count + 28, 1)) * 100))),
      description: "Количество заказов за день с учетом зала, доставки и самовывоза.",
      details: [
        ["Зал", `${zal} заказов`],
        ["Доставка", `${delivery} заказов`],
        ["Самовывоз", `${pickup} заказов`],
        ["Среднее время", `${avgTime} мин`],
      ],
      placeRows: demoOrderRows(day.orders_count, seed, placeSettings),
      insight: "Распределение заказов по залу, доставке и самовывозу за день.",
    },
    {
      className: "premium-kpi--avg",
      icon: "bi-graph-up-arrow",
      badge: "Среднее",
      label: "Средний чек",
      value: formatNumber(day.avg_check),
      suffix: "UZS",
      note: `${signed(avgChange)}% к вчерашнему дню`,
      noteClass: noteClassFor(avgChange),
      progress: Math.max(8, Math.min(100, Math.round(seededFactor(seed, 10, 0.55, 0.92) * 100))),
      description: "Средняя сумма одного заказа за выбранный день.",
      details: [
        ["Минимальный чек", `${formatNumber(Math.round(day.avg_check * 0.45))} UZS`],
        ["Максимальный чек", `${formatNumber(Math.round(day.avg_check * 5))} UZS`],
        ["Зал", `${formatNumber(Math.round(day.avg_check * 1.07))} UZS`],
        ["Доставка", `${formatNumber(Math.round(day.avg_check * 0.93))} UZS`],
      ],
      table: {
        rows: demoAverageRows(day.avg_check, seed, placeSettings),
        labelColumn: "Канал",
        valueColumn: "Средний чек",
        shareColumn: "Индекс",
        formatValue: formatMoney,
        emptyText: "Нет данных по среднему чеку",
      },
      insight: "Средний чек по всем каналам продаж за выбранный день.",
    },
    {
      className: "premium-kpi--tables",
      icon: "bi-cash-coin",
      badge: "Приход",
      label: "Денежный приход",
      value: formatNumber(moneyIncome),
      suffix: "UZS",
      note: `${signed(incomeChange)}% к вчерашнему дню`,
      noteClass: noteClassFor(incomeChange),
      progress: Math.max(8, Math.min(100, Math.round((moneyIncome / Math.max(day.revenue, 1)) * 100))),
      description: "Фактически полученные деньги за выбранную дату по кассе, картам и оплатам.",
      details: [
        ["Наличные", `${formatNumber(cash)} UZS`],
        ["Карта", `${formatNumber(Math.max(0, moneyIncome - cash))} UZS`],
        ["Оплачено заказов", `${Math.max(0, day.orders_count - activeOrders)} заказов`],
        ["Активные заказы", `${activeOrders} заказа`],
      ],
      table: {
        rows: demoIncomeRows(moneyIncome, seed),
        labelColumn: "Источник",
        valueColumn: "Приход",
        shareColumn: "Доля",
        formatValue: formatMoney,
        emptyText: "Нет приходов за выбранный день",
      },
      insight: "Денежный приход показывает поступления, которые уже прошли через оплату.",
    },
    {
      className: "premium-kpi--expense",
      icon: "bi-arrow-up-right-circle",
      badge: "Расход",
      label: "Денежные расходы",
      value: formatNumber(moneyExpense),
      suffix: "UZS",
      note: `${signed(expenseChange)}% к вчерашнему дню`,
      noteClass: noteClassFor(expenseChange),
      progress: Math.max(8, Math.min(100, Math.round((moneyExpense / Math.max(day.revenue, 1)) * 100))),
      description: "Фактические расходы за выбранную дату по закупкам, списаниям и операционным затратам.",
      details: [
        ["Закупки", `${formatNumber(Math.round(moneyExpense * 0.54))} UZS`],
        ["Склад", `${formatNumber(Math.round(moneyExpense * 0.28))} UZS`],
        ["Операционные", `${formatNumber(Math.round(moneyExpense * 0.18))} UZS`],
        ["Доля от выручки", `${Math.round((moneyExpense / Math.max(day.revenue, 1)) * 100)}%`],
      ],
      table: {
        rows: demoExpenseRows(moneyExpense, seed),
        labelColumn: "Статья расходов",
        valueColumn: "Сумма",
        shareColumn: "Доля",
        formatValue: formatMoney,
        emptyText: "Нет расходов за выбранный день",
      },
      insight: "Денежные расходы показывают затраты за выбранную дату.",
    },
  ];
}

function buildRealKpis(dash, sales, selectedDate, placeSettings = [], financeRows = []) {
  const day = sales.at(-1) || { revenue: 0, orders_count: 0, avg_check: 0 };
  const prev = sales.at(-2) || day;

  const revenue = dash.today_revenue ?? day.revenue;
  const orders = dash.today_orders ?? day.orders_count;
  const avgCheck = dash.avg_check ?? day.avg_check;
  const activeOrders = dash.active_orders ?? 0;

  const revChange = pctChange(revenue, prev.revenue);
  const ordChange = orders - (prev.orders_count || 0);
  const avgChange = pctChange(avgCheck, prev.avg_check);

  const cashTotal = dash.cash_total ?? 0;
  const nonCashTotal = dash.non_cash_total ?? 0;
  const financeIncomeTotal = groupFinanceRows(financeRows, "income").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const financeExpenseTotal = groupFinanceRows(financeRows, "expense").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const income = dash.income_total ?? (financeIncomeTotal > 0 ? financeIncomeTotal : revenue);
  const expense = dash.expense_total ?? financeExpenseTotal;
  const prevIncome = prev.revenue || 1;
  const incomeChange = pctChange(income, prevIncome);
  const expenseChange = expense > 0 ? pctChange(expense, Math.round(prevIncome * 0.31)) : 0;

  return [
    {
      className: "premium-kpi--revenue",
      icon: "bi-currency-exchange",
      badge: formatDateLabel(selectedDate),
      label: "Выручка за день",
      value: formatNumber(revenue),
      suffix: "UZS",
      note: `${signed(revChange)}% к вчерашнему дню`,
      noteClass: noteClassFor(revChange),
      progress: Math.max(8, Math.min(100, 72)),
      description: "Дневная выручка по всем закрытым заказам за выбранную дату.",
      details: [
        ["Наличные", `${formatNumber(cashTotal)} UZS`],
        ["Безнал", `${formatNumber(nonCashTotal)} UZS`],
        ["Активные заказы", `${activeOrders}`],
      ],
      paymentRows: realPaymentRows(dash, revenue, dateSeed(selectedDate)),
      insight: revChange >= 0
        ? `Темп выше вчерашнего дня на ${Math.abs(revChange)}%.`
        : `Темп ниже вчерашнего дня на ${Math.abs(revChange)}%.`,
    },
    {
      className: "premium-kpi--orders",
      icon: "bi-receipt",
      badge: "Live",
      label: "Заказов",
      value: formatNumber(orders),
      note: `${signed(ordChange)} к вчерашнему дню`,
      noteClass: noteClassFor(ordChange),
      progress: Math.max(8, Math.min(100, Math.round((orders / Math.max(orders + 28, 1)) * 100))),
      description: "Количество заказов за день.",
      details: [
        ["Активные заказы", `${activeOrders}`],
        ["Завершённых", `${Math.max(0, orders - activeOrders)}`],
      ],
      placeRows: realOrderRows(dash, orders, dateSeed(selectedDate), placeSettings),
      insight: "Количество заказов за выбранный день.",
    },
    {
      className: "premium-kpi--avg",
      icon: "bi-graph-up-arrow",
      badge: "Среднее",
      label: "Средний чек",
      value: formatNumber(avgCheck),
      suffix: "UZS",
      note: `${signed(avgChange)}% к вчерашнему дню`,
      noteClass: noteClassFor(avgChange),
      progress: Math.max(8, 65),
      description: "Средняя сумма одного заказа за выбранный день.",
      details: [],
      table: {
        rows: realAverageRows(dash, avgCheck, dateSeed(selectedDate), placeSettings),
        labelColumn: "Канал",
        valueColumn: "Средний чек",
        shareColumn: "Индекс",
        formatValue: formatMoney,
        emptyText: "Нет данных по среднему чеку",
      },
      insight: "Средний чек по всем каналам продаж.",
    },
    {
      className: "premium-kpi--tables",
      icon: "bi-cash-coin",
      badge: "Приход",
      label: "Денежный приход",
      value: formatNumber(income),
      suffix: "UZS",
      note: `${signed(incomeChange)}% к вчерашнему дню`,
      noteClass: noteClassFor(incomeChange),
      progress: Math.max(8, Math.min(100, Math.round((income / Math.max(revenue, 1)) * 100))),
      description: "Фактически полученные деньги за выбранную дату.",
      details: [
        ["Наличные", `${formatNumber(cashTotal)} UZS`],
        ["Безнал", `${formatNumber(nonCashTotal)} UZS`],
      ],
      table: {
        rows: realIncomeRows(dash, income, dateSeed(selectedDate), financeRows),
        labelColumn: "Источник",
        valueColumn: "Приход",
        shareColumn: "Доля",
        formatValue: formatMoney,
        emptyText: "Нет приходов за выбранный день",
      },
      insight: "Денежный приход показывает поступления, прошедшие через оплату.",
    },
    {
      className: "premium-kpi--expense",
      icon: "bi-arrow-up-right-circle",
      badge: "Расход",
      label: "Денежные расходы",
      value: formatNumber(expense),
      suffix: "UZS",
      note: expense > 0 ? `${signed(expenseChange)}% к вчерашнему дню` : "—",
      noteClass: expense > 0 ? noteClassFor(expenseChange) : "kpi-note--neutral",
      progress: Math.max(8, Math.min(100, Math.round((expense / Math.max(revenue, 1)) * 100))),
      description: "Фактические расходы за выбранную дату.",
      details: [],
      table: {
        rows: realExpenseRows(dash, expense, dateSeed(selectedDate), financeRows),
        labelColumn: "Статья расходов",
        valueColumn: "Сумма",
        shareColumn: "Доля",
        formatValue: formatMoney,
        emptyText: "Нет расходов за выбранный день",
      },
      insight: "Денежные расходы за выбранную дату.",
    },
  ];
}

function demoTopDishes(selectedDate) {
  const seed = dateSeed(selectedDate);
  const list = demoTopProductsForDate(selectedDate);
  const maxRevenue = list[0]?.revenue || 1;
  return list.map((item, index) => {
    const change = Math.round(seededFactor(seed, index + 20, -9, 19));
    return {
      product_id: item.product_id,
      name: item.name,
      quantity: item.quantity_sold,
      revenue: item.revenue,
      change: `${change >= 0 ? "+" : ""}${change}%`,
      positive: change >= 0,
      progress: Math.max(22, Math.round((item.revenue / maxRevenue) * 100)),
    };
  });
}

function demoWarehouseSummary(selectedDate) {
  const seed = dateSeed(selectedDate);
  const stockBalance = Math.round((7200000 * seededFactor(seed, 41, 0.86, 1.18)) / 1000) * 1000;
  const income = Math.round((stockBalance * seededFactor(seed, 42, 0.0, 0.08)) / 1000) * 1000;
  const expense = Math.round((stockBalance * seededFactor(seed, 43, 0.0, 0.06)) / 1000) * 1000;
  const totalCosts = Math.round((expense * seededFactor(seed, 44, 0.7, 1.4)) / 1000) * 1000;
  const creditor = Math.round((stockBalance * seededFactor(seed, 45, 0.0, 0.05)) / 1000) * 1000;
  const debtor = Math.round((stockBalance * seededFactor(seed, 46, 0.0, 0.04)) / 1000) * 1000;

  return [
    { label: "Приход товаров", value: income, icon: "bi-download", tone: "income" },
    { label: "Расход товаров", value: expense, icon: "bi-upload", tone: "expense" },
    { label: "Остаток склада", value: stockBalance, icon: "bi-box", tone: "stock" },
    { label: "Общие затраты", value: totalCosts, icon: "bi-wallet2", tone: "costs" },
    { label: "Кредиторка", value: creditor, icon: "bi-arrow-up-right-circle", tone: "creditor" },
    { label: "Дебиторка", value: debtor, icon: "bi-arrow-down-left-circle", tone: "debtor" },
  ];
}

function demoWarehouseReportRows(report, selectedDate) {
  if (!report) return [];

  const seed = dateSeed(`${selectedDate}-${report.label}`);
  const sources = {
    "Приход товаров": [
      ["Накладная #PR-128", "Fresh Food"],
      ["Накладная #PR-129", "Baraka Market"],
      ["Накладная #PR-130", "Milk House"],
      ["Накладная #PR-131", "Green Garden"],
      ["Накладная #PR-132", "Meat Line"],
    ],
    "Расход товаров": [
      ["Списание #EX-220", "Кухня"],
      ["Списание #EX-221", "Бар"],
      ["Списание #EX-222", "Заготовки"],
      ["Списание #EX-223", "Производство"],
      ["Списание #EX-224", "Возврат"],
    ],
    "Остаток склада": [
      ["Инвентаризация #ST-41", "Склад"],
      ["Остаток #ST-42", "Кухня"],
      ["Остаток #ST-43", "Бар"],
      ["Остаток #ST-44", "Заморозка"],
      ["Остаток #ST-45", "Овощи"],
    ],
    "Общие затраты": [
      ["Расход #CT-311", "Закупки"],
      ["Расход #CT-312", "Логистика"],
      ["Расход #CT-313", "Упаковка"],
      ["Расход #CT-314", "Хозтовары"],
      ["Расход #CT-315", "Сервис"],
    ],
    "Кредиторка": [
      ["Долг #CR-17", "Fresh Food"],
      ["Долг #CR-18", "Meat Line"],
      ["Долг #CR-19", "Baraka Market"],
      ["Долг #CR-20", "Green Garden"],
      ["Долг #CR-21", "Milk House"],
    ],
    "Дебиторка": [
      ["Оплата #DB-51", "Корпоратив"],
      ["Оплата #DB-52", "Доставка"],
      ["Оплата #DB-53", "Банкет"],
      ["Оплата #DB-54", "Партнер"],
      ["Оплата #DB-55", "Кейтеринг"],
    ],
  };
  const statuses = ["Проведено", "Проведено", "В ожидании", "Проверено", "Закрыто"];
  const baseRows = sources[report.label] || sources["Остаток склада"];
  const total = Number(report.value || 0);
  let used = 0;

  return baseRows.map(([document, category], index) => {
    const isLast = index === baseRows.length - 1;
    const amount = isLast
      ? Math.max(0, total - used)
      : Math.round((total * seededFactor(seed, index + 70, 0.08, 0.28)) / 1000) * 1000;
    used += amount;

    return {
      number: index + 1,
      document,
      category,
      amount,
      status: statuses[index],
      statusClass: statuses[index] === "В ожидании" ? "badge-warning" : "badge-success",
      date: formatDateLabel(selectedDate),
    };
  });
}

function demoRecentOrders(selectedDate) {
  const seed = dateSeed(selectedDate);
  const label = formatDateLabel(selectedDate);
  const base = [
    { id: "#1257", time: "14:32", place: "Стол 7", ready: true },
    { id: "#1256", time: "14:28", place: "Доставка", ready: true },
    { id: "#1255", time: "14:21", place: "Стол 3", ready: false },
    { id: "#1254", time: "14:15", place: "Доставка", ready: false },
    { id: "#1253", time: "14:08", place: "Стол 1", ready: true },
  ];
  return base.map((order, index) => {
    const amount = Math.round((90000 + seededFactor(seed, index + 30, 0.4, 3.4) * 80000) / 1000) * 1000;
    return {
      ...order,
      date: `${label} ${order.time}`,
      amount: `${formatNumber(amount)} UZS`,
      status: order.ready ? "Готов" : "В работе",
    };
  });
}

function dishDisplayName(name = "") {
  const normalized = name.toLowerCase().replaceAll("'", "").replaceAll("‘", "").replaceAll("’", "");
  const translations = {
    lagmon: "Лагман",
    lagman: "Лагман",
    palov: "Плов",
    pilaf: "Плов",
    shashlik: "Шашлык",
    "salat mix": "Салат микс",
    "salad mix": "Салат микс",
    manti: "Манты",
  };
  return translations[normalized] || name;
}

function dishPhotoClass(name = "", index = 0) {
  const normalized = name.toLowerCase();
  if (normalized.includes("лаг") || normalized.includes("lag")) return "dish-photo--lagman";
  if (normalized.includes("плов") || normalized.includes("palov") || normalized.includes("pilaf")) return "dish-photo--palov";
  if (normalized.includes("шаш") || normalized.includes("shash")) return "dish-photo--shashlik";
  if (normalized.includes("сал") || normalized.includes("sal")) return "dish-photo--salad";
  if (normalized.includes("мант") || normalized.includes("mant")) return "dish-photo--manti";
  return `dish-photo--${(index % 5) + 1}`;
}

function RevenueChart({ sales }) {
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const ctx = canvasRef.current.getContext("2d");
    const revealState = { progress: 0, didClip: false };
    const revealDuration = 1200;
    const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
    const revealPlugin = {
      id: "revenueChartReveal",
      beforeDatasetsDraw(chart) {
        const { chartArea } = chart;
        revealState.didClip = false;
        if (!chartArea) return;
        const width = chartArea.width * revealState.progress;
        chart.ctx.save();
        chart.ctx.beginPath();
        chart.ctx.rect(chartArea.left, chartArea.top, width, chartArea.height);
        chart.ctx.clip();
        revealState.didClip = true;
      },
      afterDatasetsDraw(chart) {
        if (revealState.didClip) chart.ctx.restore();
      },
    };
    let revealFrame = 0;
    const gradient = ctx.createLinearGradient(0, 0, 0, 360);
    gradient.addColorStop(0, "rgba(29, 181, 181, 0.28)");
    gradient.addColorStop(0.55, "rgba(31, 202, 194, 0.10)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: sales.map((item) => new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(new Date(item.date))),
        datasets: [{
          data: sales.map((item) => Number(item.revenue || 0)),
          borderColor: "#1db5b5",
          backgroundColor: gradient,
          borderWidth: 4,
          pointBackgroundColor: "#FFFFFF",
          pointBorderColor: "#1db5b5",
          pointBorderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.42,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        animation: false,
        animations: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: ({ chart, tooltip }) => {
              const tooltipEl = tooltipRef.current;
              if (!tooltipEl) return;

              if (!tooltip || tooltip.opacity === 0) {
                tooltipEl.classList.remove("is-visible");
                return;
              }

              const titleEl = tooltipEl.querySelector("strong");
              const valueEl = tooltipEl.querySelector("span");
              if (titleEl) titleEl.textContent = tooltip.title?.[0] || "";
              if (valueEl) valueEl.textContent = tooltip.body?.[0]?.lines?.[0] || "";

              const tooltipHalfWidth = tooltipEl.offsetWidth / 2 || 72;
              const minX = tooltipHalfWidth + 8;
              const maxX = chart.width - tooltipHalfWidth - 8;
              const x = Math.min(Math.max(tooltip.caretX, minX), maxX);
              const y = Math.max(tooltip.caretY - 10, 16);

              tooltipEl.style.left = `${chart.canvas.offsetLeft + x}px`;
              tooltipEl.style.top = `${chart.canvas.offsetTop + y}px`;
              tooltipEl.classList.add("is-visible");
            },
            callbacks: { label: (context) => formatMoney(context.parsed.y) },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#667085", font: { size: 12, weight: "600", family: "'Golos Text', Manrope, sans-serif" } }, border: { display: false } },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(16, 24, 40, 0.08)", drawTicks: false },
            ticks: {
              color: "#667085",
              font: { size: 12, weight: "600", family: "'Golos Text', Manrope, sans-serif" },
              callback: (value) => `${Number(value) / 1000000}M`,
            },
            border: { display: false },
          },
        },
      },
      plugins: [revealPlugin],
    });

    const revealStart = performance.now();
    const runReveal = (timestamp) => {
      const elapsed = timestamp - revealStart;
      const progress = Math.min(1, elapsed / revealDuration);
      revealState.progress = easeOutCubic(progress);
      chart.draw();
      if (progress < 1) revealFrame = window.requestAnimationFrame(runReveal);
    };
    revealFrame = window.requestAnimationFrame(runReveal);

    return () => {
      window.cancelAnimationFrame(revealFrame);
      chart.destroy();
    };
  }, [sales]);

  return (
    <>
      <canvas ref={canvasRef} id="ownerRevenueChart" />
      <div className="owner-revenue-tooltip" ref={tooltipRef} aria-hidden="true">
        <strong />
        <span />
      </div>
    </>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="card dashboard-empty">
      <div>
        <div className="dashboard-empty__mark"><Icon name="bi-shop" size={20} /></div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}

function ShiftSummaryCard({ summary }) {
  return (
    <aside className="card card-pad shift-summary-card shift-summary-card--window">
      <div className="shift-summary-card__header">
        <div>
          <span className="eyebrow">Live operations</span>
          <h2>Сводка смены</h2>
        </div>
        <div className="shift-summary-card__status" aria-label="Смена открыта">
          <span />
          Смена открыта
        </div>
      </div>

      <div className="shift-summary-card__open-time">
        <Icon name="bi-clock-history" size={20} />
        <span>Время открытия</span>
        <strong>09:00</strong>
      </div>

      <div className="shift-summary-card__stats">
        <div>
          <span>Касса</span>
          <strong>{formatMoney(summary.revenue)}</strong>
        </div>
        <div>
          <span>Заказы</span>
          <strong>{summary.orders}</strong>
        </div>
        <div>
          <span>Зал</span>
          <strong>{summary.occupancy}%</strong>
        </div>
        <div>
          <span>Среднее время</span>
          <strong>{summary.avgTime} мин</strong>
        </div>
      </div>

      <div className="shift-summary-card__load">
        <div>
          <span>Загруженность зала</span>
          <strong>{summary.occupancy}%</strong>
        </div>
        <div className="shift-summary-card__progress" aria-hidden="true">
          <i style={{ width: `${summary.occupancy}%` }} />
        </div>
      </div>

      <div className="shift-summary-card__alert">
        <div className="shift-summary-card__alert-icon"><Icon name="bi-exclamation-triangle" size={20} /></div>
        <p>Куриное филе заканчивается — осталось 2 кг</p>
        <span>Важно</span>
      </div>

      <div className="shift-summary-card__actions">
        <Link className="shift-summary-card__primary" to="/orders">Управление сменой</Link>
        <Link className="shift-summary-card__link" to="/reports/z-report">Посмотреть отчёт</Link>
      </div>
    </aside>
  );
}

function QuickActionsCard({ activeOrders, occupancy, avgTime }) {
  return (
    <section className="card card-pad quick-actions quick-actions--command">
      <div className="section-header">
        <div>
          <span className="eyebrow">Command center</span>
          <h2>Быстрые действия</h2>
          <p className="quick-actions__subtitle">Самые частые операции владельца в одном месте</p>
        </div>
        <span className="quick-actions__live"><Icon name="bi-lightning-charge-fill" size={20} /> Live</span>
      </div>

      <div className="quick-actions__grid">
        <Link to="/orders"><Icon name="bi-plus-circle" size={20} /><span>Новый заказ</span><small>Создать продажу</small></Link>
        <Link to="/menu"><Icon name="bi-journal-plus" size={20} /><span>Добавить блюдо</span><small>{products.length} блюд в меню</small></Link>
        <Link to="/staff"><Icon name="bi-person-plus" size={20} /><span>Сотрудник</span><small>{employees.length} в команде</small></Link>
        <Link to="/finance"><Icon name="bi-file-earmark-spreadsheet" size={20} /><span>Финансы</span><small>Отчеты и касса</small></Link>
      </div>

      <div className="quick-actions__insights">
        <div className="quick-actions__metric">
          <span>Активные заказы</span>
          <strong>{activeOrders}</strong>
        </div>
        <div className="quick-actions__metric">
          <span>Меню</span>
          <strong>{products.length}</strong>
        </div>
        <div className="quick-actions__metric">
          <span>Команда</span>
          <strong>{employees.length}</strong>
        </div>
        <div className="quick-actions__metric">
          <span>Столы заняты</span>
          <strong>{occupancy}%</strong>
        </div>
        <div className="quick-actions__metric">
          <span>Среднее время</span>
          <strong>{avgTime} мин</strong>
        </div>
      </div>
    </section>
  );
}

function RecentOrdersCard({ orders }) {
  return (
    <section className="card card-pad recent-orders-card">
      <div className="section-header">
        <div>
          <span className="eyebrow">Последние заказы</span>
          <h2>Последние заказы</h2>
        </div>
        <Link className="btn btn-ghost" to="/reports/orders">Все заказы</Link>
      </div>
      <div className="recent-orders-list">
        {orders.map((order) => (
          <div className="recent-order" key={order.id}>
            <strong>{order.id}</strong>
            <span>{order.date}</span>
            <span>{order.place}</span>
            <em>{order.amount}</em>
            <small className={order.ready ? "is-ready" : "is-progress"}>{order.status}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopSalesCard({ dishes }) {
  return (
    <section className="card card-pad top-dishes-card owner-top-sales-card">
      <div className="section-header">
        <div>
          <span className="eyebrow">Лучшие продажи</span>
          <h2>Топ-5 продаж</h2>
        </div>
        <Link className="btn btn-ghost" to="/menu">Все блюда</Link>
      </div>
      <div className="top-dishes-list">
        {dishes.map((item, index) => (
          <div className="top-dish top-dish--compact" key={item.product_id || item.name}>
            <div className="top-dish__rank">{index + 1}</div>
            <div className={`top-dish__photo ${dishPhotoClass(item.name, index)}`} aria-hidden="true" />
            <div className="top-dish__body">
              <div className="top-dish__line">
                <strong>{dishDisplayName(item.name)}</strong>
              </div>
            </div>
            <div className="top-dish__qty">{formatNumber(item.quantity)} шт</div>
            <div className="top-dish__price">{formatMoney(item.revenue)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatOrderCount(value) {
  const count = Math.round(Number(value) || 0);
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? "заказ"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "заказа"
      : "заказов";

  return `${formatNumber(count)} ${word}`;
}

function KpiPaymentTable({
  rows = [],
  labelColumn = "Способ оплаты",
  valueColumn = "Выручка",
  shareColumn = "Доля",
  formatValue = formatMoney,
  emptyText = "Нет оплат за выбранный день",
}) {
  const hasRows = rows.length > 0;

  return (
    <div className="kpi-payment-report">
      <div className="kpi-payment-report__table-wrap">
        <table className="kpi-payment-report__table">
          <thead>
            <tr>
              <th>{labelColumn}</th>
              <th>{valueColumn}</th>
              <th>{shareColumn}</th>
            </tr>
          </thead>
          <tbody>
            {hasRows ? rows.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{formatValue(row.amount)}</td>
                  <td>
                    <div className="kpi-payment-report__share">
                      <span aria-hidden="true"><i style={{ width: `${Math.max(2, Math.min(100, row.percent))}%` }} /></span>
                      <strong>{row.percent}%</strong>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="kpi-payment-report__empty" colSpan={3}>{emptyText}</td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiInfoDialog({ kpi, onClose }) {
  const hasCustomTable = kpi?.table && Array.isArray(kpi.table.rows);
  const hasPlaceTable = !hasCustomTable && Array.isArray(kpi?.placeRows);
  const tableRows = hasPlaceTable ? kpi.placeRows : !hasCustomTable && Array.isArray(kpi?.paymentRows) ? kpi.paymentRows : null;
  const tableProps = hasCustomTable ? kpi.table : hasPlaceTable
    ? {
      rows: tableRows,
      labelColumn: "Место",
      valueColumn: "Заказы",
      formatValue: formatOrderCount,
      emptyText: "Нет заказов за выбранный день",
    }
    : {
      rows: tableRows || [],
    };
  const hasTable = hasCustomTable || Array.isArray(tableRows);

  useEffect(() => {
    if (!kpi) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [kpi, onClose]);

  if (!kpi) return null;

  const container = document.querySelector(".dashboard-main") || document.body;

  return createPortal(
    <div className="kpi-info-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`kpi-info-window ${kpi.className} ${hasTable ? "kpi-info-window--payment-table" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kpi-info-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`kpi-info-window__head ${hasTable ? "kpi-info-window__head--payment-table" : ""}`}>
          {hasTable ? null : <div className="kpi-info-window__icon"><Icon name={kpi.icon} size={20} /></div>}
          <div>
            <span>{kpi.badge}</span>
            <h2 id="kpi-info-title">{kpi.label}</h2>
          </div>
          <button type="button" className="kpi-info-window__close" aria-label="Закрыть" onClick={onClose}>
            <Icon name="bi-x-lg" size={20} />
          </button>
        </div>

        <div className="kpi-info-window__value">
          <strong>{kpi.value}</strong>
          {kpi.suffix ? <small>{kpi.suffix}</small> : null}
        </div>
        <p>{kpi.description}</p>

        {hasTable ? (
          <KpiPaymentTable {...tableProps} />
        ) : (
          <div className="kpi-info-window__details">
            {kpi.details.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}

        {hasTable ? null : (
          <div className="kpi-info-window__insight">
            <Icon name="bi-info-circle" size={20} />
            <span>{kpi.insight}</span>
          </div>
        )}
      </section>
    </div>,
    container
  );
}

function WarehouseReportDialog({ report, selectedDate, onClose }) {
  useEffect(() => {
    if (!report) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [report, onClose]);

  const rows = useMemo(() => demoWarehouseReportRows(report, selectedDate), [report, selectedDate]);

  if (!report) return null;

  const container = document.querySelector(".dashboard-main") || document.body;

  return createPortal(
    <div className="kpi-info-backdrop warehouse-report-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`warehouse-report-window warehouse-report-window--${report.tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="warehouse-report-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="warehouse-report-window__head">
          <div className="warehouse-report-window__icon"><Icon name={report.icon} size={20} /></div>
          <div>
            <span>Складской отчёт</span>
            <h2 id="warehouse-report-title">{report.label}</h2>
          </div>
          <button type="button" className="warehouse-report-window__close" aria-label="Закрыть" onClick={onClose}>
            <Icon name="bi-x-lg" size={20} />
          </button>
        </div>

        <div className="warehouse-report-window__value">
          <strong>{formatNumber(report.value)}</strong>
          <small>UZS</small>
        </div>
        <p>Табличный отчёт по выбранному показателю склада за {formatDateLabel(selectedDate)}.</p>

        <div className="warehouse-report-table-wrap">
          <table className="data-table warehouse-report-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Документ</th>
                <th>Категория / Поставщик</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.document}>
                  <td>{row.number}</td>
                  <td>{row.document}</td>
                  <td>{row.category}</td>
                  <td>{formatMoney(row.amount)}</td>
                  <td><span className={`badge ${row.statusClass}`}>{row.status}</span></td>
                  <td>{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>,
    container
  );
}

export default function OwnerDashboard() {
  const { selectedDate = todayInputValue() } = useOutletContext();
  const [revenueRange, setRevenueRange] = useState(() => reportRangeEndingAt(7, selectedDate));
  const [selectedKpi, setSelectedKpi] = useState(null);
  const [selectedWarehouseReport, setSelectedWarehouseReport] = useState(null);
  const hasLoadedRef = useRef(false);
  const lastSelectedDateRef = useRef(selectedDate);
  const [dashboard, setDashboard] = useState(null);
  const [sales, setSales] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [placeSettings, setPlaceSettings] = useState([]);
  const [financeTransactions, setFinanceTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const normalizedRevenueRange = useMemo(() => normalizeReportRange(revenueRange), [revenueRange]);
  const revenueParams = useMemo(() => reportRangeToApiParams(normalizedRevenueRange), [normalizedRevenueRange]);
  const revenuePeriod = useMemo(() => reportRangeDays(normalizedRevenueRange), [normalizedRevenueRange]);
  const revenueEndDate = reportDateToInputDate(normalizedRevenueRange.end);
  const revenuePeriodLabel = reportRangeLabel(normalizedRevenueRange);
  const revenuePresetOptions = useMemo(() => ([
    { label: "7 дней", getRange: () => ({ ...reportRangeEndingAt(7, selectedDate), preset: "7 дней" }) },
    { label: "30 дней", getRange: () => ({ ...reportRangeEndingAt(30, selectedDate), preset: "30 дней" }) },
  ]), [selectedDate]);

  useEffect(() => {
    if (lastSelectedDateRef.current === selectedDate) {
      return;
    }

    lastSelectedDateRef.current = selectedDate;
    setRevenueRange((current) => reportRangeEndingAt(reportRangeDays(current), selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    let mounted = true;
    setLoading(!hasLoadedRef.current);
    setError("");
    const params = revenueParams;
    const dayParams = { date_from: selectedDate, date_to: selectedDate };

    Promise.all([
      api.get("/analytics/dashboard", { params: { date: selectedDate } }),
      api.get("/analytics/sales", { params }),
      api.get("/analytics/products/top", { params: { limit: 5, ...dayParams } }),
      api.get("/inventory/products"),
      api.get("/hr/employees"),
      api.get("/pos/orders", { params: { date: selectedDate } }),
      api.get("/settings/places").catch(() => ({ data: [] })),
      api.get("/finance/transactions", { params: { date_from: selectedDate, date_to: selectedDate } }).catch(() => ({ data: [] })),
    ]).then(([dashboardRes, salesRes, topRes, productsRes, employeesRes, ordersRes, placesRes, financeRes]) => {
      if (!mounted) return;
      setDashboard(dashboardRes.data);
      setSales(salesRes.data);
      setTopProducts(topRes.data);
      setProducts(productsRes.data);
      setEmployees(employeesRes.data);
      const orderList = Array.isArray(ordersRes.data) ? ordersRes.data : ordersRes.data?.items || [];
      setRecentOrders(orderList.slice(0, 5));
      const placeList = Array.isArray(placesRes.data) ? placesRes.data : placesRes.data?.items || placesRes.data?.results || [];
      setPlaceSettings(placeList);
      const financeList = Array.isArray(financeRes.data) ? financeRes.data : financeRes.data?.items || financeRes.data?.results || [];
      setFinanceTransactions(financeList);
      hasLoadedRef.current = true;
    }).catch((err) => {
      if (mounted) setError(err.response?.data?.detail || "Не удалось загрузить dashboard данные.");
    }).finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, [revenueParams, selectedDate]);

  const displaySales = useMemo(
  () => (sales.length > 0 ? sales : demoSales(revenuePeriod, revenueEndDate)),
  [sales, revenuePeriod, revenueEndDate]
);
  const isSalesDemo = sales.length === 0;
  const isDashboardDemo = !dashboard || dashboard.today_revenue === undefined;
  const kpis = useMemo(() => {
    if (!isDashboardDemo && !isSalesDemo) return buildRealKpis(dashboard, displaySales, selectedDate, placeSettings, financeTransactions);
    return demoKpis(displaySales, selectedDate, placeSettings);
  }, [isDashboardDemo, isSalesDemo, dashboard, displaySales, selectedDate, placeSettings, financeTransactions]);
  const displayTopDishes = useMemo(() => {
  if (topProducts.length > 0) {
    const maxRevenue = Number(topProducts[0]?.revenue || 1);
    return topProducts.map((item, index) => ({
      product_id: item.product_id || `p-${index}`,
      name: item.name,
      quantity: item.quantity_sold,
      revenue: Number(item.revenue || 0),
      change: "",
      positive: true,
      progress: Math.max(22, Math.round((Number(item.revenue || 0) / maxRevenue) * 100)),
    }));
  }
  return demoTopDishes(selectedDate);
}, [topProducts, selectedDate]);
  const warehouseSummary = useMemo(() => demoWarehouseSummary(selectedDate), [selectedDate]);
  const recentOrdersList = useMemo(() => {
    if (recentOrders.length > 0) {
      return recentOrders.map((order) => {
        const created = order.created_at ? new Date(order.created_at) : new Date();
        const time = created.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        const dateLabel = created.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
        const ready = order.status === "completed" || order.status === "ready";
        return {
          id: `#${order.order_number || order.id?.slice(0, 6)}`,
          date: `${dateLabel} ${time}`,
          place: order.table_number ? `Стол ${order.table_number}` : order.order_type || "—",
          amount: formatMoney(order.total_amount || 0),
          status: ready ? "Готов" : order.status === "cancelled" ? "Отменён" : "В работе",
          ready,
        };
      });
    }
    return demoRecentOrders(selectedDate);
  }, [recentOrders, selectedDate]);
  const isOrdersDemo = recentOrders.length === 0;
  const revenueStats = useMemo(() => {
    const revenues = displaySales.map((item) => Number(item.revenue || 0));
    const total = revenues.reduce((acc, value) => acc + value, 0);
    return {
      max: revenues.length ? Math.max(...revenues) : 0,
      min: revenues.length ? Math.min(...revenues) : 0,
      avg: revenues.length ? Math.round(total / revenues.length) : 0,
    };
  }, [displaySales]);
  const displayDashboard = useMemo(() => {
    if (dashboard && dashboard.today_revenue !== undefined) return dashboard;
    return demoDashboardFromSales(displaySales, selectedDate);
  }, [dashboard, displaySales, selectedDate]);
  const daySummary = useMemo(() => {
    const seed = dateSeed(selectedDate);
    const day = displaySales.at(-1) || { revenue: 0, orders_count: 0 };
    return {
      revenue: day.revenue,
      orders: day.orders_count,
      occupancy: Math.round(seededFactor(seed, 7, 0.12, 0.62) * 100),
      avgTime: Math.round(seededFactor(seed, 9, 16, 27)),
      activeOrders: displayDashboard.active_orders,
    };
  }, [displaySales, selectedDate, displayDashboard]);

  if (loading) return <PageLoader />;
  if (error) return <EmptyState title="Dashboard недоступен" text={error} />;

  return (
    <>
      <div className="owner-kpi-band">
        <section className="kpi-grid kpi-grid--premium">
          {kpis.map((kpi) => (
            <button
              className={`kpi-card premium-kpi ${kpi.className}`}
              key={kpi.label}
              type="button"
              onClick={() => setSelectedKpi(kpi)}
              aria-haspopup="dialog"
            >
              <div className="premium-kpi__top">
                <div className="premium-kpi__icon"><Icon name={kpi.icon} size={20} /></div>
                <span className="trend">{kpi.badge}</span>
              </div>
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">{kpi.value} {kpi.suffix ? <small>{kpi.suffix}</small> : null}</div>
              <div className={`kpi-note ${kpi.noteClass}`}>{kpi.note}</div>
              <div className="premium-kpi__progress"><i style={{ width: `${kpi.progress}%` }} /></div>
            </button>
          ))}
        </section>
        <div className="owner-kpi-band__side" aria-hidden="true" />
      </div>
      <KpiInfoDialog kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />
      <WarehouseReportDialog report={selectedWarehouseReport} selectedDate={selectedDate} onClose={() => setSelectedWarehouseReport(null)} />

      <section className="owner-main-grid">
        <div className="card card-pad chart-card premium-chart">
          <div className="section-header section-header--stack">
            <div><span className="eyebrow">Revenue analytics</span><h2>Выручка за {formatDaysLabel(revenuePeriod)}</h2><p>{revenuePeriodLabel}</p></div>
            <div className="period-switcher owner-revenue-switcher" aria-label="Период выручки">
              <div className="owner-revenue-range report-actions">
                <ReportDateRangePicker
                  value={normalizedRevenueRange}
                  onChange={(nextRange) => setRevenueRange(normalizeReportRange(nextRange))}
                  buttonClassName="period-dropdown__button owner-revenue-range__button"
                  presets={revenuePresetOptions}
                  formatButtonLabel={(range) => formatDaysLabel(reportRangeDays(range))}
                  showDropdownIcon
                  showTime={false}
                />
              </div>
              <Link className="period-switcher__details" to="/analytics">Подробнее</Link>
            </div>
          </div>
          <div className="revenue-stat-grid">
            <div><span>Максимум</span><strong>{formatMoney(revenueStats.max)}</strong></div>
            <div><span>Минимум</span><strong>{formatMoney(revenueStats.min)}</strong></div>
            <div><span>Среднее</span><strong>{formatMoney(revenueStats.avg)}</strong></div>
          </div>
          <div className="chart-wrap"><RevenueChart sales={displaySales} /></div>
        </div>

        <aside className="warehouse-summary-card">
          <div className="warehouse-summary-list">
            {warehouseSummary.map((item) => (
              <button
                className={`warehouse-summary-item warehouse-summary-item--${item.tone}`}
                key={item.label}
                type="button"
                onClick={() => setSelectedWarehouseReport(item)}
                aria-haspopup="dialog"
              >
                <span className="warehouse-summary-item__icon"><Icon name={item.icon} size={18} /></span>
                <div>
                  <strong>{item.label}</strong>
                  <span>{formatMoney(item.value)}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="owner-widgets">
        <TopSalesCard dishes={displayTopDishes} />
        <RecentOrdersCard orders={recentOrdersList} />
      </section>
    </>
  );
}
