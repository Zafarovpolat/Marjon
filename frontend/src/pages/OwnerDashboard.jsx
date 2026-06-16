import { useEffect, useMemo, useRef, useState } from "react";
import { Chart, Filler, LineController, LineElement, LinearScale, PointElement, CategoryScale, Tooltip } from "chart.js";
import { Link, useOutletContext } from "react-router-dom";
import { api, formatMoney, formatNumber } from "../api/client";
import { dateRangeEndingAt, formatDateLabel, todayInputValue, toDateInputValue } from "../utils/date";

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

const referenceSales = [
  { date: "2026-06-09", revenue: 1580000 },
  { date: "2026-06-10", revenue: 2210000 },
  { date: "2026-06-11", revenue: 2980000 },
  { date: "2026-06-12", revenue: 3560000 },
  { date: "2026-06-13", revenue: 3890000 },
  { date: "2026-06-14", revenue: 3800000 },
  { date: "2026-06-15", revenue: 4940000 },
];

const referenceKpis = [
  {
    className: "premium-kpi--revenue",
    icon: "bi-currency-exchange",
    badge: "15.06.2026",
    label: "Выручка за день",
    value: "4 940 000",
    suffix: "UZS",
    note: "+12% к вчерашнему дню",
    noteClass: "kpi-note--up",
    progress: 92,
    description: "Дневная выручка по всем закрытым заказам за выбранную дату.",
    details: [
      ["План на день", "5 400 000 UZS"],
      ["Оплачено наличными", "1 860 000 UZS"],
      ["Оплачено картой", "3 080 000 UZS"],
      ["Пиковый час", "13:00 - 14:00"],
    ],
    insight: "Темп выше вчерашнего дня. До плана осталось 460 000 UZS.",
  },
  {
    className: "premium-kpi--orders",
    icon: "bi-receipt",
    badge: "Live",
    label: "Заказов",
    value: "79",
    note: "-3 к вчерашнему дню",
    noteClass: "kpi-note--down",
    progress: 66,
    description: "Количество заказов за день с учетом зала, доставки и самовывоза.",
    details: [
      ["Зал", "48 заказов"],
      ["Доставка", "19 заказов"],
      ["Самовывоз", "12 заказов"],
      ["Среднее время", "21 мин"],
    ],
    insight: "Заказов немного меньше, но средний чек компенсирует падение трафика.",
  },
  {
    className: "premium-kpi--avg",
    icon: "bi-graph-up-arrow",
    badge: "Среднее",
    label: "Средний чек",
    value: "62 532",
    suffix: "UZS",
    note: "+8% к вчерашнему дню",
    noteClass: "kpi-note--up",
    progress: 78,
    description: "Средняя сумма одного заказа за выбранный день.",
    details: [
      ["Минимальный чек", "28 000 UZS"],
      ["Максимальный чек", "315 000 UZS"],
      ["Зал", "66 900 UZS"],
      ["Доставка", "58 400 UZS"],
    ],
    insight: "Рост среднего чека связан с продажами плова, шашлыка и комбо-позиций.",
  },
  {
    className: "premium-kpi--tables",
    icon: "bi-grid-3x3-gap",
    badge: "Зал",
    label: "Активных заказов",
    value: "2",
    note: "Без изменений",
    noteClass: "kpi-note--neutral",
    progress: 18,
    description: "Текущие активные заказы, которые еще не закрыты в смене.",
    details: [
      ["В работе", "2 заказа"],
      ["Готовы к выдаче", "0 заказов"],
      ["Занятые столы", "18%"],
      ["Средний возраст", "14 мин"],
    ],
    insight: "Нагрузка спокойная. Кухня работает без очереди по текущим заказам.",
  },
];

const referenceTopDishes = [
  { name: "Плов", quantity: 41, revenue: 2050000, change: "+15%", progress: 100, positive: true },
  { name: "Шашлык", quantity: 20, revenue: 1200000, change: "+8%", progress: 64, positive: true },
  { name: "Лагман", quantity: 28, revenue: 1120000, change: "+5%", progress: 58, positive: true },
  { name: "Салат микс", quantity: 34, revenue: 870000, change: "-3%", progress: 42, positive: false },
  { name: "Чай чёрный", quantity: 56, revenue: 420000, change: "-2%", progress: 28, positive: false },
];

