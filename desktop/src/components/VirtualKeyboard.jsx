import { useState, useEffect, useCallback, useRef } from 'react'
import { Delete, Globe, ArrowBigUp, Space, CornerDownLeft, X } from 'lucide-react'

const LAYOUTS = {
  en: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
    ['lang', 'num', 'space', '.', 'enter'],
  ],
  ru: [
    ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х'],
    ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
    ['shift', 'я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'backspace'],
    ['lang', 'num', 'space', '.', 'enter'],
  ],
  num: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
    ['sym', '.', ',', '?', '!', "'", '+', '=', '%', 'backspace'],
    ['lang', 'abc', 'space', '.', 'enter'],
  ],
  sym: [
    ['[', ']', '{', '}', '#', '^', '*', '+', '='],
    ['_', '\\', '|', '~', '<', '>', '€', '£', '¥'],
    ['num', '.', ',', '?', '!', "'", '-', '/', 'backspace'],
    ['lang', 'abc', 'space', '.', 'enter'],
  ],
  url: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
    ['://', 'http', '.com', '.', '/', ':', '-', '_', 'enter'],
  ],
}

const SPECIAL_KEYS = new Set([
  'shift', 'backspace', 'enter', 'space', 'lang', 'num', 'abc', 'sym',
])

export default function VirtualKeyboard({ onVisibilityChange }) {
  const [layout, setLayout] = useState('ru')
  const [shifted, setShifted] = useState(false)
  const [activeInput, setActiveInput] = useState(null)
  const keyboardRef = useRef(null)

  useEffect(() => {
    function handleFocusIn(e) {
      const el = e.target
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        setActiveInput(el)
        const kbType = el.dataset.keyboard
        if (kbType && LAYOUTS[kbType]) {
          setLayout(kbType)
        }
      }
    }

    function handleFocusOut(e) {
      setTimeout(() => {
        const active = document.activeElement
        if (active?.tagName !== 'INPUT' && active?.tagName !== 'TEXTAREA') {
          setActiveInput(null)
        }
      }, 100)
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  // Уведомляем родителя об открытии/закрытии — чтобы он сдвинул экран
  useEffect(() => {
    onVisibilityChange?.(!!activeInput)
  }, [activeInput, onVisibilityChange])

  // Закрытие клавиатуры: снимаем фокус с поля и прячем панель
  function handleClose() {
    activeInput?.blur()
    setActiveInput(null)
  }

  const handleKey = useCallback((key) => {
    if (!activeInput) return

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set

    const el = activeInput
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const val = el.value

    switch (key) {
      case 'backspace': {
        if (start === end && start > 0) {
          const next = val.slice(0, start - 1) + val.slice(end)
          nativeInputValueSetter?.call(el, next)
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.setSelectionRange(start - 1, start - 1)
        } else if (start !== end) {
          const next = val.slice(0, start) + val.slice(end)
          nativeInputValueSetter?.call(el, next)
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.setSelectionRange(start, start)
        }
        break
      }
      case 'enter': {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
        break
      }
      case 'space': {
        const next = val.slice(0, start) + ' ' + val.slice(end)
        nativeInputValueSetter?.call(el, next)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.setSelectionRange(start + 1, start + 1)
        break
      }
      case 'shift': {
        setShifted(s => !s)
        return
      }
      case 'lang': {
        setLayout(l => l === 'ru' ? 'en' : 'ru')
        return
      }
      case 'num': {
        setLayout('num')
        return
      }
      case 'sym': {
        setLayout('sym')
        return
      }
      case 'abc': {
        setLayout('ru')
        return
      }
      default: {
        const char = shifted ? key.toUpperCase() : key
        const next = val.slice(0, start) + char + val.slice(end)
        nativeInputValueSetter?.call(el, next)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.setSelectionRange(start + char.length, start + char.length)
        if (shifted) setShifted(false)
        break
      }
    }

    el.focus()
  }, [activeInput, shifted])

  if (!activeInput) return null

  const currentLayout = LAYOUTS[layout] || LAYOUTS.ru

  return (
    <div className="vkb" ref={keyboardRef} onMouseDown={(e) => e.preventDefault()}>
      <div className="vkb__header">
        <span className="vkb__lang">{layout.toUpperCase()}</span>
        <button className="vkb__close" onClick={handleClose}>
          <X size={18} />
        </button>
      </div>

      <div className="vkb__rows">
        {currentLayout.map((row, rowIdx) => (
          <div className="vkb__row" key={rowIdx}>
            {row.map((key, keyIdx) => {
              const isSpecial = SPECIAL_KEYS.has(key)
              const isWide = key === 'space'
              const isMedium = ['backspace', 'shift', 'enter', 'lang', 'num', 'abc', 'sym'].includes(key)
              const isMultiChar = key.length > 1 && !isSpecial

              return (
                <button
                  key={`${rowIdx}-${keyIdx}`}
                  className={[
                    'vkb__key',
                    isWide && 'vkb__key--wide',
                    isMedium && 'vkb__key--medium',
                    isMultiChar && 'vkb__key--multi',
                    shifted && key === 'shift' && 'vkb__key--active',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleKey(key)}
                >
                  {renderKeyLabel(key, shifted)}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function renderKeyLabel(key, shifted) {
  switch (key) {
    case 'backspace': return <Delete size={22} />
    case 'shift': return <ArrowBigUp size={22} />
    case 'space': return <Space size={22} />
    case 'enter': return <CornerDownLeft size={22} />
    case 'lang': return <Globe size={18} />
    case 'num': return '123'
    case 'abc': return 'АБВ'
    case 'sym': return '#+=  '
    default: return shifted ? key.toUpperCase() : key
  }
}
