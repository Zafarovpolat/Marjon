import { useState, useEffect, useRef } from 'react'
import { MoreVertical } from 'lucide-react'

/**
 * HeaderMenu — компактный дропдаун для действий шапки.
 * Собирает разделы (Финансы / История / Отчёты и т.п.) в одно меню рядом с профилем.
 * items: [{ id, label, Icon, onClick }]. Закрывается по клику вне и по Esc.
 */
export default function HeaderMenu({ label, Icon = MoreVertical, items = [] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!items.length) return null

  return (
    <div className="hmenu" ref={ref}>
      <button className={`btn btn--outline btn--sm ${open ? 'is-active' : ''}`} onClick={() => setOpen((v) => !v)}>
        <Icon size={18} />
        {label}
      </button>
      {open && (
        <div className="hmenu__dropdown" role="menu">
          {items.map(({ id, label: itemLabel, Icon: ItemIcon, onClick }) => (
            <button
              key={id}
              className="hmenu__item"
              role="menuitem"
              onClick={() => { setOpen(false); onClick?.() }}
            >
              {ItemIcon && <ItemIcon size={18} />}
              <span>{itemLabel}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
