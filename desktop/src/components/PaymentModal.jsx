import { useState } from 'react'
import { X, Printer, Banknote, CreditCard, CheckCircle } from 'lucide-react'
import { t } from '../shared/i18n'

/**
 * PaymentModal — оплата и закрытие СУЩЕСТВУЮЩЕГО заказа (переданного официантом).
 * Кассир: печатает чек → выбирает способ оплаты → закрывает заказ.
 * Оплату (платёжку) интегрируем позже — сейчас способ фиксируется вручную.
 *
 * props:
 *   order — заказ ({ order_number, table_number, items[], total_amount })
 *   onPrint(order) — печать чека (через сетевой принтер)
 *   onComplete(order, method) — закрыть заказ (status → completed)
 *   onClose()
 */
function fmt(n) { return Number(n || 0).toLocaleString('ru-RU') }

export default function PaymentModal({ order, onPrint, onComplete, onClose }) {
  const [method, setMethod] = useState('cash')
  const [received, setReceived] = useState('')
  const [busy, setBusy] = useState(false)
  const [printed, setPrinted] = useState(false)

  const total = Number(order?.total_amount || 0)
  const items = order?.items || []
  const change = method === 'cash' && received ? Math.max(0, Number(received) - total) : 0

  async function doPrint() {
    setPrinted(true)
    try { await onPrint(order) } finally { setTimeout(() => setPrinted(false), 1600) }
  }
  async function doComplete() {
    if (busy) return
    setBusy(true)
    try { await onComplete(order, method) } finally { setBusy(false) }
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

          <button className={`btn btn--outline pay-order__print ${printed ? 'is-done' : ''}`} onClick={doPrint}>
            {printed ? <CheckCircle size={18} /> : <Printer size={18} />} {t('print_receipt')}
          </button>

          <div className="pay-order__methods">
            <button className={`pay-method-btn ${method === 'cash' ? 'is-active' : ''}`} onClick={() => setMethod('cash')}>
              <Banknote size={26} /><span>{t('cash')}</span>
            </button>
            <button className={`pay-method-btn ${method === 'card' ? 'is-active' : ''}`} onClick={() => setMethod('card')}>
              <CreditCard size={26} /><span>{t('card')}</span>
            </button>
          </div>

          {method === 'cash' && (
            <div className="pay-order__cash">
              <label>{t('cash_received')}</label>
              <input type="number" min="0" className="input" value={received}
                onChange={(e) => setReceived(e.target.value)} placeholder={String(total)} />
              {received !== '' && Number(received) >= total && (
                <div className="pay-order__change"><span>{t('change')}</span><strong>{fmt(change)} {t('currency')}</strong></div>
              )}
            </div>
          )}
        </div>

        <div className="pay-order__actions">
          <button className="btn btn--primary btn--lg" disabled={busy} onClick={doComplete}>
            <CheckCircle size={20} /> {t('complete_order')}
          </button>
        </div>
      </div>
    </div>
  )
}
