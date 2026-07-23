import { useState, useEffect } from 'react'
import { X, Volume2, Server, Monitor, Timer, Globe, Maximize, ZoomIn, ZoomOut, Check } from 'lucide-react'
import { soundService } from '../services/sound'

const el = () => (typeof window !== 'undefined' ? window.electron : null)

export default function SettingsModal({ open, onClose }) {
  const [soundEnabled, setSoundEnabled] = useState(soundService.enabled)
  const [volume, setVolume] = useState(soundService.volume)
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('marjon_server_url') || 'http://localhost:8000/api/v1')
  const [serverSaved, setServerSaved] = useState(false)
  const [timersSaved, setTimersSaved] = useState(false)

  const [zoom, setZoom] = useState(1)
  const [autoLaunch, setAutoLaunch] = useState(() => localStorage.getItem('marjon_autolaunch') === '1')
  const [timerYellow, setTimerYellow] = useState(() => Number(localStorage.getItem('marjon_timer_yellow')) || 5)
  const [timerRed, setTimerRed] = useState(() => Number(localStorage.getItem('marjon_timer_red')) || 10)
  const [lang, setLang] = useState(() => localStorage.getItem('marjon_lang') || 'ru')
  const [theme, setTheme] = useState(() => localStorage.getItem('marjon_theme') || 'light')

  useEffect(() => {
    if (!open) return
    Promise.resolve(el()?.getZoom?.()).then((z) => { if (z) setZoom(z) }).catch(() => {})
  }, [open])

  if (!open) return null
  const persist = (k, v) => localStorage.setItem(k, v)

  async function zoomStep(dir) {
    const fn = dir > 0 ? el()?.zoomIn : el()?.zoomOut
    const next = await Promise.resolve(fn?.()).catch(() => null)
    if (next) setZoom(next)
  }
  function saveTimers() {
    persist('marjon_timer_yellow', String(timerYellow))
    persist('marjon_timer_red', String(timerRed))
    setTimersSaved(true); setTimeout(() => setTimersSaved(false), 1600)
  }
  function saveServer() {
    persist('marjon_server_url', serverUrl.trim())
    setServerSaved(true); setTimeout(() => setServerSaved(false), 1600)
  }

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
            <h3><Volume2 size={18} /> Звук</h3>
            <div className="settings-row">
              <span>Звуковые уведомления</span>
              <button
                className={`toggle ${soundEnabled ? 'toggle--on' : ''}`}
                onClick={() => { const n = !soundEnabled; setSoundEnabled(n); soundService.enabled = n }}
              ><span className="toggle__dot" /></button>
            </div>
            <div className="settings-row">
              <span>Громкость</span>
              <input type="range" min="0" max="1" step="0.05" value={volume}
                onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); soundService.volume = v }}
                className="range-input" />
              <span className="settings-value">{Math.round(volume * 100)}%</span>
            </div>
            <div className="settings-row">
              <span>Проверить звук</span>
              <button className="btn btn--outline" onClick={() => soundService.play('newOrder')}>Проиграть</button>
            </div>
          </section>

          {/* Таймеры кухни */}
          <section className="settings-section">
            <h3><Timer size={18} /> Таймеры кухни</h3>
            <p className="settings-hint">Через сколько минут карточка заказа на кухне подсветится жёлтым (внимание) и красным (просрочено).</p>
            <div className="settings-row">
              <span>Жёлтый через, мин</span>
              <input type="number" min="1" max="60" value={timerYellow} onChange={(e) => setTimerYellow(Number(e.target.value) || 5)} className="input settings-num" />
            </div>
            <div className="settings-row">
              <span>Красный через, мин</span>
              <input type="number" min="1" max="120" value={timerRed} onChange={(e) => setTimerRed(Number(e.target.value) || 10)} className="input settings-num" />
            </div>
            <div className="settings-row">
              <span>Сохранить пороги</span>
              <button className="btn btn--primary settings-save" onClick={saveTimers}>
                {timersSaved ? <Check size={20} /> : 'Сохранить'}
              </button>
            </div>
          </section>

          {/* Экран */}
          <section className="settings-section">
            <h3><Monitor size={18} /> Экран</h3>
            <div className="settings-row">
              <span>Полный экран</span>
              <button className="btn btn--outline" onClick={() => el()?.toggleFullscreen?.()}>
                <Maximize size={18} /> Переключить
              </button>
            </div>
            <div className="settings-row">
              <span>Масштаб интерфейса</span>
              <div className="settings-input-group">
                <button className="btn btn--outline settings-icon-btn" onClick={() => zoomStep(-1)}><ZoomOut size={18} /></button>
                <span className="settings-value">{Math.round(zoom * 100)}%</span>
                <button className="btn btn--outline settings-icon-btn" onClick={() => zoomStep(1)}><ZoomIn size={18} /></button>
              </div>
            </div>
            <div className="settings-row">
              <span>Запускать при старте Windows</span>
              <button className={`toggle ${autoLaunch ? 'toggle--on' : ''}`}
                onClick={() => { const n = !autoLaunch; setAutoLaunch(n); persist('marjon_autolaunch', n ? '1' : '0'); try { el()?.setAutoLaunch?.(n) } catch {} }}
              ><span className="toggle__dot" /></button>
            </div>
          </section>

          {/* Язык и тема */}
          <section className="settings-section">
            <h3><Globe size={18} /> Язык и тема</h3>
            <div className="settings-row">
              <span>Язык интерфейса</span>
              <div className="settings-input-group">
                <button className={`btn ${lang === 'ru' ? 'btn--primary' : 'btn--outline'}`} onClick={() => { setLang('ru'); persist('marjon_lang', 'ru') }}>RU</button>
                <button className={`btn ${lang === 'uz' ? 'btn--primary' : 'btn--outline'}`} onClick={() => { setLang('uz'); persist('marjon_lang', 'uz') }}>UZ</button>
              </div>
            </div>
            <div className="settings-row">
              <span>Тема</span>
              <div className="settings-input-group">
                <button className={`btn ${theme === 'light' ? 'btn--primary' : 'btn--outline'}`} onClick={() => { setTheme('light'); persist('marjon_theme', 'light') }}>Светлая</button>
                <button className={`btn ${theme === 'dark' ? 'btn--primary' : 'btn--outline'}`} onClick={() => { setTheme('dark'); persist('marjon_theme', 'dark') }}>Тёмная</button>
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
                <button className="btn btn--primary settings-save" onClick={saveServer}>
                  {serverSaved ? <Check size={20} /> : 'Сохранить'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
