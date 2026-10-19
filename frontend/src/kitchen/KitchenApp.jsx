// Отдельный KDS-экран поваров: коротко и ясно — заказы, блюда, кнопки «Готово».
// Не входит в админку (/), десктоп и мобилу: свой entry kitchen.html -> src/kitchen/main.jsx.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearKdsSession,
  isKdsAuthenticated,
  kdsGetBranches,
  kdsGetMe,
  kdsGetOrders,
  kdsLogin,
  kdsLogout,
  kdsSetItemStatus,
  kdsSetOrderReady,
  kdsWsUrl,
} from "./api";

// Бэкенд отдаёт наивный UTC без таймзоны — считаем его UTC, иначе таймеры врут
function parseTs(ts) {
  if (!ts) return Date.now();
  const s = String(ts);
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
  const t = new Date(withZone).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

function formatElapsed(createdAt, now) {
  const diff = Math.max(0, now - parseTs(createdAt));
  const min = Math.floor(diff / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Короткий звуковой сигнал о новом заказе без внешних ассетов
function beep(enabled) {
  if (!enabled) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.value = 0.15;
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close?.();
  } catch {
    // Нет звука — не блокируем кухню
  }
}

function itemState(item) {
  const s = String(item?.status || "pending").toLowerCase();
  if (s === "ready" || s === "done" || s === "served") return "ready";
  if (s === "cooking" || s === "in_progress") return "cooking";
  return "pending";
}

function KdsOrderCard({ order, now, onItemStatus, onOrderReady, busyId }) {
  const items = order.items ?? [];
  const readyCount = items.filter((i) => itemState(i) === "ready").length;
  const allReady = items.length > 0 && readyCount === items.length;
  const waitingMin = Math.floor(Math.max(0, now - parseTs(order.created_at)) / 60000);
  const tone = waitingMin > 20 ? "kds-card--urgent" : waitingMin > 10 ? "kds-card--waiting" : "";
  const orderNo = order.order_number || order.public_id || String(order.id).slice(0, 8);

  return (
    <article className={`kds-card ${tone}`}>
      <div className="kds-card__head">
        <div>
          <h2 className="kds-card__number">#{orderNo}</h2>
          <div className="kds-card__meta">
            {order.table_number ? `Стол ${order.table_number}` : order.hall_name ? order.hall_name : "Зал"}
            {order.order_type ? ` · ${order.order_type}` : ""}
          </div>
        </div>
        <div className="kds-card__timer" title="Время ожидания">
          {formatElapsed(order.created_at, now)}
        </div>
      </div>
      {order.note ? <div className="kds-card__note">{order.note}</div> : null}
      <div className="kds-card__progress">
        <div className="kds-card__progress-bar" style={{ width: `${items.length ? (readyCount / items.length) * 100 : 0}%` }} />
      </div>
      <ul className="kds-card__items">
        {items.map((item) => {
          const st = itemState(item);
          const busy = busyId === item.id;
          return (
            <li key={item.id} className={`kds-item ${st === "ready" ? "kds-item--ready" : ""}`}>
              <span className="kds-item__qty">{Number(item.quantity || 1)}×</span>
              <div className="kds-item__body">
                <span className="kds-item__name">{item.name || item.product_name || "Блюдо"}</span>
                {item.note ? <span className="kds-item__note">{item.note}</span> : null}
              </div>
              {st === "ready" ? (
                <span className="kds-item__done-mark" aria-label="Готово">✓</span>
              ) : st === "pending" ? (
                <button
                  className="kds-btn kds-btn--cook"
                  type="button"
                  disabled={busy}
                  onClick={() => onItemStatus(item, "cooking")}
                >
                  Готовить
                </button>
              ) : (
                <button
                  className="kds-btn kds-btn--ready"
                  type="button"
                  disabled={busy}
                  onClick={() => onItemStatus(item, "ready")}
                >
                  Готово
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button
        className="kds-btn kds-btn--order"
        type="button"
        disabled={!allReady || busyId === order.id}
        onClick={() => onOrderReady(order)}
      >
        {allReady ? "ЗАКАЗ ГОТОВ" : `Готово ${readyCount}/${items.length}`}
      </button>
    </article>
  );
}

export default function KitchenApp() {
  const [authed, setAuthed] = useState(() => isKdsAuthenticated());
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [soundOn, setSoundOn] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState("");
  const seenIdsRef = useRef(new Set());
  const toastTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  function flashToast(text) {
    setToast(text);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 3000);
  }

  // Тикающий таймер карточек (раз в секунду)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadOrders = useCallback(async (branchId) => {
    if (!branchId) return;
    const data = await kdsGetOrders(branchId);
    const list = data?.items ?? data ?? [];
    setOrders(Array.isArray(list) ? list : []);
    return Array.isArray(list) ? list : [];
  }, []);

  // Первичная загрузка после входа: профиль -> филиал -> заказы
  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const me = await kdsGetMe();
        // У повара филиал уже зашит в токене — берём его сразу
        const myBranchId = me?.branch_id || null;
        let active = null;
        if (myBranchId) {
          active = { id: myBranchId, name: me?.branch_name || "" };
        } else {
          const list = await kdsGetBranches();
          if (cancelled) return;
          setBranches(Array.isArray(list) ? list : []);
          if (list?.length === 1) active = list[0];
        }
        if (cancelled) return;
        setBranch(active);
        if (active?.id) {
          const list = await loadOrders(active.id);
          if (!cancelled) seenIdsRef.current = new Set(list.map((o) => String(o.id)));
        }
      } catch (e) {
        if (!cancelled) {
          if (e?.response?.status === 401) {
            clearKdsSession();
            setAuthed(false);
          } else {
            setError(e);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, loadOrders]);

  // Живые обновления: WS кухни + опрос-резерв каждые 5 сек
  useEffect(() => {
    if (!authed || !branch?.id) return;
    let stopped = false;
    let socket = null;
    let pollTimer = null;

    const refresh = async (announce = false) => {
      try {
        const list = await loadOrders(branch.id);
        if (stopped) return;
        const prev = seenIdsRef.current;
        if (prev.size > 0) {
          const fresh = list.filter((o) => !prev.has(String(o.id)));
          if (fresh.length) {
            beep(soundOn);
            if (announce) flashToast(`Новый заказ: ${fresh.length}`);
          }
        }
        seenIdsRef.current = new Set(list.map((o) => String(o.id)));
      } catch {
        // Ошибку показывает ручной refresh и следующий тик опроса
      }
    };

    try {
      const url = kdsWsUrl(branch.id);
      if (url) {
        socket = new WebSocket(url);
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            const name = payload?.event || payload?.type || "";
            if (["new_order", "order_updated", "order_cancelled", "item_status_changed"].includes(name)) {
              refresh(name === "new_order");
            }
          } catch {
            // Битый WS-кадр игнорируем — опрос всё равно подтянет
          }
        };
        socket.onclose = () => {
          if (!stopped && !pollTimer) pollTimer = setInterval(() => refresh(false), 5000);
        };
        socket.onopen = () => {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        };
      }
    } catch {
      // Нет WS — остаёмся на опросе
    }
    pollTimer = setInterval(() => refresh(false), 5000);
    refresh(false);

    return () => {
      stopped = true;
      try {
        socket?.close();
      } catch {
        // ignore
      }
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [authed, branch?.id, loadOrders, soundOn]);

  async function handleLoginSubmit(event) {
    event.preventDefault();
    if (loginBusy) return;
    if (!login.trim() || !password) {
      setLoginError("Укажите логин и пароль.");
      return;
    }
    setLoginError("");
    setLoginBusy(true);
    try {
      await kdsLogin(login.trim(), password);
      setPassword("");
      setAuthed(true);
    } catch (err) {
      setLoginError(err?.response?.data?.detail || "Неверный логин или пароль.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    await kdsLogout();
    setAuthed(false);
    setBranch(null);
    setBranches([]);
    setOrders([]);
    setError(null);
    seenIdsRef.current = new Set();
  }

  // Оптимистичный перевод позиции: интерфейс отвечает мгновенно
  async function handleItemStatus(item, status) {
    setBusyId(item.id);
    setOrders((prev) =>
      prev.map((o) => ({
        ...o,
        items: (o.items ?? []).map((it) => (it.id === item.id ? { ...it, status } : it)),
      })),
    );
    try {
      await kdsSetItemStatus(item.id, status);
      if (branch?.id) await loadOrders(branch.id);
    } catch {
      // Откатываемся к серверному состоянию
      if (branch?.id) loadOrders(branch.id).catch(() => {});
    } finally {
      setBusyId(null);
    }
  }

  async function handleOrderReady(order) {
    setBusyId(order.id);
    try {
      await kdsSetOrderReady(order.id);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch {
      if (branch?.id) loadOrders(branch.id).catch(() => {});
    } finally {
      setBusyId(null);
    }
  }

  const summary = useMemo(
    () => ({
      total: orders.length,
      items: orders.reduce((sum, o) => sum + (o.items?.length || 0), 0),
    }),
    [orders],
  );

  // Экран входа повара
  if (!authed) {
    return (
      <div className="kds-login">
        <form className="kds-login__card" onSubmit={handleLoginSubmit}>
          <h1 className="kds-login__title">MARJON · Кухня</h1>
          <p className="kds-login__hint">Войдите под логином повара — откроются заказы вашего филиала.</p>
          {loginError ? (
            <div className="kds-login__alert" role="alert">
              {loginError}
            </div>
          ) : null}
          <label className="kds-login__field">
            <span>Телефон или email</span>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="+998 90 123-45-67"
              autoComplete="username"
            />
          </label>
          <label className="kds-login__field">
            <span>Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              autoComplete="current-password"
            />
          </label>
          <button className="kds-btn kds-btn--order" type="submit" disabled={loginBusy}>
            {loginBusy ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="kds">
      <header className="kds-topbar">
        <div className="kds-topbar__info">
          <h1 className="kds-topbar__title">Кухня</h1>
          <div className="kds-topbar__sub">
            MARJON · {summary.total} заказов · {summary.items} блюд
            {branch?.name ? ` · ${branch.name}` : ""}
          </div>
        </div>
        <div className="kds-topbar__controls">
          <button
            className="kds-chip"
            type="button"
            onClick={() => setSoundOn((v) => !v)}
            title="Звук новых заказов"
          >
            {soundOn ? "Звук вкл" : "Звук выкл"}
          </button>
          <button
            className="kds-chip"
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.()}
          >
            Во весь экран
          </button>
          <button className="kds-chip" type="button" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </header>

      {branches.length > 1 && !branch?.id ? (
        <div className="kds-branches">
          <p>Выберите филиал:</p>
          <div className="kds-branches__list">
            {branches.map((b) => (
              <button
                key={b.id}
                className="kds-btn kds-btn--cook"
                type="button"
                onClick={() => setBranch(b)}
              >
                {b.name || b.id}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="kds-empty" role="alert">
          Не удалось загрузить заказы. Проверьте связь и нажмите «Обновить».
          <div>
            <button
              className="kds-btn kds-btn--cook"
              type="button"
              onClick={() => {
                setError(null);
                setLoading(true);
                loadOrders(branch?.id)
                  .then((list) => {
                    seenIdsRef.current = new Set(list.map((o) => String(o.id)));
                  })
                  .catch((e) => setError(e))
                  .finally(() => setLoading(false));
              }}
            >
              Обновить
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="kds-empty">Загрузка заказов…</div>
      ) : (
        <main className="kds-board">
          {orders.map((order) => (
            <KdsOrderCard
              key={order.id}
              order={order}
              now={now}
              busyId={busyId}
              onItemStatus={handleItemStatus}
              onOrderReady={handleOrderReady}
            />
          ))}
          {!orders.length ? <div className="kds-empty">Активных заказов нет.</div> : null}
        </main>
      )}
      {toast ? <div className="kds-toast">{toast}</div> : null}
    </div>
  );
}
