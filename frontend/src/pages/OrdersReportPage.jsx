import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, formatMoney, formatNumber } from "../api/client";
import { formatDateLabel, todayInputValue } from "../utils/date";

const STATUS_LABELS = {
  new: "Новый", accepted: "Принят", cooking: "Готовится",
  ready: "Готов", completed: "Выполнен", cancelled: "Отменён",
};
const TYPE_LABELS = { dine_in: "Зал", delivery: "Доставка", takeaway: "Самовывоз" };

export default function OrdersReportPage() {
  const outlet = useOutletContext();
  const { selectedDate = todayInputValue() } = outlet || {};
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    setError("");
    api.get("/pos/orders", { params: { date: selectedDate } })
      .then(({ data }) => setOrders(data))
      .catch((err) => setError(err.response?.data?.detail || "Не удалось загрузить заказы."))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter !== "all") list = list.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        String(o.order_number).includes(q) || String(o.table_number || "").includes(q)
      );
    }
    return list;
  }, [orders, statusFilter, search]);

  const totals = useMemo(() => ({
    revenue: filtered.reduce((s, o) => s + Number(o.total_amount || 0), 0),
    count: filtered.length,
    avg: filtered.length
      ? filtered.reduce((s, o) => s + Number(o.total_amount || 0), 0) / filtered.length
      : 0,
  }), [filtered]);

  return (
    <>
      <section className="kpi-grid">
        <article className="kpi-card compact">
          <div className="kpi-label">Заказов</div>
          <div className="kpi-value">{formatNumber(totals.count)}</div>
        </article>
        <article className="kpi-card compact">
          <div className="kpi-label">Выручка</div>
          <div className="kpi-value">{formatMoney(totals.revenue)}</div>
        </article>
        <article className="kpi-card compact">
          <div className="kpi-label">Средний чек</div>
          <div className="kpi-value">{formatMoney(Math.round(totals.avg))}</div>
        </article>
      </section>

      <section className="card card-pad">
        <div className="section-header">
          <div><span className="eyebrow">Reports</span><h2>Заказы за {formatDateLabel(selectedDate)}</h2></div>
        </div>
        {error ? <div className="login-error">{error}</div> : null}

        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <input className="pos-search-input" placeholder="Поиск по номеру, столу..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1 1 200px", maxWidth: 280 }} />
          <select className="pos-select" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)} style={{ flex: "0 1 180px" }}>
            <option value="all">Все статусы</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>Номер</th><th>Тип</th><th>Стол</th><th>Статус</th><th>Позиций</th><th>Сумма</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 24 }}>Загрузка...</td></tr>
              ) : filtered.map((order) => (
                <tr key={order.id}>
                  <td><strong>#{order.order_number}</strong></td>
                  <td>{TYPE_LABELS[order.order_type] || order.order_type || "—"}</td>
                  <td>{order.table_number || "—"}</td>
                  <td>
                    <span className={`badge ${order.status === "completed" ? "badge-success" : order.status === "cancelled" ? "badge-danger" : "badge-info"}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </td>
                  <td>{order.items?.length || 0}</td>
                  <td>{formatMoney(order.total_amount)}</td>
                </tr>
              ))}
              {!loading && !filtered.length ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 24 }}>Заказов за этот день нет.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}