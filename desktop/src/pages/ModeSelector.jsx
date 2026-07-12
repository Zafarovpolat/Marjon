import { ShoppingCart, ChefHat, UtensilsCrossed, Wine, LogOut } from 'lucide-react'

const MODES = [
  { id: 'cashier', label: 'Касса',    icon: ShoppingCart, color: '#2563eb' },
  { id: 'waiter',  label: 'Официант', icon: UtensilsCrossed, color: '#16a34a' },
  { id: 'kitchen', label: 'Кухня',    icon: ChefHat,      color: '#dc2626' },
  { id: 'bar',     label: 'Бар',      icon: Wine,         color: '#7c3aed' },
]

export default function ModeSelector({ user, branch, onSelect, onLogout }) {
  return (
    <div className="mode-selector">
      <div className="mode-header">
        <div>
          <h1>Marjon</h1>
          <p>{user?.name || user?.email} — {branch?.name}</p>
        </div>
        <button className="icon-btn" onClick={onLogout} title="Выйти">
          <LogOut size={20} />
        </button>
      </div>

      <p className="mode-hint">Выберите рабочее место</p>

      <div className="mode-grid">
        {MODES.map(({ id, label, icon: Icon, color }) => (
          <button
            key={id}
            className="mode-card"
            style={{ '--accent': color }}
            onClick={() => onSelect(id)}
          >
            <Icon size={48} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
