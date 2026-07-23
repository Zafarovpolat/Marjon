import { useState } from 'react'
import { Server, Check, Wifi, WifiOff } from 'lucide-react'
import VirtualKeyboard from '../components/VirtualKeyboard'

/**
 * ServerSetup — экран первого запуска.
 * Показывается только один раз: когда в localStorage нет marjon_server_url.
 * IT-специалист вводит адрес сервера при установке терминала.
 */
export default function ServerSetup({ onComplete }) {
  const [url, setUrl] = useState('http://localhost:8000/api/v1')
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState(null) // 'ok' | 'error'
  const [error, setError] = useState('')
  const [kbOpen, setKbOpen] = useState(false)

  async function testConnection() {
    setTesting(true)
    setStatus(null)
    setError('')

    const baseUrl = url.trim().replace(/\/api\/v1\/?$/, '')

    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        setStatus('ok')
      } else {
        setStatus('error')
        setError(`Сервер ответил ${res.status}`)
      }
    } catch (err) {
      setStatus('error')
      setError('Не удалось подключиться к серверу')
    } finally {
      setTesting(false)
    }
  }

  function handleSave() {
    const trimmed = url.trim().replace(/\/+$/, '')
    localStorage.setItem('marjon_server_url', trimmed)
    onComplete()
  }

  return (
    <div className="login-page">
      <div className={`login-card ${kbOpen ? 'login-card--kb-open' : ''}`}>
        <div className="login-card__header">
          <div className="login-card__logo">MARJON</div>
          <p className="login-card__subtitle">Настройка терминала</p>
        </div>

        <div className="server-setup">
          <div className="server-setup__icon">
            <Server size={48} strokeWidth={1.5} />
          </div>

          <p className="server-setup__hint">
            Введите адрес сервера Marjon.
            Эту настройку выполняет IT-специалист при установке.
          </p>

          <div className="login-field">
            <label className="login-field__label">Адрес сервера</label>
            <input
              className="login-field__input"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setStatus(null) }}
              placeholder="http://192.168.1.100:8000/api/v1"
              data-keyboard="url"
            />
          </div>

          {status === 'ok' && (
            <div className="server-setup__status server-setup__status--ok">
              <Wifi size={18} />
              <span>Подключение успешно</span>
            </div>
          )}

          {status === 'error' && (
            <div className="server-setup__status server-setup__status--error">
              <WifiOff size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="server-setup__actions">
            <button
              className="login-btn login-btn--outline"
              onClick={testConnection}
              disabled={testing || !url.trim()}
            >
              {testing ? 'Проверка...' : 'Проверить соединение'}
            </button>

            <button
              className="login-btn"
              onClick={handleSave}
              disabled={!url.trim()}
            >
              <Check size={18} />
              Сохранить и продолжить
            </button>
          </div>
        </div>
      </div>

      <VirtualKeyboard onVisibilityChange={setKbOpen} />
    </div>
  )
}
