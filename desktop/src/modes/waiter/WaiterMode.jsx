import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Minus, Search, X, Users, Clock, CheckCircle, Coffee, Utensils,
  LayoutGrid, Armchair, DoorClosed, Sun, Wine, CalendarClock, RefreshCw, LogOut,
} from 'lucide-react'
import { orders, menu, halls as hallsApi } from '../../shared/api'
import DishModal from '../../components/DishModal'

const STATUS_LABELS = {
  new: 'Новый', accepted: 'Принят', cooking: 'Готовится',
  ready: 'Готов', completed: 'Закрыт', cancelled: 'Отменён',
}
const STATUS_COLORS = {
  new: 'var(--color-info)', accepted: 'var(--color-brand)',
  cooking: 'var(--color-warning)', ready: 'var(--color-success)',
}
const ACTIVE_STATUSES = new Set(['new', 'accepted', 'cooking', 'ready', 'pending'])

const TABLE_LABELS = { free: 'Свободен', busy: 'Занят', ready: 'Готов' }

function zoneIcon(name = '') {
  const n = name.toLowerCase()
  if (n.includes('террас')) return Sun
  if (n.includes('бар')) return Wine
  if (n.includes('кабин')) return DoorClosed
  if (n.includes('бронь') || n.includes('бран')) return CalendarClock
  return Armchair
}
function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || 'U'
}
function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export default function WaiterMode({ user = {}, branch = {}, onBack, onLogout }) {
  const [zones, setZones] = useState([])          // [{id,name,tables:[...]}]
  const [orderList, setOrderList] = useState([])
  const [activeZone, setActiveZone] = useState('all')
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState('floor')        // floor | detail | new
  const [selectedTable, setSelectedTable] = useState(null)

  // Создание заказа
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [activeCat, setActiveCat] = useState(null)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [orderNote, setOrderNote] = useState('')
  const [guests, setGuests] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [dishModal, setDishModal] = useState(null)

  const loadData = useCallback(() => {
    hallsApi.list(user.branch_id)
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.items || []
        setZones(list.length ? list : demoZones())
      })
      .catch(() => setZones(demoZones()))

    orders.list({ branch_id: user.branch_id })
      .then((data) => {
        const all = Array.isArray(data) ? data : data?.items || []
        setOrderList(all.filter((o) => ACTIVE_STATUSES.has(o.status)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user.branch_id])

  useEffect(() => {
    loadData()
    const id = setInterval(loadData, 20000)
    return () => clearInterval(id)
  }, [loadData])

  useEffect(() => {
    if (view !== 'new') return
    menu.products().then((d) => setProducts(Array.isArray(d) ? d : d?.items || [])).catch(() => {})
    menu.categories().then((d) => setCategories(Array.isArray(d) ? d : d?.items || [])).catch(() => {})
  }, [view])

  // ── Данные столов ──
  const allTables = zones.flatMap((z) =>
    (z.tables || []).map((t) => ({ ...t, zoneId: z.id, zoneName: z.name }))
  )
  function orderFor(number) {
    return orderList.find((o) => String(o.table_number) === String(number))
  }
  function tableStatus(number) {
    const o = orderFor(number)
    if (!o) return 'free'
    return o.status === 'ready' ? 'ready' : 'busy'
  }

  const zoneNav = [
    { id: 'all', name: 'Все', count: allTables.length, Icon: LayoutGrid },
    ...zones.map((z) => ({ id: z.id, name: z.name, count: (z.tables || []).length, Icon: zoneIcon(z.name) })),
  ]
  const shownZones = activeZone === 'all' ? zones : zones.filter((z) => z.id === activeZone)
  const busyCount = allTables.filter((t) => tableStatus(t.number) !== 'free').length
  const shownCount = (activeZone === 'all' ? allTables : allTables.filter((t) => t.zoneId === activeZone)).length

  function handleTableTap(table) {
    const o = orderFor(table.number)
    if (o) {
      setSelectedTable({ ...table, order: o })
      setView('detail')
    } else {
      openNewOrder(table)
    }
  }
  function openNewOrder(table) {
    setSelectedTable(table)
    setCart([]); setOrderNote(''); setGuests(1); setSearch(''); setActiveCat(null)
    setView('new')
  }

  // ── Каталог/корзина ──
  const filteredProducts = products.filter((p) => {
    if (p.is_active === false) return false
    if (activeCat && p.category_id !== activeCat) return false
    if (search && !(p.name || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  function addFromModal({ product, quantity, price, note }) {
    setCart((prev) => [...prev, { lineId: `${Date.now()}-${Math.random()}`, product, qty: quantity, price, note }])
    setDishModal(null)
  }
  function updateQty(lineId, d) {
    setCart((prev) => prev.map((i) => i.lineId === lineId ? { ...i, qty: i.qty + d } : i).filter((i) => i.qty > 0))
  }
  const cartTotal = cart.reduce((s, i) => s + Number(i.price || 0) * i.qty, 0)

  async function submitOrder() {
    if (!cart.length) return
    setSubmitting(true)
    try {
      await orders.create({
        branch_id: user.branch_id,
        order_type: 'dine_in',
        table_number: selectedTable?.number != null ? String(selectedTable.number) : null,
        guests_count: guests,
        note: orderNote || null,
        items: cart.map((i) => ({ product_id: i.product.id, quantity: i.qty, price: i.price, note: i.note || null })),
      })
      setView('floor'); loadData()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Ошибка создания заказа')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="floor">
      {/* Сайдбар локаций */}
      <aside className="ws-side">
        <div className="ws-side__label">Локации</div>
        <nav className="ws-side__nav">
          {zoneNav.map(({ id, name, count, Icon }) => (
            <button
              key={id}
              className={`zone ${activeZone === id ? 'zone--active' : ''}`}
              onClick={() => { setActiveZone(id); setView('floor') }}
            >
              <Icon size={20} />
              <span className="zone__name">{name}</span>
              <span className="zone__count">{count}</span>
            </button>
          ))}
        </nav>
        <div className="ws-side__spacer" />
        <button className="zone" onClick={onBack}>
          <RefreshCw size={20} />
          <span className="zone__name">Сменить режим</span>
        </button>
        <div className="ws-user">
          <div className="ws-user__avatar">{initials(user?.name)}</div>
          <div className="ws-user__meta">
            <span className="ws-user__name">{user?.name || 'Сотрудник'}</span>
            <span className="ws-user__role">{user?.role_label || 'Официант'}</span>
          </div>
        </div>
      </aside>

      {/* Основная область */}
      <main className="ws__main">
        {view === 'floor' && (
          <>
            <div className="board__head">
              <div className="board__title">
                <h2>{activeZone === 'all' ? 'Все столы' : (zones.find((z) => z.id === activeZone)?.name || 'Зал')}</h2>
                <span className="board__subtitle">{shownCount} столов · {busyCount} занято</span>
              </div>
              <div className="board__head-right">
                <div className="legend">
                  <span className="legend__item"><span className="legend__swatch legend__swatch--free" /> Свободен</span>
                  <span className="legend__item"><span className="legend__swatch legend__swatch--busy" /> Занят</span>
                  <span className="legend__item"><span className="legend__swatch legend__swatch--check" /> Готов</span>
                </div>
                <button className="btn btn--primary btn--sm" onClick={() => openNewOrder(null)}>
                  <Plus size={18} /> Новый заказ
                </button>
              </div>
            </div>

            <div className="board__scroll">
              {loading ? (
                <p className="empty-text">Загрузка...</p>
              ) : shownZones.length === 0 ? (
                <p className="empty-text">Нет залов. Добавьте их в веб-админке.</p>
              ) : shownZones.map((z) => (
                <section className="tgroup" key={z.id}>
                  <div className="tgroup__title">{z.name} <span>{(z.tables || []).length} столов</span></div>
                  <div className="tgrid">
                    {(z.tables || []).map((t) => {
                      const o = orderFor(t.number)
                      const st = tableStatus(t.number)
                      const variant = st === 'free' ? 'free' : st === 'ready' ? 'check' : 'busy'
                      return (
                        <button key={t.id ?? t.number} className={`tcard tcard--${variant}`} onClick={() => handleTableTap(t)}>
                          <div className="tcard__top">
                            <span className="tcard__num">{t.number}</span>
                            <span className="tcard__seats"><Users /> {t.capacity || t.seats || 4}</span>
                          </div>
                          {o ? (
                            <>
                              <span className="tcard__client">Заказ #{o.order_number ?? ''}</span>
                              <span className="tcard__meta">
                                <Clock /> {formatTime(o.created_at)}
                                {o.total_amount != null && (
                                  <span className="tcard__amount">{Number(o.total_amount).toLocaleString('ru-RU')} сум</span>
                                )}
                              </span>
                            </>
                          ) : (
                            <div className="tcard__spacer" />
                          )}
                          <span className="tcard__status">{TABLE_LABELS[st]}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}

        {view === 'detail' && selectedTable && (
          <div className="waiter-detail">
            <header className="waiter-detail__header">
              <button className="btn-ghost" onClick={() => setView('floor')}><X size={20} /> Назад</button>
              <h2>Стол {selectedTable.number}</h2>
              <span className="status-badge" style={{ background: STATUS_COLORS[selectedTable.order?.status] || 'var(--color-text-muted)' }}>
                {STATUS_LABELS[selectedTable.order?.status] || ''}
              </span>
            </header>
            <div className="waiter-detail__order">
              <div className="waiter-detail__meta">
                <span>Заказ #{selectedTable.order?.order_number}</span>
                <span><Clock size={14} /> {formatTime(selectedTable.order?.created_at)}</span>
                <span>{Number(selectedTable.order?.total_amount || 0).toLocaleString('ru-RU')} сум</span>
              </div>
              <ul className="waiter-detail__items">
                {(selectedTable.order?.items ?? []).map((item) => (
                  <li key={item.id} className={`detail-item detail-item--${item.status || 'new'}`}>
                    <span className="detail-item__qty">×{item.quantity}</span>
                    <span className="detail-item__name">{item.name || item.product_name}</span>
                    <span className="detail-item__status">
                      {item.status === 'ready' && <CheckCircle size={16} />}
                      {item.status === 'cooking' && <Coffee size={16} />}
                      {STATUS_LABELS[item.status] || item.status || ''}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="waiter-detail__actions">
                <button className="btn-primary btn--lg" onClick={() => openNewOrder(selectedTable)}>
                  <Plus size={18} /> Добавить блюда
                </button>
                {selectedTable.order?.status === 'ready' && (
                  <button className="btn-success btn--lg" onClick={async () => {
                    try { await orders.updateStatus(selectedTable.order.id, 'completed') } catch {}
                    setView('floor'); loadData()
                  }}>
                    <CheckCircle size={18} /> Закрыть заказ
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'new' && (
          <div className="waiter-new-order">
            <header className="waiter-new-order__header">
              <button className="btn-ghost" onClick={() => setView('floor')}><X size={20} /></button>
              <h2>{selectedTable ? `Стол ${selectedTable.number}` : 'Без стола'}{' · Новый заказ'}</h2>
            </header>
            <div className="waiter-new-order__body">
              <div className="waiter-catalog">
                <div className="waiter-catalog__search">
                  <Search size={18} />
                  <input placeholder="Поиск блюда..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  {search && <button className="btn-icon-sm" onClick={() => setSearch('')}><X size={16} /></button>}
                </div>
                <div className="waiter-catalog__cats">
                  <button className={`cat-btn ${!activeCat ? 'cat-btn--active' : ''}`} onClick={() => setActiveCat(null)}>Все</button>
                  {categories.map((c) => (
                    <button key={c.id} className={`cat-btn ${activeCat === c.id ? 'cat-btn--active' : ''}`} onClick={() => setActiveCat(c.id)}>{c.name}</button>
                  ))}
                </div>
                <div className="waiter-catalog__grid">
                  {filteredProducts.length === 0 ? (
                    <p className="empty-text">Нет блюд</p>
                  ) : filteredProducts.map((p) => (
                    <button key={p.id} className="product-tile" onClick={() => setDishModal(p)}>
                      <Utensils size={20} />
                      <span className="product-tile__name">{p.name}</span>
                      <span className="product-tile__price">{Number(p.price || 0).toLocaleString('ru-RU')}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="waiter-cart">
                <div className="waiter-cart__meta">
                  <label>Гостей:
                    <input type="number" min="1" max="20" value={guests} onChange={(e) => setGuests(Number(e.target.value) || 1)} />
                  </label>
                  <input className="waiter-cart__note" placeholder="Комментарий к заказу..." value={orderNote} onChange={(e) => setOrderNote(e.target.value)} />
                </div>
                <div className="waiter-cart__items">
                  {cart.length === 0 ? (
                    <p className="empty-text">Добавьте блюда</p>
                  ) : cart.map((item) => (
                    <div key={item.lineId} className="cart-row">
                      <div className="cart-row__info">
                        <span className="cart-row__name">{item.product.name}</span>
                        {item.note && <span className="cart-row__note">{item.note}</span>}
                      </div>
                      <div className="cart-row__qty">
                        <button onClick={() => updateQty(item.lineId, -1)}><Minus size={16} /></button>
                        <span>{item.qty}</span>
                        <button onClick={() => updateQty(item.lineId, 1)}><Plus size={16} /></button>
                      </div>
                      <span className="cart-row__sum">{(Number(item.price || 0) * item.qty).toLocaleString('ru-RU')}</span>
                    </div>
                  ))}
                </div>
                {cart.length > 0 && (
                  <div className="waiter-cart__footer">
                    <div className="waiter-cart__total">Итого: <strong>{cartTotal.toLocaleString('ru-RU')} сум</strong></div>
                    <button className="btn-primary btn--xl" onClick={submitOrder} disabled={submitting}>
                      {submitting ? 'Отправка...' : 'Отправить на кухню'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {dishModal && (
        <DishModal product={dishModal} onAdd={addFromModal} onClose={() => setDishModal(null)} />
      )}
    </div>
  )
}

function demoZones() {
  const mk = (n, seats, num) => ({ id: `d${num}`, number: num, capacity: seats })
  return [
    { id: 'z-hall', name: 'Зал', tables: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => mk(n, 4, n)) },
    { id: 'z-terrace', name: 'Терраса', tables: [9, 10, 11, 12].map((n) => mk(n, 4, n)) },
    { id: 'z-cabin', name: 'Кабина', tables: [13, 14].map((n) => mk(n, 6, n)) },
  ]
}
