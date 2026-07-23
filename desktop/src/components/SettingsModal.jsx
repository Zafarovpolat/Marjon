import { useState, useEffect } from 'react'
import { X, Volume2, Server, Monitor, Timer, Shield, Globe, Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import { soundService } from '../services/sound'

const el = () => (typeof window !== 'undefined' ? window.electron : null)

export default function SettingsModal({ open, onClose }) {
  const [soundEnabled, setSoundEnabled] = useState(soundService.enabled)
  const [volume, setVolume] = useState(soundService.volume)
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('marjon_server_url') || 'http://localhost:8000/api/v1')
  const [saved, setSaved] = useState(false)

  const [zoom, setZoom] = useState(1)
  const [kiosk, setKiosk] = useState(() => localStorage.getItem('marjon_kiosk') === '1')
  const [autoLaunch, setAutoLaunch] = useState(() => localStorage.getItem('marjon_autolaunch') === '1')
  const [timerYellow, setTimerYellow] = useState(() => Number(localStorage.getItem('marjon_timer_yellow')) || 5)
  const [timerRed, setTimerRed] = useState(() => Number(localStorage.getItem('marjon_timer_red')) || 10)
  const [lang, setLang] = useState(() => localStorage.getItem('marjon_lang') || 'ru')
  const [theme, setTheme] = useState(() => localStorage.getItem('marjon_theme') || 'light')
  const [exitPin, setExitPin] = useState(() => localStorage.getItem('marjon_exit_pin') || '')

  useEffect(() => {
    if (!open) return
    Promise.resolve(el()?.getZoom?.()).then((z) => { if (z) setZoom(z) }).catch(() => {})
  }, [open])

  if (!open) return null

  function persist(key, value) { localStorage.setItem(key, value) }

  function handleSoundToggle() { const n = !soundEnabled; setSoundEnabled(n); soundService.enabled = n }
  function handleVolumeChange(e) { const v = parseFloat(e.target.value); setVolume(v); soundService.volume = v }
  function handleSaveServer() { persist('marjon_server_url', serverUrl.trim()); setSaved(true); setTimeout(() => setSaved(false), 2000) }

  async function zoomStep(dir) {
    const fn = dir > 0 ? el()?.zoomIn : el()?.zoomOut
    const next = await Promise.resolve(fn?.()).catch(() => null)
    if (next) setZoom(next)
  }
  function toggleKiosk() {
    const n = !kiosk; setKiosk(n); persist('marjon_kiosk', n ? '1' : '0')
    try { el()?.setKiosk?.(n) } catch {}
  }
  function toggleAutoLaunch() {
    const n = !autoLaunch; setAutoLaunch(n); persist('marjon_autolaunch', n ? '1' : '0')
    try { el()?.setAutoLaunch?.(n) } catch {}
  }
  function saveTimers() {
    persist('marjon_timer_yellow', String(timerYellow))
    persist('marjon_timer_red', String(timerRed))
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }
  function saveExitPin(v) { setExitPin(v); persist('marjon_exit_pin', v) }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Настройки</h2>
          <button className="icon-btn" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="modal__body">
          {/* Звук */}
          <section className="settings-section">
            <h3><Volume2 size={18} /> Звуковые уведомления</h3>
            <div className="settings-row">
              <span>Звук включён</span>
              <button className={`toggle ${soundEnabled ? 'toggle--on' : ''}`} onClick={handleSoundToggle}><span className="toggle__dot" /></button>
            </div>
            <div className="settings-row">
              <span>Громкость</span>
              <input type="range" min="0" max="1" step="0.1" value={volume} onChange={handleVolumeChange} className="range-input" />
              <span className="settings-value">{Math.round(volume * 100)}%</span>
            </div>
            <div className="settings-row">
              <span>Тест звука</span>
              <button className="btn btn--sm btn--outline" onClick={() => soundService.play('newOrder')}>Проиграть</button>
            </div>
          </section>

          {/* Кухня — таймеры */}
          <section className="settings-section">
            <h3><Timer size={18} /> Таймеры кухни (мин)</h3>
            <div className="settings-row">
              <span>Жёлтый (внимание)</span>
              <input type="number" min="1" max="60" value={timerYellow} onChange={(e) => setTimerYellow(Number(e.target.value) || 5)} className="input" style={{ width: 88 }} />
            </div>
            <div className="settings-row">
              <span>Красный (просрочено)</span>
              <input type="number" min="1" max="120" value={timerRed} onChange={(e) => setTimerRed(Number(e.target.value) || 10)} className="input" style={{ width: 88 }} />
            </div>
            <div className="settings-row">
              <span>Применить</span>
              <button className="btn btn--sm btn--primary" onClick={saveTimers}>{saved ? 'Сохранено' : 'Сохранить'}</button>
            </div>
          </section>

          {/* Экран */}
          <section className="settings-section">
            <h3><Monitor size={18} /> Экран</h3>
            <div className="settings-row">
              <span><Maximize size={15} /> Полный экран</span>
              <button className="btn btn--sm btn--outline" onClick={() => el()?.toggleFullscreen?.()}>Переключить</button>
            </div>
            <div className="settings-row">
              <span>Режим киоска</span>
              <button className={`toggle ${kiosk ? 'toggle--on' : ''}`} onClick={toggleKiosk}><span className="toggle__dot" /></button>
            </div>
            <div className="settings-row">
              <span>Масштаб интерфейса</span>
              <div className="settings-input-group" style={{ alignItems: 'center' }}>
                <button className="btn btn--sm btn--outline" onClick={() => zoomStep(-1)}><ZoomOut size={16} /></button>
                <span className="settings-value">{Math.round(zoom * 100)}%</span>
                <button className="btn btn--sm btn--outline" onClick={() => zoomStep(1)}><ZoomIn size={16} /></button>
              </div>
            </div>
            <div className="settings-row">
              <span>Автозапуск при старте Windows</span>
              <button className={`toggle ${autoLaunch ? 'toggle--on' : ''}`} onClick={toggleAutoLaunch}><span className="toggle__dot" /></button>
            </div>
          </section>

          {/* Безопасность */}
          <section className="settings-section">
            <h3><Shield size={18} /> Безопасность</h3>
            <div className="settings-row settings-row--col">
              <label>PIN для выхода из приложения</label>
              <input type="password" inputMode="numeric" maxLength={8} value={exitPin} onChange={(e) => saveExitPin(e.target.value.replace(/\D/g, ''))} className="input" placeholder="Например 4321" />
            </div>
          </section>

          {/* Язык и тема */}
          <section className="settings-section">
            <h3><Globe size={18} /> Язык и тема</h3>
            <div className="settings-row">
              <span>Язык</span>
              <div className="settings-input-group">
                <button className={`btn btn--sm ${lang === 'ru' ? 'btn--primary' : 'btn--outline'}`} onClick={() => { setLang('ru'); persist('marjon_lang', 'ru') }}>RU</button>
                <button className={`btn btn--sm ${lang === 'uz' ? 'btn--primary' : 'btn--outline'}`} onClick={() => { setLang('uz'); persist('marjon_lang', 'uz') }}>UZ</button>
              </div>
            </div>
            <div className="settings-row">
              <span>Тема</span>
              <div className="settings-input-group">
                <button className={`btn btn--sm ${theme === 'light' ? 'btn--primary' : 'btn--outline'}`} onClick={() => { setTheme('light'); persist('marjon_theme', 'light') }}>Светлая</button>
                <button className={`btn btn--sm ${theme === 'dark' ? 'btn--primary' : 'btn--outline'}`} onClick={() => { setTheme('dark'); persist('marjon_theme', 'dark') }}>Тёмная</button>
              </div>
            </div>
          </section>

          {/* Подключение */}
          <section className="settings-section">
            <h3><Server size={18} /> Подключение</h3>
            <div className="settings-row settings-row--col">
              <label>Адрес сервера</label>
              <div className="settings-input-group">
                <input type="text" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} className="input" placeholder="http://192.168.1.x:8000/api/v1" />
                <button className="btn btn--sm btn--primary" onClick={handleSaveServer}>{saved ? 'Сохранено' : 'Сохранить'}</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
