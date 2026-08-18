import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { InlineLoader } from "../Loader";
import { reportsService } from "../../api/reports";
import { formatMoney } from "../../api/client";
import { todayInputValue } from "../../utils/date";
import { isAbortError, useLatestRequest } from "../../hooks/useAsyncSafety";

// OWNER notification center. Truthful, empty-first:
//  • CANCELLED ORDERS — real, derived from GET /reports/orders (status
//    "cancelled") for today. Only backend-supplied fields (№, стол, время,
//    сумма) are shown. Empty company → no rows (healthy empty).
//  • LOW STOCK — backend contract (ingredient min-stock threshold) does NOT
//    exist yet (Inventory Core deferred), so it is shown as a small CALM
//    deferred note, NOT a red error and NOT fake data.
function apiList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function TopbarNotifications() {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const beginRequest = useLatestRequest();
  const [today] = useState(() => todayInputValue());

  const cancelled = useMemo(
    () => orders
      .filter((order) => String(order.status || "").toLowerCase() === "cancelled")
      .map((order) => ({
        id: order.order_id || order.id || order.order_number,
        number: order.order_number ?? order.order_id ?? "",
        table: order.table_number,
        time: formatTime(order.created_at),
        amount: order.total_amount,
      })),
    [orders],
  );
  const count = cancelled.length;

  function load() {
    const request = beginRequest();
    setLoading(true);
    setError("");
    reportsService.listOrders(today, today, { signal: request.signal })
      .then(({ data }) => {
        if (request.isCurrent()) {
          setOrders(apiList(data));
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (!request.isCurrent() || isAbortError(err)) return;
        setError("Не удалось загрузить уведомления");
      })
      .finally(() => {
        if (request.isCurrent()) setLoading(false);
      });
  }

  function toggle() {
    setOpen((current) => {
      const next = !current;
      if (next && !loaded && !loading) load();
      return next;
    });
  }

  useEffect(() => {
    function onDocDown(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const label = count ? `Уведомления: ${count}` : "Уведомлений нет";

  return (
    <div className="topbar-notification-wrap" ref={ref}>
      <button
        className={`topbar-icon topbar-notification ${open ? "is-open" : ""}`}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="bi-bell" size={18} />
        {count ? (
          <span className="topbar-notification__badge" aria-hidden="true">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="stock-alert-popover owner-notif" role="dialog" aria-label="Уведомления">
          <div className="stock-alert-popover__head">
            <div>
              <span>Уведомления</span>
              <strong>{count ? `${count} ${count === 1 ? "новое" : "новых"}` : "Новых уведомлений нет"}</strong>
            </div>
            <button className={loading ? "is-loading" : ""} type="button" onClick={load} disabled={loading} aria-label="Обновить">
              <Icon name="bi-arrow-clockwise" size={16} />
            </button>
          </div>
          <div className="stock-alert-popover__body">
            {loading ? <div className="stock-alert-popover__empty"><InlineLoader text="Загрузка..." /></div> : null}
            {!loading && error ? (
              <div className="owner-notif__error" role="alert">
                <span>{error}</span>
                <button type="button" onClick={load}>Повторить</button>
              </div>
            ) : null}
            {!loading && !error ? cancelled.map((item) => (
              <div className="stock-alert-item owner-notif__item owner-notif__item--cancel" key={item.id}>
                <div className="stock-alert-item__icon owner-notif__icon--cancel"><Icon name="bi-x-circle" size={16} /></div>
                <div>
                  <strong>Заказ №{item.number} отменён</strong>
                  <span>
                    {[item.table ? `Стол ${item.table}` : null, item.time || null]
                      .filter(Boolean).join(" · ")}
                    {item.amount != null ? ` · ${formatMoney(item.amount)}` : ""}
                  </span>
                </div>
              </div>
            )) : null}
            {!loading && !error && !count ? (
              <div className="owner-notif__empty">
                <p className="owner-notif__empty-title">Новых уведомлений нет</p>
                <p className="owner-notif__empty-text">Здесь появятся важные события по складу и заказам.</p>
              </div>
            ) : null}
            {!loading && !error ? (
              <p className="owner-notif__deferred">Низкие остатки появятся после подключения склада.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
