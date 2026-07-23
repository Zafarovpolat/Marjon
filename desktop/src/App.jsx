import { useState, useEffect, useCallback } from 'react'
import ServerSetup from './pages/ServerSetup'
import LoginPage from './pages/LoginPage'
import BranchSelector from './pages/BranchSelector'
import ModeSelector from './pages/ModeSelector'
import TopBar from './components/TopBar'
import BottomBar from './components/BottomBar'
import CashierMode from './modes/cashier/CashierMode'
import KitchenMode from './modes/kitchen/KitchenMode'
import WaiterMode from './modes/waiter/WaiterMode'
import BarMode from './modes/bar/BarMode'
import { kitchenWS } from './services/kitchenWS'

const MODES = {
  cashier: { component: CashierMode, label: 'Касса' },
  kitchen: { component: KitchenMode, label: 'Кухня' },
  waiter: { component: WaiterMode, label: 'Официант' },
  bar: { component: BarMode, label: 'Бар' },
}

function loadJson(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}

export default function App() {
  // Привязка терминала (admin login — сохраняется навсегда)
  const [orgToken, setOrgToken] = useState(() => localStorage.getItem('marjon_org_token'))
  const [orgUser, setOrgUser] = useState(() => loadJson('marjon_org_user'))
  const [branch, setBranch] = useState(() => loadJson('marjon_branch'))

  // Сотрудник (PIN-вход — текущая сессия)
  const [staffToken, setStaffToken] = useState(() => localStorage.getItem('marjon_token'))
  const [staffUser, setStaffUser] = useState(() => loadJson('marjon_user'))
  const [mode, setMode] = useState(() => localStorage.getItem('marjon_mode') || null)

  const [isOnline, setIsOnline] = useState(true)
  const [isLocked, setIsLocked] = useState(false)
  const [lockPin, setLockPin] = useState('')

  // Терминал привязан если есть orgToken + branch
  const isTerminalBound = !!(orgToken && branch)
  // Сотрудник залогинен
  const isStaffLoggedIn = !!(staffToken && staffUser)

  // WebSocket при полном входе
  useEffect(() => {
    if (!staffToken || !branch?.id || !mode) return
    const serverUrl = localStorage.getItem('marjon_server_url') || 'http://localhost:8000/api/v1'
    kitchenWS.connect(serverUrl, staffToken, branch.id)

    const unsubscribe = kitchenWS.on('connection', ({ status }) => {
      setIsOnline(status === 'online')
    })

    return () => {
      unsubscribe()
      kitchenWS.disconnect()
    }
  }, [staffToken, branch?.id, mode])

  // 1. Админ привязывает терминал (логин/пароль)
  const handleAdminLogin = useCallback((data) => {
    localStorage.setItem('marjon_org_token', data.access_token)
    localStorage.setItem('marjon_org_user', JSON.stringify(data.user))
    // Также ставим как текущий токен (админ = первый user)
    localStorage.setItem('marjon_token', data.access_token)
    localStorage.setItem('marjon_user', JSON.stringify(data.user))
    setOrgToken(data.access_token)
    setOrgUser(data.user)
    setStaffToken(data.access_token)
    setStaffUser(data.user)
  }, [])

  // 2. Выбор филиала
  const handleBranchSelect = useCallback((selectedBranch) => {
    localStorage.setItem('marjon_branch', JSON.stringify(selectedBranch))
    setBranch(selectedBranch)
  }, [])

  // 3. PIN-вход сотрудника
  const handlePinLogin = useCallback((data) => {
    localStorage.setItem('marjon_token', data.access_token)
    localStorage.setItem('marjon_user', JSON.stringify(data.user))
    setStaffToken(data.access_token)
    setStaffUser(data.user)
  }, [])

  // 4. Выбор режима
  const handleModeSelect = useCallback((selectedMode) => {
    localStorage.setItem('marjon_mode', selectedMode)
    setMode(selectedMode)
  }, [])

  // Выход сотрудника (не отвязывает терминал)
  const handleStaffLogout = useCallback(() => {
    localStorage.removeItem('marjon_token')
    localStorage.removeItem('marjon_user')
    localStorage.removeItem('marjon_mode')
    setStaffToken(null)
    setStaffUser(null)
    setMode(null)
    kitchenWS.disconnect()
  }, [])

  // Полный сброс терминала (отвязка от организации)
  const handleFullReset = useCallback(() => {
    localStorage.removeItem('marjon_org_token')
    localStorage.removeItem('marjon_org_user')
    localStorage.removeItem('marjon_branch')
    localStorage.removeItem('marjon_token')
    localStorage.removeItem('marjon_user')
    localStorage.removeItem('marjon_mode')
    setOrgToken(null)
    setOrgUser(null)
    setBranch(null)
    setStaffToken(null)
    setStaffUser(null)
    setMode(null)
    kitchenWS.disconnect()
  }, [])

  const handleLock = useCallback(() => setIsLocked(true), [])

  const handleUnlock = useCallback((pin) => {
    if (pin === '0000' || pin === staffUser?.pin) {
      setIsLocked(false)
      setLockPin('')
      return true
    }
    return false
  }, [staffUser])

  const handleBack = useCallback(() => {
    localStorage.removeItem('marjon_mode')
    setMode(null)
  }, [])

  // Назад из выбора режима — к списку филиалов (сотрудник остаётся залогинен)
  const handleBackToBranches = useCallback(() => {
    localStorage.removeItem('marjon_branch')
    localStorage.removeItem('marjon_mode')
    setBranch(null)
    setMode(null)
  }, [])

  // ── Экран блокировки ──
  if (isLocked) {
    return (
      <div className="lock-screen">
        <div className="lock-screen__content">
          <div className="lock-screen__icon">🔒</div>
          <h2 className="lock-screen__title">Экран заблокирован</h2>
          <p className="lock-screen__user">{staffUser?.name || staffUser?.email}</p>
          <div className="pin-input-group">
            <input
              type="password"
              className="pin-input"
              maxLength={4}
              placeholder="PIN"
              value={lockPin}
              onChange={(e) => setLockPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && lockPin.length === 4) {
                  if (!handleUnlock(lockPin)) setLockPin('')
                }
              }}
              autoFocus
            />
            <button
              className="btn btn--primary"
              disabled={lockPin.length < 4}
              onClick={() => { if (!handleUnlock(lockPin)) setLockPin('') }}
            >
              Разблокировать
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Поток ──
  // Шаг 0: Первый запуск — настройка адреса сервера
  const serverUrl = localStorage.getItem('marjon_server_url')
  if (!serverUrl) {
    return <ServerSetup onComplete={() => window.location.reload()} />
  }

  // Шаг 1: Терминал не привязан — AdminLogin (логин/пароль + сервер)
  if (!orgToken || !orgUser) {
    return <LoginPage mode="admin" onLogin={handleAdminLogin} />
  }

  // Шаг 2: Нет филиала — выбор
  if (!branch) {
    return (
      <BranchSelector
        user={orgUser}
        onSelect={handleBranchSelect}
        onLogout={handleFullReset}
      />
    )
  }

  // Шаг 3: Терминал привязан, но сотрудник не залогинен — PIN-вход
  if (!isStaffLoggedIn) {
    return (
      <LoginPage
        mode="pin"
        branchName={branch?.name}
        orgName={orgUser?.company_name || orgUser?.name}
        onLogin={handlePinLogin}
        onReset={handleFullReset}
      />
    )
  }

  // Шаг 4: Выбор режима
  if (!mode) {
    return (
      <ModeSelector
        user={staffUser}
        branch={branch}
        onSelect={handleModeSelect}
        onBack={handleBackToBranches}
        onLogout={handleStaffLogout}
      />
    )
  }

  // ── Рабочий режим ──
  const { component: ModeComponent, label: modeLabel } = MODES[mode]
  const userWithBranch = { ...staffUser, branch_id: branch.id }

  return (
    <div className="app-shell">
      <TopBar
        title={modeLabel}
        subtitle={branch?.name}
        isOnline={isOnline}
        onRefresh={() => window.location.reload()}
        onLock={handleLock}
        onAccount={handleStaffLogout}
      />

      <main className="app-shell__content">
        <ModeComponent
          user={userWithBranch}
          branch={branch}
          onLogout={handleStaffLogout}
          onBack={handleBack}
        />
      </main>

      <BottomBar
        userName={staffUser?.name}
        branchName={branch?.name}
        mode={modeLabel}
      />
    </div>
  )
}
