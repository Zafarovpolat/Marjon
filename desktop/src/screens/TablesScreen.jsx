import { useState, useEffect } from 'react'
import {
  Search, RefreshCw, Lock, Settings, User, Plus,
  LayoutGrid, Armchair, DoorClosed, Sun, Wine, CalendarClock,
  Users, Clock, Utensils, ShoppingBag, Bike, Minus,
} from 'lucide-react'

/**
 * TablesScreen — главный рабочий экран (зал/столы).
 * Каркас: navy шапка + navy сайдбар локаций (один цвет) + белый скруглённый main.
 * Официант видит только «На стол»; кассир — плюс «Собой»/«Доставка».
 */

const ZONE_ICONS = {
  all: LayoutGrid,
  hall: Armchair,
  cabin: DoorClosed,
  terrace: Sun,
  bar: Wine,
  booking: CalendarClock,
}

const ORDER_TYPES = [
  { id: 'dine_in', label: 'На стол', icon: Utensils },
  { id: 'takeaway', label: 'Собой', icon: ShoppingBag },
  { id: 'delivery', label: 'Доставка', icon: Bike },
]

function formatClock() {
  return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || 'U'
}

export default function TablesScreen({
  user = {},
  branch = {},
  zones = [],
  tables = [],
  activeZone = 'all',
  orderType = 'dine_in',
  allowedTypes = ['dine_in'],
  isOnline = true,
  printerStatuses = [],
  onZoneChange,
  onTableTap,
  onOrderType,
  onSearch,
  onRefresh,
  onLock,
  onSettings,
  onAccount,
  onNewOrder,
  onMinimize,
}) {
  const [clock, setClock] = useState(formatClock)
  useEffect(() => {
    const id = setInterval(() => setClock(formatClock()), 15000)
    return () => clearInterval(id)
  }, [])

  const visibleTables = activeZone === 'all'
    ? tables
    : tables.filter((t) => t.zone === activeZone)

  const busyCount = visibleTables.filter((t) => t.status && t.status !== 'free').length

  // Группировка по зонам (для «Все» — по каждой зоне, иначе одна группа)
  const groups = activeZone === 'all'
    ? zones.filter((z) => z.id !== 'all').map((z) => ({
        zone: z,
        items: tables.filter((t) => t.zone === z.id),
      })).filter((g) => g.items.length)
    : [{ zone: zones.find((z) => z.id === activeZone), items: visibleTables }]

  const types = ORDER_TYPES.filter((t) => allowedTypes.includes(t.id))

  return (
    <div className="ws">
      {/* Верхняя панель */}
      <header className="ws-top">
        <div className="ws-brand">
          <div className="ws-brand__mark">M</div>
          <div className="ws-brand__text">
            <span className="ws-brand__name">MARJON</span>
            <span className="ws-brand__sub">{branch?.name || 'Филиал'}</span>
          </div>
        </div>

        <div className="ws-top__center">
          {types.length > 1 && (
            <div className="seg">
              {types.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={`seg__btn ${orderType === id ? 'seg__btn--active' : ''}`}
                  onClick={() => onOrderType?.(id)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ws-top__right">
          <span className="ws-clock">{clock}</span>
          <button className="ws-iconbtn" title="Поиск" onClick={onSearch}><Search size={20} /></button>
          <button className="ws-iconbtn" title="Обновить" onClick={onRefresh}><RefreshCw size={20} /></button>
          <button className="ws-iconbtn" title="Блокировка" onClick={onLock}><Lock size={20} /></button>
          <button className="ws-iconbtn" title="Настройки" onClick={onSettings}><Settings size={20} /></button>
          <button className="ws-iconbtn" title="Аккаунт" onClick={onAccount}><User size={20} /></button>
        </div>
      </header>

      <div className="ws__body">
        {/* Сайдбар локаций */}
        <aside className="ws-side">
          <div className="ws-side__label">Локации</div>
          <nav className="ws-side__nav">
            {zones.map((z) => {
              const Icon = ZONE_ICONS[z.id] || LayoutGrid
              return (
                <button
                  key={z.id}
                  className={`zone ${activeZone === z.id ? 'zone--active' : ''}`}
                  onClick={() => onZoneChange?.(z.id)}
                >
                  <Icon size={20} />
                  <span className="zone__name">{z.name}</span>
                  {typeof z.count === 'number' && <span className="zone__count">{z.count}</span>}
                </button>
              )
            })}
          </nav>
          <div className="ws-side__spacer" />
          <div className="ws-user">
            <div className="ws-user__avatar">{initials(user?.name)}</div>
            <div className="ws-user__meta">
              <span className="ws-user__name">{user?.name || 'Сотрудник'}</span>
              <span className="ws-user__role">{user?.role_label || user?.role || 'Официант'}</span>
            </div>
          </div>
        </aside>

        {/* Доска столов */}
        <main className="ws__main">
          <div className="board__head">
            <div className="board__title">
              <h2>{activeZone === 'all' ? 'Все столы' : (zones.find((z) => z.id === activeZone)?.name || 'Зал')}</h2>
              <span className="board__subtitle">{visibleTables.length} столов · {busyCount} занято</span>
            </div>
            <div className="board__head-right">
              <div className="legend">
                <span className="legend__item"><span className="legend__swatch legend__swatch--free" /> Свободен</span>
                <span className="legend__item"><span className="legend__swatch legend__swatch--busy" /> Занят</span>
                <span className="legend__item"><span className="legend__swatch legend__swatch--check" /> Чек выдан</span>
              </div>
              <button className="btn btn--primary btn--sm" onClick={onNewOrder}>
                <Plus size={18} /> Новый заказ
              </button>
            </div>
          </div>

          <div className="board__scroll">
            {groups.map(({ zone, items }) => (
              <section className="tgroup" key={zone?.id || 'z'}>
                <div className="tgroup__title">
                  {zone?.name || 'Зона'} <span>{items.length} столов</span>
                </div>
                <div className="tgrid">
                  {items.map((t) => (
                    <TableCard key={t.id ?? t.number} table={t} onTap={() => onTableTap?.(t)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>
      </div>

      {/* Статус-бар */}
      <footer className="ws-bottom">
        <span className="wstat"><span className={`wstat__dot ${isOnline ? 'wstat__dot--ok' : 'wstat__dot--off'}`} /> Соединение</span>
        <span className="wstat"><span className={`wstat__dot ${isOnline ? 'wstat__dot--ok' : 'wstat__dot--off'}`} /> Интернет</span>
        {printerStatuses.map((p) => (
          <span className="wstat" key={p.name}>
            <span className={`wstat__dot ${p.ok ? 'wstat__dot--ok' : 'wstat__dot--off'}`} /> {p.name}
          </span>
        ))}
        <div className="ws-bottom__spacer" />
        <span className="ws-bottom__ver">v1.0.0</span>
        <button className="ws-iconbtn" title="Свернуть" onClick={onMinimize} style={{ width: 30, height: 26 }}>
          <Minus size={16} />
        </button>
      </footer>
    </div>
  )
}

const STATUS_LABELS = { free: 'Свободен', busy: 'Занят', waiting: 'В ожидании', check: 'Чек выдан' }

function TableCard({ table, onTap }) {
  const status = table.status || 'free'
  const variant = status === 'free' ? 'free' : status === 'check' ? 'check' : 'busy'
  return (
    <button className={`tcard tcard--${variant}`} onClick={onTap}>
      <div className="tcard__top">
        <span className="tcard__num">{table.number}</span>
        <span className="tcard__seats"><Users /> {table.seats || 4}</span>
      </div>

      {status === 'free' ? (
        <div className="tcard__spacer" />
      ) : (
        <>
          <span className="tcard__client">{table.client || 'Гость'}</span>
          <span className="tcard__meta">
            <Clock /> {table.time || ''}
            {table.amount != null && <span className="tcard__amount">{Number(table.amount).toLocaleString('ru-RU')} сум</span>}
          </span>
        </>
      )}

      <span className="tcard__status">{STATUS_LABELS[status] || 'Свободен'}</span>
    </button>
  )
}
