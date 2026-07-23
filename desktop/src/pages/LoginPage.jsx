import { useState, useRef } from 'react'
import { auth } from '../shared/api'
import { Eye, EyeOff, Delete, LogOut } from 'lucide-react'
import VirtualKeyboard from '../components/VirtualKeyboard'

// Оставляет только 9 локальных цифр номера (отбрасывает код страны 998)
function extractPhoneDigits(raw) {
  let d = String(raw).replace(/\D/g, '')
  if (d.startsWith('998')) d = d.slice(3)
  return d.slice(0, 9)
}

// Форматирует цифры в маску: +998 XX XXX-XX-XX
function formatPhone(digits) {
  let out = '+998'
  if (digits.length > 0) out += ' ' + digits.slice(0, 2)
  if (digits.length > 2) out += ' ' + digits.slice(2, 5)
  if (digits.length > 5) out += '-' + digits.slice(5, 7)
  if (digits.length > 7) out += '-' + digits.slice(7, 9)
  return out
}

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
  // Храним только 9 локальных цифр номера; отображаем через маску
  const [phoneDigits, setPhoneDigits] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)

  const phoneComplete = phoneDigits.length === 9

  async function handleSubmit(e) {
    e.preventDefault()
    if (!phoneComplete) {
      setError('Введите номер телефона полностью')
      return
    }
    setError('')
    setLoading(true)
    try {
      // Бэкенд нормализует 9-значный номер в +998XXXXXXXXX
      const tokens = await auth.login('+998' + phoneDigits, password)
      localStorage.setItem('marjon_token', tokens.access_token)
      const user = await auth.me()
      onLogin({ ...tokens, user })
    } catch (err) {
      localStorage.removeItem('marjon_token')
      setError(err.response?.data?.detail || 'Неверный телефон или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Сдвигаем карточку вверх, когда открыта клавиатура, чтобы поле было видно */}
      <div className={`login-card ${kbOpen ? 'login-card--kb-open' : ''}`}>
        <div className="login-card__header">
          <div className="login-card__logo">MARJON</div>
          <p className="login-card__subtitle">Настройка терминала</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-field__label">Номер телефона</label>
            <input
              className="login-field__input"
              type="tel"
              inputMode="numeric"
              value={formatPhone(phoneDigits)}
              onChange={(e) => setPhoneDigits(extractPhoneDigits(e.target.value))}
              placeholder="+998 90 123-45-67"
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
        </form>
      </div>

      <VirtualKeyboard
        onVisibilityChange={setKbOpen}
      />
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
    if (pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    setError('')
    if (next.length === 4) handlePinSubmit(next)
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
            {[0, 1, 2, 3].map(i => (
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
