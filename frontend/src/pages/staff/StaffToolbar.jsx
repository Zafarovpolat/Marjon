import Icon from "../../components/Icon";
import { roleOptions } from "./staffConstants";

// Шапка, вкладки статуса и панель фильтров списка сотрудников OWNER.
// Вынесено из StaffRolePage.jsx (FE-07B). Разметка, классы и текст сохранены 1:1;
// состояние фильтров и обработчики принадлежат оркестратору и приходят пропсами.
export default function StaffToolbar({
  pageTitle,
  openAddModal,
  activeTab,
  setActiveTab,
  draftFilters,
  setDraftFilters,
  routeRole,
  applyFilters,
  clearFilters,
}) {
  return (
    <>
      <header className="staff-header">
        <div className="staff-header__title">
          <span className="staff-header__accent" aria-hidden="true" />
          <div>
            <p className="staff-header__eyebrow">Пользователи</p>
            <h1>{pageTitle}</h1>
          </div>
        </div>
        <button className="staff-add-button" type="button" onClick={openAddModal}>
          <Icon name="bi-plus" size={18} />
          Добавить +
        </button>
      </header>

      <div className="staff-tabs" role="tablist" aria-label="Статус сотрудников">
        <button
          className={activeTab === "active" ? "is-active" : ""}
          type="button"
          onClick={() => setActiveTab("active")}
        >
          <Icon name="bi-check2-circle" size={17} />
          Активные
        </button>
        <button
          className={activeTab === "archived" ? "is-active" : ""}
          type="button"
          onClick={() => setActiveTab("archived")}
        >
          <Icon name="bi-archive" size={17} />
          Архивированные
        </button>
      </div>

      <div className="staff-filters">
        <label>
          <span>Поиск</span>
          <div className="staff-filter-control">
            <Icon name="bi-search" size={17} />
            <input
              type="search"
              value={draftFilters.query}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="ФИО или телефон"
            />
          </div>
        </label>
        <label>
          <span>Роль</span>
          <select
            value={draftFilters.roleKey}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, roleKey: event.target.value }))
            }
            disabled={routeRole !== "all"}
          >
            <option value="">Все роли</option>
            {roleOptions.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Статус</span>
          <select
            value={draftFilters.status}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="">Все статусы</option>
            <option value="active">Активные</option>
            <option value="archived">Архивированные</option>
          </select>
        </label>
        <div className="staff-filter-buttons">
          <button type="button" onClick={applyFilters}>
            <Icon name="bi-funnel" size={16} />
            Фильтровать
          </button>
          <button type="button" className="staff-clear-button" onClick={clearFilters}>
            <Icon name="bi-arrow-counterclockwise" size={16} />
            Очистить
          </button>
        </div>
      </div>
    </>
  );
}