const recentOrders = [
  { id: "#1257", date: "15.06.2026 14:32", place: "Стол 7", amount: "245 000 UZS", status: "Готов", ready: true },
  { id: "#1256", date: "15.06.2026 14:28", place: "Доставка", amount: "189 000 UZS", status: "Готов", ready: true },
  { id: "#1255", date: "15.06.2026 14:21", place: "Стол 3", amount: "315 000 UZS", status: "В работе", ready: false },
  { id: "#1254", date: "15.06.2026 14:15", place: "Доставка", amount: "178 000 UZS", status: "В работе", ready: false },
  { id: "#1253", date: "15.06.2026 14:08", place: "Стол 1", amount: "92 000 UZS", status: "Готов", ready: true },
];

function RevenueChart({ sales }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const ctx = canvasRef.current.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 360);
    gradient.addColorStop(0, "rgba(255, 107, 61, 0.28)");
    gradient.addColorStop(0.55, "rgba(255, 138, 92, 0.10)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: sales.map((item) => new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(new Date(item.date))),
        datasets: [{
          data: sales.map((item) => Number(item.revenue || 0)),
          borderColor: "#FF6B3D",
          backgroundColor: gradient,
          borderWidth: 4,
          pointBackgroundColor: "#FFFFFF",
          pointBorderColor: "#FF6B3D",
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
            padding: 14,
            cornerRadius: 14,
            boxShadow: "0 18px 45px rgba(15, 35, 70, 0.14)",
            displayColors: false,
            callbacks: { label: (context) => formatMoney(context.parsed.y) },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#667085", font: { size: 12, weight: "600" } }, border: { display: false } },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(16, 24, 40, 0.08)", drawTicks: false },
            ticks: {
              color: "#667085",
              font: { size: 12, weight: "600" },
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
        <div className="dashboard-empty__mark"><i className="bi bi-shop" /></div>
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
        <i className="bi bi-chevron-down" aria-hidden="true" />
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
              {option.value === value ? <i className="bi bi-check2" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ShiftSummaryCard({ dashboard }) {
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
        <i className="bi bi-clock-history" />
        <span>Время открытия</span>
        <strong>09:00</strong>
      </div>

      <div className="shift-summary-card__stats">
        <div>
          <span>Касса</span>
          <strong>4 940 000 UZS</strong>
        </div>
        <div>
          <span>Заказы</span>
          <strong>79</strong>
        </div>
        <div>
          <span>Зал</span>
          <strong>18%</strong>
        </div>
        <div>
          <span>Среднее время</span>
          <strong>21 мин</strong>
        </div>
      </div>

      <div className="shift-summary-card__load">
        <div>
          <span>Загруженность зала</span>
          <strong>18%</strong>
        </div>
        <div className="shift-summary-card__progress" aria-hidden="true">
          <i style={{ width: "18%" }} />
        </div>
      </div>

      <div className="shift-summary-card__alert">
        <div className="shift-summary-card__alert-icon"><i className="bi bi-exclamation-triangle" /></div>
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

function QuickActionsCard({ productsCount, employeesCount, activeOrders }) {
  return (
    <section className="card card-pad quick-actions quick-actions--command">
      <div className="section-header">
        <div>
          <span className="eyebrow">Command center</span>
          <h2>Быстрые действия</h2>
          <p className="quick-actions__subtitle">Самые частые операции владельца в одном месте</p>
        </div>
        <span className="quick-actions__live"><i className="bi bi-lightning-charge-fill" /> Live</span>
      </div>

      <div className="quick-actions__grid">
        <Link to="/orders"><i className="bi bi-plus-circle" /><span>Новый заказ</span><small>Создать продажу</small></Link>
        <Link to="/menu"><i className="bi bi-journal-plus" /><span>Добавить блюдо</span><small>18 блюд в меню</small></Link>
        <Link to="/staff"><i className="bi bi-person-plus" /><span>Сотрудник</span><small>0 в команде</small></Link>
        <Link to="/finance"><i className="bi bi-file-earmark-spreadsheet" /><span>Финансы</span><small>Отчеты и касса</small></Link>
      </div>

      <div className="quick-actions__insights">
        <div className="quick-actions__metric">
          <span>Активные заказы</span>
          <strong>2</strong>
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
          <strong>18%</strong>
        </div>
        <div className="quick-actions__metric">
          <span>Среднее время</span>
          <strong>21 мин</strong>
        </div>
      </div>
    </section>
  );
}

function RecentOrdersCard() {
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
        {recentOrders.map((order) => (
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

  return (
    <div className="kpi-info-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`kpi-info-window ${kpi.className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kpi-info-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="kpi-info-window__head">
          <div className="kpi-info-window__icon"><i className={`bi ${kpi.icon}`} /></div>
          <div>
            <span>{kpi.badge}</span>
            <h2 id="kpi-info-title">{kpi.label}</h2>
          </div>
          <button type="button" className="kpi-info-window__close" aria-label="Закрыть" onClick={onClose}>
            <i className="bi bi-x-lg" />
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
          <i className="bi bi-info-circle" />
          <span>{kpi.insight}</span>
        </div>
      </section>
    </div>
  );
}

export default function OwnerDashboard() {
  const { selectedDate = todayInputValue() } = useOutletContext();
  const [period, setPeriod] = useState(7);
  const [selectedKpi, setSelectedKpi] = useState(null);
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

  const displaySales = useMemo(() => referenceSales, []);
  const displayTopProducts = useMemo(() => topProducts.length ? topProducts : demoTopProductsForDate(selectedDate), [selectedDate, topProducts]);
  const isDemoDashboard = !sales.length || !topProducts.length;
  const displayDashboard = useMemo(
    () => (isDemoDashboard ? demoDashboardFromSales(displaySales, selectedDate) : dashboard),
    [dashboard, displaySales, isDemoDashboard, selectedDate],
  );

  if (loading) return <div className="loading-note">Загрузка dashboard...</div>;
  if (error) return <EmptyState title="Dashboard недоступен" text={error} />;

  return (
    <>
      <section className="kpi-grid kpi-grid--premium">
        {referenceKpis.map((kpi) => (
          <button
            className={`kpi-card premium-kpi ${kpi.className}`}
            key={kpi.label}
            type="button"
            onClick={() => setSelectedKpi(kpi)}
            aria-haspopup="dialog"
          >
            <div className="premium-kpi__top">
              <div className="premium-kpi__icon"><i className={`bi ${kpi.icon}`} /></div>
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

      <section className="owner-main-grid">
        <div className="card card-pad chart-card premium-chart">
          <div className="section-header section-header--stack">
            <div><span className="eyebrow">Revenue analytics</span><h2>Выручка за 7 дней</h2><p>Период заканчивается 15.06.2026</p></div>
            <div className="period-switcher" aria-label="Период выручки">
              <PeriodDropdown value={period} onChange={setPeriod} />
              <Link className="period-switcher__details" to="/analytics">Подробнее</Link>
            </div>
          </div>
          <div className="revenue-stat-grid">
            <div><span>Максимум</span><strong>4 940 000 UZS</strong></div>
            <div><span>Минимум</span><strong>1 580 000 UZS</strong></div>
            <div><span>Среднее</span><strong>3 280 000 UZS</strong></div>
          </div>
          <div className="chart-wrap"><RevenueChart sales={displaySales} /></div>
        </div>

        <aside className="card card-pad top-dishes-card">
          <div className="section-header"><div><span className="eyebrow">Menu performance</span><h2>Топ-5 блюд за день</h2></div><Link className="btn btn-ghost" to="/menu">Все блюда</Link></div>
          <div className="top-dishes-list">
            {referenceTopDishes.map((item, index) => {
              return <div className="top-dish" key={item.product_id || item.name}>
                <div className="top-dish__rank">{index + 1}</div>
                <div className="top-dish__body">
                  <div className="top-dish__line">
                    <strong>{dishDisplayName(item.name)}</strong>
                    <span className={item.positive ? "top-dish__change is-up" : "top-dish__change is-down"}>{item.change}</span>
                  </div>
                  <div className="top-dish__meta">
                    <span className="badge badge-info">{formatNumber(item.quantity)} продаж</span>
                    <div className="top-dish__bar"><i style={{ width: `${item.progress}%` }} /></div>
                  </div>
                </div>
                <div className="top-dish__price">{formatMoney(item.revenue)}</div>
              </div>;
            })}
          </div>
        </aside>
      </section>

      <section className="owner-widgets">
        <QuickActionsCard productsCount={products.length} employeesCount={employees.length} activeOrders={displayDashboard?.active_orders} />
        <RecentOrdersCard />
        <ShiftSummaryCard dashboard={displayDashboard} />
      </section>
    </>
  );
}
