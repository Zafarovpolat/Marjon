import { Link } from "react-router-dom";
import Icon from "../Icon";
import { sidebarLanguages } from "./navConfig";

// Меню аккаунта сайдбара OWNER (профиль, язык, магазин, отзывы, выход).
// Вынесено из Sidebar.jsx (FE-07B). Разметка, классы и поведение сохранены 1:1;
// состояние и обработчики принадлежат оркестратору Sidebar и приходят пропсами.
export default function SidebarAccount({
  accountRef,
  accountOpen,
  setAccountOpen,
  collapsed,
  displayName,
  role,
  user,
  profilePhoto,
  profileCardName,
  profileCardRole,
  storedProfile,
  canOpenProfile,
  canOpenSupport,
  canOpenStore,
  canOpenReviews,
  lang,
  langPanelOpen,
  setLangPanelOpen,
  selectLang,
  closeAccountAndSelectMenu,
  handleLogout,
  openCollapsedAccount,
  closeCollapsedAccount,
}) {
  return (
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
          {canOpenProfile ? (
            <Link className="sidebar-account__item" to="/settings/profile" role="menuitem" onClick={() => closeAccountAndSelectMenu("settings")}>
              <Icon name="bi-person-gear" size={16} />
              <span>Настройка профиля</span>
            </Link>
          ) : null}
          {canOpenSupport ? (
            <Link className="sidebar-account__item" to="/settings/support" role="menuitem" onClick={() => closeAccountAndSelectMenu("settings")}>
              <Icon name="bi-headset" size={16} />
              <span>Тех. поддержка</span>
            </Link>
          ) : null}

          <div className={`sidebar-account__lang ${langPanelOpen ? "is-open" : ""}`}>
            <button
              type="button"
              className="sidebar-account__lang-trigger"
              onClick={() => setLangPanelOpen((open) => !open)}
              aria-expanded={langPanelOpen}
              aria-haspopup="menu"
            >
              <span className="sidebar-account__lang-label">
                <Icon name="bi-translate" size={16} />
                Язык
              </span>
              <span className="sidebar-account__lang-current">{lang.toUpperCase()}</span>
              <Icon name="bi-chevron-down" size={14} className="sidebar-account__lang-chevron" aria-hidden="true" />
            </button>
            {langPanelOpen ? (
              <div className="sidebar-account__lang-panel" role="menu" aria-label="Выбор языка">
                {sidebarLanguages.map((language) => (
                  <button
                    key={language.code}
                    type="button"
                    className={lang === language.code ? "is-active" : ""}
                    onClick={() => selectLang(language.code)}
                    role="menuitemradio"
                    aria-checked={lang === language.code}
                    aria-label={`${language.label}: ${language.native}`}
                  >
                    <span className="sidebar-account__lang-flag" aria-hidden="true">
                      <img src={language.flagUrl} alt="" loading="lazy" decoding="async" />
                    </span>
                    <span className="sidebar-account__lang-code">{language.short}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {canOpenStore ? (
            <Link className="sidebar-account__item" to="/store" role="menuitem" onClick={() => closeAccountAndSelectMenu("")}>
              <Icon name="bi-shop" size={16} />
              <span>Магазин</span>
            </Link>
          ) : null}
          {canOpenReviews ? (
            <Link className="sidebar-account__item" to="/reviews" role="menuitem" onClick={() => closeAccountAndSelectMenu("")}>
              <Icon name="bi-chat-left" size={16} />
              <span>Отзывы</span>
            </Link>
          ) : null}

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
  );
}
