import { useMemo, useState } from "react";
import Icon from "../components/Icon";

const categoryConfigs = {
  dishes: {
    title: "Категория блюд",
    rows: ["Горячие блюда", "Супы", "Напитки", "Выпечка", "Салаты"],
  },
  raw: {
    title: "Категория сырья",
    rows: ["Мясо", "Овощи", "Крупы", "Напитки", "Специи"],
  },
  semi: {
    title: "Категория полуфабрикатов",
    rows: ["Заготовки", "Тесто", "Фарш", "Соусы"],
  },
  sales: {
    title: "Категория реализации",
    rows: ["Основное меню", "Доставка", "Банкет", "Завтрак", "Бар"],
  },
};

function makeRows(config) {
  return config.rows.map((name, index) => ({
    id: index + 1,
    name,
    parent: index % 2 === 0 ? "Нет" : "Основная",
    count: 12 + index * 4,
    status: "Активно",
  }));
}

function CategoriesPage({ type = "dishes" }) {
  const config = categoryConfigs[type] || categoryConfigs.dishes;
  const [rows, setRows] = useState(() => makeRows(config));
  const [activeTab, setActiveTab] = useState("Активно");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", parent: "", status: "Активно" });

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => row.status === activeTab && (!query || row.name.toLowerCase().includes(query)));
  }, [activeTab, rows, search]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", parent: "", status: "Активно" });
    setDrawerOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({ name: row.name, parent: row.parent, status: row.status });
    setDrawerOpen(true);
  };

  const archiveRow = (id) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status: "Архив" } : row)));
  };

  const saveRow = (event) => {
    event.preventDefault();
    if (editingId) {
      setRows((current) => current.map((row) => (row.id === editingId ? { ...row, ...form, id: editingId } : row)));
    } else {
      setRows((current) => [{ id: Date.now(), ...form, count: 0 }, ...current]);
    }
    setDrawerOpen(false);
  };

  return (
    <div className="nomenclature-page">
      <section className="nomenclature-card">
        <header className="nomenclature-header">
          <div className="nomenclature-title-group">
            <span className="nomenclature-accent-bar" />
            <div>
              <p>Номенклатура</p>
              <h1>{config.title}</h1>
            </div>
          </div>
          <div className="nomenclature-actions">
            <button type="button" className="nomenclature-primary-action" onClick={openAdd}>
              <Icon name="bi-plus" size={18} />
              Добавить +
            </button>
          </div>
        </header>

        <div className="nomenclature-tabs">
          {["Активно", "Архив"].map((tab) => (
            <button key={tab} type="button" className={activeTab === tab ? "is-active" : ""} onClick={() => setActiveTab(tab)}>
              {tab === "Активно" ? "Активные" : "Архив"}
            </button>
          ))}
        </div>

        <div className="nomenclature-filters nomenclature-filters--compact">
          <label>
            <span>Поиск</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск категории" />
          </label>
          <div className="nomenclature-filter-actions">
            <button type="button">Фильтровать</button>
            <button type="button" className="nomenclature-clear-action" onClick={() => setSearch("")}>Очистить</button>
          </div>
        </div>

        <div className="nomenclature-table-wrapper">
          <table className="nomenclature-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Родительская категория</th>
                <th>Кол-во элементов</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td className="nomenclature-name-cell">{row.name}</td>
                  <td>{row.parent || "Нет"}</td>
                  <td>{row.count}</td>
                  <td><span className={`nomenclature-status-badge ${row.status === "Архив" ? "is-archived" : ""}`}>{row.status}</span></td>
                  <td>
                    <div className="nomenclature-row-actions">
                      <button type="button" onClick={() => openEdit(row)}><Icon name="bi-pencil" size={15} />Edit</button>
                      <button type="button" className="is-danger" onClick={() => archiveRow(row.id)}><Icon name="bi-trash3" size={15} />Archive</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleRows.length ? <tr><td colSpan={5} className="nomenclature-empty">Нет данных</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {drawerOpen ? (
        <div className="nomenclature-drawer" role="dialog" aria-modal="true">
          <div className="nomenclature-drawer__backdrop" onClick={() => setDrawerOpen(false)} />
          <form className="nomenclature-form" onSubmit={saveRow}>
            <div className="nomenclature-form__header">
              <div>
                <p>{editingId ? "Редактирование" : "Новая категория"}</p>
                <h2>{config.title}</h2>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Закрыть"><Icon name="bi-x-lg" size={20} /></button>
            </div>
            <div className="nomenclature-form__grid">
              <label><span>Название</span><input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label><span>Родительская категория</span><input value={form.parent} onChange={(event) => setForm((current) => ({ ...current, parent: event.target.value }))} /></label>
              <label>
                <span>Статус</span>
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="Активно">Активно</option>
                  <option value="Архив">Архив</option>
                </select>
              </label>
            </div>
            <div className="nomenclature-form__footer">
              <button type="button" onClick={() => setDrawerOpen(false)}>Отмена</button>
              <button type="submit">Сохранить</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default CategoriesPage;
