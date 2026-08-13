import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "../api/client";
import { reportsService } from "../api/reports";
import Icon from "../components/Icon";
import { exportToExcel } from "../utils/excel";
import { isAbortError, isOrderedDateRange, useLatestRequest } from "../hooks/useAsyncSafety";

const rowsPerPage = 5;

function currentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${day}` };
}

function formatDateTime(date, time) {
  return time ? `${date} / ${time}` : date;
}

export default function CancelledDishesReportPage() {
  const [filters, setFilters] = useState(() => ({ ...currentMonthRange(), waiter: "all", query: "" }));
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const beginRequest = useLatestRequest();

  useEffect(() => {
    const request = beginRequest();
    setLoading(true);
    setError("");
    if (!isOrderedDateRange(appliedFilters.from, appliedFilters.to)) {
      setRows([]);
      setError("Дата начала периода не может быть позже даты окончания.");
      setLoading(false);
      return;
    }
    reportsService.listCancelledDishes(appliedFilters.from, appliedFilters.to, { signal: request.signal })
      .then(({ data }) => {
        if (!request.isCurrent()) return;
        if (!Array.isArray(data)) throw new Error("Invalid cancelled-items report response");
        const items = data;
        setRows(items.map((item, index) => ({
          key: `${item.date}-${item.time}-${item.order_number}-${item.name}-${index}`,
          date: item.date,
          time: item.time,
          orderNumber: item.order_number,
          tableNumber: item.table_number,
          name: item.name,
          waiterName: item.waiter_name,
          unit: item.unit,
          quantity: Number(item.quantity),
          price: Number(item.price),
        })));
      })
      .catch((err) => {
        if (!request.isCurrent() || isAbortError(err)) return;
        setRows([]);
        setError(err.response?.data?.detail || "Не удалось загрузить отчёт по отменённым блюдам.");
      })
      .finally(() => { if (request.isCurrent()) setLoading(false); });
  }, [appliedFilters.from, appliedFilters.to, beginRequest]);

  const waiters = useMemo(() => [...new Set(rows.map((row) => row.waiterName).filter(Boolean))], [rows]);
  const filteredRows = useMemo(() => {
    const query = appliedFilters.query.trim().toLowerCase();
    return rows.filter((row) => (appliedFilters.waiter === "all" || row.waiterName === appliedFilters.waiter)
      && (!query || [row.name, row.orderNumber, row.tableNumber, row.waiterName].some((value) => String(value ?? "").toLowerCase().includes(query))));
  }, [rows, appliedFilters]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const visibleRows = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  function applyFilters() {
    setAppliedFilters(filters);
    setPage(1);
  }

  function downloadExcel() {
    exportToExcel(filteredRows, [
      { key: "date", label: "Дата" },
      { key: "time", label: "Время" },
      { key: "orderNumber", label: "Номер заказа" },
      { key: "tableNumber", label: "Номер стола" },
      { key: "name", label: "Название" },
      { key: "waiterName", label: "Официант" },
      { key: "unit", label: "Единица измерения" },
      { key: "quantity", label: "Количество" },
      { key: "price", label: "Цена" },
    ], "cancelled-dishes-report");
  }

  if (loading) return <section className="cancelled-report-page"><div className="dashboard-empty" role="status">Загрузка отчёта...</div></section>;
  if (error) return <section className="cancelled-report-page"><div className="login-error" role="alert">{error}</div></section>;

  return (
    <section className="cancelled-report-page">
      <article className="cancelled-report-card">
        <div className="cancelled-report-head">
          <div className="cancelled-report-title"><span className="cancelled-report-title__mark" aria-hidden="true" /><div><span className="cancelled-report-eyebrow">Marjon reports</span><h2>Отчёт по отменённым блюдам</h2></div></div>
          <button className="cancelled-report-excel" type="button" onClick={downloadExcel}><Icon name="bi-file-earmark-excel" size={18} /> Скачать Excel</button>
        </div>

        <div className="cancelled-filter-panel">
          <label><span>Дата с</span><input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
          <label><span>Дата по</span><input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
          <label><span>Официант</span><select value={filters.waiter} onChange={(event) => setFilters((current) => ({ ...current, waiter: event.target.value }))}><option value="all">Все официанты</option>{waiters.map((waiter) => <option key={waiter} value={waiter}>{waiter}</option>)}</select></label>
          <label className="cancelled-filter-panel__search"><span>Поиск</span><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Блюдо, заказ, стол, официант" /></label>
          <button className="cancelled-filter-button" type="button" onClick={applyFilters}><Icon name="bi-sliders" size={18} /> Фильтровать</button>
        </div>

        <div className="cancelled-table-wrap">
          <table className="cancelled-table">
            <thead><tr><th>Дата</th><th>Номер заказа</th><th>Номер стола</th><th>Название</th><th>Официант</th><th>Ед. изм.</th><th>Количество</th><th>Цена</th></tr></thead>
            <tbody>
              {visibleRows.map((row) => <tr key={row.key}><td>{formatDateTime(row.date, row.time)}</td><td>{row.orderNumber}</td><td>{row.tableNumber ?? "—"}</td><td><strong>{row.name}</strong></td><td>{row.waiterName ?? "—"}</td><td>{row.unit}</td><td>{row.quantity}</td><td>{formatMoney(row.price, "UZS")}</td></tr>)}
              {!visibleRows.length ? <tr className="cancelled-empty-row"><td colSpan={8}>По выбранным фильтрам отменённых блюд нет</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="cancelled-pagination"><span>Показано {visibleRows.length} из {filteredRows.length}</span><div><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} aria-label="Предыдущая страница"><Icon name="bi-chevron-left" size={18} /></button>{Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => <button type="button" key={item} className={page === item ? "is-active" : ""} onClick={() => setPage(item)}>{item}</button>)}<button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages} aria-label="Следующая страница"><Icon name="bi-chevron-right" size={18} /></button></div></div>
      </article>
    </section>
  );
}
