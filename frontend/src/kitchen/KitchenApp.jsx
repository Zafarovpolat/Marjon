// Отдельный KDS-экран поваров: коротко и ясно — заказы, блюда, кнопки «Готово».
// Не входит в админку (/), десктоп и мобилу: свой entry kitchen.html -> src/kitchen/main.jsx.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forgetKdsDevice,
  getKdsBranch,
  getKdsCookName,
  hasKdsDevice,
  isKdsAuthenticated,
  kdsConnectDevice,
  kdsCookLogout,
  kdsGetOrders,
  kdsPinLogin,
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
  // Экран настраивается один раз (логин+пароль филиала), дальше повара
  // входят только по PIN — это главный сценарий у плиты.
  const [deviceReady, setDeviceReady] = useState(() => hasKdsDevice());
  const [authed, setAuthed] = useState(() => isKdsAuthenticated());
  const [branch, setBranch] = useState(() => getKdsBranch());
  const [cookName, setCookName] = useState(() => getKdsCookName());
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [setupError, setSetupError] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
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

  const loadOrders = useCallback(async () => {
    const data = await kdsGetOrders();
    const list = data?.items ?? data ?? [];
    setOrders(Array.isArray(list) ? list : []);
    return Array.isArray(list) ? list : [];
  }, []);

  // Первичная загрузка после входа повара: филиал уже известен из настройки
  // экрана, поэтому сразу тянем заказы.
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
        const list = await loadOrders();
        if (!cancelled) seenIdsRef.current = new Set(list.map((o) => String(o.id)));
      } catch (e) {
        if (!cancelled) {
          if (e?.response?.status === 401) {
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
        const list = await loadOrders();
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

  // Первичная настройка экрана: логин+пароль филиала (как у десктопа).
  async function handleSetupSubmit(event) {
    event.preventDefault();
    if (setupBusy) return;
    if (!login.trim() || !password) {
      setSetupError("Укажите логин и пароль филиала.");
      return;
    }
    setSetupError("");
    setSetupBusy(true);
    try {
      await kdsConnectDevice(login, password);
      setPassword("");
      setBranch(getKdsBranch());
      setDeviceReady(true);
      setPin("");
      setPinError("");
    } catch (err) {
      setSetupError(err?.response?.data?.detail || "Неверный логин или пароль филиала.");
    } finally {
      setSetupBusy(false);
    }
  }

  async function submitPin(code) {
    if (pinBusy) return;
    setPinBusy(true);
    setPinError("");
    try {
      const data = await kdsPinLogin(code);
      setCookName(data?.user_name || getKdsCookName());
      if (data?.branch) setBranch(data.branch);
      setPin("");
      setAuthed(true);
    } catch (err) {
      setPin("");
      setPinError(err?.response?.data?.detail || "Неверный PIN.");
    } finally {
      setPinBusy(false);
    }
  }

  // PIN набирается цифрами и отправляется сам на 4-м символе — повару не
  // нужно искать кнопку «Войти» мокрыми руками.
  function pressDigit(digit) {
    if (pinBusy || pin.length >= 4) return;
    setPinError("");
    const next = `${pin}${digit}`;
    setPin(next);
    if (next.length === 4) submitPin(next);
  }

  function pressBackspace() {
    if (pinBusy) return;
    setPin((prev) => prev.slice(0, -1));
  }

  // Выход повара: экран остаётся привязан к филиалу, следующий вводит свой PIN.
  async function handleCookLogout() {
    await kdsCookLogout();
    setAuthed(false);
    setCookName("");
    setPin("");
    setPinError("");
    setOrders([]);
    setError(null);
    seenIdsRef.current = new Set();
  }

  // Полный сброс устройства: сменить филиал или отдать экран другому заведению.
  function handleForgetDevice() {
    const ok = window.confirm("Отвязать экран от филиала? Понадобится логин и пароль филиала.");
    if (!ok) return;
    forgetKdsDevice();
    setDeviceReady(false);
    setAuthed(false);
    setBranch(null);
    setCookName("");
    setOrders([]);
    setPin("");
    setLogin("");
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
      await loadOrders();
    } catch {
      // Откатываемся к серверному состоянию
      loadOrders().catch(() => {});
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
      loadOrders().catch(() => {});
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

  // Настройка экрана (один раз на устройстве): логин+пароль филиала
  if (!deviceReady) {
    return (
      <div className="kds-login">
        <form className="kds-login__card" onSubmit={handleSetupSubmit}>
          <h1 className="kds-login__title">MARJON · Кухня</h1>
          <p className="kds-login__hint">
            Подключите экран один раз: логин и пароль филиала. Дальше повара входят по PIN.
          </p>
          {setupError ? (
            <div className="kds-login__alert" role="alert">
              {setupError}
            </div>
          ) : null}
          <label className="kds-login__field">
            <span>Логин филиала</span>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="+998 90 111-22-33"
              autoComplete="username"
            />
          </label>
          <label className="kds-login__field">
            <span>Пароль филиала</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль филиала"
              autoComplete="current-password"
            />
          </label>
          <button className="kds-btn kds-btn--order" type="submit" disabled={setupBusy}>
            {setupBusy ? "Подключение…" : "Подключить экран"}
          </button>
        </form>
      </div>
    );
  }

  // Вход повара: четыре цифры, крупные кнопки
  if (!authed) {
    return (
      <div className="kds-login">
        <div className="kds-login__card">
          <h1 className="kds-login__title">MARJON · Кухня</h1>
          <p className="kds-login__hint">
            {branch?.name ? `${branch.name} · ` : ""}Введите PIN повара
          </p>
          <div className="kds-pin__dots" aria-label={`Введено ${pin.length} из 4 цифр`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`kds-pin__dot ${pin.length > i ? "is-filled" : ""}`} />
            ))}
          </div>
          {pinError ? (
            <div className="kds-login__alert" role="alert">
              {pinError}
            </div>
          ) : null}
          <div className="kds-keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
              <button
                key={digit}
                className="kds-keypad__key"
                type="button"
                disabled={pinBusy}
                onClick={() => pressDigit(digit)}
              >
                {digit}
              </button>
            ))}
            <button
              className="kds-keypad__key kds-keypad__key--ghost"
              type="button"
              onClick={handleForgetDevice}
            >
              Сброс
            </button>
            <button
              className="kds-keypad__key"
              type="button"
              disabled={pinBusy}
              onClick={() => pressDigit("0")}
            >
              0
            </button>
            <button
              className="kds-keypad__key"
              type="button"
              disabled={pinBusy || !pin.length}
              onClick={pressBackspace}
              aria-label="Стереть"
            >
              ⌫
            </button>
          </div>
          {pinBusy ? <p className="kds-login__hint">Проверяем PIN…</p> : null}
        </div>
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
            {cookName ? ` · ${cookName}` : ""}
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
          <button className="kds-chip" type="button" onClick={handleCookLogout}>
            Сменить повара
          </button>
        </div>
      </header>

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
                loadOrders()
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
