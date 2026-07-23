import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/global.css'
import './styles/components.css'
import './styles/screens.css'

// Применяем сохранённую тему до первого рендера (иначе тёмная не срабатывает)
document.documentElement.setAttribute('data-theme', localStorage.getItem('marjon_theme') || 'light')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
