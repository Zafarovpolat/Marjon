import { useEffect, useMemo, useState } from "react";
import { api, formatMoney } from "../api/client";
import Icon from "../components/Icon";

const ACTIVE = "Активно";
const ARCHIVED = "Архив";

const photoLibrary = {
  cola: [
    "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1581636625402-29b2a704ef13?auto=format&fit=crop&w=260&q=80",
  ],
  plov: [
    "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=260&q=80",
  ],
  mastava: [
    "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1604152135912-04a022e23696?auto=format&fit=crop&w=260&q=80",
  ],
  lagman: [
    "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=260&q=80",
  ],
  drinks: [
    "https://images.unsplash.com/photo-1551538827-9c037cb4f32a?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1570598912132-0ba1dc952b7d?auto=format&fit=crop&w=260&q=80",
  ],
  dishes: [
    "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=260&q=80",
  ],
};

function apiProductToRow(product, categories = []) {
  const cat = categories.find((c) => c.id === product.category_id);
  return {
    id: product.id,
    name: product.name,
    sort: String(product.sort_order || 1),
    type: "Блюда",
    unit: product.unit || "шт",
    cost: product.cost_price ? `${Number(product.cost_price).toLocaleString("ru-RU")} UZS` : "0 UZS",
    price: String(product.price || ""),
    menu: cat?.name || "",
    printer: "",
    recipe: "Рецепт (0 шт)",
    stock: "-",
    auto: product.is_available ?? true,
    set: product.is_active ?? true,
    category: cat?.name || "",
    chef: "",
    photo: "",
    _raw: product,
  };
}

function parsePrice(value = "") {
  return Number(String(value).replace(/[^\d.]/g, "")) || 0;
}

function getPhotoOptions(row, query = "") {
  const normalized = `${query} ${row.name}`.toLowerCase();
  if (normalized.includes("cola") || normalized.includes("кока")) return photoLibrary.cola;
  if (normalized.includes("плов") || normalized.includes("osh")) return photoLibrary.plov;
  if (normalized.includes("мастава") || normalized.includes("mastava")) return photoLibrary.mastava;
  if (normalized.includes("лагман") || normalized.includes("lagman")) return photoLibrary.lagman;
  if (row.category === "Напитки" || normalized.includes("suv") || normalized.includes("moxito") || normalized.includes("сок")) return photoLibrary.drinks;
  return photoLibrary.dishes;
}

function renderToggle(value, onClick) {
  if (value === null) return <span className="dish-toggle-empty">-</span>;
  return (
    <button type="button" className={`dish-toggle ${value ? "is-on" : ""}`} onClick={onClick} aria-pressed={value}>
      <span />
    </button>
  );
}

const fieldLabels = { name: "Название", sort: "Сорт", price: "Цена", cost: "Себестоимость", menu: "Меню", printer: "Принтер", category: "Категория", chef: "Повар" };

const fallbackConfigs = {
  raw: {
    title: "Сырьё", action: "Добавить +",
    columns: ["Название", "Категория", "Ед. изм", "Остаток", "Мин. остаток", "Цена закупки", "Поставщик", "Статус", "Действия"],
    rows: [],
  },
  semi: {
    title: "Полуфабрикаты", action: "Добавить +",
    columns: ["Название", "Категория", "Ед. изм", "Себестоимость", "Состав", "Статус", "Действия"],
    rows: [],
  },
};

function NomenclaturePage({ type = "dishes" }) {
  if (type === "dishes") return <DishesCatalogPage />;
  return <SimpleNomenclaturePage config={fallbackConfigs[type] || fallbackConfigs.raw} />;
}

