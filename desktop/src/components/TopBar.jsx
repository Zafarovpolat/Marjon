import { useState, useEffect } from 'react'
import { RefreshCw, Lock, User, Settings, ZoomIn, ZoomOut, Maximize } from 'lucide-react'

/**
 * TopBar — верхняя панель для всех режимов.
 * Часы, название, статус соединения, кнопки управления.
 */
export default function TopBar({
  title = 'MARJON',
  subtitle,
  isOnline = true,
  onRefresh,
  onLock,
  onSettings,
  onAccount,
  children,
}) {
  const [time, setTime] = useState(formatTime)

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="topbar">
      <span className="topbar__clock">{time}</span>

      <div className="topbar__brand">
        <span className="topbar__title">{title}</span>
        {subtitle && <span className="topbar__subtitle">{subtitle}</span>}
      </div>

      {children && <div className="topbar__center">{children}</div>}

      <div className="topbar__status">
        <div className={`status-dot ${isOnline ? 'status-dot--online' : 'status-dot--offline'}`} />
        <span className="topbar__status-text">
          {isOnline ? 'Онлайн' : 'Офлайн'}
        </span>
      </div>

      <div className="topbar__actions">
        <button className="icon-btn" onClick={() => window.electron?.zoomOut?.()} title="Уменьшить масштаб">
          <ZoomOut size={22} />
        </button>
        <button className="icon-btn" onClick={() => window.electron?.zoomIn?.()} title="Увеличить масштаб">
          <ZoomIn size={22} />
        </button>
        <button className="icon-btn" onClick={() => window.electron?.toggleFullscreen?.()} title="Полный экран">
          <Maximize size={22} />
        </button>
        {onRefresh && (
          <button className="icon-btn" onClick={onRefresh} title="Обновить">
            <RefreshCw size={22} />
          </button>
        )}
        {onLock && (
          <button className="icon-btn" onClick={onLock} title="Заблокировать экран">
            <Lock size={22} />
          </button>
        )}
        {onSettings && (
          <button className="icon-btn" onClick={onSettings} title="Настройки">
            <Settings size={22} />
          </button>
        )}
        {onAccount && (
          <button className="icon-btn" onClick={onAccount} title="Аккаунт">
            <User size={22} />
          </button>
        )}
      </div>
    </header>
  )
}

function formatTime() {
  return new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
