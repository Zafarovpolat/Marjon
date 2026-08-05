import { useState } from 'react'
import { X, Printer, Banknote, CreditCard, CheckCircle, Percent, ChefHat } from 'lucide-react'
import { t } from '../shared/i18n'
import { toast } from './Toast'

/**
 * PaymentModal — оплата и закрытие СУЩЕСТВУЮЩЕГО заказа (переданного официантом).
 * Кассир: печатает чек → при необходимости даёт скидку → выбирает способ оплаты → закрывает заказ.
 * Оплату (платёжку) интегрируем позже — сейчас способ фиксируется вручную.
 *
 * props:
 *   order — заказ ({ order_number, table_number, items[], total_amount })
 *   onPrint(order) — печать чека (через сетевой принтер)
 *   onComplete(order, method) — закрыть заказ (status → completed)
 *   onApplyDiscount(order, amount) — применить скидку к заказу (PATCH /orders)
 *   onClose()
 */
function fmt(n) { return Number(n || 0).toLocaleString('ru-RU') }

export default function PaymentModal({ order, onPrint, onComplete, onCancel, onReassign, onClose, canClose = true, staff = [], onSetWaiter, onApplyDiscount, onMarkReady }) {
  const [method, setMethod] = useState('cash')
  const [received, setReceived] = useState('')
  const [cashPart, setCashPart] = useState('')   // при смешанной оплате
  const [cardPart, setCardPart] = useState('')
  const [busy, setBusy] = useState(false)
  const [printed, setPrinted] = useState(false)
  const [discPct, setDiscPct] = useState('')

  const total = Number(order?.total_amount || 0)
  const items = order?.items || []
  // «Готово» вручную доступно пока заказ в работе (new/accepted/cooking)
  const canMarkReady = !!onMarkReady && ['new', 'accepted', 'cooking'].includes(order?.status)
  const subtotal = items.reduce((s, it) => s + Number(it.total ?? (Number(it.price) * Number(it.quantity))), 0)
  const receivedNum = Number(received) || 0
  const change = method === 'cash' && received ? Math.max(0, receivedNum - total) : 0
  const cashShort = method === 'cash' && received !== '' ? Math.max(0, total - receivedNum) : 0
  const mixedSum = (Number(cashPart) || 0) + (Number(cardPart) || 0)
  const mixedLeft = Math.max(0, total - mixedSum)
  // Наличные: нужно получить всю сумму (недостающее показываем как «не хватает» и не закрываем)
  const canComplete = method === 'mixed'
    ? mixedSum >= total
    : method === 'cash' ? received !== '' && receivedNum >= total : true

  async function doPrint() {
    setPrinted(true)
    try { await onPrint(order) } finally { setTimeout(() => setPrinted(false), 1600) }
  }
  // Скидка применяется к самому заказу (сервер пересчитает итог) — на этом экране
  // просто показываем текущую применённую скидку и % поле.
  async function applyDiscount(pct) {
    if (!onApplyDiscount) return
    const amount = Math.round(subtotal * pct / 100)
    try { await onApplyDiscount(order, amount) } catch { toast(t('create_order_error')) }
  }
  async function doComplete() {
    if (busy || !canComplete) return
    setBusy(true)
    const detail = method === 'mixed' ? { cash: Number(cashPart) || 0, card: Number(cardPart) || 0 } : undefined
    try { await onComplete(order, method, detail) } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal pay-order-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>{t('pay_order')} #{order?.order_number ?? ''}{order?.table_number ? ` · ${t('table')} ${order.table_number}` : ''}</h3>
          <button className="icon-btn" onClick={onClose}><X size={22} /></button>
        </div>

        <div className="modal__body">
          <div className="pay-order__items">
            {items.length === 0 ? (
              <p className="settings-hint">{t('order_items')}: —</p>
            ) : items.map((it) => (
              <div className="pay-order__row" key={it.id}>
                <span className="pay-order__qty">{Number(it.quantity)}×</span>
                <span className="pay-order__name">{it.name}</span>
                <span className="pay-order__sum">{fmt(it.total ?? (Number(it.price) * Number(it.quantity)))} {t('currency')}</span>
              </div>
            ))}
          </div>

          <div className="pay-order__total">
            <span>{t('to_pay_label')}</span>
            <strong>{fmt(total)} {t('currency')}</strong>
          </div>

          {Number(order?.discount_amount) > 0 && (
            <div className="pay-order__change pay-order__change--discount">
              <span>{t('discount_word')}</span>
              <strong>−{fmt(order.discount_amount)} {t('currency')}</strong>
            </div>
          )}

          {onApplyDiscount && (
            <div className="pay-order__mixrow pay-order__discount">
              <label><Percent size={14} /> {t('discount')}</label>
              <input type="number" min="0" max="100" className="input" value={discPct}
                onChange={(e) => setDiscPct(e.target.value)} placeholder="0"
                onBlur={() => { const p = Math.min(100, Math.max(0, Number(discPct) || 0)); if (p > 0) applyDiscount(p) }} />
            </div>
          )}

          {onSetWaiter && staff.length > 0 && (
            <div className="pay-order__mixrow" style={{ marginBottom: 12 }}>
              <label>{t('change_waiter')}</label>
              <select className="input" value={order?.waiter_id || ''} onChange={(e) => onSetWaiter(order, e.target.value || null)}>
                <option value="">—</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name || s.email}</option>)}
              </select>
            </div>
          )}

          <button className={`btn btn--outline pay-order__print ${printed ? 'is-done' : ''}`} onClick={doPrint}>
            {printed ? <CheckCircle size={18} /> : <Printer size={18} />} {t('print_receipt')}
          </button>

          <div className="pay-order__methods pay-order__methods--3">
            <button className={`pay-method-btn ${method === 'cash' ? 'is-active' : ''}`} onClick={() => setMethod('cash')}>
              <Banknote size={26} /><span>{t('cash')}</span>
            </button>
            <button className={`pay-method-btn ${method === 'card' ? 'is-active' : ''}`} onClick={() => setMethod('card')}>
              <CreditCard size={26} /><span>{t('card')}</span>
            </button>
            <button className={`pay-method-btn ${method === 'mixed' ? 'is-active' : ''}`} onClick={() => setMethod('mixed')}>
              <span className="pay-method-btn__mix"><Banknote size={20} /><CreditCard size={20} /></span><span>{t('mixed')}</span>
            </button>
          </div>

          {method === 'cash' && (
            <div className="pay-order__cash">
              <label>{t('cash_received')}</label>
              <input type="number" min="0" className="input" value={received}
                onChange={(e) => setReceived(e.target.value)} placeholder={String(total)} />
              {received !== '' && receivedNum >= total && (
                <div className="pay-order__change"><span>{t('change')}</span><strong>{fmt(change)} {t('currency')}</strong></div>
              )}
              {cashShort > 0 && (
                <div className="pay-order__change pay-order__change--short"><span>{t('not_enough')}</span><strong>{fmt(cashShort)} {t('currency')}</strong></div>
              )}
            </div>
          )}

          {method === 'mixed' && (
            <div className="pay-order__cash">
              <div className="pay-order__mixrow">
                <label>{t('cash')}</label>
                <input type="number" min="0" className="input" value={cashPart}
                  onChange={(e) => setCashPart(e.target.value)} placeholder="0" />
              </div>
              <div className="pay-order__mixrow">
                <label>{t('card')}</label>
                <input type="number" min="0" className="input" value={cardPart}
                  onChange={(e) => setCardPart(e.target.value)} placeholder="0" />
              </div>
              <div className="pay-order__change">
                <span>{mixedLeft > 0 ? t('to_pay_label') : t('change')}</span>
                <strong>{fmt(mixedLeft > 0 ? mixedLeft : mixedSum - total)} {t('currency')}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="pay-order__actions">
          {canMarkReady && (
            <button className="btn btn--success" disabled={busy} onClick={() => onMarkReady(order)}>
              <ChefHat size={18} /> {t('mark_ready')}
            </button>
          )}
          {onReassign && order?.table_number && (
            <button className="btn btn--outline" disabled={busy} onClick={() => onReassign(order)}>
              {t('move_table')}
            </button>
          )}
          {onCancel && (
            <button className="btn btn--outline pay-order__cancel" disabled={busy} onClick={() => onCancel(order)}>
              {t('cancel_order')}
            </button>
          )}
          <button className="btn btn--primary btn--lg" disabled={busy || !canComplete || !canClose} onClick={doComplete}>
            <CheckCircle size={20} /> {t('complete_order')}
          </button>
        </div>
      </div>
    </div>
  )
}
