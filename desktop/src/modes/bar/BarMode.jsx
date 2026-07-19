import { useEffect, useState, useCallback, useRef } from 'react'
import { ArrowLeft, CheckCircle, Coffee, Wine, GlassWater, Clock, Volume2, VolumeX } from 'lucide-react'
import { kitchen } from '../../shared/api'
import { kitchenWS } from '../../services/kitchenWS'
import { soundService } from '../../services/sound'

const FILTERS = [
  { id: 'all', label: 'Все', icon: Coffee },
  { id: 'drinks', label: 'Напитки', icon: GlassWater },
  { id: 'alcohol', label: 'Алкоголь', icon: Wine },
]

export default function BarMode({ user, onBack }) {
  const [orderList, setOrderList] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [soundOn, setSoundOn] = useState(true)
  const [isOnline, setIsOnline] = useState(false)
  const prevOrderIds = useRef(new Set())

  const loadOrders = useCallback(() => {
    kitchen.orders(user.branch_id)
      .then((data) => {
        const items = data.items ?? data
        setOrderList(items)

        const newIds = new Set(items.map(o => o.id))
        items.forEach(o => {
          if (!prevOrderIds.current.has(o.id)) {
            soundService.play('newOrder')
          }
        })
        prevOrderIds.current = newIds
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user.branch_id])

  useEffect(() => {
    loadOrders()

    const serverUrl = localStorage.getItem('marjon_server_url') || 'http://localhost:8000/api/v1'
    const token = localStorage.getItem('marjon_token')
    kitchenWS.connect(serverUrl, token, user.branch_id)

    const unsubs = [
      kitchenWS.on('connection', ({ status }) => setIsOnline(status === 'online')),
      kitchenWS.on('new_order', () => { soundService.play('newOrder'); loadOrders() }),
      kitchenWS.on('order_updated', loadOrders),
      kitchenWS.on('order_cancelled', () => { soundService.play('orderCancelled'); loadOrders() }),
    ]

    return () => { unsubs.forEach(fn => fn()); kitchenWS.disconnect() }
  }, [loadOrders])

  useEffect(() => {
    soundService.enabled = soundOn
  }, [soundOn])

  async function handleItemDone(itemId) {
    await kitchen.itemDone(itemId)
    soundService.play('orderCompleted')
    loadOrders()
  }

  async function handleOrderDone(order) {
    const pendingItems = (order.items ?? []).filter(i => i.status !== 'ready')
    for (const item of pendingItems) {
      await kitchen.itemDone(item.id)
    }
    soundService.play('orderCompleted')
    loadOrders()
  }

  function getElapsed(createdAt) {
    if (!createdAt) return 0
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  }

  function getTimerClass(minutes) {
    if (minutes < 5) return 'timer-green'
    if (minutes < 10) return 'timer-yellow'
    return 'timer-red'
  }

  const filteredOrders = orderList.filter(order => {
    if (filter === 'all') return true
    // фильтрация по категории напитков (если есть category_type на items)
    return true
  })

  return (
    <div className="mode-layout bar-layout">
      <header className="mode-topbar bar-topbar">
        <button className="icon-btn" onClick={onBack}>
          <ArrowLeft size={22} />
        </button>
        <h2>Бар</h2>

        <div className="bar-filters">
          {FILTERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`bar-filter-btn ${filter === id ? 'active' : ''}`}
              onClick={() => setFilter(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="bar-topbar-right">
          <span className={`status-dot ${isOnline ? 'status-dot--online' : 'status-dot--offline'}`} />
          <span className="bar-badge">LIVE</span>
          <button
            className="icon-btn"
            onClick={() => setSoundOn(!soundOn)}
            title={soundOn ? 'Выключить звук' : 'Включить звук'}
          >
            {soundOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
          </button>
        </div>
      </header>

      <main className="kitchen-main bar-main">
        {loading ? (
          <p className="loading-text">Загрузка...</p>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            <Coffee size={64} strokeWidth={1} />
            <p>Нет активных заказов</p>
          </div>
        ) : (
          <div className="kitchen-grid bar-grid">
            {filteredOrders.map((order) => {
              const elapsed = getElapsed(order.created_at)
              const timerClass = getTimerClass(elapsed)
              const pendingItems = (order.items ?? []).filter(i => i.status !== 'ready')
              const allDone = pendingItems.length === 0

              return (
                <div key={order.id} className={`kitchen-card bar-card ${timerClass}`}>
                  <div className="kitchen-card-header">
                    <span className="order-number">#{order.order_number}</span>
                    {order.table_number && <span className="order-table">Стол {order.table_number}</span>}
                    <span className={`order-timer ${timerClass}`}>
                      <Clock size={14} />
                      {elapsed} мин
                    </span>
                  </div>

                  <ul className="kitchen-items bar-items">
                    {(order.items ?? []).map((item) => (
                      <li key={item.id} className={`kitchen-item ${item.status === 'ready' ? 'done' : ''}`}>
                        <span className="item-qty">×{item.quantity}</span>
                        <span className="item-name">{item.name}</span>
                        {item.note && <span className="item-note">{item.note}</span>}
                        {item.status !== 'ready' && (
                          <button
                            className="item-done-btn"
                            onClick={() => handleItemDone(item.id)}
                            title="Готово"
                          >
                            <CheckCircle size={22} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>

                  {!allDone && (
                    <button
                      className="bar-done-all-btn"
                      onClick={() => handleOrderDone(order)}
                    >
                      <CheckCircle size={20} />
                      Всё готово
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
