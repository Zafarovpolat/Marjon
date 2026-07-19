import { ShoppingCart, ChefHat, UtensilsCrossed, Wine, LogOut, ArrowLeft } from 'lucide-react'

const MODES = [
  {
    id: 'cashier',
    label: 'Касса',
    description: 'Приём заказов и оплата',
    icon: ShoppingCart,
    color: 'var(--color-brand)',
  },
  {
    id: 'kitchen',
    label: 'Кухня',
    description: 'Приготовление заказов',
    icon: ChefHat,
    color: 'var(--color-status-overdue)',
  },
  {
    id: 'waiter',
    label: 'Официант',
    description: 'Обслуживание столов',
    icon: UtensilsCrossed,
    color: 'var(--color-status-ok)',
  },
  {
    id: 'bar',
    label: 'Бар',
    description: 'Напитки и коктейли',
    icon: Wine,
    color: '#9333ea',
  },
]

export default function ModeSelector({ user, branch, onSelect, onBack, onLogout }) {
  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 680 }}>
        <div className="login-header">
          <button className="icon-btn" onClick={onBack} title="Назад к филиалам">
            <ArrowLeft size={22} />
          </button>
          <div className="login-header__info">
            <h1 className="login-logo">Рабочее место</h1>
            <p className="login-subtitle">{branch?.name}</p>
          </div>
          <button className="icon-btn" onClick={onLogout} title="Выйти">
            <LogOut size={22} />
          </button>
        </div>

        <p className="branch-hint">Выберите режим работы</p>

        <div className="mode-grid">
          {MODES.map(({ id, label, description, icon: Icon, color }) => (
            <button
              key={id}
              className="mode-card"
              onClick={() => onSelect(id)}
            >
              <div className="mode-card__icon" style={{ background: color }}>
                <Icon size={36} color="#fff" strokeWidth={1.8} />
              </div>
              <div className="mode-card__text">
                <span className="mode-card__label">{label}</span>
                <span className="mode-card__desc">{description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
