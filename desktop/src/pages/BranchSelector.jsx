import { useState, useEffect } from 'react'
import { LogOut, MapPin, RefreshCw, Building2 } from 'lucide-react'
import { companies } from '../shared/api'

export default function BranchSelector({ user, onSelect, onLogout }) {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    setError('')
    companies.branches()
      .then(data => setBranches(Array.isArray(data) ? data : []))
      .catch(() => setError('Не удалось загрузить список филиалов'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <div className="login-page">
      <div className="branch-selector">
        <div className="branch-selector__header">
          <div className="branch-selector__user">
            <Building2 size={28} className="brand-icon" />
            <div>
              <h1 className="branch-selector__title">Выберите филиал</h1>
              <p className="branch-selector__username">{user?.name || user?.email}</p>
            </div>
          </div>
          <div className="branch-selector__actions">
            <button className="icon-btn" onClick={load} title="Обновить">
              <RefreshCw size={22} />
            </button>
            <button className="icon-btn icon-btn--danger" onClick={onLogout} title="Выйти">
              <LogOut size={22} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="branch-selector__loading">
            <div className="spinner" />
            <p>Загрузка филиалов...</p>
          </div>
        ) : error ? (
          <div className="branch-selector__error">
            <p className="error">{error}</p>
            <button className="btn btn--outline" onClick={load}>Повторить</button>
          </div>
        ) : branches.length === 0 ? (
          <div className="branch-selector__empty">
            <MapPin size={48} strokeWidth={1.5} />
            <p>Нет доступных филиалов</p>
          </div>
        ) : (
          <div className="branch-grid">
            {branches.map((b) => (
              <button
                key={b.id}
                className="branch-card"
                onClick={() => onSelect(b)}
              >
                <div className="branch-card__icon">
                  <MapPin size={28} />
                </div>
                <div className="branch-card__info">
                  <span className="branch-card__name">{b.name}</span>
                  {b.address && <span className="branch-card__address">{b.address}</span>}
                  {b.city && <span className="branch-card__city">{b.city}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
