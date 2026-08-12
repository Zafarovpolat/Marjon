import { useState } from 'react'
import { X, Printer, Banknote, CreditCard, CheckCircle, Percent, User, Clock, Plus } from 'lucide-react'
import { t } from '../shared/i18n'
import { toast } from './Toast'

/**
 * PaymentModal — оплата и закрытие СУЩЕСТВУЮЩЕГО заказа (переданного официантом).
 * Кассир: печатает чек → при необходимости даёт скидку → выбирает способ оплаты → закрывает заказ.
 * Оплату (платёжку) интегрируем позже — сейчас способ фиксируется вручную.
 *
 * props:
 *   order — заказ ({ order_number, table_number, items[], total_amount, waiter_id, created_at })
 *   staff — сотрудники (для «кто добавил» и смены официанта)
 *   onPrint(order) — печать чека (через сетевой принтер)
 *   onComplete(order, method) — закрыть заказ (status → completed)
 *   onApplyDiscount(order, amount) — применить скидку к заказу (PATCH /orders)
 *   onAddItems(order) — дозаказ: открыть меню и добавить блюда в этот заказ
 *   onClose()
 */
function fmt(n) { return Number(n || 0).toLocaleString('ru-RU') }
function fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '' }

export default function PaymentModal({ order, onPrint, onComplete, onCancel, onReassign, onClose, canClose = true, staff = [], onSetWaiter, onApplyDiscount, onAddItems }) {
  const [method, setMethod] = useState('cash')
  const [received, setReceived] = useState('')
  const [cashPart, setCashPart] = useState('')   // при смешанной оплате
  const [cardPart, setCardPart] = useState('')
  const [busy, setBusy] = useState(false)
  const [act, setAct] = useState('')             // какое действие выполняется (для лоадера кнопки)
  const [printed, setPrinted] = useState(false)
  const [discPct, setDiscPct] = useState('')

  const total = Number(order?.total_amount || 0)
  const items = order?.items || []
  const subtotal = items.reduce((s, it) => s + Number(it.total ?? (Number(it.price) * Number(it.quantity))), 0)
  const waiter = staff.find((s) => String(s.id) === String(order?.waiter_id || '')) || null
  const creatorName = waiter ? (waiter.name || waiter.email) : (order?.waiter_name || '—')
  const receivedNum = Number(received) || 0
  const change = method === 'cash' && received ? Math.max(0, receivedNum - total) : 0
  const cashShort = method === 'cash' && received !== '' ? Math.max(0, total - receivedNum) : 0
  const mixedSum = (Number(cashPart) || 0) + (Number(cardPart) || 0)
  const mixedLeft = Math.max(0, total - mixedSum)
  // Наличные: нужно получить всю сумму (недостающее показываем как «не хватает» и не закрываем)
  const canComplete = method === 'mixed'
    ? mixedSum >= total
    : method === 'cash' ? received !== '' && receivedNum >= total : true

  // Любое серверное действие — с лоадером внутри кнопки
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
  // Скидка применяется к самому заказу (сервер пересчитает итог). 0 — снять скидку.
  async function applyDiscount(pct) {
    if (!onApplyDiscount) return
    const amount = Math.round(subtotal * pct / 100)
    await run('discount', async () => {
      try { await onApplyDiscount(order, amount) } catch { toast(t('create_order_error')) }
    })
  }
  async function doComplete() {
    if (busy || !canComplete) return
    setBusy(true)
    const detail = method === 'mixed' ? { cash: Number(cashPart) || 0, card: Number(cardPart) || 0 } : undefined
    try { await onComplete(order, method, detail) } finally { setBusy(false) }
  }
  const spin = <span className="btn-spinner" aria-hidden="true" />

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal pay-order-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>{t('pay_order')} #{order?.order_number ?? ''}{order?.table_number ? ` · ${t('table')} ${order.table_number}` : ''}</h3>
          <button className="icon-btn" onClick={onClose}><X size={22} /></button>
        </div>

        <div className="modal__body">
          {/* Кто и когда добавил заказ */}
          <div className="pay-order__meta">
            <span><User size={15} /> {creatorName}</span>
            {order?.created_at && <span><Clock size={15} /> {fmtTime(order.created_at)}</span>}
          </div>

          <div className="pay-order__items">
            {items.length === 0 ? (
              <p className="settings-hint">{t('order_items')}: —</p>
            ) : items.map((it) => (
              <div className="pay-order__row" key={it.id}>
                <span className="pay-order__qty">{Number(it.quantity)}×</span>
                <span className="pay-order__name">
                  {it.name}
                  {it.takeaway && <span className="pay-order__take">{t('takeaway')}</span>}
                  {(it.created_at || it.added_by_name || it.waiter_name) && (
                    <span className="pay-order__added">
                      {it.created_at ? fmtTime(it.created_at) : ''}
                      {(it.added_by_name || it.waiter_name) ? `${it.created_at ? ' · ' : ''}${it.added_by_name || it.waiter_name}` : ''}
                    </span>
                  )}
                </span>
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
              <label><Percent size={14} /> {t('discount_word')}</label>
              <input type="number" min="0" max="100" className="input" value={discPct} disabled={act === 'discount'}
                onChange={(e) => setDiscPct(e.target.value)} placeholder="0"
                onBlur={() => { const p = Math.min(100, Math.max(0, Number(discPct) || 0)); setDiscPct(p ? String(p) : ''); applyDiscount(p) }} />
              {act === 'discount' && spin}
            </div>
          )}

          {onSetWaiter && staff.length > 0 && (
            <div className="pay-order__mixrow">
              <label>{t('change_waiter')}</label>
              <select className="input" value={order?.waiter_id || ''} disabled={act === 'waiter'}
                onChange={(e) => run('waiter', () => onSetWaiter(order, e.target.value || null))}>
                <option value="">—</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name || s.email}</option>)}
              </select>
              {act === 'waiter' && spin}
            </div>
          )}

          <button className={`btn btn--outline pay-order__print ${printed ? 'is-done' : ''}`} disabled={act === 'print'} onClick={doPrint}>
            {act === 'print' ? spin : printed ? <CheckCircle size={18} /> : <Printer size={18} />} {t('print_receipt')}
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
          {onAddItems && (
            <button className="btn btn--outline" onClick={() => onAddItems(order)}>
              <Plus size={18} /> {t('add_dishes')}
            </button>
          )}
          {onReassign && order?.table_number && (
            <button className="btn btn--outline" onClick={() => onReassign(order)}>
              {t('move_table')}
            </button>
          )}
          {onCancel && (
            <button className="btn btn--outline pay-order__cancel" onClick={() => onCancel(order)}>
              {t('cancel_order')}
            </button>
          )}
          <button className="btn btn--primary btn--lg pay-order__close" disabled={busy || !canComplete || !canClose} onClick={doComplete}>
            {busy ? spin : <CheckCircle size={20} />} {t('complete_order')}
          </button>
        </div>
      </div>
    </div>
  )
}
