import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, Printer, Banknote, CreditCard, CheckCircle,
  User, Clock, Phone, MapPin, Wallet, Undo2, X,
} from 'lucide-react'
import { t } from '../shared/i18n'
import { formatPhone, extractPhoneDigits, fullPhone } from '../shared/phone'
import { formatQty } from '../shared/qty'
import { sanitizeDecimal, parseNum } from '../shared/numeric'
import { toast } from './Toast'
import WaiterPicker from './WaiterPicker'

/**
 * PaymentScreen — экран оплаты и закрытие заказа (полноэкранный, без оверлея).
 *
 * Способы оплаты: наличные, карта и один собирательный «Другой» — внутри него
 * список способов из веб-админки (Uzum, Yandex, …). Отдельные кнопки под каждый
 * кастомный способ не рисуем: их может быть сколько угодно, а место на
 * терминале конечное.
 *
 * Сумма к получению — ОДНО поле на любой способ. Пустое = ровно к оплате
 * (можно закрывать сразу). Ввели больше — показываем сдачу, меньше — «не хватает»
 * и закрытие блокируется.
 *
 * props:
 *   order — заказ ({ order_number, table_number, items[], total_amount, waiter_id, created_at })
 *   staff — сотрудники (для «кто добавил» и смены официанта стола)
 *   paymentMethods — дополнительные способы оплаты из веб-админки ([{ id, name }])
 *   paidBefore — сколько уже оплачено до повторного закрытия
 *   canDebt — можно ли закрывать в долг
 *   onPrint(order) — печать чека
 *   onComplete(order, method, detail) — подтвердить оплату и закрыть заказ
 *   onApplyDiscount(order, amount) — применить скидку
 *   onSetWaiter(order, waiterId) — сменить ответственного официанта
 *   onRefreshOrder(order) — живой пересчёт заказа
 *   onClose() — назад к залу/заказу
 */
function fmt(n) { return Number(n || 0).toLocaleString('ru-RU') }
function fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '' }

