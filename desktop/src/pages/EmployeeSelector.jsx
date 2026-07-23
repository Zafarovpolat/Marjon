import { useState, useEffect } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { auth } from '../shared/api'
import { t } from '../shared/i18n'

export const ROLE_LABELS = {
  owner: 'Владелец', manager: 'Менеджер', cashier: 'Кассир', waiter: 'Официант',
  cook: 'Повар', chef: 'Шеф-повар', kitchen: 'Кухня', bartender: 'Бармен',
  courier: 'Курьер', accountant: 'Бухгалтер', admin: 'Администратор',
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'
}
// Стабильный цвет аватара по имени
const AVATAR_COLORS = ['#1db5b5', '#2563eb', '#7c3aed', '#f59e0b', '#16a34a', '#ef4444', '#0e8080', '#e11d48']
function avatarColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export default function EmployeeSelector({ branch, onSelect, onBack }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  function load() {
    setLoading(true); setError(false)
    auth.staffUsers(branch?.id)
      .then((data) => {
        const list = (Array.isArray(data) ? data : data?.items || []).filter((u) => u.is_active !== false)
        setStaff(list.length ? list : DEMO_STAFF)
      })
      .catch(() => { setStaff(DEMO_STAFF); setError(true) })
      .finally(() => setLoading(false))
  }
  useEffect(load, [branch?.id])

  return (
    <div className="emp-screen">
      <div className="emp-screen__panel">
        <header className="emp-screen__header">
          <button className="icon-btn" onClick={onBack} title="Назад"><ArrowLeft size={22} /></button>
          <div className="emp-screen__titles">
            <h1>{t('choose_employee')}</h1>
            <p>{branch?.name || 'Филиал'}</p>
          </div>
          <button className="icon-btn" onClick={load} title="Обновить"><RefreshCw size={20} /></button>
        </header>

        {loading ? (
          <div className="emp-screen__state"><div className="spinner" /><p>Загрузка...</p></div>
        ) : (
          <div className="emp-grid">
            {staff.map((u) => {
              const role = u.role_slug || (u.role_slugs && u.role_slugs[0])
              return (
                <button key={u.id} className="emp-card" onClick={() => onSelect(u)}>
                  <span className="emp-card__avatar" style={{ background: avatarColor(u.name || u.email) }}>
                    {initials(u.name || u.email)}
                  </span>
                  <span className="emp-card__name">{u.name || u.email}</span>
                  <span className="emp-card__role">{ROLE_LABELS[role] || 'Сотрудник'}</span>
                </button>
              )
            })}
          </div>
        )}
        {error && <p className="emp-screen__note">Показаны демо-сотрудники (нет связи с сервером)</p>}
      </div>
    </div>
  )
}

const DEMO_STAFF = [
  { id: 'd1', name: 'Сардор Хамидов', role_slug: 'cashier', is_active: true },
  { id: 'd2', name: 'Зохида Каримова', role_slug: 'waiter', is_active: true },
  { id: 'd3', name: 'Азиз Рахимов', role_slug: 'cook', is_active: true },
  { id: 'd4', name: 'Дилноза Юсупова', role_slug: 'waiter', is_active: true },
  { id: 'd5', name: 'Женис Абдуллаев', role_slug: 'manager', is_active: true },
]
