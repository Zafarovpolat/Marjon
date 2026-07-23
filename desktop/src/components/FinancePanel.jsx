import { useState, useEffect, useCallback } from 'react'
import { X, Wallet, TrendingUp, TrendingDown, Play, Square } from 'lucide-react'
import { shifts as shiftsApi, finance } from '../shared/api'

function fmt(n) { return Number(n || 0).toLocaleString('ru-RU') }
function fmtDt(iso) { return iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '' }

export default function FinancePanel({ branch, onClose }) {
  const [shift, setShift] = useState(null)
  const [txs, setTxs] = useState([])
  const [amount, setAmount] = useState('')
  const [comment, setComment] = useState('')
  const [cash, setCash] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    shiftsApi.current(branch?.id).then((d) => setShift(d && d.id ? d : null)).catch(() => setShift(null))
    finance.incomeExpense({ size: 30 }).then((d) => setTxs(Array.isArray(d) ? d : d?.items || [])).catch(() => setTxs([]))
  }, [branch?.id])
  useEffect(load, [load])

  async function openShift() {
    setBusy(true)
    try { await shiftsApi.open(branch?.id, Number(cash) || 0); setCash(''); load() }
    catch (e) { alert(e.response?.data?.detail || 'Не удалось открыть смену') }
    finally { setBusy(false) }
  }
  async function closeShift() {
    setBusy(true)
    try { await shiftsApi.close(Number(cash) || 0); setCash(''); load() }
    catch (e) { alert(e.response?.data?.detail || 'Не удалось закрыть смену') }
    finally { setBusy(false) }
  }
  async function add(kind) {
    const amt = Number(amount)
    if (!amt || amt <= 0) return
    setBusy(true)
    try {
      await (kind === 'income' ? finance.addIncome : finance.addExpense)({ amount: amt, comment: comment || null })
      setAmount(''); setComment(''); load()
    } catch (e) { alert(e.response?.data?.detail || 'Ошибка операции') }
    finally { setBusy(false) }
  }

  const isOpen = shift && shift.status === 'open'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2><Wallet size={20} /> Касса — смена и операции</h2>
          <button className="icon-btn" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="modal__body">
          {/* Смена */}
          <section className="settings-section">
            <h3>Смена</h3>
            {isOpen ? (
              <>
                <div className="settings-row"><span>Статус</span><span className="fin-badge fin-badge--open">Открыта</span></div>
                <div className="settings-row"><span>Открыта</span><span>{fmtDt(shift.opened_at)}</span></div>
                <div className="settings-row"><span>Касса на начало</span><span>{fmt(shift.opening_cash)} сум</span></div>
                <div className="settings-row settings-row--col">
                  <label>Наличные на конец, сум</label>
                  <div className="settings-input-group">
                    <input type="number" min="0" value={cash} onChange={(e) => setCash(e.target.value)} className="input" placeholder="0" />
                    <button className="btn btn--danger" disabled={busy} onClick={closeShift}><Square size={18} /> Закрыть смену</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="settings-row settings-row--col">
                <label>Наличные на начало смены, сум</label>
                <div className="settings-input-group">
                  <input type="number" min="0" value={cash} onChange={(e) => setCash(e.target.value)} className="input" placeholder="0" />
                  <button className="btn btn--primary" disabled={busy} onClick={openShift}><Play size={18} /> Открыть смену</button>
                </div>
              </div>
            )}
          </section>

          {/* Приход / расход */}
          <section className="settings-section">
            <h3>Приход / расход</h3>
            <div className="fin-form">
              <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" placeholder="Сумма, сум" />
              <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} className="input" placeholder="Комментарий" />
            </div>
            <div className="fin-actions">
              <button className="btn fin-btn fin-btn--in" disabled={busy} onClick={() => add('income')}><TrendingUp size={18} /> Приход</button>
              <button className="btn fin-btn fin-btn--out" disabled={busy} onClick={() => add('expense')}><TrendingDown size={18} /> Расход</button>
            </div>
          </section>

          {/* История операций */}
          <section className="settings-section">
            <h3>Последние операции</h3>
            {txs.length === 0 ? (
              <p className="settings-hint">Операций пока нет.</p>
            ) : (
              <div className="fin-list">
                {txs.map((t) => (
                  <div className="fin-row" key={t.id}>
                    <span className={`fin-row__dir fin-row__dir--${t.direction}`}>
                      {t.direction === 'income' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    </span>
                    <div className="fin-row__info">
                      <span className="fin-row__cat">{t.comment || t.category_name || (t.direction === 'income' ? 'Приход' : 'Расход')}</span>
                      <span className="fin-row__date">{fmtDt(t.date)}</span>
                    </div>
                    <span className={`fin-row__amt fin-row__amt--${t.direction}`}>
                      {t.direction === 'income' ? '+' : '−'}{fmt(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
