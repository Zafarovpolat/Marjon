import { useState, useEffect } from 'react'
import LoginPage from './pages/LoginPage'
import BranchSelector from './pages/BranchSelector'
import ModeSelector from './pages/ModeSelector'
import CashierMode from './modes/cashier/CashierMode'
import KitchenMode from './modes/kitchen/KitchenMode'
import WaiterMode from './modes/waiter/WaiterMode'
import BarMode from './modes/bar/BarMode'
import { connectPrinterWS, disconnectPrinterWS } from './shared/ws'

const MODES = { cashier: CashierMode, kitchen: KitchenMode, waiter: WaiterMode, bar: BarMode }

function loadUser() {
  try { return JSON.parse(localStorage.getItem('marjon_user')) } catch { return null }
}

function loadBranch() {
  try { return JSON.parse(localStorage.getItem('marjon_branch')) } catch { return null }
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('marjon_token'))
  const [user, setUser] = useState(loadUser)
  const [branch, setBranch] = useState(loadBranch)   // { id, name, ... }
  const [mode, setMode] = useState(null)

  // Connect WebSocket after mode is chosen
  useEffect(() => {
    if (!token || !branch?.id || !mode) return
    const serverUrl = localStorage.getItem('marjon_server_url') || 'http://localhost:8000/api/v1'
    connectPrinterWS(serverUrl, token, branch.id)
    return () => disconnectPrinterWS()
  }, [token, branch?.id, mode])

  function handleLogin(data) {
    localStorage.setItem('marjon_token', data.access_token)
    localStorage.setItem('marjon_user', JSON.stringify(data.user))
    setToken(data.access_token)
    setUser(data.user)
    // Clear stale branch so user picks fresh
    setBranch(null)
    localStorage.removeItem('marjon_branch')
  }

  function handleBranchSelect(selectedBranch) {
    localStorage.setItem('marjon_branch', JSON.stringify(selectedBranch))
    setBranch(selectedBranch)
  }

  function handleLogout() {
    localStorage.removeItem('marjon_token')
    localStorage.removeItem('marjon_user')
    localStorage.removeItem('marjon_branch')
    setToken(null)
    setUser(null)
    setBranch(null)
    setMode(null)
    disconnectPrinterWS()
  }

  // 1 — not logged in
  if (!token || !user) return <LoginPage onLogin={handleLogin} />

  // 2 — no branch selected
  if (!branch) return <BranchSelector user={user} onSelect={handleBranchSelect} onLogout={handleLogout} />

  // 3 — no mode selected
  if (!mode) return <ModeSelector user={user} branch={branch} onSelect={setMode} onLogout={handleLogout} />

  // 4 — working mode
  // Pass branch.id as branchId so modes don't need user.branch_id
  const userWithBranch = { ...user, branch_id: branch.id }
  const ModeComponent = MODES[mode]
  return <ModeComponent user={userWithBranch} onLogout={handleLogout} onBack={() => setMode(null)} />
}
