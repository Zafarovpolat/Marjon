import { useState } from 'react'
import { X, Users, ListChecks, Printer } from 'lucide-react'
import { t } from '../shared/i18n'
import { toast } from './Toast'

/**
 * SplitReceiptModal — 2.1 раздельный чек.
 * Два режима деления счёта:
 *   • «Поровну»    — сумма заказа делится на N частей (без списка блюд);
 *   • «По позициям» — каждая позиция назначается в часть 1..N, каждая часть
 *                     печатает свои блюда с пропорциональной долей сбора/скидки.
 *
 * props:
 *   order — заказ ({ items[] })
 *   onPrint(payload) — печать: { mode:'even', ways } | { mode:'items', parts }
 *   onClose()
 */
function fmt(n) { return Number(n || 0).toLocaleString('ru-RU') }

export default function SplitReceiptModal({ order, onPrint, onClose }) {
  const items = order?.items || []
  const [mode, setMode] = useState('even')       // even | items
  const [ways, setWays] = useState(2)             // на сколько частей делить поровну
  const [parts, setParts] = useState(2)           // число частей в режиме «по позициям»
  // assign[index] = номер части (1..parts), по умолчанию все в части 1
  const [assign, setAssign] = useState(() => items.map(() => 1))
  const [busy, setBusy] = useState(false)

  const total = Number(order?.total_amount || 0)
  const perWay = ways > 0 ? Math.round(total / ways) : 0

  function setItemPart(idx, part) {
    setAssign((prev) => prev.map((p, i) => (i === idx ? part : p)))
  }
  function changeParts(next) {
    const n = Math.min(6, Math.max(2, next))
    setParts(n)
    // позиции, назначенные в исчезнувшую часть, возвращаем в часть 1
    setAssign((prev) => prev.map((p) => (p > n ? 1 : p)))
  }

  async function submit() {
    if (busy) return
    let payload
    if (mode === 'even') {
      const n = Math.min(12, Math.max(2, Number(ways) || 2))
      payload = { mode: 'even', ways: n }
    } else {
      // группируем позиции по номеру части
      const groups = []
      for (let p = 1; p <= parts; p++) {
        const partItems = items
          .map((it, i) => ({ it, i }))
          .filter(({ i }) => assign[i] === p)
          .map(({ it, i }) => ({ index: i, qty: Number(it.quantity) }))
        if (partItems.length) groups.push(partItems)
      }
      if (groups.length < 2) { toast(t('split_need_two')); return }
      payload = { mode: 'items', parts: groups }
    }
    setBusy(true)
    try { await onPrint(payload); onClose() }
    catch (e) { toast(e?.response?.data?.detail || e.message || t('print_failed'), 'error') }
    finally { setBusy(false) }
  }

  const spin = <span className="btn-spinner" aria-hidden="true" />

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal split-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>{t('split_receipt')}{order?.order_number ? ` #${order.order_number}` : ''}</h3>
          <button className="icon-btn" onClick={onClose}><X size={22} /></button>
        </div>

        <div className="modal__body">
          <div className="split-tabs">
            <button className={`split-tab ${mode === 'even' ? 'is-active' : ''}`} onClick={() => setMode('even')}>
              <Users size={18} /> {t('split_even')}
            </button>
            <button className={`split-tab ${mode === 'items' ? 'is-active' : ''}`} onClick={() => setMode('items')}>
              <ListChecks size={18} /> {t('split_by_items')}
            </button>
          </div>

          {mode === 'even' ? (
            <div className="split-even">
              <label>{t('split_ways')}</label>
              <div className="split-stepper">
                <button className="btn btn--outline" onClick={() => setWays((w) => Math.max(2, w - 1))} disabled={ways <= 2}>−</button>
                <span className="split-stepper__val">{ways}</span>
                <button className="btn btn--outline" onClick={() => setWays((w) => Math.min(12, w + 1))} disabled={ways >= 12}>+</button>
              </div>
              <p className="settings-hint">{t('split_each')}: <strong>{fmt(perWay)} {t('currency')}</strong></p>
            </div>
          ) : (
            <div className="split-items">
              <div className="split-parts-row">
                <label>{t('split_parts')}</label>
                <div className="split-stepper">
                  <button className="btn btn--outline" onClick={() => changeParts(parts - 1)} disabled={parts <= 2}>−</button>
                  <span className="split-stepper__val">{parts}</span>
                  <button className="btn btn--outline" onClick={() => changeParts(parts + 1)} disabled={parts >= 6}>+</button>
                </div>
              </div>
              <div className="split-list">
                {items.length === 0 ? (
                  <p className="settings-hint">{t('order_items')}: —</p>
                ) : items.map((it, idx) => (
                  <div className="split-item" key={it.id ?? idx}>
                    <span className="split-item__name">
                      <b>{Number(it.quantity)}×</b> {it.name}
                    </span>
                    <div className="split-item__parts">
                      {Array.from({ length: parts }, (_, p) => p + 1).map((p) => (
                        <button
                          key={p}
                          className={`split-chip ${assign[idx] === p ? 'is-active' : ''}`}
                          onClick={() => setItemPart(idx, p)}
                        >{p}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pay-order__actions">
          <button className="btn btn--primary btn--lg" disabled={busy} onClick={submit}>
            {busy ? spin : <Printer size={18} />} {t('split_print')}
          </button>
        </div>
      </div>
    </div>
  )
}
