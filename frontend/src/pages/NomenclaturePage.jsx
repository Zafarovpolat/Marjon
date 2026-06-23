import { useMemo, useState } from "react";
import Icon from "../components/Icon";

const ACTIVE = "Активно";
const ARCHIVED = "Архив";

const pageConfig = {
  dishes: {
    title: "Блюда",
    addLabel: "Добавить блюдо +",
    searchPlaceholder: "Поиск по названию...",
    summary: [
      { label: "Всего блюд", value: "128", note: "наименований", tone: "blue", icon: "bi-cup-hot" },
      { label: "Активные", value: "112", note: "блюд", tone: "green", icon: "bi-check2-circle" },
      { label: "Архив", value: "16", note: "блюд", tone: "orange", icon: "bi-archive" },
      { label: "Средняя цена", value: "28 400 UZS", note: "средняя стоимость", tone: "purple", icon: "bi-currency-exchange" },
    ],
    filters: [
      ["category", "Категория", ["Горячие блюда", "Супы", "Напитки", "Выпечка", "Салаты", "Шашлык"]],
      ["status", "Статус", [ACTIVE, ARCHIVED]],
      ["unit", "Ед. изм.", ["порция", "чашка", "шт", "стакан"]],
      ["workshop", "Цех / Повар", ["Горячий цех", "Бар", "Выпечка", "Мангал"]],
    ],
    columns: ["Фото", "Название", "Категория", "Цена", "Себестоимость", "Маржа", "Ед. изм.", "Статус", "Действия"],
    rows: [
      { id: 1, name: "Плов", category: "Горячие блюда", price: "35 000 UZS", cost: "22 000 UZS", margin: "+13 000 UZS", unit: "порция", status: ACTIVE, workshop: "Горячий цех", description: "Классический плов", photo: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=160&q=80" },
      { id: 2, name: "Лагман", category: "Супы", price: "32 000 UZS", cost: "18 000 UZS", margin: "+14 000 UZS", unit: "порция", status: ACTIVE, workshop: "Горячий цех", description: "Домашний лагман", photo: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=160&q=80" },
      { id: 3, name: "Чай зелёный", category: "Напитки", price: "6 000 UZS", cost: "1 500 UZS", margin: "+4 500 UZS", unit: "чашка", status: ACTIVE, workshop: "Бар", description: "Зелёный чай", photo: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=160&q=80" },
      { id: 4, name: "Самса с мясом", category: "Выпечка", price: "8 000 UZS", cost: "4 500 UZS", margin: "+3 500 UZS", unit: "шт", status: ACTIVE, workshop: "Выпечка", description: "Тандырная самса", photo: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=160&q=80" },
      { id: 5, name: "Салат Греческий", category: "Салаты", price: "24 000 UZS", cost: "12 500 UZS", margin: "+11 500 UZS", unit: "порция", status: ACTIVE, workshop: "Горячий цех", description: "Свежий салат", photo: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=160&q=80" },
      { id: 6, name: "Шашлык из говядины", category: "Шашлык", price: "45 000 UZS", cost: "28 000 UZS", margin: "+17 000 UZS", unit: "порция", status: ACTIVE, workshop: "Мангал", description: "Мангал", photo: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=160&q=80" },
      { id: 7, name: "Лимонад", category: "Напитки", price: "10 000 UZS", cost: "3 000 UZS", margin: "+7 000 UZS", unit: "стакан", status: ACTIVE, workshop: "Бар", description: "Домашний лимонад", photo: "https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=160&q=80" },
    ],
  },
  raw: {
    title: "Сырьё",
    addLabel: "Добавить +",
    searchPlaceholder: "Поиск сырья...",
    filters: [
      ["category", "Категория", ["Мясо", "Крупы", "Овощи"]],
      ["status", "Статус", [ACTIVE, ARCHIVED]],
      ["unit", "Ед. изм.", ["кг", "л", "шт"]],
      ["supplier", "Поставщик", ["Bozor", "Поставщик 1"]],
    ],
    columns: ["Название", "Категория", "Ед. изм", "Остаток", "Мин. остаток", "Цена закупки", "Поставщик", "Статус", "Действия"],
    rows: [
      { id: 11, name: "Говядина", category: "Мясо", unit: "кг", stock: "24.5", minStock: "5", purchasePrice: "78 000 UZS", supplier: "Bozor", status: ACTIVE },
      { id: 12, name: "Рис", category: "Крупы", unit: "кг", stock: "55", minStock: "10", purchasePrice: "15 000 UZS", supplier: "Поставщик 1", status: ACTIVE },
      { id: 13, name: "Лук", category: "Овощи", unit: "кг", stock: "12", minStock: "5", purchasePrice: "4 000 UZS", supplier: "Bozor", status: ACTIVE },
    ],
  },
  semi: {
    title: "Полуфабрикаты",
    addLabel: "Добавить +",
    searchPlaceholder: "Поиск полуфабриката...",
    filters: [
      ["category", "Категория", ["Заготовки"]],
      ["status", "Статус", [ACTIVE, ARCHIVED]],
      ["unit", "Ед. изм.", ["кг", "шт"]],
    ],
    columns: ["Название", "Категория", "Ед. изм", "Себестоимость", "Состав", "Статус", "Действия"],
    rows: [
      { id: 21, name: "Фарш говяжий", category: "Заготовки", unit: "кг", cost: "65 000 UZS", composition: "3 ингредиента", status: ACTIVE },
      { id: 22, name: "Тесто", category: "Заготовки", unit: "кг", cost: "12 000 UZS", composition: "4 ингредиента", status: ACTIVE },
    ],
  },
};

const emptyByType = {
  dishes: { name: "", category: "", price: "", cost: "", margin: "", unit: "", status: ACTIVE, description: "", photo: "" },
  raw: { name: "", category: "", unit: "", stock: "", minStock: "", purchasePrice: "", supplier: "", status: ACTIVE },
  semi: { name: "", category: "", unit: "", cost: "", composition: "", status: ACTIVE },
};

function NomenclaturePage({ type = "dishes" }) {
  const config = pageConfig[type] || pageConfig.dishes;
  const [rows, setRows] = useState(config.rows);
  const [draftFilters, setDraftFilters] = useState({ search: "", category: "", status: "", unit: "", workshop: "", supplier: "" });
  const [filters, setFilters] = useState(draftFilters);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyByType[type] || emptyByType.dishes);

  const visibleRows = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch = !query || row.name.toLowerCase().includes(query);
      const matchesFilters = Object.entries(filters).every(([key, value]) => {
        if (!value || key === "search") return true;
        return row[key] === value;
      });

      return matchesSearch && matchesFilters;
    });
  }, [filters, rows]);

  const updateDraft = (key, value) => setDraftFilters((current) => ({ ...current, [key]: value }));
  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...(emptyByType[type] || emptyByType.dishes) });
    setDrawerOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({ ...(emptyByType[type] || emptyByType.dishes), ...row });
    setDrawerOpen(true);
  };

  const archiveRow = (id) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status: ARCHIVED } : row)));
  };

  const saveRow = (event) => {
    event.preventDefault();
    if (editingId) {
      setRows((current) => current.map((row) => (row.id === editingId ? { ...row, ...form, id: editingId } : row)));
    } else {
      setRows((current) => [{ ...form, id: Date.now(), status: form.status || ACTIVE }, ...current]);
    }
    setDrawerOpen(false);
  };

  const clearFilters = () => {
    const reset = { search: "", category: "", status: "", unit: "", workshop: "", supplier: "" };
    setDraftFilters(reset);
    setFilters(reset);
  };

  return (
    <div className="nomenclature-page">
      <section className="nomenclature-card nomenclature-card--reference">
        <header className="nomenclature-header">
          <div className="nomenclature-title-group">
            <span className="nomenclature-accent-bar" />
            <h1>{config.title}</h1>
          </div>
          <div className="nomenclature-actions">
            {type === "dishes" ? (
              <button type="button">
                <Icon name="bi-box-arrow-up" size={16} />
                Импорт Excel
              </button>
            ) : null}
            <button type="button" className="nomenclature-primary-action" onClick={openAdd}>
              {config.addLabel}
            </button>
          </div>
        </header>

        {config.summary ? (
          <div className="nomenclature-summary-grid">
            {config.summary.map((item) => (
              <div className={`nomenclature-summary-card nomenclature-summary-card--${item.tone}`} key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.note}</small>
                </div>
                <i aria-hidden="true">
                  <Icon name={item.icon} size={28} />
                </i>
              </div>
            ))}
          </div>
        ) : null}

        <div className="nomenclature-table-panel">
          <div className="nomenclature-filters">
            <label className="nomenclature-search-control">
              <input value={draftFilters.search} onChange={(event) => updateDraft("search", event.target.value)} placeholder={config.searchPlaceholder} />
              <Icon name="bi-search" size={17} />
            </label>
            {config.filters.map(([key, label, options]) => (
              <label key={key}>
                <span>{label}</span>
                <select value={draftFilters[key] || ""} onChange={(event) => updateDraft(key, event.target.value)}>
                  <option value="">Все</option>
                  {options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            ))}
            <div className="nomenclature-filter-actions">
              <button type="button" onClick={() => setFilters(draftFilters)}>
                <Icon name="bi-funnel" size={15} />
                Фильтровать
              </button>
              <button type="button" className="nomenclature-clear-action" onClick={clearFilters}>Очистить</button>
            </div>
          </div>

          <div className="nomenclature-table-wrapper">
            <table className="nomenclature-table">
              <thead>
                <tr>{config.columns.map((column) => <th key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    {renderCells(type, row, openEdit, archiveRow)}
                  </tr>
                ))}
                {!visibleRows.length ? <tr><td colSpan={config.columns.length} className="nomenclature-empty">Нет данных</td></tr> : null}
              </tbody>
            </table>
          </div>

          <footer className="nomenclature-pagination">
            <span>Показано 1 - {Math.min(10, visibleRows.length)} из 128</span>
            <div>
              <button type="button" disabled><Icon name="bi-chevron-left" size={15} /></button>
              <button type="button" className="is-active">1</button>
              <button type="button">2</button>
              <button type="button">3</button>
              <span>...</span>
              <button type="button">13</button>
              <button type="button"><Icon name="bi-chevron-right" size={15} /></button>
            </div>
            <select defaultValue="10">
              <option value="10">10 / стр.</option>
              <option value="20">20 / стр.</option>
            </select>
          </footer>
        </div>
      </section>

      {drawerOpen ? (
        <div className="nomenclature-drawer" role="dialog" aria-modal="true">
          <div className="nomenclature-drawer__backdrop" onClick={() => setDrawerOpen(false)} />
          <form className="nomenclature-form" onSubmit={saveRow}>
            <div className="nomenclature-form__header">
              <div>
                <p>{editingId ? "Редактирование" : "Новая запись"}</p>
                <h2>{config.title}</h2>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Закрыть"><Icon name="bi-x-lg" size={20} /></button>
            </div>
            {renderForm(type, form, updateForm)}
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

function renderCells(type, row, openEdit, archiveRow) {
  const status = <span className={`nomenclature-status-badge ${row.status === ARCHIVED ? "is-archived" : ""}`}>{row.status}</span>;
  const category = <span className={`nomenclature-category-badge ${getCategoryClass(row.category)}`}>{row.category || "-"}</span>;
  const actions = (
    <td>
      <div className="nomenclature-row-actions">
        <button type="button" aria-label="Редактировать" onClick={() => openEdit(row)}><Icon name="bi-pencil" size={15} /></button>
        <button type="button" className="is-danger" aria-label="Архивировать" onClick={() => archiveRow(row.id)}><Icon name="bi-trash3" size={15} /></button>
      </div>
    </td>
  );

  if (type === "dishes") {
    return (
      <>
        <td><div className="nomenclature-photo">{row.photo ? <img src={row.photo} alt={row.name} /> : <Icon name="bi-image" size={20} />}</div></td>
        <td className="nomenclature-name-cell">{row.name}</td>
        <td>{category}</td>
        <td>{row.price}</td>
        <td>{row.cost}</td>
        <td className="nomenclature-margin-positive">{row.margin}</td>
        <td>{row.unit}</td>
        <td>{status}</td>
        {actions}
      </>
    );
  }

  if (type === "raw") {
    return (
      <>
        <td className="nomenclature-name-cell">{row.name}</td>
        <td>{category}</td>
        <td>{row.unit}</td>
        <td>{row.stock}</td>
        <td>{row.minStock}</td>
        <td>{row.purchasePrice}</td>
        <td>{row.supplier}</td>
        <td>{status}</td>
        {actions}
      </>
    );
  }

  return (
    <>
      <td className="nomenclature-name-cell">{row.name}</td>
      <td>{category}</td>
      <td>{row.unit}</td>
      <td>{row.cost}</td>
      <td>{row.composition}</td>
      <td>{status}</td>
      {actions}
    </>
  );
}

function getCategoryClass(category = "") {
  const map = {
    "Горячие блюда": "is-blue",
    "Супы": "is-green",
    "Напитки": "is-yellow",
    "Выпечка": "is-purple",
    "Салаты": "is-red",
    "Шашлык": "is-cyan",
  };
  return map[category] || "is-blue";
}

function renderForm(type, form, updateForm) {
  const commonStatus = (
    <label>
      <span>Статус</span>
      <select value={form.status} onChange={(event) => updateForm("status", event.target.value)}>
        <option value={ACTIVE}>Активно</option>
        <option value={ARCHIVED}>Архив</option>
      </select>
    </label>
  );

  if (type === "dishes") {
    return (
      <div className="nomenclature-form__grid">
        <label><span>Фото</span><input value={form.photo || ""} onChange={(event) => updateForm("photo", event.target.value)} placeholder="URL фото" /></label>
        <label><span>Название</span><input required value={form.name} onChange={(event) => updateForm("name", event.target.value)} /></label>
        <label><span>Категория</span><input value={form.category} onChange={(event) => updateForm("category", event.target.value)} /></label>
        <label><span>Цена</span><input value={form.price} onChange={(event) => updateForm("price", event.target.value)} /></label>
        <label><span>Себестоимость</span><input value={form.cost} onChange={(event) => updateForm("cost", event.target.value)} /></label>
        <label><span>Ед. изм</span><input value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} /></label>
        {commonStatus}
        <label className="nomenclature-form__wide"><span>Описание</span><textarea value={form.description || ""} onChange={(event) => updateForm("description", event.target.value)} /></label>
      </div>
    );
  }

  if (type === "raw") {
    return (
      <div className="nomenclature-form__grid">
        <label><span>Название</span><input required value={form.name} onChange={(event) => updateForm("name", event.target.value)} /></label>
        <label><span>Категория</span><input value={form.category} onChange={(event) => updateForm("category", event.target.value)} /></label>
        <label><span>Ед. изм</span><input value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} /></label>
        <label><span>Остаток</span><input value={form.stock} onChange={(event) => updateForm("stock", event.target.value)} /></label>
        <label><span>Мин. остаток</span><input value={form.minStock} onChange={(event) => updateForm("minStock", event.target.value)} /></label>
        <label><span>Цена закупки</span><input value={form.purchasePrice} onChange={(event) => updateForm("purchasePrice", event.target.value)} /></label>
        <label><span>Поставщик</span><input value={form.supplier} onChange={(event) => updateForm("supplier", event.target.value)} /></label>
        {commonStatus}
      </div>
    );
  }

  return (
    <div className="nomenclature-form__grid">
      <label><span>Название</span><input required value={form.name} onChange={(event) => updateForm("name", event.target.value)} /></label>
      <label><span>Категория</span><input value={form.category} onChange={(event) => updateForm("category", event.target.value)} /></label>
      <label><span>Ед. изм</span><input value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} /></label>
      <label><span>Себестоимость</span><input value={form.cost} onChange={(event) => updateForm("cost", event.target.value)} /></label>
      <label><span>Состав</span><input value={form.composition} onChange={(event) => updateForm("composition", event.target.value)} /></label>
      {commonStatus}
    </div>
  );
}

export default NomenclaturePage;
