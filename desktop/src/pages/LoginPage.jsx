import { useState } from 'react'
import { auth } from '../shared/api'
import { Eye, EyeOff, Delete, LogOut } from 'lucide-react'
import { t } from '../shared/i18n'
import { formatPhone, fullPhone, isPhoneComplete, extractPhoneDigits } from '../shared/phone'

/**
 * LoginPage — двухрежимная страница входа.
 *
 * mode="admin" — первый вход на кассе: 6.2 — логин/пароль ФИЛИАЛА (не владельца).
 *   Логин филиала глобально уникален → определяет и организацию, и филиал за один
 *   шаг (без выбора филиала). Личный логин владельца сотрудникам не показывается.
 *
 * mode="pin" — ежедневный вход сотрудников по PIN.
 *   Показывается когда терминал уже привязан к филиалу.
 */
export default function LoginPage({ mode = 'admin', onLogin, onReset, branchName, orgName }) {
  if (mode === 'pin') {
    return <PinLogin onLogin={onLogin} onReset={onReset} branchName={branchName} orgName={orgName} />
  }
  return <BranchLogin onLogin={onLogin} />
}

// ═══════════════════════════════════════════════════
// Вход по телефону/паролю филиала (6.2) — один шаг, без выбора филиала.
// Логин филиала — номер телефона под маской +998 XX XXX-XX-XX (как в 1.4).
// ═══════════════════════════════════════════════════
function BranchLogin({ onLogin }) {
  const [phone, setPhone] = useState('')          // 9 локальных цифр номера филиала
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isPhoneComplete(phone)) {
      setError(t('lp_phone_incomplete'))
      return
    }
    if (!password) {
      setError(t('lp_branch_bad_creds'))
      return
    }
    setError('')
    setLoading(true)
    try {
      // Логин филиала — номер телефона в каноничном виде (+998XXXXXXXXX).
      // Ответ несёт токен терминала филиала + сведения о branch/company —
      // App сохранит всё атомарно и сразу перейдёт к PIN-входу сотрудника.
      const data = await auth.loginByBranch(fullPhone(phone), password)
      onLogin(data)
    } catch (err) {
      setError(err.response?.data?.detail || t('lp_branch_bad_creds'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <div className="login-card__logo">MARJON</div>
          <p className="login-card__subtitle">{t('lp_branch_subtitle')}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-field__label">{t('lp_branch_login')}</label>
            <input
              className="login-field__input"
              type="tel"
              inputMode="tel"
              value={formatPhone(phone)}
              onChange={(e) => setPhone(extractPhoneDigits(e.target.value))}
              placeholder={t('lp_branch_login_ph')}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div className="login-field">
            <label className="login-field__label">{t('lp_password')}</label>
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
            {loading ? t('lp_logging_in') : t('lp_branch_enter')}
          </button>
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
      setError(t('lp_bad_pin'))
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
          <p className="login-pin__hint">{t('lp_enter_pin_hint')}</p>

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
            {t('change_org')}
          </button>
        )}
      </div>
    </div>
  )
}