export default function PaymentScreen({
  order, onPrint, onComplete, onCancel, onReassign, onClose, canClose = true, staff = [],
  onSetWaiter, onApplyDiscount, onRefreshOrder,
  paymentMethods = [], paidBefore = 0, canDebt = false,
}) {
  const [method, setMethod] = useState('cash')
  const [busy, setBusy] = useState(false)
  const [act, setAct] = useState('')
  const [printed, setPrinted] = useState(false)
  const [discPct, setDiscPct] = useState('')
  const [debtStep, setDebtStep] = useState('none')
  const [debtorName, setDebtorName] = useState('')
  const [debtorPhone, setDebtorPhone] = useState('')
  const [otherOpen, setOtherOpen] = useState(false)
  // Сумма, которую дал гость. Строкой: пустое поле ≠ 0, это «ровно к оплате».
  const [amount, setAmount] = useState('')

  const total = Number(order?.total_amount || 0)
  const items = (order?.items || []).filter((item) => item.status !== 'cancelled')
  const subtotal = items.reduce((s, it) => s + Number(it.total ?? (Number(it.price) * Number(it.quantity))), 0)
  const waiter = staff.find((s) => String(s.id) === String(order?.waiter_id || '')) || null
  const creatorName = waiter ? (waiter.name || waiter.email) : (order?.waiter_name || '—')

  // Кастомные способы (Uzum, Yandex…).
  const customMethods = (paymentMethods || []).filter((m) => m && m.name)
  const isCustom = method !== 'cash' && method !== 'card' && method !== 'debt'
  const reopening = Number(paidBefore || 0) > 0
  const refundDue = Math.max(0, Number(paidBefore || 0) - total)
  const dueNow = Math.max(0, total - (reopening ? Number(paidBefore || 0) : 0))
  const debtAllowed = canDebt && !reopening

  // ── Введённая сумма ──────────────────────────────────────────────────
  const entered = parseNum(amount)
  // Пустое поле = оплата ровно на остаток (так «Закрыть заказ» работает сразу).
  const paid = entered > 0 ? entered : dueNow
  const change = Math.max(0, paid - dueNow)
  const short = Math.max(0, dueNow - paid)
  // Карта не может «переплатить»: терминал списывает ровно сумму чека.
  const cardOver = method === 'card' && entered > dueNow
  const canComplete = canClose && !busy && short === 0 && !cardOver

  // Живой пересчёт итога
  const refreshTimer = useRef(null)
  useEffect(() => {
    if (!onRefreshOrder || !order?.id) return
    clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => { onRefreshOrder(order) }, 1200)
    return () => clearTimeout(refreshTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.total_amount, order?.discount_amount])

  function pickMethod(next) {
    setOtherOpen(false)
    if (next === method) return
    setMethod(next)
    setAmount('')      // у каждого способа своя принятая сумма
  }

  /**
   * Тап по сумме к оплате подставляет полную сумму в поле «Получено».
   *
   * Работает на любом способе, кроме долга и возвращённого заказа (там поля
   * нет вовсе). Сумма берётся с учётом типа: карта не может «переплатить»,
   * поэтому подставляется ровно остаток к оплате; наличные — тот же остаток
   * как стартовая цифра, которую кассир правит под купюру.
   */
  function fillDue() {
    if (busy || method === 'debt' || reopening || dueNow <= 0) return
    setAmount(String(Number(dueNow.toFixed(2))))
  }

  async function run(name, fn) {
    if (act || busy) return
    setAct(name)
    try { await fn() } finally { setAct('') }
  }

  async function doPrint() {
    await run('print', async () => {
      setPrinted(true)
      try { await onPrint(order) } finally { setTimeout(() => setPrinted(false), 1600) }
    })
  }

  async function applyDiscount() {
    if (!onApplyDiscount) return
    const p = Math.min(100, Math.max(0, Number(discPct) || 0))
    if (!p) return
    const sum = Math.round(subtotal * p / 100)
    await run('discount', async () => {
      try {
        await onApplyDiscount(order, sum)
        setDiscPct('')
      } catch { toast(t('create_order_error')) }
    })
  }

  async function doComplete() {
    if (!canComplete) return
    if (debtAllowed && dueNow > 0 && method === 'debt') {
      setDebtStep('form'); return
    }
    setBusy(true)
    // detail несём только когда кассир реально ввёл сумму. Пустое поле — оплата
    // ровно на итог: backend (buildOrderPayment) сам подставит полную сумму.
    const detail = entered > 0 && (method === 'cash' || method === 'card')
      ? { [method]: entered }
      : undefined
    const payMethod = isCustom ? method : (method === 'card' ? 'card' : 'cash')
    try {
      await onComplete(order, payMethod, detail)
    } finally { setBusy(false) }
  }

  async function doDebtComplete() {
    if (busy) return
    setBusy(true)
    const detail = {
      debt: dueNow,
      client_name: debtorName.trim() || undefined,
      client_phone: fullPhone(debtorPhone) || undefined,
    }
    try { await onComplete(order, 'debt', detail) } finally { setBusy(false) }
  }

  function closeDebt() { setDebtStep('none') }
  const spin = <span className="btn-spinner" aria-hidden="true" />

  // Закрытие в долг — отдельный экран поверх оплаты
  if (debtStep === 'form') {
    return (
      <div className="pay-screen">
        <header className="pay-screen__head">
          <button className="icon-btn" onClick={closeDebt} title={t('back')}><ArrowLeft size={20} /></button>
          <h3>{t('debt_title')}</h3>
          <div style={{ width: 40 }} />
        </header>
        <div className="pay-screen__body pay-screen__body--form">
          <div className="pay-order__cash">
            <div className="pay-order__change"><span>{t('to_pay_label')}</span><strong>{fmt(total)} {t('currency')}</strong></div>
            <div className="pay-order__change pay-order__change--short"><span>{t('debt_left')}</span><strong>{fmt(dueNow)} {t('currency')}</strong></div>
            <div className="login-field" style={{ marginTop: 'var(--spacing-md)' }}>
              <label className="login-field__label">{t('debt_client')}</label>
              <input className="login-field__input" value={debtorName}
                onChange={(e) => setDebtorName(e.target.value)} placeholder={t('debt_client_ph')} />
            </div>
            <div className="login-field">
              <label className="login-field__label">{t('debt_phone')}</label>
              <input className="login-field__input" type="tel" inputMode="tel" value={formatPhone(debtorPhone)}
                onChange={(e) => setDebtorPhone(extractPhoneDigits(e.target.value))} placeholder="+998 __ ___-__-__" />
            </div>
          </div>
        </div>
        <footer className="pay-screen__foot">
          <div className="pay-dialog__actions">
            <button className="btn btn--outline" onClick={closeDebt}>{t('back')}</button>
            <button className="btn btn--primary btn--lg pay-order__close" disabled={busy} onClick={doDebtComplete}>
              {busy ? spin : <CheckCircle size={20} />} {t('debt_close')}
            </button>
          </div>
        </footer>
      </div>
    )
  }

  return (
    <div className="pay-screen">
      <header className="pay-screen__head">
        <button className="icon-btn" onClick={onClose} title={t('back')}><ArrowLeft size={22} /></button>
        <h3>{t('pay_order')} #{order?.order_number ?? ''}{order?.table_number ? ` · ${t('table')} ${order.table_number}` : ''}</h3>
        <div style={{ width: 40 }} />
      </header>

      <div className="pay-screen__body">
        <div className="pay-order__meta">
          <span><User size={15} /> {creatorName}</span>
          {order?.created_at && <span><Clock size={15} /> {fmtTime(order.created_at)}</span>}
          {order?.customer_phone && <span><Phone size={15} /> {formatPhone(order.customer_phone)}</span>}
          {order?.customer_address && <span><MapPin size={15} /> {order.customer_address}</span>}
        </div>

        {/* Счёт */}
        <div className="pay-bill">
          {items.length === 0 ? (
            <p className="settings-hint">{t('order_items')}: —</p>
          ) : items.map((it) => (
            <div className="pay-bill__row" key={it.id}>
              <span className="pay-bill__qty">{formatQty(it.quantity)}×</span>
              <span className="pay-bill__name">
                {it.name}
                {it.takeaway && <span className="pay-order__take">{t('takeaway')}</span>}
                {(it.created_at || it.added_by_name || it.waiter_name) && (
                  <span className="pay-order__added">
                    {it.created_at ? fmtTime(it.created_at) : ''}
                    {(it.added_by_name || it.waiter_name) ? `${it.created_at ? ' · ' : ''}${it.added_by_name || it.waiter_name}` : ''}
                  </span>
                )}
              </span>
              <span className="pay-bill__sum">{fmt(it.total ?? (Number(it.price) * Number(it.quantity)))} {t('currency')}</span>
            </div>
          ))}
        </div>

        {/* Скидка + официант — переехали в нижнюю панель, к сумме полученных
            денег: три органа управления оплатой стоят одной строкой. */}

        {/* Возврат в закрытый заказ */}
        {reopening && (
          <div className="pay-order__reopen">
            <div className="pay-order__change"><span>{t('paid_before')}</span><strong>{fmt(paidBefore)} {t('currency')}</strong></div>
            {refundDue > 0 && (
              <div className="pay-order__change pay-order__change--refund">
                <span><Undo2 size={14} /> {t('refund_to_client')}</span><strong>{fmt(refundDue)} {t('currency')}</strong>
              </div>
            )}
            {dueNow > 0 && (
              <div className="pay-order__change pay-order__change--short">
                <span>{t('not_enough')}</span><strong>{fmt(dueNow)} {t('currency')}</strong>
              </div>
            )}
          </div>
        )}

        {/* Способы оплаты: наличные / карта / «Другой» (список из админки) */}
        <div className="pay-order__methods">
          <button className={`pay-method-btn ${method === 'cash' ? 'is-active' : ''}`} onClick={() => pickMethod('cash')}>
            <Banknote size={22} /><span>{t('cash')}</span>
          </button>
          <button className={`pay-method-btn ${method === 'card' ? 'is-active' : ''}`} onClick={() => pickMethod('card')}>
            <CreditCard size={22} /><span>{t('card')}</span>
          </button>
          {customMethods.length > 0 && (
            <button
              className={`pay-method-btn ${isCustom ? 'is-active' : ''}`}
              onClick={() => setOtherOpen(true)}
            >
              <Wallet size={22} /><span>{isCustom ? method : t('other_method')}</span>
            </button>
          )}
          {debtAllowed && (
            <button className={`pay-method-btn ${method === 'debt' ? 'is-active' : ''}`} onClick={() => pickMethod('debt')}>
              <Wallet size={22} /><span>{t('debt')}</span>
            </button>
          )}
        </div>

        {/* Сумма к получению переехала в нижнюю панель — рядом со скидкой и
            сменой официанта. В возвращённом заказе поля нет: там либо возврат
            клиенту, либо доплата за добавленные блюда, а платёж всё равно
            пишется на полный новый итог (прежние платежи уходят в refunded). */}

        {Number(order?.discount_amount) > 0 && (
          <div className="pay-order__change pay-order__change--discount">
            <span>{t('discount_word')}</span><strong>−{fmt(order.discount_amount)} {t('currency')}</strong>
          </div>
        )}
      </div>

      <footer className="pay-screen__foot">
        <button
          type="button"
          className="pay-total-static pay-total-static--tap"
          onClick={fillDue}
          title={t('to_pay_label')}
        >
          <span>{t('to_pay_label')}</span>
          <strong>{fmt(total)} {t('currency')}</strong>
        </button>

        {/* Одна строка управления оплатой: скидка · смена официанта ·
            полученная сумма (+ смена стола, если заказ за столом). Раньше
            каждое поле шло отдельным блоком и вытесняло друг друга. */}
        <div className="pay-screen__controls">
          {onApplyDiscount && (
            <div className="pay-screen__control">
              <label className="pay-dialog__disc">
                <span className="pay-dialog__disc-label">{t('discount_word')}</span>
                <div className="pay-dialog__disc-row">
                  <input
                    type="text" inputMode="numeric" data-keyboard="num"
                    className="pay-dialog__disc-input"
                    value={discPct} disabled={act === 'discount'} placeholder="0"
                    onChange={(e) => setDiscPct(sanitizeDecimal(e.target.value, 0).slice(0, 3))}
                  />
                  <span className="pay-dialog__disc-unit">%</span>
                  <button
                    type="button" className="btn btn--sm"
                    disabled={act === 'discount' || !discPct}
                    onClick={applyDiscount}
                  >
                    {act === 'discount' ? spin : t('apply')}
                  </button>
                </div>
              </label>
            </div>
          )}

          {onSetWaiter && staff.length > 0 && (
            <div className="pay-screen__control">
              <WaiterPicker
                value={order?.waiter_id || ''}
                staff={staff}
                label={t('change_waiter')}
                disabled={act === 'waiter'}
                onChange={(waiterId) => run('waiter', () => onSetWaiter(order, waiterId || null))}
              />
              {act === 'waiter' && spin}
            </div>
          )}

          {method !== 'debt' && !reopening && (
            <div className="pay-screen__control">
              <div className="pay-amount pay-amount--inline">
                <label className="pay-dialog__disc pay-amount__field" htmlFor="pay-amount-input">
                  <span className="pay-dialog__disc-label">
                    {method === 'card' ? t('card_amount') : t('cash_received')}
                  </span>
                  <div className="pay-dialog__disc-row">
                    <input
                      id="pay-amount-input"
                      type="text" inputMode="decimal" data-keyboard="num"
                      className="pay-dialog__disc-input pay-amount__input"
                      value={amount}
                      disabled={busy}
                      placeholder={String(Math.round(dueNow))}
                      onClick={fillDue}
                      onChange={(e) => setAmount(sanitizeDecimal(e.target.value, 2))}
                    />
                    <span className="pay-dialog__disc-unit">{t('currency')}</span>
                  </div>
                </label>
                {(change > 0 || short > 0 || cardOver) && (
                  <div className="pay-amount__hint">
                    {change > 0 && <span className="pay-amount__hint--change">{t('change')}: {fmt(change)} {t('currency')}</span>}
                    {short > 0 && <span className="pay-amount__hint--short">{t('not_enough')}: {fmt(short)} {t('currency')}</span>}
                    {cardOver && <span className="pay-amount__hint--short">{t('payment_card_over_total')}</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {onReassign && order?.table_number && (
            <div className="pay-screen__control pay-screen__control--narrow">
              <button className="btn btn--outline pay-screen__reassign" onClick={() => onReassign(order)}>
                {t('move_table')}
              </button>
            </div>
          )}
        </div>

        {/* Три главных действия — одной строкой: печать · закрыть · отменить */}
        <div className="pay-screen__actions">
          <button className={`btn btn--outline btn--eq ${printed ? 'is-done' : ''}`} disabled={act === 'print'} onClick={doPrint}>
            {act === 'print' ? spin : printed ? <CheckCircle size={18} /> : <Printer size={18} />} {t('print_receipt')}
          </button>
          <button className="btn btn--primary btn--lg pay-order__close btn--eq" disabled={!canComplete} onClick={doComplete}>
            {busy ? spin : <CheckCircle size={20} />} {t('complete_order')}
          </button>
          {onCancel && (
            <button className="btn btn--outline pay-order__cancel btn--eq" onClick={() => onCancel(order)}>
              {t('cancel_order')}
            </button>
          )}
        </div>
      </footer>

      {/* Выбор «другого» способа оплаты (Uzum, Yandex, …) */}
      {otherOpen && (
        <div className="pay-other" onClick={() => setOtherOpen(false)}>
          <div className="pay-other__panel" onClick={(e) => e.stopPropagation()}>
            <div className="pay-other__head">
              <span>{t('other_method')}</span>
              <button className="icon-btn" onClick={() => setOtherOpen(false)}><X size={20} /></button>
            </div>
            <div className="pay-other__list">
              {customMethods.map((m) => (
                <button
                  key={m.id ?? m.name}
                  className={`pay-other__item ${method === m.name ? 'is-active' : ''}`}
                  onClick={() => pickMethod(m.name)}
                >
                  <Wallet size={18} /><span>{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
