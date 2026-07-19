import { useEffect, useState, useCallback, useRef } from 'react'
import { CheckCircle, Clock, AlertTriangle, XCircle, Volume2, VolumeX, ArrowLeft, RefreshCw, Filter } from 'lucide-react'
import { kitchen } from '../../shared/api'
import { kitchenWS } from '../../services/kitchenWS'
import { soundService } from '../../services/sound'
import TopBar from '../../components/TopBar'
import BottomBar from '../../components/BottomBar'

const TIMER_GREEN = 10 * 60 * 1000
const TIMER_YELLOW = 20 * 60 * 1000

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'cooking', label: 'Готовятся' },
  { id: 'ready', label: 'Готовы' },
]

export default function KitchenMode({ user, onBack, onLogout }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(false)
  const [soundOn, setSoundOn] = useState(() => soundService.enabled)
  const [filter, setFilter] = useState('all')
  const [now, setNow] = useState(Date.now())
  const prevOrderIdsRef = useRef(new Set())

  const loadOrders = useCallback(() => {
    kitchen.orders(user.branch_id)
      .then((data) => {
        const list = data.items ?? data ?? []
        setOrders(list)
        trackNewOrders(list)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user.branch_id])

  function trackNewOrders(list) {
    const currentIds = new Set(list.map(o => o.id))
    const prevIds = prevOrderIdsRef.current
    if (prevIds.size > 0) {
      for (const id of currentIds) {
        if (!prevIds.has(id)) {
          soundService.play('newOrder')
          break
        }
      }
    }
    prevOrderIdsRef.current = currentIds
  }

  useEffect(() => {
    loadOrders()

    const serverUrl = localStorage.getItem('marjon_server_url') || 'http://localhost:8000/api/v1'
    const token = localStorage.getItem('marjon_token')
    kitchenWS.connect(serverUrl, token, user.branch_id)

    kitchenWS.on('connection', ({ status }) => {
      setIsOnline(status === 'online')
      if (status === 'online') {
        soundService.play('connectionRestored')
        loadOrders()
      }
    })

    kitchenWS.on('new_order', () => {
      soundService.play('newOrder')
      loadOrders()
    })

    kitchenWS.on('order_updated', () => loadOrders())
    kitchenWS.on('order_cancelled', () => {
      soundService.play('orderCancelled')
      loadOrders()
    })

    return () => {
      kitchenWS.disconnect()
      soundService.stopAllAlerts()
    }
  }, [loadOrders])

  // Таймер — обновляем каждые 10 секунд
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(id)
  }, [])

  // Проверка просроченных заказов
  useEffect(() => {
    orders.forEach(order => {
      const elapsed = now - new Date(order.created_at).getTime()
      if (elapsed > TIMER_YELLOW) {
        soundService.startOverdueAlert(order.id)
      } else {
        soundService.stopOverdueAlert(order.id)
      }
    })
  }, [orders, now])

  async function handleItemDone(itemId) {
    try {
      await kitchen.itemDone(itemId)
      setOrders(prev => prev.map(order => ({
        ...order,
        items: (order.items ?? []).map(item =>
          item.id === itemId ? { ...item, status: 'ready' } : item
        )
      })))
      soundService.play('orderCompleted')
    } catch {
      loadOrders()
    }
  }

  async function handleOrderDone(orderId) {
    try {
      await kitchen.orderDone(orderId)
      setOrders(prev => prev.filter(o => o.id !== orderId))
      soundService.stopOverdueAlert(orderId)
      soundService.play('orderCompleted')
    } catch {
      loadOrders()
    }
  }

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    soundService.enabled = next
    if (!next) soundService.stopAllAlerts()
  }

  function getTimerState(createdAt) {
    const elapsed = now - new Date(createdAt).getTime()
    if (elapsed < TIMER_GREEN) return 'green'
    if (elapsed < TIMER_YELLOW) return 'yellow'
    return 'red'
  }

  function formatElapsed(createdAt) {
    const elapsed = Math.floor((now - new Date(createdAt).getTime()) / 1000)
    const min = Math.floor(elapsed / 60)
    const sec = elapsed % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter(o => {
        if (filter === 'new') return o.status === 'new' || o.status === 'pending'
        if (filter === 'cooking') return o.status === 'cooking' || o.status === 'in_progress'
        if (filter === 'ready') return o.status === 'ready'
        return true
      })

  return (
    <div className="app-shell app-shell--kitchen">
      <TopBar
        title="Кухня (KDS)"
        subtitle={user?.name}
        isOnline={isOnline}
        onRefresh={loadOrders}
        onLock={onBack}
      >
        <div className="kitchen-filters">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`filter-chip ${filter === f.id ? 'filter-chip--active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {f.id !== 'all' && (
                <span className="filter-chip__count">
                  {orders.filter(o => {
                    if (f.id === 'new') return o.status === 'new' || o.status === 'pending'
                    if (f.id === 'cooking') return o.status === 'cooking' || o.status === 'in_progress'
                    if (f.id === 'ready') return o.status === 'ready'
                    return false
                  }).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </TopBar>

      <main className="kitchen-board">
        {loading ? (
          <div className="kitchen-empty">
            <div className="spinner" />
            <p>Загрузка заказов...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="kitchen-empty">
            <CheckCircle size={64} strokeWidth={1} />
            <p>Нет активных заказов</p>
            <span className="kitchen-empty__hint">Новые заказы появятся автоматически</span>
          </div>
        ) : (
          <div className="kitchen-grid">
            {filteredOrders.map(order => (
              <KitchenCard
                key={order.id}
                order={order}
                timerState={getTimerState(order.created_at)}
                elapsed={formatElapsed(order.created_at)}
                onItemDone={handleItemDone}
                onOrderDone={handleOrderDone}
              />
            ))}
          </div>
        )}
      </main>

      <BottomBar onMinimize={() => window.electronAPI?.minimize?.()}>
        <button
          className={`bottom-action ${soundOn ? '' : 'bottom-action--muted'}`}
          onClick={toggleSound}
          title={soundOn ? 'Выключить звук' : 'Включить звук'}
        >
          {soundOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
          <span>{soundOn ? 'Звук вкл' : 'Звук выкл'}</span>
        </button>
        <div className="bottom-stats">
          <span className="bottom-stats__item">
            Заказов: <strong>{orders.length}</strong>
          </span>
        </div>
      </BottomBar>
    </div>
  )
}

function KitchenCard({ order, timerState, elapsed, onItemDone, onOrderDone }) {
  const items = order.items ?? []
  const doneCount = items.filter(i => i.status === 'ready' || i.status === 'done').length
  const allDone = items.length > 0 && doneCount === items.length

  return (
    <div className={`kitchen-card timer-${timerState}`}>
      <div className="kitchen-card__header">
        <div className="kitchen-card__info">
          <span className="kitchen-card__number">#{order.order_number || order.id}</span>
          {order.table_number && (
            <span className="kitchen-card__table">Стол {order.table_number}</span>
          )}
          {order.order_type && (
            <span className="kitchen-card__type">
              {order.order_type === 'dine_in' ? '🍽️' : order.order_type === 'takeaway' ? '📦' : '🚗'}
            </span>
          )}
        </div>
        <div className="kitchen-card__timer">
          <Clock size={14} />
          <span>{elapsed}</span>
        </div>
      </div>

      {order.note && (
        <div className="kitchen-card__note">
          <AlertTriangle size={14} />
          <span>{order.note}</span>
        </div>
      )}

      <div className="kitchen-card__progress">
        <div
          className="kitchen-card__progress-bar"
          style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }}
        />
      </div>

      <ul className="kitchen-card__items">
        {items.map(item => (
          <li
            key={item.id}
            className={`kitchen-item ${item.status === 'ready' || item.status === 'done' ? 'kitchen-item--done' : ''}`}
          >
            <span className="kitchen-item__qty">{item.quantity}×</span>
            <div className="kitchen-item__body">
              <span className="kitchen-item__name">{item.name || item.product_name}</span>
              {item.note && <span className="kitchen-item__note">{item.note}</span>}
            </div>
            {item.status !== 'ready' && item.status !== 'done' && (
              <button
                className="kitchen-item__done-btn"
                onClick={() => onItemDone(item.id)}
                title="Готово"
              >
                <CheckCircle size={28} />
              </button>
            )}
            {(item.status === 'ready' || item.status === 'done') && (
              <CheckCircle size={22} className="kitchen-item__check" />
            )}
          </li>
        ))}
      </ul>

      {allDone && (
        <button className="kitchen-card__complete" onClick={() => onOrderDone(order.id)}>
          <CheckCircle size={20} />
          Заказ готов — отдать
        </button>
      )}
    </div>
  )
}
