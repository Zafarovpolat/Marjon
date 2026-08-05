import { useState, useCallback, useEffect } from 'react'
import { X, BarChart3, Printer } from 'lucide-react'
import { reports, printers as printersApi } from '../shared/api'
import { t } from '../shared/i18n'
import CalendarField from './CalendarField'
import { toast } from './Toast'

// Ключ колонки с сервера → ключ словаря
const COL_KEY = {
  name: 'col_name', title: 'col_name', product: 'col_product', staff: 'col_staff', cashier: 'col_cashier',
  count: 'col_count', qty: 'col_count', quantity: 'col_count', dishes_count: 'col_count', orders: 'col_orders', orders_count: 'col_orders',
  total: 'col_sum', amount: 'col_sum', sum: 'col_sum', orders_total: 'col_sum', revenue: 'col_revenue', date: 'col_date',
  service_fee: 'col_service', waiter_share: 'col_share', price: 'col_price', unit: 'col_unit', profit: 'col_profit',
  // Продажи (список заказов)
  order_number: 'col_order_no', created_at: 'col_created', status: 'col_status', table_number: 'col_table',
  waiter_name: 'col_waiter', items_count: 'col_items', total_amt: 'col_sum', total_amount: 'col_sum',
  discount_amount: 'col_discount', payment_method: 'col_pay_method', order_type: 'col_type', avg_check: 'col_avg',
}
function colLabel(c) { return COL_KEY[c] ? t(COL_KEY[c]) : c }

function today() { return new Date().toISOString().slice(0, 10) }
function isNum(v) { return typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)) && /[0-9]/.test(v)) }
function fmtCell(k, v) {
  if (v == null || v === '') return '—'
  if (k === 'status') return t.status(String(v))
  if (k === 'order_type') return t.type(String(v))
  // Даты вида 2026-08-05T17:41:00 → 05.08 17:41
  if (/_at$|^date/.test(k) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v)
    if (!isNaN(d)) {
      const dm = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
      return v.includes('T') || v.includes(' ') ? `${dm} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : dm
    }
  }
  if (isNum(v) && /total|amount|revenue|sum|price|fee|share|profit|cost/i.test(k)) return Number(v).toLocaleString('ru-RU')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function ReportsPanel({ branch, onClose }) {
  const TABS = [
    { id: 'sales', label: t('rep_sales') },
    { id: 'products', label: t('rep_products') },
    { id: 'staff', label: t('rep_staff') },
  ]
  const [tab, setTab] = useState('sales')
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(false)

  // Чековый принтер филиала — тот же поиск, что у кассира (для общего чека)
  const [receiptPrinter, setReceiptPrinter] = useState(null)
  useEffect(() => {
    printersApi.list()
      .then((list) => setReceiptPrinter((Array.isArray(list) ? list : []).find((p) => p.printer_type === 'receipt' && p.branch_id === branch?.id) || null))
      .catch(() => setReceiptPrinter(null))
  }, [branch?.id])

  const run = useCallback((which) => {
    const active = which || tab
    setTab(active); setLoading(true); setErr(false); setRows(null)
    reports[active]?.({ date_from: from, date_to: to, branch_id: branch?.id })
      .then((d) => {
        const arr = Array.isArray(d) ? d : d?.items || d?.rows || d?.data || (d && typeof d === 'object' ? [d] : [])
        setRows(arr)
      })
      .catch((e) => {
        // Ошибка видна всегда: и в таблице, и тостом с причиной
        setErr(true); setRows([])
        const detail = e?.response?.data?.detail || e?.message
        toast(detail ? `${t('rep_error')}: ${detail}` : t('rep_error'))
      })
      .finally(() => setLoading(false))
  }, [tab, from, to, branch?.id])

  const cols = rows && rows.length
    ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object' && !/_id$|^id$/i.test(k)).slice(0, 8)
    : []

  function fmtDate(isoStr) {
    if (!isoStr) return ''
    const [y, m, d] = isoStr.split('-')
    return `${d}.${m}.${y}`
  }

  // Общий чек: текущая таблица отчёта → строки → чековый принтер
  async function printSummary() {
    if (!rows?.length) return
    if (!receiptPrinter) { toast(t('no_receipt_printer')); return }
    const nameCol = cols.find((c) => /name|title/i.test(c)) || cols[0]
    const sumCol = cols.find((c) => /total|amount|revenue|sum/i.test(c))
    const lines = rows.map((r) => {
      const name = String(r[nameCol] ?? '—')
      return sumCol ? `${name} — ${Number(r[sumCol] || 0).toLocaleString('ru-RU')}` : name
    })
    const footer = sumCol
      ? `${t('total')}: ${rows.reduce((s, r) => s + (Number(r[sumCol]) || 0), 0).toLocaleString('ru-RU')} ${t('currency')}`
      : `${t('total')}: ${rows.length}`
    const label = TABS.find((x) => x.id === tab)?.label || t('reports')
    try {
      await printersApi.printSummary({
        printer_id: receiptPrinter.id,
        title: label,
        lines: [`${fmtDate(from)} — ${fmtDate(to)}`, ...lines],
        footer,
        copies: 1,
      })
      toast(t('receipt_sent'), 'ok')
    } catch (e) { toast(t('print_failed') + (e?.response?.data?.detail ? `: ${e.response.data.detail}` : '')) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rep-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2><BarChart3 size={20} /> {t('reports')}</h2>
          <button className="icon-btn" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="rep-controls">
          <div className="hist-tabs">
            {TABS.map((tb) => (
              <button key={tb.id} className={`filter-chip ${tab === tb.id ? 'filter-chip--active' : ''}`} onClick={() => run(tb.id)}>{tb.label}</button>
            ))}
          </div>
          <div className="rep-dates">
            <CalendarField value={from} onChange={setFrom} />
            <span>—</span>
            <CalendarField value={to} onChange={setTo} />
            <button className="btn btn--primary" onClick={() => run()}>{t('generate')}</button>
          </div>
        </div>

        <div className="modal__body rep-body">
          {loading ? (
            <div className="kitchen-empty"><div className="spinner" /><p>{t('generating')}</p></div>
          ) : rows == null ? (
            <p className="settings-hint">{t('rep_hint')}</p>
          ) : rows.length === 0 ? (
            <p className="settings-hint">{err ? t('rep_unavailable') : t('rep_no_data')}</p>
          ) : (
            <>
              <div className="rep-table-wrap">
                <table className="hist-table">
                  <thead><tr>{cols.map((c) => <th key={c} className={/total|amount|revenue|sum|fee|share|price|profit|cost/i.test(c) ? 'ta-r' : ''}>{colLabel(c)}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>{cols.map((c) => <td key={c} className={/total|amount|revenue|sum|fee|share|price|profit|cost/i.test(c) ? 'ta-r hist-sum' : ''}>{fmtCell(c, r[c])}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn--outline rep-print" onClick={printSummary}><Printer size={18} /> {t('print_summary')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
