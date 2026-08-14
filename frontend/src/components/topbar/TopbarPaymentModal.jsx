import uzcardLogo from "../../assets/paylogos/uzcard-humo.jpg";
import visaLogo from "../../assets/paylogos/visa-mastercard.jpg";
import Icon from "../Icon";

// Модалка оплаты баланса (OWNER) — сиблинг <header>, position:fixed оверлей.
// Вынесено из Topbar.jsx (FE-07B). Биллинг DEFERRED: сабмит отключён, процессор
// не подключён. Разметка, классы и поведение сохранены 1:1.
export default function TopbarPaymentModal({
  paymentOpen,
  setPaymentOpen,
  paymentStep,
  paymentMethod,
  setPaymentMethod,
  closePayment,
  cardAmount,
  setCardAmount,
  formatAmountInput,
  cardNumber,
  setCardNumber,
  maskCardNumber,
  cardExpiry,
  setCardExpiry,
  maskExpiry,
  offerAccepted,
  setOfferAccepted,
  cardValid,
}) {
  if (!paymentOpen) return null;

  return (
    <div className="balance-payment-modal" role="presentation" onMouseDown={() => setPaymentOpen(false)}>
      <section className={`balance-payment-dialog ${paymentStep === "card" ? "balance-payment-dialog--card" : ""}`} role="dialog" aria-modal="true" aria-labelledby="balance-payment-title" onMouseDown={(event) => event.stopPropagation()}>
        {paymentStep === "method" ? (
          <>
            <div className="balance-payment-dialog__head">
              <div>
                <span>Оплата баланса</span>
                <h2 id="balance-payment-title">Оплата</h2>
              </div>
              <button className="balance-card-back balance-card-back--icon" type="button" aria-label="Закрыть" onClick={closePayment}>
                <Icon name="bi-x-lg" size={18} />
              </button>
            </div>
            <div className="balance-payment-dialog__notice">
              <Icon name="bi-credit-card-2-front" size={20} />
              <span>Платёжный процессор пока не подключён. Пополнение баланса недоступно.</span>
            </div>
            <div className="balance-payment-dialog__field">
              <span>Payment ID</span>
              <strong>Недоступно</strong>
            </div>
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
                  <img src={uzcardLogo} alt="UzCard" />
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
                  <img src={visaLogo} alt="Visa" />
                </span>
                <span>Visa / Mastercard</span>
              </button>
            </div>
            {null}
            <button className="balance-payment-submit" type="button" disabled>
              Оплата недоступна
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
                  <dd>0 UZS</dd>
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
                <button className="balance-card-back balance-card-back--icon" type="button" aria-label="Закрыть" onClick={closePayment}>
                  <Icon name="bi-x-lg" size={18} />
                </button>
              </div>
              <h3>Введите данные карты</h3>
              <label className="balance-card-field">
                <span>Сумма</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Введите сумму"
                  value={cardAmount}
                  onChange={(e) => setCardAmount(formatAmountInput(e.target.value))}
                />
              </label>
              <div className="balance-card-quick">
                <button type="button" onClick={() => setCardAmount("390 000")}>390 000</button>
                <button type="button" onClick={() => setCardAmount("1 000 000")}>1 000 000</button>
              </div>
              <div className="balance-card-grid">
                <label className="balance-card-field">
                  <span>Номер карты</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0000 0000 0000 0000"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(maskCardNumber(e.target.value))}
                  />
                </label>
                <label className="balance-card-field">
                  <span>Срок действия</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="ММ/ГГ"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(maskExpiry(e.target.value))}
                  />
                </label>
              </div>
              <label className="balance-offer balance-offer--check">
                <input type="checkbox" checked={offerAccepted} onChange={(e) => setOfferAccepted(e.target.checked)} />
                <span>Я ознакомлен с <a href="#" onClick={(e) => e.preventDefault()}>публичной офертой</a></span>
              </label>
              <button className="balance-payment-submit balance-payment-submit--wide" type="button" disabled={!cardValid}>
                Перейти к подтверждению
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
