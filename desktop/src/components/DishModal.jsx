import { useState } from 'react'
import { X, Plus, Minus } from 'lucide-react'

/**
 * DishModal — окно добавления блюда: количество, цена за порцию, комментарий.
 * onAdd({ product, quantity, price, note }).
 */
export default function DishModal({ product, onAdd, onClose }) {
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState(Number(product?.price) || 0)
  const [note, setNote] = useState('')
  if (!product) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal dish-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>{product.name}</h3>
          <button className="icon-btn" onClick={onClose}><X size={22} /></button>
        </div>

        <div className="dish-modal__body">
          <div className="dish-modal__row">
            <label>Количество</label>
            <div className="qty-stepper">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus size={18} /></button>
              <span>{qty}</span>
              <button onClick={() => setQty((q) => q + 1)}><Plus size={18} /></button>
            </div>
          </div>

          <div className="dish-modal__row">
            <label>Цена за порцию (сум)</label>
            <input
              type="number" min="0" step="500"
              value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
              className="input dish-modal__price"
            />
          </div>

          <div className="dish-modal__row dish-modal__row--col">
            <label>Комментарий к блюду</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input dish-modal__note"
              placeholder="Например: без лука, острее, отдельно соус…"
              rows={2}
            />
          </div>

          <div className="dish-modal__total">
            Итого: <strong>{(qty * price).toLocaleString('ru-RU')} сум</strong>
          </div>
        </div>

        <div className="dish-modal__actions">
          <button className="btn btn--outline" onClick={onClose}>Отмена</button>
          <button className="btn btn--primary" onClick={() => onAdd({ product, quantity: qty, price, note })}>
            <Plus size={18} /> Добавить
          </button>
        </div>
      </div>
    </div>
  )
}
