import { useEffect, useState } from 'react'

/**
 * Тосты — короткие уведомления ВНИЗУ экрана (вместо alert-окон).
 * Используется для ошибок печати и прочих сбоев, чтобы не отрывать
 * кассира от работы модальным окном браузера.
 *
 * toast('Текст')           — ошибка (красный)
 * toast('Текст', 'ok')     — успех (зелёный)
 */
export function toast(message, kind = 'error') {
  window.dispatchEvent(new CustomEvent('marjon:toast', { detail: { message, kind } }))
}

let seq = 0

export default function ToastHost() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const onToast = (e) => {
      const id = ++seq
      const { message, kind } = e.detail || {}
      if (!message) return
      setItems((prev) => [...prev.slice(-3), { id, message, kind: kind || 'error' }])
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4500)
    }
    window.addEventListener('marjon:toast', onToast)
    return () => window.removeEventListener('marjon:toast', onToast)
  }, [])

  if (!items.length) return null
  return (
    <div className="toast-stack">
      {items.map((i) => (
        <div key={i.id} className={`toast toast--${i.kind}`}>{i.message}</div>
      ))}
    </div>
  )
}
