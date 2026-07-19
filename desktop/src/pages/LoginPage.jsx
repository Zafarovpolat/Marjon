import { useState } from 'react'
import { auth } from '../shared/api'
import { Eye, EyeOff, Delete, Settings, LogOut } from 'lucide-react'

/**
 * LoginPage — двухрежимная страница входа.
 *
 * mode="admin" — первый вход: логин/пароль + настройка сервера.
 *   Привязывает терминал к организации.
 *
 * mode="pin" — ежедневный вход сотрудников по PIN.
 *   Показывается когда терминал уже привязан.
 */
export default function LoginPage({ mode = 'admin', onLogin, onReset, branchName, orgName }) {
  if (mode === 'pin') {
    return <PinLogin onLogin={onLogin} onReset={onReset} branchName={branchName} orgName={orgName} />
  }
  return <AdminLogin onLogin={onLogin} />
}

// ═══════════════════════════════════════════════════
// Админ-вход (логин + пароль)
// ═══════════════════════════════════════════════════
function AdminLogin({ onLogin }) {
  const [serverUrl, setServerUrl] = useState(
    () => localStorage.getItem('marjon_server_url') || 'http://localhost:8000/api/v1'
  )
  const [showServer, setShowServer] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    localStorage.setItem('marjon_server_url', serverUrl.trim())
    try {
      const tokens = await auth.login(email.trim(), password)
      localStorage.setItem('marjon_token', tokens.access_token)
      const user = await auth.me()
      onLogin({ ...tokens, user })
    } catch (err) {
      localStorage.removeItem('marjon_token')
      setError(err.response?.data?.detail || 'Неверный email или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <div className="login-card__logo">MARJON</div>
          <p className="login-card__subtitle">Настройка терминала</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-field__label">Email или телефон</label>
            <input
              className="login-field__input"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="+998901234567"
              required
              autoComplete="username"
            />
          </div>

          <div className="login-field">
            <label className="login-field__label">Пароль</label>
            <div className="login-field__password-wrap">
              <input
                className="login-field__input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-field__eye"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Вход...' : 'Привязать терминал'}
          </button>

          <button
            type="button"
            className="login-form__server-toggle"
            onClick={() => setShowServer(!showServer)}
          >
            <Settings size={16} />
            {showServer ? 'Скрыть настройки' : 'Адрес сервера'}
          </button>

          {showServer && (
            <div className="login-field">
              <label className="login-field__label">Сервер API</label>
              <input
                className="login-field__input"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://192.168.1.x:8000/api/v1"
              />
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════
// PIN-вход сотрудников
// ═══════════════════════════════════════════════════
function PinLogin({ onLogin, onReset, branchName, orgName }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handlePinSubmit(pinValue) {
    if (pinValue.length < 4) return
    setError('')
    setLoading(true)
    try {
      const tokens = await auth.loginByPin(pinValue)
      localStorage.setItem('marjon_token', tokens.access_token)
      const user = await auth.me()
      onLogin({ ...tokens, user })
    } catch (err) {
      localStorage.removeItem('marjon_token')
      setPin('')
      setError('Неверный PIN-код')
    } finally {
      setLoading(false)
    }
  }

  function handleDigit(digit) {
    if (pin.length >= 6) return
    const next = pin + digit
    setPin(next)
    setError('')
    if (next.length >= 4) handlePinSubmit(next)
  }

  function handleBackspace() {
    setPin(prev => prev.slice(0, -1))
    setError('')
  }

  return (
    <div className="login-page">
      <div className="login-card login-card--pin">
        <div className="login-card__header">
          <div className="login-card__logo">MARJON</div>
          {orgName && <p className="login-card__org">{orgName}</p>}
          {branchName && <p className="login-card__subtitle">{branchName}</p>}
        </div>

        <div className="login-pin">
          <p className="login-pin__hint">Введите PIN для входа</p>

          <div className="login-pin__dots">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className={`login-pin__dot ${i < pin.length ? 'login-pin__dot--filled' : ''} ${error && pin.length === 0 ? 'login-pin__dot--error' : ''}`}
              />
            ))}
          </div>

          {error && <p className="login-error">{error}</p>}

          <div className="login-pin__pad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'back'].map((key, idx) => {
              if (key === null) return <div key={idx} className="login-pin__key--empty" />
              if (key === 'back') {
                return (
                  <button
                    key={idx}
                    className="login-pin__key login-pin__key--action"
                    onClick={handleBackspace}
                    disabled={loading}
                  >
                    <Delete size={24} />
                  </button>
                )
              }
              return (
                <button
                  key={idx}
                  className="login-pin__key"
                  onClick={() => handleDigit(String(key))}
                  disabled={loading}
                >
                  {key}
                </button>
              )
            })}
          </div>
        </div>

        {onReset && (
          <button className="login-reset-btn" onClick={onReset}>
            <LogOut size={16} />
            Сменить организацию
          </button>
        )}
      </div>
    </div>
  )
}
