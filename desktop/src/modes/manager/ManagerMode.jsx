import { useState } from 'react'
import {
  ShoppingCart, UtensilsCrossed, Wallet, BarChart3, History, Ban, LogOut,
} from 'lucide-react'
import FinancePanel from '../../components/FinancePanel'
import HistoryPanel from '../../components/HistoryPanel'
import ReportsPanel from '../../components/ReportsPanel'
import StopListPanel from '../../components/StopListPanel'
import { t } from '../../shared/i18n'

export default function ManagerMode({ user = {}, branch = {}, onSwitchMode, onLogout }) {
  const [panel, setPanel] = useState(null)

  const nav = [
    { id: 'cashier', name: t('mode_cashier'), Icon: ShoppingCart, onClick: () => onSwitchMode?.('cashier') },
    { id: 'waiter', name: t('mode_waiter'), Icon: UtensilsCrossed, onClick: () => onSwitchMode?.('waiter') },
    { id: 'fin', name: t('finance'), Icon: Wallet, onClick: () => setPanel('fin') },
    { id: 'rep', name: t('reports'), Icon: BarChart3, onClick: () => setPanel('rep') },
    { id: 'hist', name: t('history'), Icon: History, onClick: () => setPanel('hist') },
    { id: 'stop', name: t('stoplist'), Icon: Ban, onClick: () => setPanel('stop') },
  ]

  return (
    <div className="floor">
      <aside className="ws-side">
        <div className="ws-side__label">{t('mode_manager')}</div>
        <nav className="ws-side__nav">
          {nav.map(({ id, name, Icon, active, onClick }) => (
            <button key={id} className={`zone ${active ? 'zone--active' : ''}`} onClick={onClick}>
              <Icon size={20} /><span className="zone__name">{name}</span>
            </button>
          ))}
        </nav>
        <div className="ws-side__spacer" />
        <button className="zone" onClick={onLogout}><LogOut size={20} /><span className="zone__name">{t('logout')}</span></button>
      </aside>

      <main className="ws__main">
        <div className="board__head">
          <div className="board__title">
            <h2>{t('mode_manager')}</h2>
            <span className="board__subtitle">{branch?.name || t('branch')} · {t('today')}</span>
          </div>
        </div>

        <div className="board__scroll">
          <p className="settings-hint mgr-hint">{t('manager_hint')}</p>
        </div>
      </main>

      {panel === 'fin' && <FinancePanel branch={branch} onClose={() => setPanel(null)} />}
      {panel === 'hist' && <HistoryPanel branch={branch} onClose={() => setPanel(null)} />}
      {panel === 'rep' && <ReportsPanel branch={branch} onClose={() => setPanel(null)} />}
      {panel === 'stop' && <StopListPanel user={user} onClose={() => setPanel(null)} />}
    </div>
  )
}
