import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/marjon-logo.svg";
import { logout } from "../api/client";
import { filterNavItems } from "../utils/permissions";
import Icon from "./Icon";

const PROFILE_STORAGE_KEY = "marjon_profile_settings";

function readStoredProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

const navItems = [
  { key: "dashboard", label: "Дашборд", icon: "bi-bar-chart-line", to: "/" },
  {
    key: "reports",
    label: "Отчеты",
    icon: "bi-file-earmark-bar-graph",
    to: "/reports",
    children: [
      { key: "z-report", label: "Z - Отчёт", to: "/reports/z-report", icon: "bi-receipt-cutoff" },
      { key: "orders", label: "Отчёт по заказам", to: "/reports/orders", icon: "bi-receipt" },
      { key: "tables", label: "Отчёт по столам", to: "/reports/tables", icon: "bi-grid-3x3-gap" },
      { key: "waiters", label: "Отчёт по официантам", to: "/reports/waiters", icon: "bi-person-lines-fill" },
      { key: "dishes", label: "Отчёт по блюдам", to: "/reports/dishes", icon: "bi-stars" },
      { key: "cancelled-dishes", label: "Отчёт по отмененным блюдам", to: "/reports/cancelled-dishes", icon: "bi-x-octagon" },
    ],
  },
  {
    key: "users",
    label: "Сотрудники",
    icon: "bi-people",
    to: "/users",
    children: [
      { key: "cashier", label: "Кассир", to: "/users/cashier", icon: "bi-cash-coin" },
      { key: "waiter", label: "Официант", to: "/users/waiter", icon: "bi-person" },
      { key: "courier", label: "Курьер", to: "/users/courier", icon: "bi-send" },
      { key: "monoblock", label: "Моноблок", to: "/users/monoblock", icon: "bi-pc-display" },
      { key: "kitchen", label: "Повар", to: "/users/kitchen", icon: "bi-display" },
      { key: "manager", label: "Менеджер", to: "/users/manager", icon: "bi-shield-lock" },
      { key: "warehouse", label: "Завсклад", to: "/users/warehouse", icon: "bi-box-seam" },
      { key: "login-history", label: "История входа", to: "/users/login-history", icon: "bi-clock-history" },
      { key: "attendance", label: "Посещаемость", to: "/users/attendance", icon: "bi-calendar-check" },
    ],
  },
  {
    key: "nomenclature",
    label: "Меню",
    icon: "bi-boxes",
    to: "/nomenclature",
    children: [
      { key: "dishes", label: "Блюда", to: "/nomenclature/dishes", icon: "bi-cup-hot" },
      { key: "dish-categories", label: "Категория блюд", to: "/nomenclature/dish-categories", icon: "bi-grid" },
      { key: "menu", label: "Меню", to: "/nomenclature/menu", icon: "bi-journal-bookmark" },
    ],
  },
  {
    key: "warehouse",
    label: "Склад",
    icon: "bi-box-seam",
    to: "/warehouse",
    children: [
      { key: "incoming", label: "Приход товаров", to: "/warehouse/incoming", icon: "bi-box-arrow-in-down" },
      { key: "outgoing", label: "Расход товаров", to: "/warehouse/outgoing", icon: "bi-box-arrow-up" },
      { key: "stock", label: "Остаток", to: "/warehouse/stock", icon: "bi-boxes" },
      { key: "incoming-journal", label: "Журнал приходов", to: "/warehouse/incoming-journal", icon: "bi-clock-history" },
      { key: "transfer", label: "Перемещение", to: "/warehouse/transfer", icon: "bi-arrow-left-right" },
      { key: "inventory", label: "Инвентаризация", to: "/warehouse/inventory", icon: "bi-clipboard-check" },
      { key: "write-off", label: "Списание", to: "/warehouse/write-off", icon: "bi-trash3" },
      { key: "write-off-categories", label: "Категории списания", to: "/warehouse/write-off-categories", icon: "bi-tags" },
      { key: "waste", label: "Отход товаров", to: "/warehouse/waste", icon: "bi-recycle" },
      { key: "raw-materials", label: "Сырьё", to: "/nomenclature/raw-materials", icon: "bi-basket" },
      { key: "semi-finished", label: "Полуфабрикаты", to: "/nomenclature/semi-finished", icon: "bi-box" },
      { key: "raw-categories", label: "Категория сырья", to: "/nomenclature/raw-categories", icon: "bi-boxes" },
      { key: "semi-finished-categories", label: "Категория полуфабрикатов", to: "/nomenclature/semi-finished-categories", icon: "bi-diagram-3" },
      { key: "sales-categories", label: "Категория реализации", to: "/nomenclature/sales-categories", icon: "bi-shop" },
    ],
  },
  {
    key: "finance",
    label: "Финансы",
    icon: "bi-wallet2",
    to: "/finance",
    children: [
      { key: "transactions", label: "Денежные операции", to: "/finance/transactions", icon: "bi-cash-stack" },
      { key: "income-categories", label: "Категория приходов", to: "/finance/income-categories", icon: "bi-arrow-down-left-circle" },
      { key: "expense-categories", label: "Категория расходов", to: "/finance/expense-categories", icon: "bi-arrow-up-right-circle" },
      { key: "debtors-creditors", label: "Дебиторы и кредиторы", to: "/finance/debtors-creditors", icon: "bi-wallet2" },
    ],
  },
  {
    key: "settings",
    label: "Настройки",
    icon: "bi-gear",
    to: "/settings",
    children: [
      { key: "clients", label: "Клиенты", to: "/settings/clients", icon: "bi-person-fill" },
      { key: "places", label: "Место", to: "/settings/places", icon: "bi-geo-alt" },
      { key: "payment-methods", label: "Способ оплаты", to: "/settings/payment-methods", icon: "bi-credit-card" },
      { key: "units", label: "Единица измерения", to: "/settings/units", icon: "bi-pencil" },
      { key: "profile", label: "Настройка профиля", to: "/settings/profile", icon: "bi-person-gear" },
      { key: "printers", label: "Настройка принтеров", to: "/settings/printers", icon: "bi-printer" },
      { key: "receipt", label: "Настройка чека", to: "/settings/receipt", icon: "bi-receipt" },
      { key: "kitchen-receipt", label: "Настройка чека повара", to: "/settings/kitchen-receipt", icon: "bi-cup-hot" },
    ],
  },
];

