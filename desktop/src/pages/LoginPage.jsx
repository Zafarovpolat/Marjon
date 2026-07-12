import { useState } from 'react'
import { auth } from '../shared/api'

export default function LoginPage({ onLogin }) {
  const [serverUrl, setServerUrl] = useState(
    () => localStorage.getItem('marjon_server_url') || 'http://localhost:8000/api/v1'
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    localStorage.setItem('marjon_server_url', serverUrl.trim())
    try {
      const tokens = await auth.login(email.trim(), password)
      // Store token first so the /auth/me call can use it
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
        <h1>Marjon</h1>
        <p className="login-subtitle">Терминал</p>
        <form onSubmit={handleSubmit}>
          <label>Адрес сервера</label>
          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://192.168.1.x:8000/api/v1"
          />
          <label>Email или телефон</label>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="+998901234567 или admin@marjon.uz"
            required
          />
          <label>Пароль</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
