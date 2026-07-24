import { useEffect, useState, useCallback } from 'react'
import {
  Search, Plus, Minus, Trash2, CreditCard, Banknote, X, ShoppingBag, Bike, Utensils,
  Percent, LayoutGrid, Armchair, DoorClosed, Sun, Wine, CalendarClock, ArrowLeft, Users, Clock, Wallet, History, BarChart3, ChefHat,
} from 'lucide-react'
import { orders, menu, halls as hallsApi, printers as printersApi } from '../../shared/api'
import { onPrintJob } from '../../shared/ws'
import DishModal from '../../components/DishModal'
import FinancePanel from '../../components/FinancePanel'
import HistoryPanel from '../../components/HistoryPanel'
import ReportsPanel from '../../components/ReportsPanel'
import RecipeModal from '../../components/RecipeModal'
import PaymentModal from '../../components/PaymentModal'
import { t } from '../../shared/i18n'

const ACTIVE = new Set(['new', 'accepted', 'cooking', 'ready', 'pending'])

function zoneIcon(name = '') {
  const n = name.toLowerCase()
  if (n.includes('террас')) return Sun
  if (n.includes('бар')) return Wine
  if (n.includes('кабин')) return DoorClosed
  if (n.includes('бронь')) return CalendarClock
  return Armchair
}
function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'
}
function fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '' }

