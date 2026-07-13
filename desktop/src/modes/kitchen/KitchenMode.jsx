import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { kitchen } from '../../shared/api'

export default function KitchenMode({ user, onBack }) {
  const [orderList, setOrderList] = useState([])
  const [loading, setLoading] = useState(true)

  const loadOrders = useCallback(() => {
    kitchen.orders(user.branch_id)
      .then((data) => setOrderList(data.items ?? data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user.branch_id])

  // Poll every 15 seconds (WS для кухни можно добавить позже)
  useEffect(() => {
    loadOrders()
    const interval = setInterval(loadOrders, 15_000)
    return () => clearInterval(interval)
  }, [loadOrders])

  async function handleItemDone(itemId) {
    await kitchen.itemDone(itemId)
    loadOrders()
  }

  return (
    <div className="mode-layout kitchen-layout">
      <header className="mode-topbar kitchen-topbar">
        <button className="icon-btn" onClick={onBack}><ArrowLeft size={20} /></button>
        <h2>Кухня</h2>
        <span className="live-badge">LIVE</span>
      </header>

      <main className="kitchen-main">
        {loading ? (
          <p className="loading-text">Загрузка...</p>
        ) : orderList.length === 0 ? (
          <p className="empty-text">Нет активных заказов</p>
        ) : (
          <div className="kitchen-grid">
            {orderList.map((order) => (
              <div key={order.id} className="kitchen-card">
                <div className="kitchen-card-header">
                  <span className="order-number">#{order.order_number}</span>
                  {order.table_number && <span>Стол {order.table_number}</span>}
                  <span className="order-time">{formatTime(order.created_at)}</span>
                </div>
                {order.note && <p className="order-note">📝 {order.note}</p>}
                <ul className="kitchen-items">
                  {(order.items ?? []).map((item) => (
                    <li key={item.id} className={`kitchen-item ${item.status === 'done' ? 'done' : ''}`}>
                      <span className="item-qty">×{item.quantity}</span>
                      <span className="item-name">{item.name}</span>
                      {item.note && <span className="item-note">{item.note}</span>}
                      {item.status !== 'done' && (
                        <button
                          className="item-done-btn"
                          onClick={() => handleItemDone(item.id)}
                          title="Готово"
                        >
                          <CheckCircle size={20} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
