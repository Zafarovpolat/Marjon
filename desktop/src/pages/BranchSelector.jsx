import { useState, useEffect } from 'react'
import { LogOut, MapPin } from 'lucide-react'
import { companies } from '../shared/api'

export default function BranchSelector({ user, onSelect, onLogout }) {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    companies.branches()
      .then(setBranches)
      .catch(() => setError('Не удалось загрузить список филиалов'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mode-selector">
      <div className="mode-header">
        <div>
          <h1>Marjon</h1>
          <p>{user?.name || user?.email}</p>
        </div>
        <button className="icon-btn" onClick={onLogout} title="Выйти">
          <LogOut size={20} />
        </button>
      </div>

      <p className="mode-hint">Выберите филиал</p>

      {loading ? (
        <p className="loading-text">Загрузка...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : branches.length === 0 ? (
        <p className="empty-text">Нет доступных филиалов</p>
      ) : (
        <div className="branch-grid">
          {branches.map((b) => (
            <button
              key={b.id}
              className="branch-card"
              onClick={() => onSelect(b)}
            >
              <MapPin size={32} />
              <span className="branch-name">{b.name}</span>
              {b.city && <span className="branch-city">{b.city}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
