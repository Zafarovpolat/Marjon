import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Lock, User, Settings, TrendingUp, ChevronDown } from 'lucide-react'
import { t } from '../shared/i18n'

// Курсы ЦБ РУз (как в веб-панели). Возвращаем rate/nominal по каждой валюте.
const RATE_URLS = {
  USD: 'https://cbu.uz/ru/arkhiv-kursov-valyut/json/USD/',
  RUB: 'https://cbu.uz/ru/arkhiv-kursov-valyut/json/RUB/',
  KZT: 'https://cbu.uz/ru/arkhiv-kursov-valyut/json/KZT/',
  KGS: 'https://cbu.uz/ru/arkhiv-kursov-valyut/json/KGS/',
}

/**
 * TopBar — верхняя панель для всех режимов.
 * Часы, название, статус соединения, кнопки управления.
 */
export default function TopBar({
  title = 'MARJON',
  subtitle,
  isOnline = true,
  queued = 0,
  onRefresh,
  onLock,
  onSettings,
  onAccount,
  onDevAccess,
  children,
}) {
  const [time, setTime] = useState(formatTime)
  const [rates, setRates] = useState({})   // { USD: 12500, RUB: 135, ... } — сум за единицу
  const [ratesOpen, setRatesOpen] = useState(false)
  const ratesRef = useRef(null)
  const devTapsRef = useRef([])             // метки времени тапов по часам (секретный вход)

  // Секретный доступ к панели разработчика: 7 быстрых тапов по часам подряд.
  // Без видимой подсказки — намеренно скрыто.
  const handleClockTap = () => {
    if (!onDevAccess) return
    const now = Date.now()
    devTapsRef.current = [...devTapsRef.current.filter((ts) => now - ts < 3000), now]
    if (devTapsRef.current.length >= 7) {
      devTapsRef.current = []
      onDevAccess()
    }
  }


  useEffect(() => {
    const id = setInterval(() => setTime(formatTime()), 1000)
    return () => clearInterval(id)
  }, [])

  // Закрытие дропдауна курсов по клику вне его области
  useEffect(() => {
    if (!ratesOpen) return
    const onDocClick = (e) => { if (ratesRef.current && !ratesRef.current.contains(e.target)) setRatesOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [ratesOpen])

  // Курсы валют — тянем при монтировании и обновляем раз в 10 минут (как веб-панель).
  useEffect(() => {
    const controller = new AbortController()
    const load = () => {
      Object.entries(RATE_URLS).forEach(([ccy, url]) => {
        fetch(url, { signal: controller.signal })
          .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
          .then((data) => {
            const rate = Number(data?.[0]?.Rate)
            const nominal = Number(data?.[0]?.Nominal) || 1
            if (Number.isFinite(rate) && rate > 0) setRates((p) => ({ ...p, [ccy]: rate / nominal }))
          })
          .catch(() => { /* нет связи — просто не показываем */ })
      })
    }
    load()
    const id = setInterval(load, 10 * 60 * 1000)
    return () => { controller.abort(); clearInterval(id) }
  }, [])

  const rateList = Object.keys(RATE_URLS).filter((c) => rates[c])

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__title">{title}</span>
        {subtitle && <span className="topbar__subtitle">{subtitle}</span>}
      </div>

      <span className="topbar__clock" onClick={handleClockTap}>{time}</span>

      {/* Курсы валют — сразу после часов, слева (как просил клиент) */}
      {rateList.length > 0 && (
        <div className="topbar__rates-dd" ref={ratesRef}>
          <button
            className="btn btn--outline btn--sm topbar__rates-btn"
            onClick={() => setRatesOpen((o) => !o)}
            title={t('exchange_rates')}
          >
            <TrendingUp size={16} />
            <span className="topbar__rates-lead">
              {rateList[0]} {Math.round(rates[rateList[0]]).toLocaleString('ru-RU')}
            </span>
            <ChevronDown size={14} className={`topbar__rates-caret ${ratesOpen ? 'is-open' : ''}`} />
          </button>
          {ratesOpen && (
            <div className="topbar__rates-menu">
              {rateList.map((ccy) => (
                <div key={ccy} className="topbar__rates-item">
                  <span className="topbar__rate-ccy">{ccy}</span>
                  <span className="topbar__rate-val">{Math.round(rates[ccy]).toLocaleString('ru-RU')} UZS</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {children && <div className="topbar__center">{children}</div>}

      <div className="topbar__status">
        <div className={`status-dot ${isOnline ? 'status-dot--online' : 'status-dot--offline'}`} />
        <span className="topbar__status-text">
          {isOnline ? t('online') : t('offline')}
        </span>
        {queued > 0 && (
          <span className="topbar__queue" title={t('queue_hint')}>↻ {queued}</span>
        )}
      </div>

      <div className="topbar__actions">
        {onRefresh && (
          <button className="icon-btn" onClick={onRefresh} title={t('refresh')}>
            <RefreshCw size={22} />
          </button>
        )}
        {onLock && (
          <button className="icon-btn" onClick={onLock} title={t('lock_screen')}>
            <Lock size={22} />
          </button>
        )}
        {onSettings && (
          <button className="icon-btn" onClick={onSettings} title={t('settings')}>
            <Settings size={22} />
          </button>
        )}
        {onAccount && (
          <button className="icon-btn" onClick={onAccount} title={t('account')}>
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
