import { useEffect, useMemo, useState } from "react";
import { reportsService } from "../api/reports";
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

export default function TablesReportPage() {
  const [dateRange, setDateRange] = useState(currentMonthRange);
  const [tableFilter, setTableFilter] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    reportsService.listTables(toApiDate(dateRange.start), toApiDate(dateRange.end))
      .then(({ data }) => {
        if (!Array.isArray(data)) throw new Error("Invalid tables report response");
        const items = data;
        setRows(items.map((item) => ({
          tableNumber: String(item.table_number),
          ordersCount: Number(item.orders_count),
          revenue: Number(item.revenue),
          avgCheck: Number(item.avg_check),
        })));
      })
      .catch((err) => {
        setRows([]);
        setError(err.response?.data?.detail || "Не удалось загрузить отчёт по столам.");
      })
      .finally(() => setLoading(false));
  }, [dateRange.start, dateRange.end]);

  const visibleRows = useMemo(() => rows.filter((row) => !tableFilter || row.tableNumber.toLowerCase().includes(tableFilter.toLowerCase())), [rows, tableFilter]);
  const totals = useMemo(() => {
    const ordersCount = visibleRows.reduce((sum, row) => sum + row.ordersCount, 0);
    const revenue = visibleRows.reduce((sum, row) => sum + row.revenue, 0);
    return { ordersCount, revenue, avgCheck: ordersCount ? revenue / ordersCount : 0 };
  }, [visibleRows]);

  function downloadExcel() {
    exportToExcel(visibleRows, [
      { key: "tableNumber", label: "Номер стола" },
      { key: "ordersCount", label: "Количество заказов" },
      { key: "revenue", label: "Выручка" },
      { key: "avgCheck", label: "Средний чек" },
    ], "tables-report");
  }

  if (loading) return <section className="tables-report-page"><div className="dashboard-empty" role="status">Загрузка отчёта...</div></section>;
  if (error) return <section className="tables-report-page"><div className="login-error" role="alert">{error}</div></section>;

  return (
    <section className="tables-report-page">
      <article className="report-page-card">
        <div className="report-page-header">
          <div className="report-title-group"><span className="report-accent-bar" aria-hidden="true" /><div><span className="report-eyebrow">Marjon reports</span><h2>Отчёт по столам</h2></div></div>
          <div className="report-actions"><ReportDateRangePicker value={dateRange} onChange={setDateRange} showDropdownIcon /><button className="report-excel-button" type="button" onClick={downloadExcel}><Icon name="bi-file-earmark-excel" size={18} /> Скачать Excel</button></div>
        </div>

        <div className="report-filter-panel"><label><span>Номер стола</span><input value={tableFilter} onChange={(event) => setTableFilter(event.target.value)} /></label></div>

        <div className="report-summary-grid">
          <article className="report-summary-card tables-summary-total"><div><span>Выручка</span><strong>{formatMoney(totals.revenue)}</strong></div><Icon name="bi-cash-stack" size={22} /></article>
          <article className="report-summary-card"><div><span>Количество заказов</span><strong>{totals.ordersCount}</strong></div><Icon name="bi-receipt" size={22} /></article>
          <article className="report-summary-card"><div><span>Средний чек</span><strong>{formatMoney(totals.avgCheck)}</strong></div><Icon name="bi-calculator" size={22} /></article>
        </div>

        <div className="report-table-wrapper">
          <table className="report-table">
            <thead><tr><th>Номер стола</th><th>Количество заказов</th><th>Выручка</th><th>Средний чек</th></tr></thead>
            <tbody>
              {visibleRows.map((row) => <tr key={row.tableNumber}><td><strong>{row.tableNumber}</strong></td><td>{row.ordersCount}</td><td>{formatMoney(row.revenue)}</td><td>{formatMoney(row.avgCheck)}</td></tr>)}
              {!visibleRows.length ? <tr className="report-empty-row"><td colSpan={4}>По выбранным фильтрам столов не найдено</td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
