import { useState, useEffect, useCallback } from 'react'
import { X, History } from 'lucide-react'
import { orders } from '../shared/api'

const STATUS = {
  new: 'Новый', accepted: 'Принят', cooking: 'Готовится', ready: 'Готов',
  completed: 'Закрыт', cancelled: 'Отменён', pending: 'Новый',
}
const TYPES = [
  { id: 'all', label: 'Все' },
  { id: 'dine_in', label: 'В зале' },
  { id: 'takeaway', label: 'С собой' },
  { id: 'delivery', label: 'Доставка' },
]
const TYPE_LABEL = { dine_in: 'В зале', takeaway: 'С собой', delivery: 'Доставка', qr: 'QR' }

function fmtDt(iso) { return iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '' }

export default function HistoryPanel({ branch, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('all')

  const load = useCallback(() => {
    setLoading(true)
    orders.list({ branch_id: branch?.id })
      .then((d) => setRows(Array.isArray(d) ? d : d?.items || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [branch?.id])
  useEffect(load, [load])

  const shown = type === 'all' ? rows : rows.filter((o) => o.order_type === type)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal hist-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2><History size={20} /> История заказов</h2>
          <button className="icon-btn" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="hist-tabs">
          {TYPES.map((t) => (
            <button key={t.id} className={`filter-chip ${type === t.id ? 'filter-chip--active' : ''}`} onClick={() => setType(t.id)}>{t.label}</button>
          ))}
        </div>

        <div className="modal__body hist-body">
          {loading ? (
            <div className="kitchen-empty"><div className="spinner" /><p>Загрузка...</p></div>
          ) : shown.length === 0 ? (
            <p className="settings-hint">Заказов не найдено.</p>
          ) : (
            <table className="hist-table">
              <thead>
                <tr><th>№</th><th>Тип</th><th>Стол</th><th>Статус</th><th>Время</th><th className="ta-r">Сумма</th></tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id}>
                    <td className="hist-num">#{o.order_number ?? '—'}</td>
                    <td>{TYPE_LABEL[o.order_type] || o.order_type || '—'}</td>
                    <td>{o.table_number || '—'}</td>
                    <td><span className={`hist-status hist-status--${o.status}`}>{STATUS[o.status] || o.status}</span></td>
                    <td className="hist-date">{fmtDt(o.created_at)}</td>
                    <td className="ta-r hist-sum">{Number(o.total_amount || 0).toLocaleString('ru-RU')} сум</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
