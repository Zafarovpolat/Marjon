import { useState } from 'react'
import {
  ChefHat, ShoppingCart, UtensilsCrossed, Wine,
  LayoutGrid, Clock, Ban, FileText, Package,
  DollarSign, Users, ArrowLeft,
} from 'lucide-react'

const MODE_NAV = {
  kitchen: [
    { id: 'orders', label: 'Заказы', icon: LayoutGrid },
    { id: 'history', label: 'История', icon: Clock },
    { id: 'stoplist', label: 'Стоп-лист', icon: Ban },
  ],
  cashier: [
    { id: 'pos', label: 'Продажа', icon: ShoppingCart },
    { id: 'orders', label: 'Заказы', icon: FileText },
    { id: 'history', label: 'История', icon: Clock },
    { id: 'income', label: 'Приход', icon: DollarSign },
  ],
  waiter: [
    { id: 'hall', label: 'Зал', icon: LayoutGrid },
    { id: 'orders', label: 'Мои заказы', icon: FileText },
  ],
  bar: [
    { id: 'orders', label: 'Заказы', icon: LayoutGrid },
    { id: 'stoplist', label: 'Стоп-лист', icon: Ban },
  ],
}

const MODE_ICONS = {
  kitchen: ChefHat,
  cashier: ShoppingCart,
  waiter: UtensilsCrossed,
  bar: Wine,
}

const MODE_LABELS = {
  kitchen: 'Кухня',
  cashier: 'Касса',
  waiter: 'Официант',
  bar: 'Бар',
}

export default function Sidebar({ mode, activeTab, onTabChange, onBack }) {
  const nav = MODE_NAV[mode] || []
  const ModeIcon = MODE_ICONS[mode] || LayoutGrid

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <ModeIcon size={24} />
        <span className="sidebar__mode-label">{MODE_LABELS[mode]}</span>
      </div>

      <nav className="sidebar__nav">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`sidebar__item ${activeTab === id ? 'sidebar__item--active' : ''}`}
            onClick={() => onTabChange(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <button className="sidebar__item sidebar__item--back" onClick={onBack}>
          <ArrowLeft size={20} />
          <span>Режимы</span>
        </button>
      </div>
    </aside>
  )
}
