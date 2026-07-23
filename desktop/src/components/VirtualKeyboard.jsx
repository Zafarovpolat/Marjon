import { useState, useEffect, useCallback, useRef } from 'react'
import { Delete, ArrowBigUp, CornerDownLeft, X } from 'lucide-react'

// Раскладки 1:1 по референсу: верхний ряд цифр + спец-клавиши справа.
const LAYOUTS = {
  en: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'backspace', 'lang', 'sym'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '+', '@', '_'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '/', '=', 'shift'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '!', '?', 'space'],
  ],
  ru: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'backspace', 'lang', 'sym'],
    ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
    ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э', 'shift'],
    ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', ',', '.', 'space'],
  ],
  sym: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'backspace', 'lang', 'abc'],
    ['@', '#', '$', '%', '&', '*', '(', ')', '-', '+', '=', '/'],
    ['!', '?', ':', ';', '"', "'", '_', '\\', '|', '~', '`', 'shift'],
    ['<', '>', '[', ']', '{', '}', '№', '€', '₽', ',', '.', 'space'],
  ],
}

const SPECIAL = new Set(['shift', 'backspace', 'enter', 'space', 'lang', 'sym', 'abc'])

export default function VirtualKeyboard({ onVisibilityChange }) {
  const [layout, setLayout] = useState('ru')
  const [shifted, setShifted] = useState(false)
  const [activeInput, setActiveInput] = useState(null)
  const lastAlpha = useRef('ru')

  useEffect(() => {
    function onFocusIn(e) {
      const el = e.target
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.type === 'password' && el.dataset.keyboard !== 'ru' && el.dataset.keyboard !== 'en') {
          // пароли/пины часто цифровые — но оставим текущую раскладку
        }
        setActiveInput(el)
      }
    }
    function onFocusOut() {
      setTimeout(() => {
        const a = document.activeElement
        if (a?.tagName !== 'INPUT' && a?.tagName !== 'TEXTAREA') setActiveInput(null)
      }, 100)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  useEffect(() => { onVisibilityChange?.(!!activeInput) }, [activeInput, onVisibilityChange])

  function close() { activeInput?.blur(); setActiveInput(null) }

  const setNativeValue = useCallback((el, next, caret) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(el, next)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    if (caret != null) el.setSelectionRange(caret, caret)
  }, [])

  const handleKey = useCallback((key) => {
    if (!activeInput) return
    const el = activeInput
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const val = el.value

    switch (key) {
      case 'backspace': {
        if (start === end && start > 0) setNativeValue(el, val.slice(0, start - 1) + val.slice(end), start - 1)
        else if (start !== end) setNativeValue(el, val.slice(0, start) + val.slice(end), start)
        break
      }
      case 'enter':
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
        break
      case 'space':
        setNativeValue(el, val.slice(0, start) + ' ' + val.slice(end), start + 1)
        break
      case 'shift': setShifted((s) => !s); return
      case 'lang': { const next = layout === 'ru' ? 'en' : 'ru'; lastAlpha.current = next; setLayout(next); return }
      case 'sym': setLayout('sym'); return
      case 'abc': setLayout(lastAlpha.current || 'ru'); return
      default: {
        const ch = shifted ? key.toUpperCase() : key
        setNativeValue(el, val.slice(0, start) + ch + val.slice(end), start + ch.length)
        if (shifted) setShifted(false)
      }
    }
    el.focus()
  }, [activeInput, shifted, layout, setNativeValue])

  if (!activeInput) return null
  const rows = LAYOUTS[layout] || LAYOUTS.ru
  const langLabel = layout === 'ru' ? 'RU' : layout === 'en' ? 'EN' : 'RU'

  return (
    <div className="vkb" onMouseDown={(e) => e.preventDefault()}>
      <div className="vkb__bar">
        <span className="vkb__hint">Раскладка: {langLabel}</span>
        <div className="vkb__bar-actions">
          <button className="vkb__enter" onClick={() => handleKey('enter')} title="Ввод">
            <CornerDownLeft size={20} /> Ввод
          </button>
          <button className="vkb__close" onClick={close} title="Скрыть"><X size={18} /></button>
        </div>
      </div>

      <div className="vkb__rows">
        {rows.map((row, ri) => (
          <div className="vkb__row" key={ri}>
            {row.map((key, ki) => {
              const isDigit = /^[0-9]$/.test(key) && (layout === 'ru' || layout === 'en')
              const cls = [
                'vkb__key',
                key === 'space' && 'vkb__key--space',
                key === 'backspace' && 'vkb__key--backspace',
                key === 'shift' && 'vkb__key--shift',
                key === 'lang' && 'vkb__key--lang',
                (key === 'sym' || key === 'abc') && 'vkb__key--fn',
                isDigit && 'vkb__key--num',
                shifted && key === 'shift' && 'vkb__key--active',
                SPECIAL.has(key) && key !== 'space' && 'vkb__key--special',
              ].filter(Boolean).join(' ')
              return (
                <button key={`${ri}-${ki}`} className={cls} onClick={() => handleKey(key)}>
                  {label(key, shifted, langLabel)}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function label(key, shifted, langLabel) {
  switch (key) {
    case 'backspace': return <Delete size={22} />
    case 'shift': return <ArrowBigUp size={22} />
    case 'space': return ''
    case 'lang': return langLabel
    case 'sym': return '+#='
    case 'abc': return 'АБВ'
    default: return shifted ? key.toUpperCase() : key
  }
}
