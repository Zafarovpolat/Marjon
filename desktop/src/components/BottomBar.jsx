import { useState, useEffect } from 'react'
import { Minus, Printer, User } from 'lucide-react'
import { t } from '../shared/i18n'
import { printers as printersApi } from '../shared/api'

/**
 * BottomBar — нижняя панель с кнопкой сворачивания, краткой информацией
 * о текущей сессии, статусом связи и часами (переехали сюда из шапки —
 * здесь они не мешают).
 * Критична для touch-моноблоков без стандартного taskbar Windows.
 */
export default function BottomBar({ userName, branchName, mode, isOnline = true, queued = 0, onMinimize }) {
  const [time, setTime] = useState(formatTime)
  // Принтеры филиала: имена + IP + живой статус (тихий индикатор рядом с онлайном).
  const [printerList, setPrinterList] = useState([])
  const [printerState, setPrinterState] = useState({})   // { [id]: 'ok' | 'fail' }

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let alive = true
    async function refreshPrinters() {
      let list = []
      try {
        const data = await printersApi.list()
        list = Array.isArray(data) ? data : data?.items || []
      } catch { /* офлайн — прячем блок */ }
      if (!alive) return
      setPrinterList(list)
      // Статус — серверным пингом (сервер печатает первым, его доступность главная).
      const states = await Promise.all(list.map(async (p) => {
        try {
          const r = await printersApi.ping(p.ip_address, p.port ?? 9100)
          return [p.id, r?.reachable ? 'ok' : 'fail']
        } catch {
          return [p.id, 'fail']
        }
      }))
      if (alive) setPrinterState(Object.fromEntries(states))
    }
    refreshPrinters()
    const timer = setInterval(refreshPrinters, 90_000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize()
    } else if (window.electron?.minimize) {
      window.electron.minimize()
    }
  }

  return (
    <footer className="bottombar">
      <div className="bottombar__info">
        {userName && (
          <span className="bottombar__name flex items-center gap-sm">
            <User size={14} />
            {userName}
          </span>
        )}
        {mode && <span> · <span className="bottombar__mode">{mode}</span></span>}
        {branchName && <span> · {branchName}</span>}
      </div>

      {/* Статус связи: тихий в норме, заметный только при обрыве */}
      <span className={`bottombar__status ${isOnline ? '' : 'bottombar__status--offline'}`}>
        <span className={`status-dot ${isOnline ? 'status-dot--online' : 'status-dot--offline'}`} />
        {isOnline ? t('online') : t('offline')}
      </span>
      {queued > 0 && (
        <span className="bottombar__queue" title={t('queue_hint')}>↻ {queued}</span>
      )}

      {/* Принтеры: имя + IP в подсказке, точка — живой статус пинга. Блок тихий. */}
      {printerList.length > 0 && (
        <span className="bottombar__printers" aria-label={t('printers_diag')}>
          <Printer size={13} />
          {printerList.map((p) => {
            const state = printerState[p.id]
            const dot = state === 'ok' ? 'status-dot--online' : state === 'fail' ? 'status-dot--offline' : 'status-dot--unknown'
            return (
              <span
                key={p.id}
                className="bottombar__printer"
                title={`${p.name} · ${p.ip_address || '—'}:${p.port ?? 9100}`}
              >
                <span className={`status-dot ${dot}`} />
                {p.name}
              </span>
            )
          })}
        </span>
      )}

      <span className="bottombar__clock">{time}</span>

      <button className="bottombar__minimize" onClick={handleMinimize} title={t('minimize')}>
        <Minus size={18} />
      </button>
    </footer>
  )
}

function formatTime() {
  return new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