export default function CashierMode({ user = {}, onBack }) {
  const [zones, setZones] = useState([])
  const [orderList, setOrderList] = useState([])
  const [activeZone, setActiveZone] = useState('all')
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState('floor')        // floor | order
  const [orderType, setOrderType] = useState('dine_in')
  const [selectedTable, setSelectedTable] = useState(null)

  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [activeCat, setActiveCat] = useState(null)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [discount, setDiscount] = useState(0)
  const [editLine, setEditLine] = useState(null)
  const [payModal, setPayModal] = useState(false)
  const [finOpen, setFinOpen] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [repOpen, setRepOpen] = useState(false)
  const [recipeProd, setRecipeProd] = useState(null)
  const [payExisting, setPayExisting] = useState(null)   // существующий заказ на оплату/закрытие
  const [printerMap, setPrinterMap] = useState({})

  const loadFloor = useCallback(() => {
    hallsApi.list(user.branch_id)
      .then((d) => { const l = Array.isArray(d) ? d : d?.items || []; setZones(l.length ? l : demoZones()) })
      .catch(() => setZones(demoZones()))
    orders.list({ branch_id: user.branch_id })
      .then((d) => { const all = Array.isArray(d) ? d : d?.items || []; setOrderList(all.filter((o) => ACTIVE.has(o.status))) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user.branch_id])

  useEffect(() => {
    loadFloor()
    const id = setInterval(loadFloor, 20000)
    return () => clearInterval(id)
  }, [loadFloor])

  useEffect(() => {
    Promise.all([menu.categories().catch(() => []), menu.products().catch(() => []), printersApi.list().catch(() => [])])
      .then(([cats, prods, pl]) => {
        setCategories(cats.items ?? cats ?? [])
        setProducts(prods.items ?? prods ?? [])
        const map = {}; (pl.items ?? pl ?? []).forEach((p) => { map[p.id] = p }); setPrinterMap(map)
      })
  }, [])

  useEffect(() => {
    return onPrintJob(async (msg) => {
      if (msg.event !== 'print_job') return
      const printer = printerMap[msg.printer_id]
      if (!printer) return
      try {
        await window.electron?.print({ ip: printer.ip_address, port: printer.port ?? 9100, payloadBase64: msg.payload, copies: msg.copies ?? 1 })
        await printersApi.jobDone(msg.job_id)
      } catch (err) { console.error('[print]', err) }
    })
  }, [printerMap])

  // ── Столы ──
  const allTables = zones.flatMap((z) => (z.tables || []).map((t) => ({ ...t, zoneId: z.id, zoneName: z.name })))
  const orderFor = (num) => orderList.find((o) => String(o.table_number) === String(num))
  const tableStatus = (num) => { const o = orderFor(num); return !o ? 'free' : o.status === 'ready' ? 'ready' : 'busy' }
  const freeCount = (list) => list.filter((t) => tableStatus(t.number) === 'free').length
  const zoneNav = [
    { id: 'all', name: t('all'), count: freeCount(allTables), Icon: LayoutGrid },
    ...zones.map((z) => ({ id: z.id, name: z.name, count: freeCount(z.tables || []), Icon: zoneIcon(z.name) })),
  ]
  const shownZones = activeZone === 'all' ? zones : zones.filter((z) => z.id === activeZone)
  const busyCount = allTables.filter((t) => tableStatus(t.number) !== 'free').length

  function openOrder(type, table) {
    setOrderType(type); setSelectedTable(table || null)
    setCart([]); setDiscount(0); setSearch(''); setActiveCat(null)
    setView('order')
  }
  // Клик по столу: есть заказ (передан официантом) → оплата/закрытие; пусто → новый заказ
  function tapTable(tbl) {
    const o = orderFor(tbl.number)
    if (o) setPayExisting(o)
    else openOrder('dine_in', tbl)
  }

  // Чековый принтер филиала (привязка по IP — в админке организации)
  function receiptPrinter() {
    return Object.values(printerMap).find((p) => p.printer_type === 'receipt' && p.branch_id === user.branch_id)
  }
  async function printOrderReceipt(order) {
    const pr = receiptPrinter()
    if (!pr) { alert(t('no_receipt_printer')); return }
    try { await printersApi.printReceipt({ order_id: order.id, printer_id: pr.id, copies: 1 }) }
    catch (e) { alert(e?.response?.data?.detail || e.message) }
  }
  // Закрыть заказ (оплата подтверждена кассиром). Способ оплаты фиксируется вручную —
  // платёжку интегрируем позже; сейчас просто переводим заказ в completed.
  async function completeExistingOrder(order /* , method */) {
    try { await orders.updateStatus(order.id, 'completed') } catch { /* офлайн-очередь досошлёт */ }
    setPayExisting(null)
    loadFloor()
  }

  // ── Каталог/корзина ──
  const filtered = products.filter((p) => {
    if (search) { const q = search.toLowerCase(); return p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) }
    return activeCat ? p.category_id === activeCat : true
  })
  // Клик по блюду в меню — сразу в заказ (без модалки)
  function addToCart(product) {
    if (product.is_available === false || product.in_stop_list) return // в стоп-листе
    setCart((prev) => [...prev, { lineId: `${Date.now()}-${Math.random()}`, product, name: product.name, price: Number(product.price) || 0, qty: 1, note: '' }])
  }
  // Правка позиции В ЗАКАЗЕ (кол-во/цена/комментарий)
  function saveEdit({ quantity, price, note }) {
    setCart((prev) => prev.map((i) => i.lineId === editLine.lineId ? { ...i, qty: quantity, price, note } : i))
    setEditLine(null)
  }
  function updateQty(lineId, d) { setCart((prev) => prev.map((i) => i.lineId === lineId ? { ...i, qty: i.qty + d } : i).filter((i) => i.qty > 0)) }
  function removeLine(lineId) { setCart((prev) => prev.filter((i) => i.lineId !== lineId)) }

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const discountAmount = subtotal * (discount / 100)
  const total = subtotal - discountAmount
  const itemCount = cart.reduce((s, i) => s + i.qty, 0)

  async function handlePayment(method) {
    if (!cart.length) return
    setPayModal(false)
    try {
      const order = await orders.create({
        branch_id: user.branch_id,
        order_type: orderType,
        table_number: orderType === 'dine_in' && selectedTable?.number != null ? String(selectedTable.number) : undefined,
        discount_amount: discountAmount ? Math.round(discountAmount) : undefined,
        payment_method: method,
        items: cart.map((i) => ({ product_id: i.product.id, quantity: i.qty, price: i.price, note: i.note || null })),
      })
      const receiptPrinter = Object.values(printerMap).find((p) => p.printer_type === 'receipt' && p.branch_id === user.branch_id)
      if (receiptPrinter) await printersApi.printReceipt({ order_id: order.id, printer_id: receiptPrinter.id, copies: 1 }).catch(() => {})
      setView('floor'); loadFloor()
    } catch (err) {
      alert(t('create_order_error') + ': ' + (err.response?.data?.detail || err.message))
    }
  }

  // ═══ Вид: столы ═══
  if (view === 'floor') {
    return (
      <div className="floor">
        <aside className="ws-side">
          <div className="ws-side__label">{t('locations')}</div>
          <nav className="ws-side__nav">
            {zoneNav.map(({ id, name, count, Icon }) => (
              <button key={id} className={`zone ${activeZone === id ? 'zone--active' : ''}`} onClick={() => setActiveZone(id)}>
                <Icon size={20} /><span className="zone__name">{name}</span><span className="zone__count">{count}</span>
              </button>
            ))}
          </nav>
          <div className="ws-side__spacer" />
          <button className="zone" onClick={onBack}><ArrowLeft size={20} /><span className="zone__name">{t('switch_mode')}</span></button>
        </aside>

        <main className="ws__main">
          <div className="board__head">
            <div className="board__title">
              <h2>{t('tables')}</h2>
              <span className="board__subtitle">{allTables.length} {t('tables_low')} · {busyCount} {t('busy_low')}</span>
            </div>
            <div className="board__head-right">
              <button className="btn btn--outline btn--sm" onClick={() => openOrder('takeaway', null)}><ShoppingBag size={18} /> {t('takeaway')}</button>
              <button className="btn btn--outline btn--sm" onClick={() => openOrder('delivery', null)}><Bike size={18} /> {t('delivery')}</button>
              <button className="btn btn--outline btn--sm" onClick={() => setFinOpen(true)}><Wallet size={18} /> {t('finance')}</button>
              <button className="btn btn--outline btn--sm" onClick={() => setHistOpen(true)}><History size={18} /> {t('history')}</button>
              <button className="btn btn--outline btn--sm" onClick={() => setRepOpen(true)}><BarChart3 size={18} /> {t('reports')}</button>
            </div>
          </div>
          <div className="board__scroll">
            {loading ? <p className="empty-text">{t('loading')}</p> : shownZones.map((z) => (
              <section className="tgroup" key={z.id}>
                <div className="tgroup__title">{z.name} <span>{(z.tables || []).length} {t('tables_low')}</span></div>
                <div className="tgrid">
                  {(z.tables || []).map((tb) => {
                    const o = orderFor(tb.number); const st = tableStatus(tb.number)
                    const variant = st === 'free' ? 'free' : st === 'ready' ? 'check' : 'busy'
                    return (
                      <button key={tb.id ?? tb.number} className={`tcard tcard--${variant}`} onClick={() => tapTable(tb)}>
                        <div className="tcard__top">
                          <span className="tcard__num">{tb.number}</span>
                          <span className="tcard__seats"><Users /> {tb.capacity || 4}</span>
                        </div>
                        {o ? (
                          <><span className="tcard__client">{t('order_no')} #{o.order_number ?? ''}</span>
                            <span className="tcard__meta"><Clock /> {fmtTime(o.created_at)}
                              {o.total_amount != null && <span className="tcard__amount">{Number(o.total_amount).toLocaleString('ru-RU')} {t('currency')}</span>}
                            </span></>
                        ) : <div className="tcard__spacer" />}
                        <span className="tcard__status">{t(st)}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </main>
        {finOpen && <FinancePanel branch={{ id: user.branch_id }} onClose={() => setFinOpen(false)} />}
        {histOpen && <HistoryPanel branch={{ id: user.branch_id }} onClose={() => setHistOpen(false)} />}
        {repOpen && <ReportsPanel branch={{ id: user.branch_id }} onClose={() => setRepOpen(false)} />}
        {payExisting && (
          <PaymentModal
            order={payExisting}
            onPrint={printOrderReceipt}
            onComplete={completeExistingOrder}
            onClose={() => setPayExisting(null)}
          />
        )}
      </div>
    )
  }

  // ═══ Вид: заказ (меню + корзина) ═══
  return (
    <div className="floor">
      <aside className="ws-side">
        <div className="ws-side__label">{t('categories')}</div>
        <nav className="ws-side__nav">
          <button className={`zone ${!activeCat ? 'zone--active' : ''}`} onClick={() => setActiveCat(null)}>
            <LayoutGrid size={20} /><span className="zone__name">{t('all')}</span>
          </button>
          {categories.map((c) => (
            <button key={c.id} className={`zone ${activeCat === c.id ? 'zone--active' : ''}`} onClick={() => setActiveCat(c.id)}>
              <span className="zone__name">{c.name}</span>
            </button>
          ))}
        </nav>
        <div className="ws-side__spacer" />
        <button className="zone" onClick={() => setView('floor')}><ArrowLeft size={20} /><span className="zone__name">{t('to_tables')}</span></button>
      </aside>

      <main className="ws__main">
        <div className="board__head">
          <div className="board__title">
            <h2>
              {orderType === 'dine_in' ? (selectedTable ? `${t('table')} ${selectedTable.number}` : t('dine_in')) : t(orderType)}
            </h2>
            <span className="board__subtitle">{itemCount} {t('items_low')} · {total.toLocaleString('ru-RU')} {t('currency')}</span>
          </div>
          <div className="board__head-right">
            <div className="cashier-products__search" style={{ padding: 0, border: 'none' }}>
              <Search size={18} className="search-icon" />
              <input className="search-input" placeholder={t('search_dish')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="cashier-work">
          <div className="cashier-products">
            <div className="cashier-products__grid">
              {filtered.length === 0 ? <p className="empty-text">{t('no_dishes')}</p> : filtered.map((p) => {
                const stopped = p.is_available === false || p.in_stop_list
                return (
                  <div key={p.id} className="product-cell">
                    <button className={`product-card ${stopped ? 'product-card--stop' : ''}`} onClick={() => addToCart(p)}>
                      <span className="product-card__thumb">
                        {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <Utensils size={26} />}
                      </span>
                      <span className="product-card__name">{p.name}</span>
                      <span className="product-card__price">{Number(p.price || 0).toLocaleString('ru-RU')} {t('currency')}</span>
                      {stopped && <span className="product-card__stop">STOP</span>}
                    </button>
                    <button className="product-card__info" onClick={() => setRecipeProd(p)} title={t('tech_card')}><ChefHat size={15} /></button>
                  </div>
                )
              })}
            </div>
          </div>

          <aside className="cashier-cart">
            <div className="cashier-cart__header"><ShoppingBag size={20} /><span>{t('order')}</span><span className="cart-count">{itemCount}</span></div>
            <div className="cashier-cart__items">
              {cart.length === 0 ? <p className="cart-empty">{t('tap_dish_hint')}</p> : cart.map((item) => (
                <div key={item.lineId} className="cart-item">
                  <button type="button" className="cart-item__info" onClick={() => setEditLine(item)} title={t('edit')}>
                    <span className="cart-item__name">{item.name}</span>
                    {item.note && <span className="cart-row__note">{item.note}</span>}
                    <span className="cart-item__price">{(item.price * item.qty).toLocaleString('ru-RU')} {t('currency')}</span>
                  </button>
                  <div className="cart-item__controls">
                    <button className="qty-btn" onClick={() => updateQty(item.lineId, -1)}><Minus size={16} /></button>
                    <span className="qty-value">{item.qty}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.lineId, 1)}><Plus size={16} /></button>
                    <button className="qty-btn qty-btn--delete" onClick={() => removeLine(item.lineId)}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="cashier-cart__discount">
                <Percent size={16} />
                <input type="number" min="0" max="100" value={discount || ''} onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))} placeholder={t('discount')} className="discount-input" />
              </div>
            )}
            <div className="cashier-cart__total">
              {discount > 0 && <div className="total-row total-row--discount"><span>{t('discount_word')} {discount}%</span><span>−{discountAmount.toLocaleString('ru-RU')}</span></div>}
              <div className="total-row total-row--final"><span>{t('total')}</span><span>{total.toLocaleString('ru-RU')} {t('currency')}</span></div>
            </div>
            <div className="cashier-cart__actions">
              <button className="cart-btn cart-btn--pay" disabled={cart.length === 0} onClick={() => setPayModal(true)}><CreditCard size={20} /> {t('pay')}</button>
            </div>
          </aside>
        </div>
      </main>

      {editLine && (
        <DishModal
          product={editLine.product}
          line={editLine}
          onSubmit={saveEdit}
          onRemove={() => { removeLine(editLine.lineId); setEditLine(null) }}
          onClose={() => setEditLine(null)}
        />
      )}

      {recipeProd && <RecipeModal product={recipeProd} onClose={() => setRecipeProd(null)} />}

      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(false)}>
          <div className="modal pay-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header"><h3>{t('pay')}</h3><button className="icon-btn" onClick={() => setPayModal(false)}><X size={22} /></button></div>
            <div className="pay-modal__total"><span>{t('to_pay')}:</span><strong>{total.toLocaleString('ru-RU')} {t('currency')}</strong></div>
            <div className="pay-modal__methods">
              <button className="pay-method-btn" onClick={() => handlePayment('cash')}><Banknote size={32} /><span>{t('cash')}</span></button>
              <button className="pay-method-btn" onClick={() => handlePayment('card')}><CreditCard size={32} /><span>{t('card')}</span></button>
              <button className="pay-method-btn" onClick={() => handlePayment('mixed')}><Banknote size={24} /><CreditCard size={24} /><span>{t('mixed')}</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function demoZones() {
  const mk = (num, cap) => ({ id: `d${num}`, number: num, capacity: cap })
  return [
    { id: 'z-hall', name: 'Зал', tables: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => mk(n, 4)) },
    { id: 'z-terrace', name: 'Терраса', tables: [9, 10, 11, 12].map((n) => mk(n, 4)) },
  ]
}
