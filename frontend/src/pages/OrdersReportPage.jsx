import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import Icon from "../components/Icon";
import ReportDateRangePicker from "../components/ReportDateRangePicker";
import { exportToExcel } from "../utils/excel";

function toApiDate(value) {
  if (!value) return undefined;
  const [day, month, year] = value.split(".");
  return `${year}-${month}-${day}`;
}

function currentMonthRange() {
  const now = new Date();
  return {
    preset: "",
    start: `01.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`,
    end: `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`,
  };
}

function formatMoney(value) {
  return `${new Intl.NumberFormat("ru-RU").format(Number(value))} UZS`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ru-RU");
}

export default function OrdersReportPage() {
  const [dateRange, setDateRange] = useState(currentMonthRange);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "all", waiter: "all", table: "", min: "", max: "" });
  const [rows, setRows] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api.get("/reports/orders", { params: { date_from: toApiDate(dateRange.start), date_to: toApiDate(dateRange.end) } })
      .then(({ data }) => {
        if (!Array.isArray(data)) throw new Error("Invalid orders report response");
        const items = data;
        setRows(items.map((item) => ({
          id: String(item.order_id),
          orderNumber: String(item.order_number),
          createdAt: item.created_at,
          status: item.status,
          tableNumber: item.table_number,
          waiterName: item.waiter_name,
          itemsCount: Number(item.items_count),
          totalAmount: Number(item.total_amount),
        })));
      })
      .catch((err) => {
        setRows([]);
        setError(err.response?.data?.detail || "Не удалось загрузить отчёт по заказам.");
      })
      .finally(() => setLoading(false));
  }, [dateRange.start, dateRange.end]);

  const statuses = useMemo(() => [...new Set(rows.map((row) => row.status))], [rows]);
  const waiters = useMemo(() => [...new Set(rows.map((row) => row.waiterName).filter(Boolean))], [rows]);
  const visibleRows = useMemo(() => rows.filter((row) => {
    const min = filters.min === "" ? null : Number(filters.min);
    const max = filters.max === "" ? null : Number(filters.max);
    return (filters.status === "all" || row.status === filters.status)
      && (filters.waiter === "all" || row.waiterName === filters.waiter)
      && (!filters.table || String(row.tableNumber ?? "").includes(filters.table))
      && (min === null || row.totalAmount >= min)
      && (max === null || row.totalAmount <= max);
  }), [filters, rows]);

  function downloadExcel() {
    exportToExcel(visibleRows, [
      { key: "id", label: "ID заказа" },
      { key: "orderNumber", label: "Номер заказа" },
      { key: "createdAt", label: "Дата" },
      { key: "status", label: "Статус" },
      { key: "tableNumber", label: "Номер стола" },
      { key: "waiterName", label: "Официант" },
      { key: "itemsCount", label: "Количество позиций" },
      { key: "totalAmount", label: "Итоговая сумма" },
    ], "orders-report");
  }

  if (loading) return <section className="orders-report-page"><div className="dashboard-empty" role="status">Загрузка отчёта...</div></section>;
  if (error) return <section className="orders-report-page"><div className="login-error" role="alert">{error}</div></section>;

  return (
    <section className="orders-report-page">
      <article className="report-page-card">
        <div className="report-page-header">
          <div className="report-title-group"><span className="report-accent-bar" aria-hidden="true" /><div><h2>Заказы</h2></div></div>
          <div className="report-actions">
            <ReportDateRangePicker value={dateRange} onChange={setDateRange} showDropdownIcon />
            <button className="orders-filter-toggle" type="button" onClick={() => setFiltersOpen((value) => !value)}><Icon name="bi-sliders" size={18} /> Фильтровать</button>
            <button className="report-excel-button" type="button" onClick={downloadExcel}><Icon name="bi-file-earmark-excel" size={18} /> Скачать Excel</button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="report-filter-panel">
            <label><span>Статус</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="all">Все статусы</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label><span>Официант</span><select value={filters.waiter} onChange={(event) => setFilters((current) => ({ ...current, waiter: event.target.value }))}><option value="all">Все официанты</option>{waiters.map((waiter) => <option key={waiter} value={waiter}>{waiter}</option>)}</select></label>
            <label><span>Номер стола</span><input value={filters.table} onChange={(event) => setFilters((current) => ({ ...current, table: event.target.value }))} /></label>
            <label><span>Мин. сумма</span><input inputMode="numeric" value={filters.min} onChange={(event) => setFilters((current) => ({ ...current, min: event.target.value }))} /></label>
            <label><span>Макс. сумма</span><input inputMode="numeric" value={filters.max} onChange={(event) => setFilters((current) => ({ ...current, max: event.target.value }))} /></label>
          </div>
        ) : null}

        <div className="report-table-wrapper">
          <table className="report-table">
            <thead><tr><th>ID заказа</th><th>Номер заказа</th><th>Дата</th><th>Статус</th><th>Номер стола</th><th>Официант</th><th>Количество позиций</th><th>Итоговая сумма</th></tr></thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} onClick={() => setSelectedOrder(row)}>
                  <td><strong>{row.id}</strong></td><td>{row.orderNumber}</td><td>{formatDate(row.createdAt)}</td><td>{row.status}</td><td>{row.tableNumber ?? "—"}</td><td>{row.waiterName ?? "—"}</td><td>{row.itemsCount}</td><td className="report-total-price">{formatMoney(row.totalAmount)}</td>
                </tr>
              ))}
              {!visibleRows.length ? <tr className="report-empty-row"><td colSpan={8}>По выбранным фильтрам заказов не найдено</td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>

      {selectedOrder ? (
        <div className="order-details-drawer" role="dialog" aria-label="Детали заказа">
          <div className="order-details-drawer__backdrop" onClick={() => setSelectedOrder(null)} />
          <aside className="order-details-drawer__panel">
            <div className="order-details-drawer__head"><div><span>Заказ</span><h3>{selectedOrder.orderNumber}</h3></div><button type="button" onClick={() => setSelectedOrder(null)} aria-label="Закрыть"><Icon name="bi-x-lg" size={18} /></button></div>
            <div className="order-details-drawer__grid">
              <div><span>ID</span><strong>{selectedOrder.id}</strong></div><div><span>Дата</span><strong>{formatDate(selectedOrder.createdAt)}</strong></div><div><span>Статус</span><strong>{selectedOrder.status}</strong></div><div><span>Стол</span><strong>{selectedOrder.tableNumber ?? "—"}</strong></div><div><span>Официант</span><strong>{selectedOrder.waiterName ?? "—"}</strong></div><div><span>Позиций</span><strong>{selectedOrder.itemsCount}</strong></div><div><span>Итоговая сумма</span><strong>{formatMoney(selectedOrder.totalAmount)}</strong></div>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
