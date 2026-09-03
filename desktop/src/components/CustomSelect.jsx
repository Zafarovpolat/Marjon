import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

/**
 * Кастомный селект вместо нативного <select> (единый вид с .cal-field):
 * кнопка с текущим значением → дропдаун со списком опций. Клик вне и Esc — закрыть.
 *
 * Пропсы:
 *  - value: выбранное значение ('' = ничего/плейсхолдер);
 *  - onChange(value): колбэк выбора;
 *  - options: массив строк ИЛИ { value, label };
 *  - placeholder: текст кнопки, когда значение не найдено среди опций;
 *  - className: доп. класс контейнера (напр. 'rep-filter' для ширины).
 */
export default function CustomSelect({ value, onChange, options = [], placeholder = '', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Нормализуем опции к { value, label }
  const items = options.map((o) => (o && typeof o === 'object' ? o : { value: o, label: String(o) }))
  const current = items.find((o) => o.value === value)

  // Клик вне селекта и Esc закрывают дропдаун
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className={`cselect ${className}`} ref={ref}>
      <button type="button" className="input cselect__btn" onClick={() => setOpen((v) => !v)}>
        <span className="cselect__value">{current ? current.label : placeholder}</span>
        <ChevronDown size={16} className={`cselect__caret ${open ? 'cselect__caret--open' : ''}`} />
      </button>
      {open && (
        <div className="cselect__pop" role="listbox">
          {items.map((o) => (
            <button
              type="button"
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`cselect__opt ${o.value === value ? 'cselect__opt--active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              <span className="cselect__opt-label">{o.label}</span>
              {o.value === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
