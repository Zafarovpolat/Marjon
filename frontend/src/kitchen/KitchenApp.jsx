// Отдельный KDS-экран поваров: заказы, блюда, «Готово» в одно касание.
// Не входит в админку (/), десктоп и мобилу: свой entry kitchen.html -> src/kitchen/main.jsx.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  ChefHat,
  Clock,
  Delete,
  Loader2,
  LogOut,
  Maximize,
  RefreshCw,
  ShieldCheck,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
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

function orderNumber(order) {
  return order.order_number || order.public_id || String(order.id).slice(0, 8);
}

function orderPlace(order) {
  if (order.table_number) return `Стол ${order.table_number}`;
  return order.hall_name || "Зал";
}

// Русское склонение числительных: 1 заказ, 2 заказа, 5 заказов.
function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const tail = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (tail > 1 && tail < 5) return few;
  if (tail === 1) return one;
  return many;
}

/**
 * Карточка заказа.
 *
 * Порог тревоги — по времени ожидания: до 10 минут спокойная, 10–20 минут
 * янтарная, дольше — красная. Цвет ведёт кайма сверху и таймер, чтобы повар
 * видел «горит» ещё до того, как прочитает цифры.
 */
function KdsOrderCard({ order, now, onItemStatus, onOrderReady, busyId }) {
  const items = order.items ?? [];
  const readyCount = items.filter((i) => itemState(i) === "ready").length;
  const allReady = items.length > 0 && readyCount === items.length;
  const waitingMin = Math.floor(Math.max(0, now - parseTs(order.created_at)) / 60000);
  const tone = waitingMin > 20 ? "urgent" : waitingMin > 10 ? "waiting" : "fresh";
  const isNew = now - parseTs(order.created_at) < 60000;
  const progress = items.length ? Math.round((readyCount / items.length) * 100) : 0;

  return (
    <article className={`kds-card kds-card--${tone} ${isNew ? "is-new" : ""}`}>
      <header className="kds-card__head">
        <div className="kds-card__id">
          <span className="kds-card__num">#{orderNumber(order)}</span>
          <span className="kds-card__where">
            <UtensilsCrossed size={14} aria-hidden="true" />
            {orderPlace(order)}
            {order.order_type ? ` · ${order.order_type}` : ""}
          </span>
        </div>
        <span className="kds-card__timer" title="Время с момента заказа">
          <Clock size={16} aria-hidden="true" />
          {formatElapsed(order.created_at, now)}
        </span>
      </header>

      {order.note ? (
        <p className="kds-card__note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{order.note}</span>
        </p>
      ) : null}

      <ul className="kds-card__items">
        {items.map((item) => {
          const st = itemState(item);
          const busy = busyId === item.id;
          return (
            <li key={item.id} className={`kds-item is-${st}`}>
              <span className="kds-item__qty">{Number(item.quantity || 1)}×</span>
              <span className="kds-item__text">
                <span className="kds-item__name">{item.name || item.product_name || "Блюдо"}</span>
                {item.note ? <span className="kds-item__note">{item.note}</span> : null}
              </span>
              {st === "ready" ? (
                <span className="kds-item__check" aria-label="Готово">
                  <CheckCheck size={20} aria-hidden="true" />
                </span>
              ) : st === "cooking" ? (
                <button
                  className="kds-btn kds-btn--ready"
                  type="button"
                  disabled={busy}
                  onClick={() => onItemStatus(item, "ready")}
                >
                  {busy ? <Loader2 className="kds-spin" size={16} aria-hidden="true" /> : null}
                  Готово
                </button>
              ) : (
                <button
                  className="kds-btn kds-btn--cook"
                  type="button"
                  disabled={busy}
                  onClick={() => onItemStatus(item, "cooking")}
                >
                  Готовить
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="kds-card__foot">
        <div className="kds-progress">
          <div className="kds-progress__head">
            <span>Готово {readyCount} из {items.length}</span>
            <span>{progress}%</span>
          </div>
          <div className="kds-progress__track">
            <span className="kds-progress__bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <button
          className="kds-btn kds-btn--serve"
          type="button"
          disabled={!allReady || busyId === order.id}
          onClick={() => onOrderReady(order)}
        >
          {busyId === order.id ? <Loader2 className="kds-spin" size={18} aria-hidden="true" /> : null}
          {allReady ? "Заказ готов" : "Заказ не готов"}
        </button>
      </footer>
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
  const [online, setOnline] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState("");
  const seenIdsRef = useRef(new Set());
  const toastTimerRef = useRef(null);
  const pinInputRef = useRef(null);
  // Зеркало PIN в ref: два быстрых тапа подряд идут в одном кадре, и чтение
  // pin из замыкания теряло вторую цифру. Значение ведём через ref.
  const pinValueRef = useRef("");

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

  // Поле PIN держим в фокусе: повар может набирать и с физической клавиатуры,
  // и с экранной — ввод идёт в одно и то же поле.
  useEffect(() => {
    if (deviceReady && !authed) pinInputRef.current?.focus();
  }, [deviceReady, authed, pinError]);

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
        setOnline(true);
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
        if (!stopped) setOnline(false);
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
          setOnline(true);
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
      setPinValue("");
      setPinError("");
    } catch (err) {
      setSetupError(err?.response?.data?.detail || "Неверный логин или пароль филиала.");
    } finally {
      setSetupBusy(false);
    }
  }

  function setPinValue(value) {
    pinValueRef.current = value;
    setPin(value);
  }

  async function submitPin(code) {
    if (pinBusy) return;
    setPinBusy(true);
    setPinError("");
    try {
      const data = await kdsPinLogin(code);
      setCookName(data?.user_name || getKdsCookName());
      if (data?.branch) setBranch(data.branch);
      setPinValue("");
      setAuthed(true);
    } catch (err) {
      setPinValue("");
      setPinError(err?.response?.data?.detail || "Неверный PIN. Попробуйте ещё раз.");
    } finally {
      setPinBusy(false);
    }
  }

  // PIN набирается цифрами и отправляется сам на 4-м символе — повару не
  // нужно искать кнопку «Войти» мокрыми руками.
  function pressDigit(digit) {
    const current = pinValueRef.current;
    if (pinBusy || current.length >= 4) return;
    setPinError("");
    const next = `${current}${digit}`;
    setPinValue(next);
    if (next.length === 4) submitPin(next);
  }

  function pressBackspace() {
    if (pinBusy) return;
    setPinError("");
    setPinValue(pinValueRef.current.slice(0, -1));
  }

  // Ввод с физической клавиатуры идёт в то же поле, что и с экранной:
  // маска, авто-отправка и очистка ошибки — одинаковые.
  function handlePinChange(event) {
    if (pinBusy) return;
    const digits = String(event.target.value || "").replace(/\D/g, "").slice(0, 4);
    setPinError("");
    setPinValue(digits);
    if (digits.length === 4) submitPin(digits);
  }

  // Выход повара: экран остаётся привязан к филиалу, следующий вводит свой PIN.
  async function handleCookLogout() {
    await kdsCookLogout();
    setAuthed(false);
    setCookName("");
    setPinValue("");
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
    setPinValue("");
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

  function refreshNow() {
    setError(null);
    setLoading(true);
    loadOrders()
      .then((list) => {
        seenIdsRef.current = new Set(list.map((o) => String(o.id)));
        setOnline(true);
      })
      .catch((e) => {
        setOnline(false);
        setError(e);
      })
      .finally(() => setLoading(false));
  }

  const summary = useMemo(
    () => ({
      total: orders.length,
      items: orders.reduce((sum, o) => sum + (o.items?.length || 0), 0),
      ready: orders.reduce(
        (sum, o) => sum + (o.items ?? []).filter((i) => itemState(i) === "ready").length,
        0,
      ),
      // Заказы, которые горят: ждут больше 20 минут и ещё не готовы целиком.
      urgent: orders.filter((o) => {
        const mins = Math.floor((now - parseTs(o.created_at)) / 60000);
        const items = o.items ?? [];
        const allReady = items.length > 0 && items.every((i) => itemState(i) === "ready");
        return mins > 20 && !allReady;
      }).length,
    }),
    [orders, now],
  );

  // Старые заказы — первыми: повар разгребает очередь, а не список.
  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => parseTs(a.created_at) - parseTs(b.created_at)),
    [orders],
  );

  // Настройка экрана (один раз на устройстве): логин+пароль филиала
  if (!deviceReady) {
    return (
      <div className="kds-auth">
        <form className="kds-auth__card" onSubmit={handleSetupSubmit}>
          <div className="kds-auth__brand">
            <span className="kds-auth__logo">
              <ChefHat size={24} aria-hidden="true" />
            </span>
            <span className="kds-auth__wordmark">
              <strong>MARJON</strong>
              <small>Кухонный экран</small>
            </span>
          </div>

          <div className="kds-auth__intro">
            <h1 className="kds-auth__title">Подключение экрана</h1>
            <p className="kds-auth__sub">
              Введите логин и пароль филиала — один раз на этом устройстве. Дальше повара
              входят по PIN.
            </p>
          </div>

          {setupError ? (
            <div className="kds-alert" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{setupError}</span>
            </div>
          ) : null}

          <label className="kds-field">
            <span className="kds-field__label">Логин филиала</span>
            <input
              className="kds-field__input"
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="+998 90 111-22-33"
              autoComplete="username"
            />
          </label>

          <label className="kds-field">
            <span className="kds-field__label">Пароль филиала</span>
            <input
              className="kds-field__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>

          <button className="kds-btn kds-btn--primary kds-btn--block" type="submit" disabled={setupBusy}>
            {setupBusy ? <Loader2 className="kds-spin" size={18} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
            {setupBusy ? "Подключение…" : "Подключить экран"}
          </button>

          <p className="kds-auth__foot">MARJON POS · кухня</p>
        </form>
      </div>
    );
  }

  // Вход повара: четыре цифры, крупные кнопки, маска в поле
  if (!authed) {
    return (
      <div className="kds-auth">
        <div className="kds-auth__card kds-auth__card--pin">
          <div className="kds-auth__brand">
            <span className="kds-auth__logo">
              <ChefHat size={24} aria-hidden="true" />
            </span>
            <span className="kds-auth__wordmark">
              <strong>MARJON</strong>
              <small>Кухонный экран</small>
            </span>
          </div>

          <div className="kds-auth__intro">
            <h1 className="kds-auth__title">Вход повара</h1>
            <p className="kds-auth__sub">{branch?.name || "Введите PIN из 4 цифр"}</p>
          </div>

          <div className={`kds-pin ${pinError ? "is-error" : ""} ${pinBusy ? "is-busy" : ""}`}>
            {/* Настоящее поле: держит фокус, принимает и экранную, и физическую
                клавиатуру. Само скрыто — рисуем маску из четырёх ячеек. */}
            <input
              ref={pinInputRef}
              className="kds-pin__input"
              type="text"
              inputMode="none"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={4}
              value={pin}
              onChange={handlePinChange}
              aria-label="PIN повара, 4 цифры"
            />
            <div className="kds-pin__slots" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`kds-pin__slot ${pin.length > i ? "is-filled" : ""}`} />
              ))}
            </div>
            <div className="kds-pin__hint" role={pinError ? "alert" : undefined}>
              {pinBusy ? (
                <>
                  <Loader2 className="kds-spin" size={14} aria-hidden="true" /> Проверяем PIN…
                </>
              ) : pinError ? (
                pinError
              ) : (
                "Введите 4 цифры"
              )}
            </div>
          </div>

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
            <button className="kds-keypad__key kds-keypad__key--ghost" type="button" onClick={handleForgetDevice}>
              Сброс
            </button>
            <button className="kds-keypad__key" type="button" disabled={pinBusy} onClick={() => pressDigit("0")}>
              0
            </button>
            <button
              className="kds-keypad__key kds-keypad__key--ghost"
              type="button"
              disabled={pinBusy || !pin.length}
              onClick={pressBackspace}
              aria-label="Стереть последнюю цифру"
            >
              <Delete size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kds">
      <header className="kds-bar">
        <div className="kds-bar__brand">
          <span className="kds-auth__logo kds-auth__logo--sm">
            <ChefHat size={20} aria-hidden="true" />
          </span>
          <div className="kds-bar__names">
            <span className="kds-bar__title">Кухня</span>
            <span className="kds-bar__meta">
              {branch?.name || "Филиал"}
              {cookName ? ` · ${cookName}` : ""}
            </span>
          </div>
        </div>

        <div className="kds-bar__stats">
          <span className="kds-stat">
            <b>{summary.total}</b> {plural(summary.total, "заказ", "заказа", "заказов")}
          </span>
          <span className="kds-stat">
            <b>{summary.items}</b> {plural(summary.items, "блюдо", "блюда", "блюд")}
          </span>
          {summary.urgent > 0 ? (
            <span className="kds-stat kds-stat--alert">
              <b>{summary.urgent}</b> {plural(summary.urgent, "горит", "горят", "горят")}
            </span>
          ) : null}
          <span className={`kds-conn ${online ? "is-on" : "is-off"}`}>
            {online ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
            {online ? "на связи" : "нет связи"}
          </span>
        </div>

        <div className="kds-bar__actions">
          <button
            className={`kds-icon-btn ${soundOn ? "is-on" : ""}`}
            type="button"
            onClick={() => setSoundOn((v) => !v)}
            title={soundOn ? "Звук включён" : "Звук выключен"}
            aria-pressed={soundOn}
          >
            {soundOn ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
          </button>
          <button className="kds-icon-btn" type="button" onClick={refreshNow} title="Обновить заказы">
            <RefreshCw size={20} aria-hidden="true" />
          </button>
          <button
            className="kds-icon-btn"
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.()}
            title="Во весь экран"
          >
            <Maximize size={20} aria-hidden="true" />
          </button>
          <button className="kds-btn kds-btn--ghost" type="button" onClick={handleCookLogout}>
            <LogOut size={18} aria-hidden="true" />
            Сменить повара
          </button>
        </div>
      </header>

      {error ? (
        <main className="kds-board kds-board--state">
          <div className="kds-state">
            <span className="kds-state__icon kds-state__icon--danger">
              <WifiOff size={28} aria-hidden="true" />
            </span>
            <h2 className="kds-state__title">Нет связи с сервером</h2>
            <p className="kds-state__text">
              Заказы не загрузились. Проверьте интернет и попробуйте снова — экран сам
              подхватит новые заказы, как только связь вернётся.
            </p>
            <button className="kds-btn kds-btn--primary" type="button" onClick={refreshNow}>
              <RefreshCw size={18} aria-hidden="true" />
              Обновить
            </button>
          </div>
        </main>
      ) : loading ? (
        <main className="kds-board kds-board--state">
          <div className="kds-state">
            <Loader2 className="kds-spin kds-state__spinner" size={32} aria-hidden="true" />
            <p className="kds-state__text">Загружаем заказы…</p>
          </div>
        </main>
      ) : (
        <main className="kds-board">
          {sortedOrders.map((order) => (
            <KdsOrderCard
              key={order.id}
              order={order}
              now={now}
              busyId={busyId}
              onItemStatus={handleItemStatus}
              onOrderReady={handleOrderReady}
            />
          ))}
          {!sortedOrders.length ? (
            <div className="kds-state">
              <span className="kds-state__icon kds-state__icon--ok">
                <CheckCheck size={28} aria-hidden="true" />
              </span>
              <h2 className="kds-state__title">Все заказы готовы</h2>
              <p className="kds-state__text">
                Новые заказы появятся здесь автоматически — экран обновляется сам.
              </p>
            </div>
          ) : null}
        </main>
      )}

      {toast ? (
        <div className="kds-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
