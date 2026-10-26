import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Icon from "../Icon";
import { navLabelKey } from "./navConfig";

// Мобильная нижняя навигация OWNER (панель + выдвижной ящик «Ещё»).
// Вынесено из Sidebar.jsx (FE-07B). Вне <aside>, чтобы transform сайдбара
// не ломал position:fixed. Разметка, классы и поведение сохранены 1:1.
export default function SidebarMobileNav({
  visibleNavItems,
  location,
  dashboardTo = "/",
  moreOpen,
  setMoreOpen,
  canOpenProfile,
  profilePhoto,
  displayName,
  handleLogout,
  navigate,
}) {
  const { t } = useTranslation();
  const labelOf = (item) => {
    const key = navLabelKey(item.to);
    return key ? t(key, item.label) : item.label;
  };
  return (
    <div className={`mobile-bottom-nav${moreOpen ? " is-more-open" : ""}`}>
      {moreOpen && (
        <>
          <div
            className="mobile-bottom-nav__backdrop"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="mobile-bottom-nav__drawer" role="dialog" aria-modal="true" aria-label={t("sidebar.more")}>
            <div className="mobile-bottom-nav__drawer-handle" aria-hidden="true" />
            <nav className="mobile-bottom-nav__drawer-nav">
              {visibleNavItems.slice(4).map((item) => {
                const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    className={`mobile-drawer-item${active ? " is-active" : ""}`}
                    onClick={() => setMoreOpen(false)}
                  >
                    <span className="mobile-drawer-item__icon">
                      <Icon name={item.icon} size={20} />
                    </span>
                    <span className="mobile-drawer-item__label">{labelOf(item)}</span>
                    <Icon name="bi-chevron-right" size={14} className="mobile-drawer-item__chevron" aria-hidden="true" />
                  </Link>
                );
              })}
            </nav>
            <div className="mobile-bottom-nav__drawer-footer">
              {canOpenProfile ? (
                <button
                  type="button"
                  className="mobile-drawer-item mobile-drawer-item--user"
                  onClick={() => { setMoreOpen(false); navigate("/settings/profile"); }}
                >
                  <div className="mobile-drawer-item__avatar">
                    <img src={profilePhoto} alt={displayName} decoding="async" />
                  </div>
                  <div className="mobile-drawer-item__user-meta">
                    <strong>{displayName}</strong>
                  </div>
                  <Icon name="bi-chevron-right" size={14} className="mobile-drawer-item__chevron" aria-hidden="true" />
                </button>
              ) : null}
              <button
                type="button"
                className="mobile-drawer-item mobile-drawer-item--logout"
                onClick={() => { setMoreOpen(false); handleLogout(); }}
              >
                <span className="mobile-drawer-item__icon">
                  <Icon name="bi-box-arrow-right" size={20} />
                </span>
                <span className="mobile-drawer-item__label">{t("sidebar.logout_action")}</span>
              </button>
            </div>
          </div>
        </>
      )}

      <nav className="mobile-bottom-nav__bar" aria-label={t("sidebar.mobile_navigation")}>
        {visibleNavItems.slice(0, 4).map((item) => {
          const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.key}
              to={item.key === "dashboard" ? dashboardTo : item.to}
              className={`mobile-nav-item${active ? " is-active" : ""}`}
              onClick={() => setMoreOpen(false)}
            >
              <span className="mobile-nav-item__icon">
                <Icon name={item.icon} size={20} />
              </span>
              <span className="mobile-nav-item__label">{labelOf(item)}</span>
            </Link>
          );
        })}
        {visibleNavItems.length > 4 && (
          <button
            type="button"
            className={`mobile-nav-item${moreOpen ? " is-active" : ""}`}
            onClick={() => setMoreOpen((v) => !v)}
            aria-label={t("sidebar.more")}
            aria-expanded={moreOpen}
          >
            <span className="mobile-nav-item__icon">
              <Icon name={moreOpen ? "bi-x-lg" : "bi-grid"} size={20} />
            </span>
            <span className="mobile-nav-item__label">{t("sidebar.more")}</span>
          </button>
        )}
      </nav>
    </div>
  );
}
