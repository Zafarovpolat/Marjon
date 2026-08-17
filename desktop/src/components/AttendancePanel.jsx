import { useState, useEffect, useCallback } from 'react'
import { X, Clock, LogIn, LogOut, Check, Ban } from 'lucide-react'
import { attendance } from '../shared/api'
import { t } from '../shared/i18n'
import { toast } from './Toast'

// 5.5 — кассир подтверждает/отклоняет приход-уход повара.
// Очередь pending-отметок; каждая строка: имя повара, действие (приход/уход),
// время. Кнопки «Подтвердить»/«Отклонить» шлют approve/reject и убирают строку.
function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
}

export default function AttendancePanel({ onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    attendance.pending()
      .then((d) => setRows(Array.isArray(d) ? d : d?.items || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  async function decide(row, approve) {
    setBusyId(row.id)
    // Оптимистично убираем строку из очереди — она уходит из pending в любом случае.
    setRows((prev) => prev.filter((x) => x.id !== row.id))
    try {
      if (approve) await attendance.approve(row.id)
      else await attendance.reject(row.id)
      toast(approve ? t('att_approved') : t('att_rejected'), 'success')
    } catch (e) {
      toast(e?.response?.data?.detail || e.message || t('att_err'), 'error')
      load() // откат: перечитываем очередь
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal att-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2><Clock size={20} /> {t('att_pending')} {rows.length > 0 && <span className="stop-count">{rows.length}</span>}</h2>
          <button className="icon-btn" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="modal__body att-body">
          {loading ? (
            <div className="kitchen-empty"><div className="spinner" /><p>{t('loading')}</p></div>
          ) : rows.length === 0 ? (
            <p className="settings-hint">{t('att_empty')}</p>
          ) : (
            <div className="att-list">
              {rows.map((row) => {
                const isIn = row.action === 'check_in'
                return (
                  <div className="att-row" key={row.id}>
                    <div className={`att-row__badge ${isIn ? 'att-row__badge--in' : 'att-row__badge--out'}`}>
                      {isIn ? <LogIn size={18} /> : <LogOut size={18} />}
                    </div>
                    <div className="att-row__info">
                      <span className="att-row__name">{row.employee_name || '—'}</span>
                      <span className="att-row__meta">
                        {isIn ? t('att_check_in') : t('att_check_out')} · {fmtTime(row.timestamp)}
                      </span>
                    </div>
                    <div className="att-row__actions">
                      <button
                        className="btn btn--sm btn--primary"
                        disabled={busyId === row.id}
                        onClick={() => decide(row, true)}
                      >
                        <Check size={16} /> {t('att_approve')}
                      </button>
                      <button
                        className="btn btn--sm btn--danger-soft"
                        disabled={busyId === row.id}
                        onClick={() => decide(row, false)}
                      >
                        <Ban size={16} /> {t('att_reject')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