function DishesCatalogPage() {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftFilters, setDraftFilters] = useState({ search: "", chef: "", category: "" });
  const [filters, setFilters] = useState(draftFilters);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [photoPicker, setPhotoPicker] = useState(null);
  const [photoSearch, setPhotoSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", sort: "1", type: "Блюда", unit: "шт", cost: "0", price: "", menu: "", printer: "", category: "", chef: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [productsRes, catsRes] = await Promise.all([
        api.get("/inventory/products"),
        api.get("/inventory/categories"),
      ]);
      setCategories(catsRes.data);
      setRows(productsRes.data.map((p) => apiProductToRow(p, catsRes.data)));
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось загрузить данные.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const dishStats = useMemo(() => [
    { label: "Кол-во товаров", value: String(rows.length), rows: [["Активных", String(rows.filter((r) => r.set).length)], ["Архив", String(rows.filter((r) => !r.set).length)]], icon: "bi-basket", tone: "blue" },
    { label: "Доступность", value: String(rows.filter((r) => r.auto).length), rows: [["Доступно", String(rows.filter((r) => r.auto).length)], ["Скрыто", String(rows.filter((r) => !r.auto).length)]], icon: "bi-eye", tone: "green" },
    { label: "С ценой", value: String(rows.filter((r) => parsePrice(r.price) > 0).length), rows: [["С ценой", String(rows.filter((r) => parsePrice(r.price) > 0).length)], ["Без цены", String(rows.filter((r) => parsePrice(r.price) === 0).length)]], icon: "bi-cash-coin", tone: "orange" },
  ], [rows]);

  const categoryOptions = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))], [rows]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const searchMatch = !filters.search || row.name.toLowerCase().includes(filters.search.toLowerCase());
    const chefMatch = !filters.chef || row.chef === filters.chef;
    const categoryMatch = !filters.category || row.category === filters.category;
    return searchMatch && chefMatch && categoryMatch;
  }), [rows, filters]);

  const updateRow = (id, key, value) =>
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [key]: value } : r));

  const openDrawer = (row = null) => {
    setEditing(row);
    setForm(row
      ? { name: row.name, sort: row.sort, type: row.type, unit: row.unit, cost: String(parsePrice(row.cost)), price: row.price, menu: row.menu, printer: row.printer, category: row.category, chef: row.chef }
      : { name: "", sort: "1", type: "Блюда", unit: "шт", cost: "0", price: "", menu: "", printer: "", category: "", chef: "" }
    );
    setDrawerOpen(true);
  };

  async function saveDish() {
    setSaving(true);
    setError("");
    try {
      const cat = categories.find((c) => c.name === form.category || c.name === form.menu);
      const payload = {
        name: form.name,
        price: parsePrice(form.price),
        cost_price: parsePrice(form.cost),
        unit: form.unit,
        sort_order: Number(form.sort || 1),
        category_id: cat?.id || null,
        description: form.chef || null,
      };
      if (editing) {
        await api.patch(`/inventory/products/${editing.id}`, payload);
      } else {
        await api.post("/inventory/products", payload);
      }
      setDrawerOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось сохранить блюдо.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveDish(id) {
    try {
      await api.patch(`/inventory/products/${id}`, { is_active: false });
      load();
    } catch {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
  }

  async function toggleField(row, field) {
    const apiField = field === "auto" ? "is_available" : "is_active";
    const newValue = !row[field];
    updateRow(row.id, field, newValue);
    try {
      await api.patch(`/inventory/products/${row.id}`, { [apiField]: newValue });
    } catch {
      updateRow(row.id, field, !newValue);
    }
  }

  const openPhotoPicker = (row) => { setPhotoPicker(row); setPhotoSearch(row.name); };
  const selectPhoto = (photo) => {
    if (!photoPicker) return;
    updateRow(photoPicker.id, "photo", photo);
    setPhotoPicker(null); setPhotoSearch("");
  };

  return (
    <section className="nomenclature-page dish-catalog-page">
      <div className="dish-catalog-card">
        <div className="dish-catalog-header">
          <div className="report-title-group">
            <span className="report-accent-bar" />
            <div>
              <h1>Блюда</h1>
              <p>Каталог блюд и товаров — реальные данные из базы.</p>
            </div>
          </div>
          <div className="dish-header-actions">
            <button type="button" className="btn-primary" onClick={() => openDrawer()}>
              <Icon name="bi-plus" /> Добавить
            </button>
          </div>
        </div>

        {error ? <div className="login-error">{error}</div> : null}

        <div className="dish-stat-grid">
          {dishStats.map((stat) => (
            <article className={`dish-stat-card dish-stat-${stat.tone}`} key={stat.label}>
              <div className="dish-stat-top"><span>{stat.label}</span><Icon name={stat.icon} size={20} /></div>
              <strong>{stat.value}</strong>
              <div className="dish-stat-lines">
                {stat.rows.map(([label, value]) => (
                  <button type="button" key={label} onClick={() => {}}>
                    <em>{label}</em><b>{value}</b>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="dish-toolbar">
          <label className="dish-search">
            <Icon name="bi-search" />
            <input value={draftFilters.search}
              onChange={(e) => setDraftFilters((p) => ({ ...p, search: e.target.value }))}
              placeholder="Поиск" />
          </label>
          <select value={draftFilters.category}
            onChange={(e) => setDraftFilters((p) => ({ ...p, category: e.target.value }))}>
            <option value="">Категория</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" className="btn-outline-primary" onClick={() => setFilters(draftFilters)}>
            <Icon name="bi-funnel" /> Фильтровать
          </button>
          <button type="button" className="btn-outline-danger"
            onClick={() => { const e = { search: "", chef: "", category: "" }; setDraftFilters(e); setFilters(e); }}>
            Очистить
          </button>
        </div>

        <div className="dish-grid-wrap">
          <table className="dish-grid-table">
            <thead>
              <tr>
                <th>Действия</th><th>Фото</th><th>Название</th><th>Сорт</th>
                <th>Тип</th><th>Ед. изм</th><th>Себестоимость</th><th>Цена</th>
                <th>Категория</th><th>Доступно</th><th>Активно</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={{ textAlign: "center", padding: 24 }}>Загрузка...</td></tr>
              ) : filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="dish-row-actions">
                      <button type="button" onClick={() => openDrawer(row)}><Icon name="bi-pencil" size={15} /></button>
                      <button type="button" className="danger" onClick={() => archiveDish(row.id)}><Icon name="bi-trash3" size={15} /></button>
                    </div>
                  </td>
                  <td>
                    <button type="button" className="dish-photo-button" onClick={() => openPhotoPicker(row)}>
                      {row.photo ? <img className="dish-photo" src={row.photo} alt={row.name} /> : <span className="dish-photo-placeholder"><Icon name="bi-image" /></span>}
                    </button>
                  </td>
                  <td><button type="button" className="dish-name-link">{row.name}</button></td>
                  <td><input className="dish-mini-input" value={row.sort} onChange={(e) => updateRow(row.id, "sort", e.target.value)} /></td>
                  <td><span className="dish-type-pill">{row.type}</span></td>
                  <td>{row.unit}</td>
                  <td>{row.cost}</td>
                  <td><input className="dish-price-input" value={row.price} onChange={(e) => updateRow(row.id, "price", e.target.value)} /></td>
                  <td><span className="dish-menu-pill">{row.category || row.menu || "—"}</span></td>
                  <td>{renderToggle(row.auto, () => toggleField(row, "auto"))}</td>
                  <td>{renderToggle(row.set, () => toggleField(row, "set"))}</td>
                </tr>
              ))}
              {!loading && !filteredRows.length ? (
                <tr><td colSpan={11} style={{ textAlign: "center", padding: 24 }}>Блюд пока нет.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <div className="nomenclature-drawer dish-drawer">
          <div className="nomenclature-drawer-card">
            <div className="nomenclature-drawer-header">
              <h2>{editing ? "Редактировать блюдо" : "Добавить блюдо"}</h2>
              <button type="button" onClick={() => setDrawerOpen(false)}><Icon name="bi-x-lg" /></button>
            </div>
            <div className="nomenclature-form">
              {["name", "sort", "price", "cost", "category", "chef"].map((field) => (
                <label key={field}>
                  <span>{fieldLabels[field]}</span>
                  <input value={form[field] || ""} onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))} />
                </label>
              ))}
              <label>
                <span>Тип</span>
                <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                  <option>Блюда</option><option>Реализация</option>
                </select>
              </label>
              <label>
                <span>Ед. изм</span>
                <select value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}>
                  <option>шт</option><option>порция</option><option>кг</option><option>л</option>
                </select>
              </label>
            </div>
            {error ? <div className="login-error" style={{ margin: "8px 0" }}>{error}</div> : null}
            <div className="nomenclature-drawer-footer">
              <button type="button" className="btn-soft" onClick={() => setDrawerOpen(false)}>Отмена</button>
              <button type="button" className="btn-primary" disabled={saving} onClick={saveDish}>
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {photoPicker && (
        <div className="dish-photo-modal" role="dialog" aria-modal="true">
          <div className="dish-photo-modal__backdrop" onClick={() => setPhotoPicker(null)} />
          <div className="dish-photo-modal__card">
            <div className="dish-photo-modal__header">
              <div><span>База фото</span><h2>{photoPicker.name}</h2></div>
              <button type="button" onClick={() => setPhotoPicker(null)}><Icon name="bi-x-lg" /></button>
            </div>
            <label className="dish-photo-search">
              <Icon name="bi-search" />
              <input value={photoSearch} onChange={(e) => setPhotoSearch(e.target.value)}
                placeholder="плов, cola, мастава..." autoFocus />
            </label>
            <div className="dish-photo-modal__grid">
              {getPhotoOptions(photoPicker, photoSearch).map((photo) => (
                <button type="button" key={photo} className="dish-photo-option" onClick={() => selectPhoto(photo)}>
                  <img src={photo} alt={photoPicker.name} />
                  {photoPicker.photo === photo && <span><Icon name="bi-check2" /> Выбрано</span>}
                </button>
              ))}
            </div>
            <div className="dish-photo-modal__footer">
              <button type="button" className="btn-soft" onClick={() => setPhotoPicker(null)}>Отмена</button>
              <button type="button" className="btn-outline-danger" onClick={() => selectPhoto("")}>Убрать фото</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SimpleNomenclaturePage({ config }) {
  const [rows, setRows] = useState(config.rows || []);
  const [query, setQuery] = useState("");
  const filteredRows = rows.filter((r) => r.join(" ").toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="nomenclature-page">
      <div className="nomenclature-card">
        <div className="nomenclature-header">
          <div className="report-title-group">
            <span className="report-accent-bar" />
            <div><h1>{config.title}</h1><p>Справочник склада в Marjon-дизайне.</p></div>
          </div>
          <div className="nomenclature-actions">
            <button type="button" className="btn-primary"><Icon name="bi-plus" /> {config.action}</button>
          </div>
        </div>
        <div className="nomenclature-filters">
          <label>
            <Icon name="bi-search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск" />
          </label>
        </div>
        <div className="nomenclature-table-wrapper">
          <table className="nomenclature-table">
            <thead><tr>{config.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td key={i}>{i === row.length - 1 ? <span className="nomenclature-status-badge">{cell}</span> : cell}</td>
                  ))}
                  <td>
                    <div className="dish-row-actions">
                      <button type="button"><Icon name="bi-pencil" size={15} /></button>
                      <button type="button" className="danger"><Icon name="bi-trash3" size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? <tr><td colSpan={config.columns.length} style={{ textAlign: "center", padding: 24 }}>Данных нет.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default NomenclaturePage;