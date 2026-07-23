import { useState } from 'react'
import { X, Volume2, VolumeX, Printer, Server, Monitor } from 'lucide-react'
import { soundService } from '../services/sound'

export default function SettingsModal({ open, onClose }) {
  const [soundEnabled, setSoundEnabled] = useState(soundService.enabled)
  const [volume, setVolume] = useState(soundService.volume)
  const [serverUrl, setServerUrl] = useState(
    () => localStorage.getItem('marjon_server_url') || 'http://localhost:8000/api/v1'
  )
  const [saved, setSaved] = useState(false)

  if (!open) return null

  function handleSoundToggle() {
    const next = !soundEnabled
    setSoundEnabled(next)
    soundService.enabled = next
  }

  function handleVolumeChange(e) {
    const val = parseFloat(e.target.value)
    setVolume(val)
    soundService.volume = val
  }

  function handleSaveServer() {
    localStorage.setItem('marjon_server_url', serverUrl.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleTestSound() {
    soundService.play('newOrder')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Настройки</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal__body">
          {/* Звук */}
          <section className="settings-section">
            <h3><Volume2 size={18} /> Звуковые уведомления</h3>
            <div className="settings-row">
              <span>Звук включён</span>
              <button
                className={`toggle ${soundEnabled ? 'toggle--on' : ''}`}
                onClick={handleSoundToggle}
              >
                <span className="toggle__dot" />
              </button>
            </div>
            <div className="settings-row">
              <span>Громкость</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="range-input"
              />
              <span className="settings-value">{Math.round(volume * 100)}%</span>
            </div>
            <div className="settings-row">
              <span>Тест звука</span>
              <button className="btn btn--sm btn--outline" onClick={handleTestSound}>
                Проиграть
              </button>
            </div>
          </section>

          {/* Сервер */}
          <section className="settings-section">
            <h3><Server size={18} /> Подключение</h3>
            <div className="settings-row settings-row--col">
              <label>Адрес сервера</label>
              <div className="settings-input-group">
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="input"
                  placeholder="http://192.168.1.x:8000/api/v1"
                />
                <button className="btn btn--sm btn--primary" onClick={handleSaveServer}>
                  {saved ? 'Сохранено' : 'Сохранить'}
                </button>
              </div>
            </div>
          </section>

          {/* Экран */}
          <section className="settings-section">
            <h3><Monitor size={18} /> Экран</h3>
            <div className="settings-row">
              <span>Полноэкранный режим</span>
              <button
                className="btn btn--sm btn--outline"
                onClick={() => {
                  if (document.fullscreenElement) {
                    document.exitFullscreen()
                  } else {
                    document.documentElement.requestFullscreen()
                  }
                }}
              >
                {document.fullscreenElement ? 'Выйти' : 'Включить'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
