import { useState, useCallback } from 'react'
import { X, BarChart3, Printer } from 'lucide-react'
import { reports } from '../shared/api'

const TABS = [
  { id: 'sales', label: 'Продажи' },
  { id: 'products', label: 'Блюда' },
  { id: 'staff', label: 'Сотрудники' },
]

const COL_LABELS = {
  name: 'Название', title: 'Название', product: 'Блюдо', staff: 'Сотрудник', cashier: 'Кассир',
  count: 'Кол-во', qty: 'Кол-во', quantity: 'Кол-во', orders: 'Заказы',
  total: 'Сумма', amount: 'Сумма', revenue: 'Выручка', sum: 'Сумма', date: 'Дата',
}

function today() { return new Date().toISOString().slice(0, 10) }
function isNum(v) { return typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)) && /[0-9]/.test(v)) }
function fmtCell(k, v) {
  if (v == null) return '—'
  if (isNum(v) && /total|amount|revenue|sum|price/i.test(k)) return Number(v).toLocaleString('ru-RU')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function ReportsPanel({ branch, onClose }) {
  const [tab, setTab] = useState('sales')
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(false)

  const run = useCallback((which) => {
    const t = which || tab
    setTab(t); setLoading(true); setErr(false); setRows(null)
    reports[t]?.({ date_from: from, date_to: to, branch_id: branch?.id })
      .then((d) => {
        const arr = Array.isArray(d) ? d : d?.items || d?.rows || d?.data || (d && typeof d === 'object' ? [d] : [])
        setRows(arr)
      })
      .catch(() => { setErr(true); setRows([]) })
      .finally(() => setLoading(false))
  }, [tab, from, to, branch?.id])

  const cols = rows && rows.length ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object').slice(0, 6) : []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rep-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2><BarChart3 size={20} /> Отчёты</h2>
          <button className="icon-btn" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="rep-controls">
          <div className="hist-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`filter-chip ${tab === t.id ? 'filter-chip--active' : ''}`} onClick={() => run(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="rep-dates">
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>—</span>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            <button className="btn btn--primary" onClick={() => run()}>Сформировать</button>
          </div>
        </div>

        <div className="modal__body rep-body">
          {loading ? (
            <div className="kitchen-empty"><div className="spinner" /><p>Формируем отчёт...</p></div>
          ) : rows == null ? (
            <p className="settings-hint">Выберите тип отчёта и период, затем нажмите «Сформировать».</p>
          ) : rows.length === 0 ? (
            <p className="settings-hint">{err ? 'Отчёт недоступен (нет связи или данных).' : 'Нет данных за период.'}</p>
          ) : (
            <>
              <div className="rep-table-wrap">
                <table className="hist-table">
                  <thead><tr>{cols.map((c) => <th key={c} className={/total|amount|revenue|sum/i.test(c) ? 'ta-r' : ''}>{COL_LABELS[c] || c}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>{cols.map((c) => <td key={c} className={/total|amount|revenue|sum/i.test(c) ? 'ta-r hist-sum' : ''}>{fmtCell(c, r[c])}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn--outline rep-print" onClick={() => window.print()}><Printer size={18} /> Печать</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
