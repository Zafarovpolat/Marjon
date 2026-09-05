import { Link } from "react-router-dom";
import Icon from "../Icon";

// Десктопное дерево навигации сайдбара OWNER.
// Вынесено из Sidebar.jsx (FE-07B). Разметка, классы и поведение сохранены 1:1;
// всё состояние по-прежнему принадлежит оркестратору Sidebar и приходит пропсами.
export default function SidebarNav({
  visibleNavItems,
  location,
  collapsed,
  openMenu,
  pinnedMenu,
  hoverMenu,
  exactChildParentKey,
  setPinnedMenu,
  setOpenMenu,
  setHoverMenu,
  openCollapsedPopover,
  closeCollapsedPopover,
}) {
  return (
    <nav className="sidebar-nav" aria-label="Навигация">
      {visibleNavItems.map((item) => {
        const hasChildren = Boolean(item.children?.length);
        const childActive = hasChildren && item.children.some((child) => location.pathname === child.to);
        const active = exactChildParentKey
          ? item.key === exactChildParentKey
          : item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to) || childActive;
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
  );
}
