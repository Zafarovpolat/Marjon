import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Search, Plus, Minus, Trash2, CreditCard, Banknote,
  Printer, X, ShoppingBag, Percent, UserPlus, ScanLine
} from 'lucide-react'
import { orders, menu, printers as printersApi } from '../../shared/api'
import { onPrintJob } from '../../shared/ws'

export default function CashierMode({ user, onBack, onLogout }) {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [printerMap, setPrinterMap] = useState({})
  const [payModal, setPayModal] = useState(false)
  const [orderType, setOrderType] = useState('dine_in')
  const [tableNumber, setTableNumber] = useState('')
  const [note, setNote] = useState('')
  const [discount, setDiscount] = useState(0)
  const searchRef = useRef(null)

  // Загрузка меню и принтеров
  useEffect(() => {
    Promise.all([
      menu.categories().catch(() => []),
      menu.products().catch(() => []),
      printersApi.list().catch(() => []),
    ]).then(([cats, prods, printerList]) => {
      const catList = cats.items ?? cats ?? []
      const prodList = prods.items ?? prods ?? []
      setCategories(catList)
      setProducts(prodList)
      if (catList.length > 0) setActiveCategory(catList[0].id)

      const map = {}
      ;(printerList.items ?? printerList ?? []).forEach(p => { map[p.id] = p })
      setPrinterMap(map)
    }).finally(() => setLoading(false))
  }, [])

  // Печать через Electron
  useEffect(() => {
    return onPrintJob(async (msg) => {
      if (msg.event !== 'print_job') return
      const printer = printerMap[msg.printer_id]
      if (!printer) return
      try {
        await window.electron.print({
          ip: printer.ip_address,
          port: printer.port ?? 9100,
          payloadBase64: msg.payload,
          copies: msg.copies ?? 1,
        })
        await printersApi.jobDone(msg.job_id)
      } catch (err) {
        console.error('[print]', err)
      }
    })
  }, [printerMap])

  // Фильтрация товаров
  const filteredProducts = products.filter(p => {
    if (search) {
      const q = search.toLowerCase()
      return p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
    }
    return activeCategory ? p.category_id === activeCategory : true
  })

  // Управление корзиной
  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id)
      if (existing) {
        return prev.map(item =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        quantity: 1,
      }]
    })
  }

  function updateQty(productId, delta) {
    setCart(prev => prev
      .map(item => item.product_id === productId
        ? { ...item, quantity: item.quantity + delta }
        : item
      )
      .filter(item => item.quantity > 0)
    )
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(item => item.product_id !== productId))
  }

  function clearCart() {
    setCart([])
    setDiscount(0)
    setNote('')
    setTableNumber('')
  }

  // Итоги
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const discountAmount = subtotal * (discount / 100)
  const total = subtotal - discountAmount
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  // Оплата
  async function handlePayment(method) {
    if (cart.length === 0) return
    setPayModal(false)

    const orderData = {
      branch_id: user.branch_id,
      order_type: orderType,
      table_number: tableNumber || undefined,
      note: note || undefined,
      discount_percent: discount || undefined,
      payment_method: method,
      items: cart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
      })),
    }

    try {
      const order = await orders.create(orderData)
      // Печать чека
      const receiptPrinter = Object.values(printerMap).find(
        p => p.printer_type === 'receipt' && p.branch_id === user.branch_id
      )
      if (receiptPrinter) {
        await printersApi.printReceipt({
          order_id: order.id,
          printer_id: receiptPrinter.id,
          copies: 1,
        }).catch(() => {})
      }
      clearCart()
    } catch (err) {
      console.error('[order]', err)
      alert('Ошибка создания заказа: ' + (err.response?.data?.detail || err.message))
    }
  }

  if (loading) {
    return (
      <div className="cashier-loading">
        <div className="spinner" />
        <p>Загрузка меню...</p>
      </div>
    )
  }

  return (
    <div className="cashier-layout">
      {/* Колонка 1 — Категории */}
      <aside className="cashier-categories">
        <div className="cashier-categories__header">
          <span className="cashier-categories__title">Меню</span>
        </div>
        <div className="cashier-categories__list">
          <button
            className={`category-btn ${!activeCategory ? 'category-btn--active' : ''}`}
            onClick={() => { setActiveCategory(null); setSearch('') }}
          >
            Все
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`category-btn ${activeCategory === cat.id ? 'category-btn--active' : ''}`}
              onClick={() => { setActiveCategory(cat.id); setSearch('') }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </aside>

      {/* Колонка 2 — Товары */}
      <main className="cashier-products">
        <div className="cashier-products__search">
          <Search size={20} className="search-icon" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Поиск блюда..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>
              <X size={18} />
            </button>
          )}
        </div>

        <div className="cashier-products__grid">
          {filteredProducts.length === 0 ? (
            <p className="empty-text">Нет блюд в этой категории</p>
          ) : (
            filteredProducts.map(product => (
              <button
                key={product.id}
                className="product-card"
                onClick={() => addToCart(product)}
              >
                {product.image_url && (
                  <img
                    src={product.image_url}
                    alt=""
                    className="product-card__img"
                    loading="lazy"
                  />
                )}
                <span className="product-card__name">{product.name}</span>
                <span className="product-card__price">
                  {Number(product.price || 0).toLocaleString()} сум
                </span>
                {product.in_stop_list && (
                  <span className="product-card__stop">СТОП</span>
                )}
              </button>
            ))
          )}
        </div>
      </main>

      {/* Колонка 3 — Корзина */}
      <aside className="cashier-cart">
        <div className="cashier-cart__header">
          <ShoppingBag size={20} />
          <span>Заказ</span>
          <span className="cart-count">{itemCount}</span>

          <div className="cashier-cart__type">
            <button
              className={`type-btn ${orderType === 'dine_in' ? 'type-btn--active' : ''}`}
              onClick={() => setOrderType('dine_in')}
            >
              В зале
            </button>
            <button
              className={`type-btn ${orderType === 'takeaway' ? 'type-btn--active' : ''}`}
              onClick={() => setOrderType('takeaway')}
            >
              С собой
            </button>
            <button
              className={`type-btn ${orderType === 'delivery' ? 'type-btn--active' : ''}`}
              onClick={() => setOrderType('delivery')}
            >
              Доставка
            </button>
          </div>
        </div>

        {orderType === 'dine_in' && (
          <input
            type="text"
            className="table-input"
            placeholder="Стол №"
            value={tableNumber}
            onChange={e => setTableNumber(e.target.value)}
          />
        )}

        <div className="cashier-cart__items">
          {cart.length === 0 ? (
            <p className="cart-empty">Корзина пуста</p>
          ) : (
            cart.map(item => (
              <div key={item.product_id} className="cart-item">
                <div className="cart-item__info">
                  <span className="cart-item__name">{item.name}</span>
                  <span className="cart-item__price">
                    {(item.price * item.quantity).toLocaleString()} сум
                  </span>
                </div>
                <div className="cart-item__controls">
                  <button
                    className="qty-btn"
                    onClick={() => updateQty(item.product_id, -1)}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="qty-value">{item.quantity}</span>
                  <button
                    className="qty-btn"
                    onClick={() => updateQty(item.product_id, 1)}
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    className="qty-btn qty-btn--delete"
                    onClick={() => removeFromCart(item.product_id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Скидка */}
        {cart.length > 0 && (
          <div className="cashier-cart__discount">
            <Percent size={16} />
            <input
              type="number"
              min="0"
              max="100"
              value={discount || ''}
              onChange={e => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
              placeholder="Скидка %"
              className="discount-input"
            />
          </div>
        )}

        {/* Итог */}
        <div className="cashier-cart__total">
          {discount > 0 && (
            <div className="total-row total-row--sub">
              <span>Подытог</span>
              <span>{subtotal.toLocaleString()} сум</span>
            </div>
          )}
          {discount > 0 && (
            <div className="total-row total-row--discount">
              <span>Скидка {discount}%</span>
              <span>−{discountAmount.toLocaleString()} сум</span>
            </div>
          )}
          <div className="total-row total-row--final">
            <span>Итого</span>
            <span>{total.toLocaleString()} сум</span>
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="cashier-cart__actions">
          <button
            className="cart-btn cart-btn--pay"
            disabled={cart.length === 0}
            onClick={() => setPayModal(true)}
          >
            <CreditCard size={20} />
            Оплата
          </button>
          <button
            className="cart-btn cart-btn--clear"
            disabled={cart.length === 0}
            onClick={clearCart}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </aside>

      {/* Модал оплаты */}
      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(false)}>
          <div className="modal pay-modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3>Оплата</h3>
              <button className="icon-btn" onClick={() => setPayModal(false)}>
                <X size={22} />
              </button>
            </div>
            <div className="pay-modal__total">
              <span>К оплате:</span>
              <strong>{total.toLocaleString()} сум</strong>
            </div>
            <div className="pay-modal__methods">
              <button className="pay-method-btn" onClick={() => handlePayment('cash')}>
                <Banknote size={32} />
                <span>Наличные</span>
              </button>
              <button className="pay-method-btn" onClick={() => handlePayment('card')}>
                <CreditCard size={32} />
                <span>Карта</span>
              </button>
              <button className="pay-method-btn" onClick={() => handlePayment('mixed')}>
                <Banknote size={24} />
                <CreditCard size={24} />
                <span>Смешанная</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
