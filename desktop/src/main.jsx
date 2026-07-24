import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/global.css'
import './styles/components.css'
import './styles/screens.css'

// Применяем сохранённую тему до первого рендера (иначе тёмная не срабатывает)
document.documentElement.setAttribute('data-theme', localStorage.getItem('marjon_theme') || 'light')
// Кэшированный кастомный фон организации — применяем сразу, чтобы не мигал дефолт
const _cachedBg = localStorage.getItem('marjon_bg')
if (_cachedBg) document.documentElement.style.setProperty('--org-bg-image', `url("${_cachedBg}")`)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
