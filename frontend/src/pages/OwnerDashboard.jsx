import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { formatMoney } from "../api/client";
import { dashboardService } from "../api/dashboard";
import { todayInputValue, toDateInputValue } from "../utils/date";
import Icon from "../components/Icon";
import { PageLoader } from "../components/Loader";
import ReportDateRangePicker from "../components/ReportDateRangePicker";
import { isAbortError, useLatestRequest } from "../hooks/useAsyncSafety";
import {
  reportRangeEndingAt,
  normalizeReportRange,
  reportRangeToApiParams,
  reportRangeDays,
  reportRangeLabel,
  formatDaysLabel,
} from "./dashboard/reportRange";
import {
  EMPTY_DASHBOARD,
  EMPTY_WAREHOUSE_REPORTS,
  apiList,
  toFiniteNumber,
  buildRealKpis,
  buildUnavailableWarehouseSummary,
  buildRevenueChartSales,
} from "./dashboard/analyticsData";
import {
  buildSimulatedDashboard,
  buildSimulatedWarehouseReports,
  simulatedRevenueAmount,
  hasRows,
  hasPositiveAmount,
  hasBalanceRows,
} from "./dashboard/simulation";
import RevenueChart from "./dashboard/RevenueChart";
import { KpiInfoDialog, WarehouseReportDialog } from "./dashboard/DashboardDialogs";
import { EmptyState, TopSalesCard, RecentOrdersCard, SectionEmpty } from "./dashboard/DashboardCards";

// Оркестратор OWNER-дашборда (FE-07B). Владеет верхнеуровневым состоянием
// (период выручки, выбранные KPI/склад-отчёт, данные запроса) и раздаёт его
// презентационным подкомпонентам. Аналитика/симуляция/секции вынесены в
// ./dashboard/*. FE-05 (сервисный слой) и FE-06 (безопасность запросов) сохранены.

// Слияние с симуляцией сохранено из исходника как невызываемый код
// (truth-гарды фиксируют единичное присутствие). В живом рендере не используется.
function mergeDashboardWithSimulation(dash, sales) {
  const source = dash || EMPTY_DASHBOARD;
  const demo = buildSimulatedDashboard(sales);
  const positive = (field) => toFiniteNumber(source[field]) > 0;
  const sourceRows = (...fields) => fields.map((field) => source[field]).find((rows) => Array.isArray(rows) && rows.length > 0);
  const paymentRows = sourceRows("payment_methods", "paymentMethods", "payment_breakdown", "paymentBreakdown");
  const orderRows = sourceRows("order_locations", "orderLocations", "place_orders", "placeOrders", "order_places", "orderPlaces");
  const avgRows = sourceRows("avg_check_segments", "avgCheckSegments", "average_check_segments", "averageCheckSegments");
  const incomeRows = sourceRows("income_breakdown", "incomeBreakdown", "income_sources", "incomeSources");
  const expenseRows = sourceRows("expense_breakdown", "expenseBreakdown", "expense_categories", "expenseCategories");

  return {
    ...source,
    today_revenue: positive("today_revenue") ? source.today_revenue : demo.today_revenue,
    today_orders: positive("today_orders") ? source.today_orders : demo.today_orders,
    avg_check: positive("avg_check") ? source.avg_check : demo.avg_check,
    active_orders: positive("active_orders") ? source.active_orders : demo.active_orders,
    cash_total: positive("cash_total") ? source.cash_total : demo.cash_total,
    non_cash_total: positive("non_cash_total") ? source.non_cash_total : demo.non_cash_total,
    income_total: positive("income_total") ? source.income_total : demo.income_total,
    expense_total: positive("expense_total") ? source.expense_total : demo.expense_total,
    payment_methods: paymentRows || demo.payment_methods,
    order_locations: orderRows || demo.order_locations,
    avg_check_segments: avgRows || demo.avg_check_segments,
    income_breakdown: incomeRows || demo.income_breakdown,
    expense_breakdown: expenseRows || demo.expense_breakdown,
  };
}

function mergeWarehouseReportsWithSimulation(reports = EMPTY_WAREHOUSE_REPORTS) {
  const demo = buildSimulatedWarehouseReports();
  const source = reports || EMPTY_WAREHOUSE_REPORTS;

  return {
    incomes: hasPositiveAmount(source.incomes, ["total", "amount", "value"]) ? source.incomes : demo.incomes,
    consumption: hasPositiveAmount(source.consumption, ["total", "amount", "value"]) ? source.consumption : demo.consumption,
    balances: hasRows(source.balances) ? source.balances : demo.balances,
    debtCredit: hasBalanceRows(source.debtCredit) ? source.debtCredit : demo.debtCredit,
    stock: hasPositiveAmount(source.stock, ["quantity", "total", "amount", "value"]) ? source.stock : demo.stock,
  };
}

function buildSimulatedRevenueSales(range) {
  const params = reportRangeToApiParams(range);
  const days = reportRangeDays(range);
  const start = new Date(`${params.date_from}T00:00:00`);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const revenue = simulatedRevenueAmount(index, days);
    const orders = Math.max(1, Math.round(revenue / 115_000));

    return {
      date: toDateInputValue(date),
      revenue,
      orders_count: orders,
      avg_check: Math.round(revenue / orders),
      isSimulated: true,
    };
  });
}