export default function Sidebar({ user, collapsed, onToggle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const closePopoverTimer = useRef(null);
  const closeAccountTimer = useRef(null);
  const [openMenu, setOpenMenu] = useState("");
  const [pinnedMenu, setPinnedMenu] = useState("");
  const [hoverMenu, setHoverMenu] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [lang, setLang] = useState(() => localStorage.getItem("marjon_lang") || "ru");
  const [storedProfile, setStoredProfile] = useState(() => readStoredProfile());
  const accountRef = useRef(null);
  const role = user?.role_slugs?.[0] || (user?.is_superadmin ? "superadmin" : "owner");
  const displayName = storedProfile.name || user?.full_name || user?.email || "Owner";
  const profileCardName = storedProfile.name || (user?.email ? `${user.email.slice(0, 14)}...` : "manager@marjon...");
  const profileCardRole = role === "owner" ? "manager" : role;
  const profilePhoto = storedProfile.photo || logo;

  // Ролевая фильтрация пунктов меню (ТЗ §2.2)
  const visibleNavItems = useMemo(() => filterNavItems(navItems, user), [user]);

  useEffect(() => {
    const activeParent = navItems.find((item) => item.children?.some((child) => location.pathname === child.to));
    if (activeParent) {
      setPinnedMenu(activeParent.key);
      setOpenMenu(activeParent.key);
    } else {
      setPinnedMenu("");
      setOpenMenu("");
    }
  }, [location.pathname]);

  useEffect(() => { setAccountOpen(false); }, [location.pathname]);
  useEffect(() => { setHoverMenu(""); }, [location.pathname]);

  useEffect(() => {
    const syncStoredProfile = () => setStoredProfile(readStoredProfile());
    window.addEventListener("storage", syncStoredProfile);
    window.addEventListener("marjon-profile-updated", syncStoredProfile);
    return () => {
      window.removeEventListener("storage", syncStoredProfile);
      window.removeEventListener("marjon-profile-updated", syncStoredProfile);
    };
  }, []);

  useEffect(() => () => {
    if (closePopoverTimer.current) clearTimeout(closePopoverTimer.current);
    if (closeAccountTimer.current) clearTimeout(closeAccountTimer.current);
  }, []);

  useEffect(() => {
    if (!accountOpen) return undefined;
    function onDocClick(event) {
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function selectLang(code) {
    setLang(code);
    localStorage.setItem("marjon_lang", code);
  }

  function closeAccountAndSelectMenu(menuKey = "") {
    setAccountOpen(false);
    setPinnedMenu(menuKey);
    setOpenMenu(menuKey);
    setHoverMenu("");
  }

  function openCollapsedPopover(key) {
    if (collapsed && accountOpen) return;
    if (closePopoverTimer.current) clearTimeout(closePopoverTimer.current);
    setHoverMenu(key);
  }

  function closeCollapsedPopover() {
    if (closePopoverTimer.current) clearTimeout(closePopoverTimer.current);
    closePopoverTimer.current = setTimeout(() => setHoverMenu(""), 260);
  }

  function openCollapsedAccount() {
    if (closeAccountTimer.current) clearTimeout(closeAccountTimer.current);
    if (collapsed) {
      if (closePopoverTimer.current) clearTimeout(closePopoverTimer.current);
      setHoverMenu("");
      setAccountOpen(true);
    }
  }

  function closeCollapsedAccount() {
    if (closeAccountTimer.current) clearTimeout(closeAccountTimer.current);
    if (collapsed) {
      closeAccountTimer.current = setTimeout(() => setAccountOpen(false), 260);
    }
  }

  return (
    <aside className={`dashboard-sidebar ${collapsed ? "is-collapsed" : ""}`} id="dashboardSidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand__identity">
          {collapsed ? (
            <button
              className="brand-mark brand-mark--button"
              type="button"
              onClick={onToggle}
              title="Открыть меню"
              aria-label="Открыть меню"
            >
              <img src={logo} alt="MARJON" className="marjon-logo" decoding="async" />
            </button>
          ) : (
            <div className="brand-mark">
              <img src={logo} alt="MARJON" className="marjon-logo" decoding="async" />
            </div>
          )}
          <div>
            <div className="brand-title">MARJON</div>
            <div className="brand-subtitle">Restaurant OS</div>
          </div>
        </div>
        {!collapsed ? (
          <button
            className="sidebar-brand__toggle"
            type="button"
            onClick={onToggle}
            aria-label="Закрыть меню"
            aria-expanded={!collapsed}
            title="Закрыть меню"
          >
            <Icon name="bi-chevron-right" size={18} className="sidebar-brand__toggle-chevron" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <nav className="sidebar-nav" aria-label="Навигация">
        {visibleNavItems.map((item) => {
          const hasChildren = Boolean(item.children?.length);
          const childActive = hasChildren && item.children.some((child) => location.pathname === child.to);
          const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to) || childActive;
          const submenuOpen = !collapsed && (openMenu === item.key || pinnedMenu === item.key);
          const popoverOpen = collapsed && hoverMenu === item.key;

          if (hasChildren) {
            return (
              <div
                key={item.key}
                className={`sidebar-nav-item has-submenu ${active ? "is-active" : ""} ${submenuOpen ? "is-open" : ""} ${popoverOpen ? "has-popover" : ""}`}
                onMouseEnter={() => {
                  if (collapsed) {
                    openCollapsedPopover(item.key);
                  }
                }}
                onMouseLeave={() => {
                  if (collapsed) {
                    closeCollapsedPopover();
                  }
                }}
              >
                <button
                  className={`sidebar-link sidebar-link--button ${active ? "is-active" : ""}`}
                  type="button"
                  onClick={() => {
                    if (pinnedMenu === item.key) {
                      setPinnedMenu("");
                      setOpenMenu("");
                    } else {
                      setPinnedMenu(item.key);
                      setOpenMenu(item.key);
                    }
                  }}
                  aria-expanded={submenuOpen}
                >
                  <span className="sidebar-icon"><Icon name={item.icon} size={18} /></span>
                  <span>{item.label}</span>
                  <Icon name="bi-chevron-right" size={18} className="sidebar-link__chevron" aria-hidden="true" />
                </button>
                <div className="sidebar-submenu">
                  {item.children.map((child) => (
                    <Link
                      key={child.key}
                      className={`sidebar-submenu__link ${location.pathname === child.to ? "is-active" : ""}`}
                      to={child.to}
                      onClick={() => {
                        setPinnedMenu(item.key);
                        setOpenMenu(item.key);
                      }}
                    >
                      <span className="sidebar-submenu__dot" aria-hidden="true" />
                      <span className="sidebar-submenu__icon"><Icon name={child.icon || "bi-circle"} size={child.icon ? 16 : 8} /></span>
                      {child.label}
                    </Link>
                  ))}
                </div>
                {collapsed ? (
                  <div
                    className="sidebar-collapsed-popover"
                    onMouseEnter={() => openCollapsedPopover(item.key)}
                    onMouseLeave={closeCollapsedPopover}
                  >
                    {item.children.map((child) => (
                      <Link
                        key={child.key}
                        className={`sidebar-collapsed-popover__link ${location.pathname === child.to ? "is-active" : ""}`}
                        to={child.to}
                        onClick={() => {
                          setPinnedMenu(item.key);
                          setOpenMenu(item.key);
                          setHoverMenu("");
                        }}
                      >
                        <span className="sidebar-collapsed-popover__icon">
                          <Icon name={child.icon || "bi-circle"} size={16} />
                        </span>
                        <span>{child.label}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <div key={item.key} className={`sidebar-nav-item ${active ? "is-active" : ""}`}>
              <Link
                className={`sidebar-link ${active ? "is-active" : ""}`}
                to={item.to}
                onClick={() => {
                  setPinnedMenu("");
                  setOpenMenu("");
                }}
              >
                <span className="sidebar-icon"><Icon name={item.icon} size={18} /></span>
                <span>{item.label}</span>
              </Link>
            </div>
          );
        })}
      </nav>

      <div
        className={`sidebar-account ${accountOpen ? "is-open" : ""}`}
        ref={accountRef}
        onMouseEnter={openCollapsedAccount}
        onMouseLeave={closeCollapsedAccount}
      >
        {accountOpen ? (
          <div
            className="sidebar-account__menu"
            role="menu"
            onMouseEnter={openCollapsedAccount}
            onMouseLeave={closeCollapsedAccount}
          >
            <div className="sidebar-account__head">
              <div className="sidebar-account__head-avatar">
                <img src={profilePhoto} alt={displayName} decoding="async" />
              </div>
              <div className="sidebar-account__head-meta">
                <strong>{displayName}</strong>
                <span>{role} · {user?.company_name || "MARJON"}</span>
              </div>
              <Icon name="bi-chevron-up" size={16} className="sidebar-account__head-arrow" />
            </div>
            <Link className="sidebar-account__item" to="/settings/profile" role="menuitem" onClick={() => closeAccountAndSelectMenu("settings")}>
              <Icon name="bi-person-gear" size={16} />
              <span>Настройка профиля</span>
            </Link>
            <Link className="sidebar-account__item" to="/settings/support" role="menuitem" onClick={() => closeAccountAndSelectMenu("settings")}>
              <Icon name="bi-headset" size={16} />
              <span>Тех. поддержка</span>
            </Link>

            <div className="sidebar-account__lang">
              <span className="sidebar-account__lang-label">
                <Icon name="bi-translate" size={16} />
                Язык
              </span>
              <div className="sidebar-account__lang-switch" role="group" aria-label="Выбор языка">
                <button
                  type="button"
                  className={lang === "ru" ? "is-active" : ""}
                  onClick={() => selectLang("ru")}
                  aria-pressed={lang === "ru"}
                >
                  RU
                </button>
                <button
                  type="button"
                  className={`sidebar-account__lang-button--flag ${lang === "uz" ? "is-active" : ""}`}
                  onClick={() => selectLang("uz")}
                  aria-pressed={lang === "uz"}
                  aria-label="O'zbek tili"
                >
                  <img
                    className="sidebar-account__flag"
                    src="https://upload.wikimedia.org/wikipedia/commons/8/84/Flag_of_Uzbekistan.svg"
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              </div>
            </div>

            <Link className="sidebar-account__item" to="/store" role="menuitem" onClick={() => closeAccountAndSelectMenu("")}>
              <Icon name="bi-shop" size={16} />
              <span>Магазин</span>
            </Link>
            <Link className="sidebar-account__item" to="/reviews" role="menuitem" onClick={() => closeAccountAndSelectMenu("")}>
              <Icon name="bi-chat-left" size={16} />
              <span>Отзывы</span>
            </Link>

            <button type="button" className="sidebar-account__item sidebar-account__item--danger" role="menuitem" onClick={handleLogout}>
              <Icon name="bi-box-arrow-right" size={16} />
              <span>Выйти</span>
            </button>
          </div>
        ) : null}

        {collapsed && accountOpen ? (
          <div
            className="sidebar-account__hover-bridge"
            aria-hidden="true"
            onMouseEnter={openCollapsedAccount}
            onMouseLeave={closeCollapsedAccount}
          />
        ) : null}

        <button
          type="button"
          className="sidebar-user sidebar-user--button"
          onClick={() => setAccountOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={accountOpen}
        >
          <div className={`sidebar-user__avatar ${storedProfile.photo ? "sidebar-user__avatar--photo" : ""}`}>
            <img src={profilePhoto} alt={displayName} className="sidebar-user-logo" decoding="async" />
          </div>
          <div className="sidebar-user__meta">
            <strong>{profileCardName}</strong>
            <span>{profileCardRole}</span>
            <em>{user?.company_name || "MARJON"}</em>
          </div>
          <Icon name="bi-chevron-right" size={16} className="sidebar-user__arrow" />
        </button>
      </div>
    </aside>
  );
}
