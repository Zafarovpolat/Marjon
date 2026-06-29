import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Chart, Filler, LineController, LineElement, LinearScale, PointElement, CategoryScale, Tooltip } from "chart.js";
import { Link, useOutletContext } from "react-router-dom";
import { api, formatMoney, formatNumber } from "../api/client";
import { dateRangeEndingAt, formatDateLabel, todayInputValue, toDateInputValue } from "../utils/date";
import Icon from "../components/Icon";
import { PageLoader } from "../components/Loader";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

function dateSeed(value) {
  return value.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function seededFactor(seed, index, min = 0.82, max = 1.18) {
  const wave = Math.sin((seed + 17) * (index + 3)) * 10000;
  const normalized = wave - Math.floor(wave);
  return min + normalized * (max - min);
}

function demoSales(days, endValue) {
  const seed = dateSeed(endValue);
  const values = days === 30
    ? [1180000, 1460000, 1320000, 1750000, 1680000, 2120000, 1980000, 2240000, 2410000, 2190000, 2650000, 2880000, 2740000, 3160000, 3420000, 3290000, 3680000, 3510000, 3940000, 4280000, 4120000, 4570000, 4860000, 4620000, 4980000, 5320000, 5180000, 5740000, 6020000, 6350000]
    : [1850000, 2420000, 2180000, 3360000, 3820000, 3540000, 4680000];
  const endDate = new Date(`${endValue}T00:00:00`);
  return values.slice(-days).map((baseRevenue, index, list) => {
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

function demoKpis(sales, selectedDate) {
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
      insight: "Средний чек по всем каналам продаж за выбранный день.",
    },
    {
      className: "premium-kpi--tables",
      icon: "bi-cash-coin",
      badge: "Доход",
      label: "Денежный доход",
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
      insight: "Денежный доход показывает поступления, которые уже прошли через оплату.",
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
    { label: "Приход товаров", value: income, icon: "bi-box-arrow-in-down", tone: "blue" },
    { label: "Расход товаров", value: expense, icon: "bi-arrow-up-right-circle", tone: "red" },
    { label: "Остаток склада", value: stockBalance, icon: "bi-box-seam", tone: "orange" },
    { label: "Общие затраты", value: totalCosts, icon: "bi-cash-coin", tone: "rose" },
    { label: "Кредиторка", value: creditor, icon: "bi-arrow-up-right-circle", tone: "pink" },
    { label: "Дебиторка", value: debtor, icon: "bi-arrow-down-left-circle", tone: "green" },
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

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const ctx = canvasRef.current.getContext("2d");
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
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#FFFFFF",
            titleColor: "#0B1F3A",
            bodyColor: "#334155",
            borderColor: "rgba(15, 35, 70, 0.10)",
            borderWidth: 1,
            padding: 16,
            cornerRadius: 14,
            boxShadow: "0 18px 45px rgba(15, 35, 70, 0.14)",
            displayColors: false,
            titleFont: { size: 14, weight: "600", family: "'Golos Text', Manrope, sans-serif" },
            bodyFont: { size: 16, weight: "500", family: "'Golos Text', Manrope, sans-serif" },
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
    });

    return () => chart.destroy();
  }, [sales]);

  return <canvas ref={canvasRef} id="ownerRevenueChart" />;
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

function PeriodDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef(null);
  const options = [
    { value: 7, label: "7 дней" },
    { value: 30, label: "30 дней" },
  ];
  const selected = options.find((option) => option.value === value) || options[0];
  const openMenu = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setOpen(true);
  };
  const closeMenu = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 140);
  };

  return (
    <div
      className={`period-dropdown ${open ? "is-open" : ""}`}
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
      onFocus={openMenu}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
      }}
    >
      <button className="period-dropdown__button" type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
        <span>Период</span>
        <strong>{selected.label}</strong>
        <Icon name="bi-chevron-down" size={20} />
      </button>
      {open ? (
        <div className="period-dropdown__menu" role="listbox">
          {options.map((option) => (
            <button
              className={option.value === value ? "is-selected" : ""}
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
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
        <Link to="/menu"><Icon name="bi-journal-plus" size={20} /><span>Добавить блюдо</span><small>18 блюд в меню</small></Link>
        <Link to="/staff"><Icon name="bi-person-plus" size={20} /><span>Сотрудник</span><small>0 в команде</small></Link>
        <Link to="/finance"><Icon name="bi-file-earmark-spreadsheet" size={20} /><span>Финансы</span><small>Отчеты и касса</small></Link>
      </div>

      <div className="quick-actions__insights">
        <div className="quick-actions__metric">
          <span>Активные заказы</span>
          <strong>{activeOrders}</strong>
        </div>
        <div className="quick-actions__metric">
          <span>Меню</span>
          <strong>18</strong>
        </div>
        <div className="quick-actions__metric">
          <span>Команда</span>
          <strong>0</strong>
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

function KpiInfoDialog({ kpi, onClose }) {
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
        className={`kpi-info-window ${kpi.className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kpi-info-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="kpi-info-window__head">
          <div className="kpi-info-window__icon"><Icon name={kpi.icon} size={20} /></div>
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

        <div className="kpi-info-window__details">
          {kpi.details.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className="kpi-info-window__insight">
          <Icon name="bi-info-circle" size={20} />
          <span>{kpi.insight}</span>
        </div>
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
  const [period, setPeriod] = useState(7);
  const [selectedKpi, setSelectedKpi] = useState(null);
  const [selectedWarehouseReport, setSelectedWarehouseReport] = useState(null);
  const hasLoadedRef = useRef(false);
  const [dashboard, setDashboard] = useState(null);
  const [sales, setSales] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(!hasLoadedRef.current);
    setError("");
    const params = dateRangeEndingAt(period, selectedDate);
    const dayParams = { date_from: selectedDate, date_to: selectedDate };

    Promise.all([
      api.get("/analytics/dashboard", { params: { date: selectedDate } }),
      api.get("/analytics/sales", { params }),
      api.get("/analytics/products/top", { params: { limit: 5, ...dayParams } }),
      api.get("/inventory/products"),
      api.get("/hr/employees"),
    ]).then(([dashboardRes, salesRes, topRes, productsRes, employeesRes]) => {
      if (!mounted) return;
      setDashboard(dashboardRes.data);
      setSales(salesRes.data);
      setTopProducts(topRes.data);
      setProducts(productsRes.data);
      setEmployees(employeesRes.data);
      hasLoadedRef.current = true;
    }).catch((err) => {
      if (mounted) setError(err.response?.data?.detail || "Не удалось загрузить dashboard данные.");
    }).finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, [period, selectedDate]);

  const displaySales = useMemo(() => demoSales(period, selectedDate), [period, selectedDate]);
  const kpis = useMemo(() => demoKpis(displaySales, selectedDate), [displaySales, selectedDate]);
  const displayTopDishes = useMemo(() => demoTopDishes(selectedDate), [selectedDate]);
  const warehouseSummary = useMemo(() => demoWarehouseSummary(selectedDate), [selectedDate]);
  const recentOrdersList = useMemo(() => demoRecentOrders(selectedDate), [selectedDate]);
  const revenueStats = useMemo(() => {
    const revenues = displaySales.map((item) => Number(item.revenue || 0));
    const total = revenues.reduce((acc, value) => acc + value, 0);
    return {
      max: revenues.length ? Math.max(...revenues) : 0,
      min: revenues.length ? Math.min(...revenues) : 0,
      avg: revenues.length ? Math.round(total / revenues.length) : 0,
    };
  }, [displaySales]);
  const displayDashboard = useMemo(() => demoDashboardFromSales(displaySales, selectedDate), [displaySales, selectedDate]);
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
      <KpiInfoDialog kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />
      <WarehouseReportDialog report={selectedWarehouseReport} selectedDate={selectedDate} onClose={() => setSelectedWarehouseReport(null)} />

      <section className="owner-main-grid">
        <div className="card card-pad chart-card premium-chart">
          <div className="section-header section-header--stack">
            <div><span className="eyebrow">Revenue analytics</span><h2>Выручка за {period} дней</h2><p>Период заканчивается {formatDateLabel(selectedDate)}</p></div>
            <div className="period-switcher" aria-label="Период выручки">
              <PeriodDropdown value={period} onChange={setPeriod} />
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