export default function OwnerDashboard() {
  const { selectedDate = todayInputValue() } = useOutletContext();
  const navigate = useNavigate();
  const [revenueRange, setRevenueRange] = useState(() => reportRangeEndingAt(7, selectedDate));
  const [selectedKpi, setSelectedKpi] = useState(null);
  const [selectedWarehouseReport, setSelectedWarehouseReport] = useState(null);
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
  const beginRequest = useLatestRequest();
  const normalizedRevenueRange = useMemo(() => normalizeReportRange(revenueRange), [revenueRange]);
  const revenueParams = useMemo(() => reportRangeToApiParams(normalizedRevenueRange), [normalizedRevenueRange]);
  const revenuePeriod = useMemo(() => reportRangeDays(normalizedRevenueRange), [normalizedRevenueRange]);
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
    const request = beginRequest();
    setLoading(true);
    setError("");
    dashboardService.loadOwnerOverview({
      selectedDate,
      dateFrom: revenueParams.date_from,
      dateTo: revenueParams.date_to,
      signal: request.signal,
    }).then(([
      dashboardRes,
      salesRes,
      topRes,
      productsRes,
      employeesRes,
      ordersRes,
      placesRes,
      financeRes,
    ]) => {
      if (!request.isCurrent()) return;
      setDashboard(dashboardRes.data);
      setSales(apiList(salesRes.data));
      setTopProducts(apiList(topRes.data));
      setProducts(apiList(productsRes.data));
      setEmployees(apiList(employeesRes.data));
      const orderList = apiList(ordersRes.data);
      setRecentOrders(orderList.slice(0, 5));
      const placeList = apiList(placesRes.data);
      setPlaceSettings(placeList);
      const financeList = apiList(financeRes.data);
      setFinanceTransactions(financeList);
    }).catch((err) => {
      if (request.isCurrent() && !isAbortError(err)) setError(err.response?.data?.detail || "Не удалось загрузить dashboard данные.");
    }).finally(() => {
      if (request.isCurrent()) setLoading(false);
    });
  }, [beginRequest, revenueParams, selectedDate]);

  const displaySales = useMemo(() => sales, [sales]);
  const revenueChartSales = useMemo(
    () => buildRevenueChartSales(displaySales),
    [displaySales]
  );
  const displayPlaceSettings = useMemo(() => placeSettings, [placeSettings]);
  const displayFinanceTransactions = useMemo(() => financeTransactions, [financeTransactions]);
  const displayDashboard = useMemo(() => dashboard || EMPTY_DASHBOARD, [dashboard]);
  const kpis = useMemo(() => {
    return buildRealKpis(displayDashboard, revenueChartSales, selectedDate, displayPlaceSettings, displayFinanceTransactions);
  }, [displayDashboard, revenueChartSales, selectedDate, displayPlaceSettings, displayFinanceTransactions]);
  const displayTopProducts = useMemo(() => topProducts, [topProducts]);
  const displayTopDishes = useMemo(() => {
  if (displayTopProducts.length > 0) {
    const maxRevenue = Math.max(1, ...displayTopProducts.map((item) => Number(item.revenue || 0)));
    return displayTopProducts.map((item, index) => ({
      product_id: item.product_id || `p-${index}`,
      name: item.name,
      quantity: Number(item.quantity_sold ?? item.quantity ?? item.count ?? 0),
      revenue: Number(item.revenue || 0),
      change: "",
      positive: true,
      progress: Math.max(22, Math.round((Number(item.revenue || 0) / maxRevenue) * 100)),
    }));
  }
  return [];
}, [displayTopProducts]);
  const warehouseSummary = useMemo(() => buildUnavailableWarehouseSummary(), []);
  const displayRecentOrders = useMemo(() => recentOrders, [recentOrders]);
  const recentOrdersList = useMemo(() => {
    if (displayRecentOrders.length > 0) {
      return displayRecentOrders.map((order) => {
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
    return [];
  }, [displayRecentOrders]);
  const revenueStats = useMemo(() => {
    const revenues = revenueChartSales.map((item) => Number(item.revenue || 0));
    const total = revenues.reduce((acc, value) => acc + value, 0);
    return {
      max: revenues.length ? Math.max(...revenues) : 0,
      min: revenues.length ? Math.min(...revenues) : 0,
      avg: revenues.length ? Math.round(total / revenues.length) : 0,
    };
  }, [revenueChartSales]);
  const handleWarehouseSummaryClick = (item) => {
    if (item.unavailable) return;
    if (item.to) {
      navigate(item.to);
      return;
    }

    setSelectedWarehouseReport(item);
  };

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
          <div className="chart-wrap">
            {revenueChartSales.length ? (
              <RevenueChart sales={revenueChartSales} />
            ) : (
              <SectionEmpty
                className="owner-empty--chart"
                icon="bi-graph-up"
                title="Продаж пока нет"
                text="После первых закрытых заказов здесь появится динамика выручки за выбранный период."
              />
            )}
          </div>
        </div>

        <aside className="warehouse-summary-card">
          <div className="warehouse-summary-list">
            {warehouseSummary.map((item) => (
              <button
                className={`warehouse-summary-item warehouse-summary-item--${item.tone}`}
                key={item.label}
                type="button"
                onClick={() => handleWarehouseSummaryClick(item)}
                aria-haspopup={item.to ? undefined : "dialog"}
              >
                <span className="warehouse-summary-item__icon"><Icon name={item.icon} size={18} /></span>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.unavailable ? "Скоро" : formatMoney(item.value)}</span>
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




