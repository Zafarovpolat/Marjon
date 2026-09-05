// Панель инструментов каталога блюд OWNER: поиск, фильтры и настройка колонок.
// Разметка перенесена из NomenclaturePage.jsx (FE-07B) без изменений.
import Icon from "../../components/Icon";
import { defaultDishColumnVisibility, dishColumnOptions } from "./nomenclatureConfig";

export default function DishesToolbar({
  draftFilters,
  setDraftFilters,
  setFilters,
  settingsOpen,
  setSettingsOpen,
  isColumnVisible,
  visibleColumnCount,
  toggleColumn,
  setVisibleColumns,
}) {
  return (
    <div className="dish-toolbar">
      <label className="dish-search">
        <Icon name="bi-search" />
        <input
          value={draftFilters.search}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, search: event.target.value }))}
          placeholder="Поиск"
        />
      </label>
      <select value={draftFilters.chef} onChange={(event) => setDraftFilters((prev) => ({ ...prev, chef: event.target.value }))}>
        <option value="">Выберите повара</option>
        <option value="Повар 1">Повар 1</option>
        <option value="Повар 2">Повар 2</option>
        <option value="Бар">Бар</option>
      </select>
      <select value={draftFilters.category} onChange={(event) => setDraftFilters((prev) => ({ ...prev, category: event.target.value }))}>
        <option value="">Категория</option>
        <option value="Горячие блюда">Горячие блюда</option>
        <option value="Напитки">Напитки</option>
        <option value="Салаты">Салаты</option>
        <option value="Игры">Игры</option>
      </select>
      <button type="button" className="btn-outline-primary" onClick={() => setFilters(draftFilters)}>
        <Icon name="bi-funnel" /> Фильтровать
      </button>
      <div className="dish-table-settings">
        <button
          type="button"
          className="dish-table-settings-btn"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
        >
          <Icon name="bi-sliders" /> Настроить таблицу
        </button>
        {settingsOpen ? (
          <div className="dish-table-settings-popover">
            <div className="dish-table-settings-head">
              <strong>Столбцы</strong>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Закрыть">
                <Icon name="bi-x-lg" size={14} />
              </button>
            </div>
            <div className="dish-column-toggle-list">
              {dishColumnOptions.map((column) => {
                const checked = isColumnVisible(column.key);
                const disabled = checked && visibleColumnCount <= 1;
                return (
                  <label className="dish-column-toggle" key={column.key}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleColumn(column.key)}
                    />
                    <span className="dish-column-toggle-box">
                      {checked ? <Icon name="bi-check2" size={13} /> : null}
                    </span>
                    <span>{column.label}</span>
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              className="dish-column-reset"
              onClick={() => setVisibleColumns(defaultDishColumnVisibility)}
            >
              Показать все
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
