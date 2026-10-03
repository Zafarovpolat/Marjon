import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatMoney } from "../api/client";
import { dashboardService } from "../api/dashboard";
import { toDateInputValue } from "../utils/date";
import Icon from "../components/Icon";
import { PageLoader } from "../components/Loader";
import ReportDateRangePicker from "../components/ReportDateRangePicker";
import { isAbortError, useLatestRequest } from "../hooks/useAsyncSafety";
import {
  todayReportRange,
  dashboardPeriodFromSearch,
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
  buildRevenueChartSales,
  buildUnavailableWarehouseSummary,
  buildZeroRevenueBuckets,
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
import { EmptyState, TopSalesCard, RecentOrdersCard } from "./dashboard/DashboardCards";
import { prepareKpiDialogTrigger } from "./dashboard/kpiFocusOrigin";
import revenueArt from "../assets/dashboard-card-art/revenue.png";
import ordersArt from "../assets/dashboard-card-art/orders.png";
import averageCheckArt from "../assets/dashboard-card-art/average_check.png";
import incomeArt from "../assets/dashboard-card-art/income.png";
import expenseArt from "../assets/dashboard-card-art/expense.png";
import incomingGoodsArt from "../assets/dashboard-card-art/incoming_goods_clean.png";
import outgoingGoodsArt from "../assets/dashboard-card-art/outgoing_goods_clean.png";
import warehouseStockArt from "../assets/dashboard-card-art/warehouse_stock_clean.png";
import totalCostsArt from "../assets/dashboard-card-art/total_costs_clean.png";
import accountsPayableArt from "../assets/dashboard-card-art/accounts_payable_clean.png";
import accountsReceivableArt from "../assets/dashboard-card-art/accounts_receivable_clean.png";

// DASHBOARD MAXIMAL KPI CARDS V1 — decorative-only PNG mapping. Real KPI values
// stay as DOM text; PNGs are presentational (alt="" aria-hidden, no pointers).
const KPI_VISUALS = {
  "premium-kpi--revenue": { src: revenueArt, variant: "revenue" },
  "premium-kpi--orders": { src: ordersArt, variant: "orders" },
  "premium-kpi--avg": { src: averageCheckArt, variant: "average" },
  "premium-kpi--tables": { src: incomeArt, variant: "income" },
  "premium-kpi--expense": { src: expenseArt, variant: "expense" },
};

const WAREHOUSE_VISUALS = {
  income: { src: incomingGoodsArt, variant: "incoming" },
  expense: { src: outgoingGoodsArt, variant: "outgoing" },
  stock: { src: warehouseStockArt, variant: "stock" },
  costs: { src: totalCostsArt, variant: "costs" },
  creditor: { src: accountsPayableArt, variant: "payable" },
  debtor: { src: accountsReceivableArt, variant: "receivable" },
};

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
  const navigate = useNavigate();
  const [dashboardPeriod, setDashboardPeriod] = useState(() => (
    dashboardPeriodFromSearch(window.location.search) || todayReportRange()
  ));
  const [periodPanelState, setPeriodPanelState] = useState({ active: "", closing: "", pending: "" });
  const [selectedKpi, setSelectedKpi] = useState(null);
  const [selectedKpiSource, setSelectedKpiSource] = useState(null);
  const selectedKpiTriggerRef = useRef(null);
  const [selectedWarehouseReport, setSelectedWarehouseReport] = useState(null);
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
  const hasLoadedDashboardRef = useRef(false);
  const beginRequest = useLatestRequest();
  const normalizedDashboardPeriod = useMemo(() => normalizeReportRange(dashboardPeriod), [dashboardPeriod]);
  const dashboardPeriodParams = useMemo(() => reportRangeToApiParams(normalizedDashboardPeriod), [normalizedDashboardPeriod]);
  const dashboardPeriodDays = useMemo(() => reportRangeDays(normalizedDashboardPeriod), [normalizedDashboardPeriod]);
  const dashboardPeriodLabel = reportRangeLabel(normalizedDashboardPeriod);
  const dashboardReferenceDate = dashboardPeriodParams.date_to;

  function requestPeriodPanel(panelId) {
    setPeriodPanelState((current) => {
      if (current.closing) {
        const nextPending = current.pending === panelId ? "" : panelId;
        return { ...current, pending: nextPending };
      }
      if (!current.active) return panelId ? { active: panelId, closing: "", pending: "" } : current;
      return {
        active: "",
        closing: current.active,
        pending: current.active === panelId ? "" : panelId,
      };
    });
  }

  function completePeriodPanelExit(panelId) {
    setPeriodPanelState((current) => {
      if (current.closing !== panelId) return current;
      return { active: current.pending, closing: "", pending: "" };
    });
  }

  useEffect(() => {
    const request = beginRequest();
    if (!hasLoadedDashboardRef.current) setLoading(true);
    setError("");
    dashboardService.loadOwnerOverview({
      dateFrom: dashboardPeriodParams.date_from,
      dateTo: dashboardPeriodParams.date_to,
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
      if (request.isCurrent()) {
        hasLoadedDashboardRef.current = true;
        setLoading(false);
      }
    });
  }, [beginRequest, dashboardPeriodParams]);

  function applyDashboardPeriod(nextRange) {
    const normalized = normalizeReportRange(nextRange);
    const apiRange = reportRangeToApiParams(normalized);
    const params = new URLSearchParams(window.location.search);
    params.set("date_from", apiRange.date_from);
    params.set("date_to", apiRange.date_to);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}?${params.toString()}${window.location.hash}`,
    );
    setDashboardPeriod(normalized);
  }

  const displaySales = useMemo(() => sales, [sales]);
  const revenueChartSales = useMemo(
    () => buildRevenueChartSales(displaySales),
    [displaySales]
  );
  // No-data state: same real chart shell with a flat display-only zero series
  // derived from the selected period (never stored/sent, values exactly 0).
  const revenueChartZeroBuckets = useMemo(
    () => buildZeroRevenueBuckets(dashboardPeriodParams.date_from, dashboardPeriodParams.date_to),
    [dashboardPeriodParams]
  );
  const revenueChartDisplaySales = revenueChartSales.length ? revenueChartSales : revenueChartZeroBuckets;
  const displayPlaceSettings = useMemo(() => placeSettings, [placeSettings]);
  const displayFinanceTransactions = useMemo(() => financeTransactions, [financeTransactions]);
  const displayDashboard = useMemo(() => dashboard || EMPTY_DASHBOARD, [dashboard]);
  const kpis = useMemo(() => {
    return buildRealKpis(displayDashboard, revenueChartSales, dashboardReferenceDate, displayPlaceSettings, displayFinanceTransactions);
  }, [dashboardReferenceDate, displayDashboard, revenueChartSales, displayPlaceSettings, displayFinanceTransactions]);
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
          {kpis.map((kpi) => {
            const visual = KPI_VISUALS[kpi.className];
            return (
            <button
              className={`kpi-card premium-kpi ${kpi.className}${visual ? ` dashboard-kpi-card--visual dashboard-kpi-card--${visual.variant}` : ""}`}
              key={kpi.label}
              type="button"
              onClick={(event) => {
                setSelectedKpiSource(prepareKpiDialogTrigger(event, selectedKpiTriggerRef));
                setSelectedKpi(kpi);
              }}
              aria-haspopup="dialog"
            >
              <div className="premium-kpi__top">
                <div className="premium-kpi__icon"><Icon name={kpi.icon} size={20} /></div>
                <span className="trend">{kpi.badge}</span>
              </div>
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">{kpi.value} {kpi.suffix ? <small>{kpi.suffix}</small> : null}</div>
              <div className="premium-kpi__progress"><i style={{ width: `${kpi.progress}%` }} /></div>
              {visual ? (
                <img
                  className="dashboard-kpi-card__art"
                  src={visual.src}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
              ) : null}
            </button>
            );
          })}
        </section>
        <div className="owner-kpi-band__side" aria-hidden="true" />
      </div>
      <KpiInfoDialog
        kpi={selectedKpi}
        sourceRect={selectedKpiSource}
        returnFocusRef={selectedKpiTriggerRef}
        onClose={() => setSelectedKpi(null)}
      />
      <WarehouseReportDialog report={selectedWarehouseReport} selectedDate={dashboardReferenceDate} onClose={() => setSelectedWarehouseReport(null)} />

      <section className="owner-main-grid">
        <div className="card card-pad chart-card premium-chart">
          <div className="section-header section-header--stack">
            <div><span className="eyebrow">Revenue analytics</span><h2>Выручка за {formatDaysLabel(dashboardPeriodDays)}</h2></div>
            <div className="owner-revenue-switcher" aria-label="Период выручки">
              <ReportDateRangePicker
                variant="canonical"
                animateExit
                value={normalizedDashboardPeriod}
                onChange={applyDashboardPeriod}
                open={periodPanelState.active === "period"}
                onOpenChange={(nextOpen) => requestPeriodPanel(nextOpen ? "period" : "")}
                onExitComplete={() => completePeriodPanelExit("period")}
                buttonAriaLabel="Период выручки"
                buttonClassName="owner-dashboard-period__trigger"
              />
            </div>
          </div>
          <div className="revenue-stat-grid">
            <div><span>Максимум</span><strong>{formatMoney(revenueStats.max)}</strong></div>
            <div><span>Минимум</span><strong>{formatMoney(revenueStats.min)}</strong></div>
            <div><span>Среднее</span><strong>{formatMoney(revenueStats.avg)}</strong></div>
          </div>
          <div className="chart-wrap">
            <RevenueChart sales={revenueChartDisplaySales} />
          </div>
        </div>

        <aside className="warehouse-summary-card">
          <div className="warehouse-summary-list">
            {warehouseSummary.map((item) => {
              const visual = WAREHOUSE_VISUALS[item.tone];
              return (
              <button
                className={`warehouse-summary-item warehouse-summary-item--${item.tone}${visual ? ` dashboard-side-metric--visual dashboard-side-metric--${visual.variant}` : ""}`}
                key={item.label}
                type="button"
                onClick={() => handleWarehouseSummaryClick(item)}
                aria-haspopup={item.to ? undefined : "dialog"}
              >
                <span className="warehouse-summary-item__icon"><Icon name={item.icon} size={18} /></span>
                <div className="warehouse-summary-item__text">
                  <strong>{item.label}</strong>
                  <span>{item.unavailable && (item.tone === "creditor" || item.tone === "debtor") ? "Скоро" : formatMoney(item.unavailable ? 0 : item.value)}</span>
                </div>
                {visual ? (
                  <img
                    className="dashboard-side-metric__art"
                    src={visual.src}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                  />
                ) : null}
              </button>
              );
            })}
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




