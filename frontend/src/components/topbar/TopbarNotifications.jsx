import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { InlineLoader } from "../Loader";
import { reportsService } from "../../api/reports";
import { formatMoney } from "../../api/client";
import { todayInputValue } from "../../utils/date";
import { isAbortError, useLatestRequest } from "../../hooks/useAsyncSafety";

// OWNER notification center. Cancelled orders come from today's
// GET /reports/orders response; no unread state or low-stock data is inferred.
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

function formatEventCount(count) {
  const lastTwo = count % 100;
  const lastDigit = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} событий`;
  if (lastDigit === 1) return `${count} событие`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} события`;
  return `${count} событий`;
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
      <div
        className={`stock-alert-popover owner-notif ${open ? "is-open" : ""}`}
        role="dialog"
        aria-label="Уведомления"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="stock-alert-popover__head">
          <div>
            <span>Уведомления</span>
            <strong>{count ? formatEventCount(count) : "Событий пока нет"}</strong>
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
              <div className="stock-alert-item__icon owner-notif__icon--cancel" aria-hidden="true">
                <Icon name="bi-x-octagon" size={18} />
              </div>
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
              <span className="owner-notif__empty-icon" aria-hidden="true">
                <Icon name="bi-bell" size={19} />
              </span>
              <p className="owner-notif__empty-text">Здесь появятся важные события по заказам.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
