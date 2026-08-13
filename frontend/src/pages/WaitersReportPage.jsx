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

export default function WaitersReportPage() {
  const [selectedWaiter, setSelectedWaiter] = useState("all");
  const [dateRange, setDateRange] = useState(currentMonthRange);
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api.get("/reports/waiters", { params: { date_from: toApiDate(dateRange.start), date_to: toApiDate(dateRange.end) } })
      .then(({ data }) => {
        if (!Array.isArray(data)) throw new Error("Invalid waiters report response");
        const items = data;
        setWaiters(items.map((item, index) => ({
          key: item.waiter_id == null ? `unassigned-${index}-${item.name}` : String(item.waiter_id),
          waiterId: item.waiter_id,
          name: item.name,
          ordersCount: Number(item.orders_count),
          ordersTotal: Number(item.orders_total),
          dishesCount: Number(item.dishes_count),
        })));
      })
      .catch((err) => {
        setWaiters([]);
        setError(err.response?.data?.detail || "Не удалось загрузить отчёт по официантам.");
      })
      .finally(() => setLoading(false));
  }, [dateRange.start, dateRange.end]);

  const visibleRows = useMemo(() => selectedWaiter === "all" ? waiters : waiters.filter((waiter) => waiter.key === selectedWaiter), [selectedWaiter, waiters]);
  const totals = useMemo(() => visibleRows.reduce((acc, waiter) => ({
    ordersCount: acc.ordersCount + waiter.ordersCount,
    ordersTotal: acc.ordersTotal + waiter.ordersTotal,
    dishesCount: acc.dishesCount + waiter.dishesCount,
  }), { ordersCount: 0, ordersTotal: 0, dishesCount: 0 }), [visibleRows]);

  function handleExport() {
    exportToExcel(visibleRows, [
      { key: "waiterId", label: "ID официанта" },
      { key: "name", label: "Имя" },
      { key: "ordersCount", label: "Количество заказов" },
      { key: "ordersTotal", label: "Сумма заказов" },
      { key: "dishesCount", label: "Количество блюд" },
    ], "waiters-report");
  }

  if (loading) return <section className="z-waiters-report"><div className="dashboard-empty" role="status">Загрузка отчёта...</div></section>;
  if (error) return <section className="z-waiters-report"><div className="login-error" role="alert">{error}</div></section>;

  return (
    <section className="waiters-report-page">
      <article className="waiters-report-card z-waiters-report">
        <div className="z-waiters-report__head">
          <div className="z-waiters-report__title"><span aria-hidden="true" /><strong>Отчёт по официантам</strong></div>
          <div className="z-waiters-report__controls">
            <div className="z-waiters-report__date-picker report-actions"><ReportDateRangePicker value={dateRange} onChange={setDateRange} buttonClassName="z-waiters-report__date" showDropdownIcon /></div>
            <label className="z-waiters-report__select"><select value={selectedWaiter} onChange={(event) => setSelectedWaiter(event.target.value)}><option value="all">Все официанты</option>{waiters.map((waiter) => <option key={waiter.key} value={waiter.key}>{waiter.name}</option>)}</select><Icon name="bi-chevron-down" size={18} /></label>
            <button className="z-waiters-report__excel" type="button" onClick={handleExport}><Icon name="bi-file-earmark-excel" size={18} /> Скачать на Excel</button>
          </div>
        </div>

        <div className="report-table-wrapper">
          <table className="report-table" aria-label="Отчёт по официантам">
            <thead><tr><th>Имя</th><th>Количество заказов</th><th>Сумма заказов</th><th>Количество блюд</th></tr></thead>
            <tbody>
              <tr className="z-waiters-report__row--total"><td><strong>Всего</strong></td><td>{totals.ordersCount}</td><td>{formatMoney(totals.ordersTotal)}</td><td>{totals.dishesCount}</td></tr>
              {visibleRows.map((waiter) => <tr key={waiter.key}><td><strong>{waiter.name}</strong></td><td>{waiter.ordersCount}</td><td>{formatMoney(waiter.ordersTotal)}</td><td>{waiter.dishesCount}</td></tr>)}
              {!visibleRows.length ? <tr className="report-empty-row"><td colSpan={4}>Данных по официантам за выбранный период нет</td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
