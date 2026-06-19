import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { clampToToday, todayInputValue } from "../utils/date";
import DatePicker from "./DatePicker";
import Icon from "./Icon";

const USD_RATE_URL = "https://cbu.uz/ru/arkhiv-kursov-valyut/json/USD/";

function parseMoneyInput(value) {
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyInput(value, withDecimal = false) {
  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace(/[^\d,.]/g, "")
    .replace(".", ",");
  const [integerPart = "", decimalPart = ""] = cleaned.split(",");
  const groupedInteger = integerPart.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (withDecimal && cleaned.includes(",")) {
    return `${groupedInteger || "0"},${decimalPart.slice(0, 2)}`;
  }
  return groupedInteger || "";
}

export default function Topbar({
  selectedDate,
  onSelectedDateChange,
}) {
  const notificationsRef = useRef(null);
  const rateWidgetRef = useRef(null);
  const [today] = useState(() => todayInputValue());
  const [stockOpen, setStockOpen] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");
  const [lowStock, setLowStock] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("uzcard");
  const [paymentStep, setPaymentStep] = useState("method");
  const [usdRate, setUsdRate] = useState(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [usdAmount, setUsdAmount] = useState("1");
  const [converterDirection, setConverterDirection] = useState("usd-to-uzs");
  const [widgetError, setWidgetError] = useState(false);
  const ingredientById = useMemo(() => new Map(ingredients.map((item) => [item.id, item])), [ingredients]);
  const visibleLowStock = useMemo(
    () => lowStock.filter((item) => Number(item.quantity || 0) <= Number(item.min_quantity || 0)).slice(0, 8),
    [lowStock],
  );
  const stockNotifications = useMemo(() => {
    if (visibleLowStock.length) {
      return visibleLowStock.map((item) => {
        const ingredient = ingredientById.get(item.ingredient_id);
        const quantity = Number(item.quantity || 0);
        const minQuantity = Number(item.min_quantity || 0);
        return {
          id: item.id,
          title: ingredient?.name || `${"\u0418\u043d\u0433\u0440\u0435\u0434\u0438\u0435\u043d\u0442"} ${String(item.ingredient_id).slice(0, 8)}`,
          text: `${quantity.toLocaleString("ru-RU")} ${item.unit} / min ${minQuantity.toLocaleString("ru-RU")} ${item.unit}`,
        };
      });
    }

    return [{
      id: "demo-chicken-low-stock",
      title: "\u041a\u0443\u0440\u0438\u043d\u043e\u0435 \u0444\u0438\u043b\u0435",
      text: "\u0417\u0430\u043a\u0430\u043d\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044f - \u043e\u0441\u0442\u0430\u043b\u043e\u0441\u044c 2 \u043a\u0433",
    }];
  }, [ingredientById, visibleLowStock]);
  const notificationCount = stockError ? 0 : stockNotifications.length;
  const notificationLabel = notificationCount
    ? `\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f: ${notificationCount}`
    : "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439 \u043d\u0435\u0442";
  const convertedAmount = useMemo(() => {
    const amount = parseMoneyInput(usdAmount);
    if (!usdRate) return "";
    if (converterDirection === "uzs-to-usd") {
      return formatMoneyInput((amount / usdRate).toFixed(2).replace(".", ","), true);
    }
    return formatMoneyInput(String(Math.round(amount * usdRate)));
  }, [converterDirection, usdAmount, usdRate]);
  const converterSource = converterDirection === "usd-to-uzs"
    ? { label: "Доллар США", inputMode: "decimal" }
    : { label: "Узбекский сум", inputMode: "numeric" };
  const converterTarget = converterDirection === "usd-to-uzs"
    ? { label: "Узбекский сум", inputMode: "numeric" }
    : { label: "Доллар США", inputMode: "decimal" };
  const converterDirectionLabel = converterDirection === "usd-to-uzs" ? "USD → UZS" : "UZS → USD";

  function loadLowStock() {
    setStockLoading(true);
    setStockError("");
    api.get("/inventory/stock", { params: { low_stock: true } })
      .then((stockRes) => {
        setLowStock(stockRes.data);
        return api.get("/inventory/ingredients")
          .then((ingredientsRes) => setIngredients(ingredientsRes.data))
          .catch(() => setIngredients([]));
      })
      .catch((err) => {
        setLowStock([]);
        setStockError(err.response?.data?.detail || "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043e\u0441\u0442\u0430\u0442\u043a\u0438.");
      })
      .finally(() => setStockLoading(false));
  }

  function toggleStockNotifications() {
    setStockOpen((current) => {
      const next = !current;
      if (next && !lowStock.length && !stockLoading) {
        loadLowStock();
      }
      return next;
    });
  }

  function toggleConverterDirection() {
    setUsdAmount(convertedAmount || "1");
    setConverterDirection((current) => (current === "usd-to-uzs" ? "uzs-to-usd" : "usd-to-uzs"));
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (!notificationsRef.current?.contains(event.target)) {
        setStockOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    loadLowStock();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    function loadInfoWidgets() {
      setWidgetError(false);
      fetch(USD_RATE_URL, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("rate");
          return res.json();
        })
        .then((data) => {
          const rate = Number(data?.[0]?.Rate);
          if (Number.isFinite(rate)) setUsdRate(Math.round(rate));
        })
        .catch(() => {
          if (!controller.signal.aborted) setWidgetError(true);
        });
    }

    loadInfoWidgets();
    const id = window.setInterval(loadInfoWidgets, 10 * 60 * 1000);
    return () => {
      controller.abort();
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rateWidgetRef.current?.contains(event.target)) {
        setRateOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!paymentOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setPaymentOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [paymentOpen]);

  return (
    <>
      <header className="dashboard-topbar">
        <div className="topbar-left">
          <DatePicker
            value={selectedDate}
            max={today}
            onChange={(value) => onSelectedDateChange(clampToToday(value))}
          />
        </div>
        <div className="topbar-actions">
          <div className="topbar-info-widgets" aria-label="Информационные виджеты" ref={rateWidgetRef}>
          <button className={`topbar-info-widget topbar-info-widget--rate ${rateOpen ? "is-open" : ""}`} type="button" onClick={() => setRateOpen((value) => !value)} aria-expanded={rateOpen} aria-haspopup="dialog">
            <span className="topbar-info-widget__icon">
              <Icon name="bi-currency-exchange" size={17} />
            </span>
            <strong className="topbar-info-widget__body">
              {usdRate ? `${usdRate.toLocaleString("ru-RU")} UZS/USD` : "—"}
            </strong>
            {widgetError && !usdRate
              ? <Icon name="bi-wifi-off" size={15} className="topbar-info-widget__trend" />
              : null}
          </button>
          {rateOpen ? (
            <div className="usd-rate-popover" role="dialog" aria-label="Курс USD">
              <div className="usd-rate-popover__head">
                <div>
                  <span>Официальный курс ЦБ</span>
                  <strong>{usdRate ? `${usdRate.toLocaleString("ru-RU")} UZS` : "Загрузка..."}</strong>
                </div>
                <button type="button" aria-label="Закрыть" onClick={() => setRateOpen(false)}>
                  <Icon name="bi-x-lg" size={18} />
                </button>
              </div>
              <div className="usd-rate-popover__meta">
                <button
                  className="usd-rate-direction-toggle"
                  type="button"
                  onClick={toggleConverterDirection}
                  aria-label="Поменять направление конвертации"
                >
                  <span>{converterDirectionLabel}</span>
                  <Icon name="bi-arrow-left-right" size={16} />
                </button>
                <span>Источник: ЦБ Узбекистана</span>
              </div>
              <div className="usd-converter">
                <label>
                  <input
                    value={usdAmount}
                    inputMode={converterSource.inputMode}
                    onChange={(event) => setUsdAmount(formatMoneyInput(event.target.value, converterDirection === "usd-to-uzs"))}
                  />
                  <span>{converterSource.label}</span>
                  <Icon name="bi-chevron-down" size={14} />
                </label>
                <label>
                  <input value={convertedAmount} inputMode={converterTarget.inputMode} onChange={(event) => {
                    const value = parseMoneyInput(event.target.value);
                    if (!usdRate) {
                      setUsdAmount("0");
                      return;
                    }
                    if (converterDirection === "uzs-to-usd") {
                      setUsdAmount(formatMoneyInput(String(Math.round(value * usdRate))));
                      return;
                    }
                    setUsdAmount(formatMoneyInput(String((value / usdRate).toFixed(2)).replace(".", ","), true));
                  }} />
                  <span>{converterTarget.label}</span>
                  <Icon name="bi-chevron-down" size={14} />
                </label>
              </div>
            </div>
          ) : null}
          </div>
          <div className="topbar-notification-wrap" ref={notificationsRef}>
            <button
              className={`topbar-icon topbar-notification ${stockOpen ? "is-open" : ""}`}
              type="button"
              aria-label={notificationLabel}
              aria-haspopup="dialog"
              aria-expanded={stockOpen}
              onClick={toggleStockNotifications}
            >
              <Icon name="bi-bell" size={18} />
              {notificationCount ? (
                <span className="topbar-notification__badge" aria-hidden="true">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              ) : null}
            </button>
            {stockOpen ? (
              <div className="stock-alert-popover" role="dialog" aria-label={"\u0421\u043a\u043b\u0430\u0434\u0441\u043a\u0438\u0435 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f"}>
                <div className="stock-alert-popover__head">
                  <div>
                    <span>{"\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f"}</span>
                    <strong>{notificationCount ? `${notificationCount} ${notificationCount === 1 ? "\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435" : "\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439"}` : "\u041d\u0435\u0442 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439"}</strong>
                  </div>
                  <button className={stockLoading ? "is-loading" : ""} type="button" onClick={loadLowStock} disabled={stockLoading} aria-label={"\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c"}>
                    <Icon name="bi-arrow-clockwise" size={16} />
                  </button>
                </div>
                <div className="stock-alert-popover__body">
                  {stockLoading ? <p className="stock-alert-popover__empty">{"\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430..."}</p> : null}
                  {stockError ? <p className="stock-alert-popover__error">{stockError}</p> : null}
                  {!stockLoading && !stockError ? stockNotifications.map((item) => {
                    return (
                      <div className="stock-alert-item" key={item.id}>
                        <div className="stock-alert-item__icon"><Icon name="bi-exclamation-triangle" size={16} /></div>
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.text}</span>
                        </div>
                      </div>
                    );
                  }) : null}
                  {!stockLoading && !stockError && !stockNotifications.length ? (
                    <p className="stock-alert-popover__empty">{"\u041d\u043e\u0432\u044b\u0445 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439 \u043d\u0435\u0442"}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <div className="topbar-balance-pill" aria-label="Баланс 12 540 000 UZS">
            <span className="topbar-balance-amount">12 540 000 UZS</span>
            <button className="topbar-pay-button" type="button" onClick={() => {
              setPaymentStep("method");
              setPaymentOpen(true);
            }}>
              <Icon name="bi-wallet2" size={18} />
              <span>Баланс</span>
            </button>
          </div>
        </div>
      </header>
      {paymentOpen ? (
        <div className="balance-payment-modal" role="presentation" onMouseDown={() => setPaymentOpen(false)}>
          <section className={`balance-payment-dialog ${paymentStep === "card" ? "balance-payment-dialog--card" : ""}`} role="dialog" aria-modal="true" aria-labelledby="balance-payment-title" onMouseDown={(event) => event.stopPropagation()}>
            {paymentStep === "method" ? (
              <>
                <div className="balance-payment-dialog__head">
                  <div>
                    <span>Оплата баланса</span>
                    <h2 id="balance-payment-title">Оплата</h2>
                  </div>
                  <button className="balance-card-back balance-card-back--icon" type="button" aria-label="Закрыть" onClick={() => setPaymentOpen(false)}>
                    <Icon name="bi-x-lg" size={18} />
                  </button>
                </div>
                <div className="balance-payment-dialog__notice">
                  <Icon name="bi-credit-card-2-front" size={20} />
                  <span>Выберите способ оплаты</span>
                </div>
                <label className="balance-payment-dialog__field">
                  <span>Payment ID</span>
                  <input type="text" value="1001162" readOnly />
                </label>
                <div className="balance-payment-methods" role="radiogroup" aria-label="Способ оплаты">
                  <button
                    className={`balance-payment-method ${paymentMethod === "uzcard" ? "is-selected" : ""}`}
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === "uzcard"}
                    onClick={() => setPaymentMethod("uzcard")}
                  >
                    <span className="balance-payment-method__check" aria-hidden="true" />
                    <span className="balance-payment-method__logos">
                      <strong>UZ</strong>
                      <em>HUMO</em>
                    </span>
                    <span>UzCard / Humo</span>
                  </button>
                  <button
                    className={`balance-payment-method ${paymentMethod === "visa" ? "is-selected" : ""}`}
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === "visa"}
                    onClick={() => setPaymentMethod("visa")}
                  >
                    <span className="balance-payment-method__check" aria-hidden="true" />
                    <span className="balance-payment-method__logos balance-payment-method__logos--visa">
                      <strong>VISA</strong>
                      <em>Mastercard</em>
                    </span>
                    <span>Visa / Mastercard</span>
                  </button>
                </div>
                {paymentMethod === "visa" ? (
                  <div className="balance-payment-visa-extra">
                    <label className="balance-payment-dialog__field balance-payment-dialog__field--required">
                      <span>Сумма</span>
                      <input type="text" placeholder="Введите сумму" />
                    </label>
                    <div className="balance-payment-quick">
                      <button type="button">390 000</button>
                      <button type="button">1 000 000</button>
                    </div>
                    <label className="balance-payment-offer">
                      <strong>Публичная оферта</strong>
                      <span>
                        <input type="checkbox" />
                        Я ознакомлен с публичной офертой
                      </span>
                    </label>
                  </div>
                ) : null}
                <button className="balance-payment-submit" type="button" onClick={() => setPaymentStep("card")}>
                  Оплатить
                </button>
              </>
            ) : (
              <div className="balance-card-step">
                <aside className="balance-card-step__side">
                  <div className="balance-card-step__badge">
                    <Icon name="bi-shield-fill-check" size={20} />
                    <span>Безопасная оплата</span>
                  </div>
                  <h2 id="balance-payment-title">Пополнение баланса</h2>
                  <p>Проверьте данные ресторана перед оплатой</p>
                  <dl className="balance-card-step__details">
                    <div>
                      <dt><Icon name="bi-building" size={14} />Филиал</dt>
                      <dd>MARJON RESTAURANT</dd>
                    </div>
                    <div>
                      <dt><Icon name="bi-wallet2" size={14} />Баланс</dt>
                      <dd className="is-positive">0 UZS</dd>
                    </div>
                    <div>
                      <dt><Icon name="bi-person" size={14} />Сотрудник</dt>
                      <dd>Рустам</dd>
                    </div>
                    <div>
                      <dt><Icon name="bi-telephone" size={14} />Телефон</dt>
                      <dd>+998 90 000 00 00</dd>
                    </div>
                  </dl>
                </aside>
                <div className="balance-card-step__form">
                  <div className="balance-card-step__topline">
                    <div className="balance-card-step__progress" aria-label="Шаг 1 из 2">
                      <span className="is-active">1</span>
                      <i />
                      <span>2</span>
                      <strong>Данные карты</strong>
                    </div>
                    <button className="balance-card-back balance-card-back--icon" type="button" aria-label="Закрыть" onClick={() => setPaymentOpen(false)}>
                      <Icon name="bi-x-lg" size={18} />
                    </button>
                  </div>
                  <h3>Введите данные карты</h3>
                  <label className="balance-card-field">
                    <span>Сумма</span>
                    <input type="text" placeholder="Введите сумму" />
                  </label>
                  <div className="balance-card-quick">
                    <button type="button">390 000</button>
                    <button type="button">1 000 000</button>
                  </div>
                  <div className="balance-card-grid">
                    <label className="balance-card-field">
                      <span>Номер карты</span>
                      <input type="text" inputMode="numeric" placeholder="0000 0000 0000 0000" />
                    </label>
                    <label className="balance-card-field">
                      <span>Срок действия</span>
                      <input type="text" inputMode="numeric" placeholder="ММ/ГГ" />
                    </label>
                  </div>
                  <label className="balance-offer">
                    <strong>Публичная оферта</strong>
                    <span>
                      <input type="checkbox" />
                      Я ознакомлен с публичной офертой
                    </span>
                  </label>
                  <button className="balance-payment-submit balance-payment-submit--wide" type="button">
                    Перейти к подтверждению
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

