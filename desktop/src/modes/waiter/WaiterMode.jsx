import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Minus, Search, X, Users, Clock,
  CheckCircle, AlertCircle, Coffee, Utensils,
} from 'lucide-react'
import { orders, menu, tables as tablesApi } from '../../shared/api'

const STATUS_LABELS = {
  new: 'Новый', accepted: 'Принят', cooking: 'Готовится',
  ready: 'Готов', completed: 'Закрыт', cancelled: 'Отменён',
}

const STATUS_COLORS = {
  new: 'var(--color-info)',
  accepted: 'var(--color-brand)',
  cooking: 'var(--color-warning)',
  ready: 'var(--color-success)',
}

const ACTIVE_STATUSES = new Set(['new', 'accepted', 'cooking', 'ready'])

export default function WaiterMode({ user, onBack }) {
  const [view, setView] = useState('hall')
  const [tableList, setTableList] = useState([])
  const [orderList, setOrderList] = useState([])
  const [selectedTable, setSelectedTable] = useState(null)
  const [loading, setLoading] = useState(true)

  // Для создания заказа
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [activeCat, setActiveCat] = useState(null)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [orderNote, setOrderNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [guests, setGuests] = useState(1)

  const loadData = useCallback(() => {
    Promise.all([
      orders.list({ branch_id: user.branch_id }).then(data => {
        const all = data.items ?? data
        setOrderList(all.filter(o => ACTIVE_STATUSES.has(o.status)))
      }),
      tablesApi.list(user.branch_id).then(data => {
        setTableList(data.items ?? data)
      }).catch(() => {
        // Если нет API столов — сгенерируем демо
        setTableList(generateDemoTables())
      }),
    ]).finally(() => setLoading(false))
  }, [user.branch_id])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 20000)
    return () => clearInterval(interval)
  }, [loadData])

  useEffect(() => {
    if (view !== 'new-order') return
    menu.products().then(data => setProducts(data.items ?? data)).catch(() => {})
    menu.categories().then(data => setCategories(data.items ?? data)).catch(() => {})
  }, [view])

  function getTableOrder(tableNum) {
    return orderList.find(o => String(o.table_number) === String(tableNum))
  }

  function getTableStatus(table) {
    const order = getTableOrder(table.number)
    if (!order) return 'free'
    return order.status
  }

  function handleTableTap(table) {
    const order = getTableOrder(table.number)
    if (order) {
      setSelectedTable({ ...table, order })
      setView('table-detail')
    } else {
      setSelectedTable(table)
      setCart([])
      setOrderNote('')
      setGuests(1)
      setSearch('')
      setActiveCat(null)
      setView('new-order')
    }
  }

  function openNewForTable(table) {
    setSelectedTable(table)
    setCart([])
    setOrderNote('')
    setGuests(1)
    setSearch('')
    setActiveCat(null)
    setView('new-order')
  }

  // Каталог
  const filteredProducts = products.filter(p => {
    if (!p.is_active && p.is_active !== undefined) return false
    if (activeCat && p.category_id !== activeCat) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { product, qty: 1, note: '' }]
    })
  }

  function updateQty(productId, delta) {
    setCart(prev =>
      prev.map(i => i.product.id === productId ? { ...i, qty: i.qty + delta } : i)
        .filter(i => i.qty > 0)
    )
  }

  const cartTotal = cart.reduce((sum, i) => sum + Number(i.product.price) * i.qty, 0)

  async function handleSubmitOrder() {
    if (!cart.length) return
    setSubmitting(true)
    try {
      await orders.create({
        branch_id: user.branch_id,
        order_type: 'dine_in',
        table_number: selectedTable?.number || null,
        guests_count: guests,
        note: orderNote || null,
        items: cart.map(i => ({
          product_id: i.product.id,
          quantity: i.qty,
          note: i.note || null,
        })),
      })
      setView('hall')
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка создания заказа')
    } finally {
      setSubmitting(false)
    }
  }

  // === VIEW: Hall map ===
  if (view === 'hall') {
    return (
      <div className="waiter-hall">
        <header className="waiter-hall__header">
          <h2>Зал</h2>
          <div className="waiter-hall__legend">
            <span className="legend-item legend-free"><span className="legend-dot" /> Свободен</span>
            <span className="legend-item legend-occupied"><span className="legend-dot" /> Занят</span>
            <span className="legend-item legend-ready"><span className="legend-dot" /> Готов</span>
          </div>
          <button className="btn-primary btn--sm" onClick={() => openNewForTable(null)}>
            <Plus size={18} /> Без стола
          </button>
        </header>

        {loading ? (
          <div className="waiter-hall__loading">Загрузка...</div>
        ) : (
          <div className="waiter-hall__grid">
            {tableList.map(table => {
              const status = getTableStatus(table)
              const order = getTableOrder(table.number)
              return (
                <button
                  key={table.id || table.number}
                  className={`table-card table-card--${status}`}
                  onClick={() => handleTableTap(table)}
                >
                  <span className="table-card__number">{table.number}</span>
                  <span className="table-card__seats">
                    <Users size={14} /> {table.seats || 4}
                  </span>
                  {order && (
                    <span className="table-card__status">
                      {STATUS_LABELS[order.status]}
                    </span>
                  )}
                  {order && (
                    <span className="table-card__time">
                      <Clock size={12} /> {formatTime(order.created_at)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // === VIEW: Table detail ===
  if (view === 'table-detail' && selectedTable) {
    const order = selectedTable.order
    return (
      <div className="waiter-detail">
        <header className="waiter-detail__header">
          <button className="btn-ghost" onClick={() => setView('hall')}>
            <X size={20} /> Назад
          </button>
          <h2>Стол {selectedTable.number}</h2>
          <span className="status-badge" style={{ background: STATUS_COLORS[order?.status] }}>
            {STATUS_LABELS[order?.status]}
          </span>
        </header>

        {order && (
          <div className="waiter-detail__order">
            <div className="waiter-detail__meta">
              <span>Заказ #{order.order_number}</span>
              <span><Clock size={14} /> {formatTime(order.created_at)}</span>
              <span>{Number(order.total_amount).toLocaleString()} сум</span>
            </div>

            <ul className="waiter-detail__items">
              {(order.items ?? []).map(item => (
                <li key={item.id} className={`detail-item detail-item--${item.status || 'new'}`}>
                  <span className="detail-item__qty">×{item.quantity}</span>
                  <span className="detail-item__name">{item.name}</span>
                  <span className="detail-item__status">
                    {item.status === 'ready' && <CheckCircle size={16} />}
                    {item.status === 'cooking' && <Coffee size={16} />}
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </li>
              ))}
            </ul>

            <div className="waiter-detail__actions">
              <button
                className="btn-primary btn--lg"
                onClick={() => openNewForTable(selectedTable)}
              >
                <Plus size={18} /> Добавить блюда
              </button>
              {order.status === 'ready' && (
                <button
                  className="btn-success btn--lg"
                  onClick={async () => {
                    await orders.updateStatus(order.id, 'completed')
                    setView('hall')
                    loadData()
                  }}
                >
                  <CheckCircle size={18} /> Закрыть заказ
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // === VIEW: New order ===
  if (view === 'new-order') {
    return (
      <div className="waiter-new-order">
        <header className="waiter-new-order__header">
          <button className="btn-ghost" onClick={() => setView('hall')}>
            <X size={20} />
          </button>
          <h2>
            {selectedTable ? `Стол ${selectedTable.number}` : 'Без стола'}
            {' — Новый заказ'}
          </h2>
        </header>

        <div className="waiter-new-order__body">
          {/* Каталог */}
          <div className="waiter-catalog">
            <div className="waiter-catalog__search">
              <Search size={18} />
              <input
                placeholder="Поиск блюда..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="btn-icon-sm" onClick={() => setSearch('')}>
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="waiter-catalog__cats">
              <button
                className={`cat-btn ${!activeCat ? 'cat-btn--active' : ''}`}
                onClick={() => setActiveCat(null)}
              >Все</button>
              {categories.map(c => (
                <button
                  key={c.id}
                  className={`cat-btn ${activeCat === c.id ? 'cat-btn--active' : ''}`}
                  onClick={() => setActiveCat(c.id)}
                >{c.name}</button>
              ))}
            </div>

            <div className="waiter-catalog__grid">
              {filteredProducts.length === 0 ? (
                <p className="empty-text">Нет блюд</p>
              ) : filteredProducts.map(p => (
                <button key={p.id} className="product-tile" onClick={() => addToCart(p)}>
                  <Utensils size={20} />
                  <span className="product-tile__name">{p.name}</span>
                  <span className="product-tile__price">{Number(p.price).toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Корзина */}
          <div className="waiter-cart">
            <div className="waiter-cart__meta">
              <label>
                Гостей:
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={guests}
                  onChange={e => setGuests(Number(e.target.value) || 1)}
                />
              </label>
              <input
                className="waiter-cart__note"
                placeholder="Комментарий к заказу..."
                value={orderNote}
                onChange={e => setOrderNote(e.target.value)}
              />
            </div>

            <div className="waiter-cart__items">
              {cart.length === 0 ? (
                <p className="empty-text">Добавьте блюда</p>
              ) : cart.map(item => (
                <div key={item.product.id} className="cart-row">
                  <span className="cart-row__name">{item.product.name}</span>
                  <div className="cart-row__qty">
                    <button onClick={() => updateQty(item.product.id, -1)}>
                      <Minus size={16} />
                    </button>
                    <span>{item.qty}</span>
                    <button onClick={() => updateQty(item.product.id, 1)}>
                      <Plus size={16} />
                    </button>
                  </div>
                  <span className="cart-row__sum">
                    {(Number(item.product.price) * item.qty).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div className="waiter-cart__footer">
                <div className="waiter-cart__total">
                  Итого: <strong>{cartTotal.toLocaleString()} сум</strong>
                </div>
                <button
                  className="btn-primary btn--xl"
                  onClick={handleSubmitOrder}
                  disabled={submitting}
                >
                  {submitting ? 'Отправка...' : 'Отправить на кухню'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}

function generateDemoTables() {
  return Array.from({ length: 12 }, (_, i) => ({
    id: `demo-${i + 1}`,
    number: i + 1,
    seats: [2, 4, 4, 6, 4, 2, 8, 4, 4, 6, 2, 4][i],
    zone: i < 6 ? 'main' : 'terrace',
  }))
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
