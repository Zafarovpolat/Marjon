import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../Icon";
import { InlineLoader } from "../Loader";
import { reportsService } from "../../api/reports";
import { warehouseService } from "../../api/warehouse";
import { formatMoney } from "../../api/client";
import { todayInputValue } from "../../utils/date";
import { isAbortError, useLatestRequest } from "../../hooks/useAsyncSafety";

// OWNER notification center. Cancelled orders come from today's
// GET /reports/orders response; low-stock alerts come from live
// GET /inventory/stock?low_stock=true (no unread state is inferred).
const LOW_STOCK_POLL_MS = 60000;
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
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // Дефицит сырья: stock-строки ниже порога + имена из справочника.
  const [lowRows, setLowRows] = useState([]);
  const [lowNames, setLowNames] = useState(new Map());
  const [lowLoaded, setLowLoaded] = useState(false);
  const [lowLoading, setLowLoading] = useState(false);
  const beginRequest = useLatestRequest();
  const beginLowRequest = useLatestRequest();
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
  const lowStock = useMemo(() => {
    const nameOf = (row) => lowNames.get(String(row?.ingredient_id)) || null;
    return lowRows
      .filter((row) => Number(row?.quantity) < Number(row?.min_quantity))
      .map((row) => ({
        id: `${row?.warehouse_id || "wh"}:${row?.ingredient_id}`,
        ingredientId: row?.ingredient_id,
        name: nameOf(row)?.name || "Сырьё",
        unit: nameOf(row)?.unit || row?.unit || "кг",
        quantity: Number(row?.quantity) || 0,
        min: Number(row?.min_quantity) || 0,
      }));
  }, [lowRows, lowNames]);
  const count = cancelled.length + lowStock.length;

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
    loadLowStock();
  }

  // Дефицит live: бейдж обновляется сам (mount + минута), без открытия.
  function loadLowStock() {
    const request = beginLowRequest();
    setLowLoading(true);
    Promise.all([
      warehouseService.listStock({ params: { low_stock: true }, signal: request.signal }),
      warehouseService.listIngredients({ signal: request.signal }).catch(() => ({ data: [] })),
    ])
      .then(([stockRes, ingRes]) => {
        if (!request.isCurrent()) return;
        const items = stockRes?.data;
        setLowRows(Array.isArray(items) ? items : items?.items || []);
        const ings = ingRes?.data;
        const list = Array.isArray(ings) ? ings : ings?.items || [];
        const map = new Map();
        list.forEach((item) => {
          if (item?.id) map.set(String(item.id), { name: item.name, unit: item.unit });
        });
        setLowNames(map);
        setLowLoaded(true);
      })
      .catch((err) => {
        if (!request.isCurrent() || isAbortError(err)) return;
        // Честно прячем секцию дефицита, заказы не трогаем.
        setLowRows([]);
        setLowLoaded(true);
      })
      .finally(() => {
        if (request.isCurrent()) setLowLoading(false);
      });
  }

  useEffect(() => {
    loadLowStock();
    const timer = setInterval(loadLowStock, LOW_STOCK_POLL_MS);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          {lowLoaded && !lowLoading && !error ? lowStock.map((item) => (
            <button
              type="button"
              className="stock-alert-item owner-notif__item owner-notif__item--low"
              key={item.id}
              onClick={() => {
                setOpen(false);
                navigate("/nomenclature/raw-materials");
              }}
              aria-label={`${item.name}: остаток ниже порога`}
            >
              <div className="stock-alert-item__icon owner-notif__icon--low" aria-hidden="true">
                <Icon name="bi-exclamation-triangle" size={18} />
              </div>
              <div>
                <strong>{item.name}: дефицит</strong>
                <span>Остаток {item.quantity} {item.unit} из мин. {item.min}</span>
              </div>
            </button>
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
