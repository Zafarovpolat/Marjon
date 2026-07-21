import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Plus, Minus } from 'lucide-react'
import { orders, menu } from '../../shared/api'
import { onKitchenEvent } from '../../shared/ws'

const ACTIVE_STATUSES = new Set(['new', 'accepted', 'cooking', 'ready'])

const STATUS_LABELS = {
  new: 'Новый', accepted: 'Принят', cooking: 'Готовится',
  ready: 'Готов', completed: 'Закрыт', cancelled: 'Отменён',
}

export default function WaiterMode({ user, onBack }) {
  const [view, setView] = useState('list')
  const [orderList, setOrderList] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [activeCat, setActiveCat] = useState(null)
  const [search, setSearch] = useState('')
  const [table, setTable] = useState('')
  const [cart, setCart] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const loadOrders = useCallback(() => {
    orders.list({ branch_id: user.branch_id })
      .then((data) => {
        const all = data.items ?? data
        setOrderList(all.filter((o) => ACTIVE_STATUSES.has(o.status)))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user.branch_id])

  useEffect(() => {
    loadOrders()
    const unsubs = [
      onKitchenEvent('new_order',       loadOrders),
      onKitchenEvent('order_updated',   loadOrders),
      onKitchenEvent('order_cancelled', loadOrders),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [loadOrders])

  useEffect(() => {
    if (view !== 'new') return
    menu.products().then((data) => setProducts(data.items ?? data)).catch(console.error)
    menu.categories().then((data) => setCategories(data.items ?? data)).catch(console.error)
  }, [view])

  function openNew() {
    setCart([])
    setTable('')
    setSearch('')
    setActiveCat(null)
    setView('new')
  }

  const filteredProducts = products.filter((p) => {
    if (!p.is_active || !p.is_available) return false
    if (activeCat && p.category_id !== activeCat) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) return prev.map((i) => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { product, qty: 1 }]
    })
  }

  function updateQty(productId, delta) {
    setCart((prev) =>
      prev.map((i) => i.product.id === productId ? { ...i, qty: i.qty + delta } : i)
        .filter((i) => i.qty > 0)
    )
  }

  const total = cart.reduce((sum, i) => sum + Number(i.product.price) * i.qty, 0)

  async function handleSubmit() {
    if (!cart.length) return
    setSubmitting(true)
    try {
      await orders.create({
        branch_id: user.branch_id,
        order_type: 'dine_in',
        table_number: table || null,
        items: cart.map((i) => ({ product_id: i.product.id, quantity: i.qty })),
      })
      setView('list')
      loadOrders()
    } catch (err) {
      console.error('[order]', err)
      alert(err.response?.data?.detail || 'Ошибка создания заказа')
    } finally {
      setSubmitting(false)
    }
  }

  if (view === 'new') {
    return (
      <div className="mode-layout">
        <header className="mode-topbar">
          <button className="icon-btn" onClick={() => setView('list')}><ArrowLeft size={20} /></button>
          <h2>Новый заказ</h2>
        </header>

        <main className="waiter-new">
          <div className="waiter-catalog">
            <div className="catalog-controls">
              <input
                className="catalog-search"
                placeholder="Поиск блюда..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {categories.length > 0 && (
                <div className="catalog-cats">
                  <button
                    className={`cat-chip ${!activeCat ? 'active' : ''}`}
                    onClick={() => setActiveCat(null)}
                  >Все</button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      className={`cat-chip ${activeCat === c.id ? 'active' : ''}`}
                      onClick={() => setActiveCat(c.id)}
                    >{c.name}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="catalog-grid">
              {filteredProducts.length === 0 ? (
                <p className="empty-text" style={{ gridColumn: '1/-1' }}>Нет блюд</p>
              ) : filteredProducts.map((p) => (
                <button key={p.id} className="catalog-item" onClick={() => addToCart(p)}>
                  <span className="catalog-name">{p.name}</span>
                  <span className="catalog-price">{Number(p.price).toLocaleString()} сум</span>
                </button>
              ))}
            </div>
          </div>

          <div className="waiter-cart">
            <div className="cart-table-input">
              <label>Стол</label>
              <input
                value={table}
                onChange={(e) => setTable(e.target.value)}
                placeholder="Номер стола"
              />
            </div>

            <div className="cart-items">
              {cart.length === 0 ? (
                <p className="cart-empty">Добавьте блюда из каталога</p>
              ) : cart.map((item) => (
                <div key={item.product.id} className="cart-item">
                  <span className="cart-item-name">{item.product.name}</span>
                  <div className="qty-controls">
                    <button onClick={() => updateQty(item.product.id, -1)}><Minus size={14} /></button>
                    <span>{item.qty}</span>
                    <button onClick={() => updateQty(item.product.id, 1)}><Plus size={14} /></button>
                  </div>
                  <span className="cart-item-price">
                    {(Number(item.product.price) * item.qty).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div className="cart-footer">
                <div className="cart-total">
                  Итого: <strong>{total.toLocaleString()} сум</strong>
                </div>
                <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Создание...' : 'Создать заказ'}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="mode-layout">
      <header className="mode-topbar">
        <button className="icon-btn" onClick={onBack}><ArrowLeft size={20} /></button>
        <h2>Официант</h2>
        <button className="btn-new-order" onClick={openNew}>
          <Plus size={16} /> Новый заказ
        </button>
      </header>

      <main className="waiter-orders">
        {loading ? (
          <p className="loading-text">Загрузка заказов...</p>
        ) : orderList.length === 0 ? (
          <p className="empty-text">Нет активных заказов</p>
        ) : (
          <div className="order-grid">
            {orderList.map((order) => (
              <div key={order.id} className="order-card">
                <div className="order-card-header">
                  <span className="order-number">#{order.order_number}</span>
                  <span className={`order-status status-${order.status}`}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>
                {order.table_number && <p className="order-table">Стол {order.table_number}</p>}
                <ul className="order-items-preview">
                  {(order.items ?? []).slice(0, 3).map((item) => (
                    <li key={item.id}>{item.name} ×{item.quantity}</li>
                  ))}
                  {(order.items ?? []).length > 3 && (
                    <li className="more-items">+{(order.items ?? []).length - 3} ещё</li>
                  )}
                </ul>
                <p className="order-total">{Number(order.total_amount).toLocaleString()} сум</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
