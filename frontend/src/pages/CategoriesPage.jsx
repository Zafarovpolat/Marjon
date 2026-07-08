import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import DemoNotice from "../components/DemoNotice";
import Icon from "../components/Icon";

const TYPE_CONFIG = {
  dishes: { label: "Категории блюд", title: "Меню", slug_prefix: "dish" },
  raw: { label: "Категории сырья", title: "Категории сырья", slug_prefix: "raw" },
  semi: { label: "Категории полуфабрикатов", title: "Категории полуфабрикатов", slug_prefix: "semi" },
  sales: { label: "Категории реализации", title: "Категории реализации", slug_prefix: "sales" },
};

const DEFAULT_FORM = { name: "", slug: "", sort_order: 0 };

const DEMO_DISH_CATEGORIES = [
  { id: "demo-first", name: "БИРИНЧИ ТАОМ", slug: "birinchi-taom", sort_order: 1, is_active: true },
  { id: "demo-tea", name: "НОН ЧОЙ", slug: "non-choy", sort_order: 2, is_active: true },
  { id: "demo-second", name: "ИККИНЧИ ТАОМ", slug: "ikkinchi-taom", sort_order: 3, is_active: true },
  { id: "demo-salad", name: "САЛАТ", slug: "salat", sort_order: 4, is_active: true },
  { id: "demo-grill", name: "МАНГАЛ", slug: "mangal", sort_order: 5, is_active: true },
  { id: "demo-drinks", name: "ИЧИМЛИКЛАР", slug: "ichimliklar", sort_order: 6, is_active: true },
  { id: "demo-billiard", name: "Billiard", slug: "billiard", sort_order: 7, is_active: true },
  { id: "demo-combo", name: "КОМБО", slug: "combo", sort_order: 8, is_active: true },
];

function withDefaultDishCategories(categories) {
  const current = Array.isArray(categories) ? categories : [];
  const seen = new Set(
    current.map((category) => String(category.slug || category.name || "").trim().toLowerCase()).filter(Boolean),
  );
  const missing = DEMO_DISH_CATEGORIES.filter((category) => {
    const slug = String(category.slug || "").toLowerCase();
    const name = String(category.name || "").toLowerCase();
    return !seen.has(slug) && !seen.has(name);
  });

  return [...current, ...missing];
}

function makeSlug(name, prefix) {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return clean || `${prefix}-${Date.now()}`;
}

function sortCategories(a, b) {
  const first = Number(a.sort_order || 0);
  const second = Number(b.sort_order || 0);

  if (first !== second) return first - second;
  return String(a.name || "").localeCompare(String(b.name || ""), "ru");
}

export default function CategoriesPage({ type = "dishes" }) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.dishes;
  const [rows, setRows] = useState([]);
  const [isDemo, setIsDemo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/inventory/categories");
      const loadedCategories = Array.isArray(data) ? data : [];
      setRows(type === "dishes" ? withDefaultDishCategories(loadedCategories) : loadedCategories);
      if (loadedCategories.length) setIsDemo(false);
    } catch (err) {
      if (type === "dishes") {
        setRows(DEMO_DISH_CATEGORIES);
        setError("");
      } else {
        setError(err.response?.data?.detail || "Не удалось загрузить категории.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [type]);

  function openCreate() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
  }

  function openEdit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      slug: row.slug || "",
      sort_order: row.sort_order ?? 0,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!form.name.trim()) return;

    const slug = form.slug.trim() || makeSlug(form.name, config.slug_prefix);
    const categoryPayload = {
      name: form.name.trim(),
      slug,
      sort_order: Number(form.sort_order || 0),
    };
    const localPayload = {
      ...categoryPayload,
      is_active: true,
    };

    setSaving(true);
    setError("");
    try {
      if (editingId) {
        setRows((current) => current.map((row) => (row.id === editingId ? { ...row, ...localPayload } : row)));
      } else {
        const { data } = await api.post("/inventory/categories", categoryPayload);
        setRows((current) => [...current, data || { ...localPayload, id: `local-${Date.now()}` }]);
      }
      closeForm();
    } catch (err) {
      if (!editingId && type === "dishes" && !err.response) {
        setRows((current) => [...current, { ...localPayload, id: `local-${Date.now()}` }]);
        closeForm();
        return;
      }
      setError(err.response?.data?.detail || "Не удалось сохранить категорию.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(row) {
    setRows((current) => current.filter((item) => item.id !== row.id));
    if (editingId === row.id) closeForm();
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source = query
      ? rows.filter((row) => `${row.name || ""} ${row.slug || ""}`.toLowerCase().includes(query))
      : rows;

    return [...source].sort(sortCategories);
  }, [rows, search]);

  return (
    <section className="nomenclature-page menu-categories-page">
      {isDemo && <DemoNotice />}
      <div className="menu-categories-card">
        <div className="menu-categories-header">
          <div className="menu-categories-title">
            <span className="menu-categories-accent" />
            <div>
              <h1>{config.title}</h1>
              <p>{config.label}</p>
            </div>
          </div>
          <button type="button" className="menu-category-add" onClick={openCreate}>
            <span>Добавить</span>
            <Icon name="bi-plus" />
          </button>
        </div>

        {error ? <div className="login-error menu-category-error">{error}</div> : null}

        {showForm ? (
          <form className="menu-category-form" onSubmit={handleSave}>
            <div className="menu-category-form-title">
              <strong>{editingId ? "Изменить категорию" : "Новая категория"}</strong>
              <button type="button" onClick={closeForm} aria-label="Закрыть">
                <Icon name="bi-x-lg" />
              </button>
            </div>
            <div className="menu-category-form-grid">
              <label>
                <span>Название *</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Название категории"
                />
              </label>
              <label>
                <span>Slug</span>
                <input
                  value={form.slug}
                  onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                  placeholder="Автоматически"
                />
              </label>
              <label>
                <span>Сортировка</span>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
                />
              </label>
            </div>
            <div className="menu-category-form-actions">
              <button className="menu-category-save" type="submit" disabled={saving || !form.name.trim()}>
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
              <button className="menu-category-cancel" type="button" onClick={closeForm}>
                Отмена
              </button>
            </div>
          </form>
        ) : null}

        <div className="menu-category-toolbar">
          <label>
            <Icon name="bi-search" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по названию" />
          </label>
          <button type="button" className="menu-category-config">
            <Icon name="bi-sliders" />
            <span>Настроить таблицу</span>
          </button>
        </div>

        <div className="menu-category-list" aria-busy={loading}>
          {loading
            ? Array.from({ length: 6 }, (_, index) => <div className="menu-category-row is-loading" key={index} />)
            : visible.map((row) => (
                <article className="menu-category-row" key={row.id}>
                  <div className="menu-category-name">
                    <strong>{row.name}</strong>
                    <span>#{row.slug || makeSlug(row.name || "", config.slug_prefix)}</span>
                  </div>
                  <button type="button" className="menu-category-image" aria-label="Изображение категории">
                    <Icon name="bi-image" />
                  </button>
                  <button type="button" className="menu-category-service">
                    Рассчитать обслугу
                  </button>
                  <span className={`menu-category-status ${row.is_active === false ? "is-muted" : ""}`}>
                    {row.is_active === false ? "#архив" : "#активно"}
                  </span>
                  <button type="button" className="menu-category-icon edit" onClick={() => openEdit(row)} aria-label="Изменить">
                    <Icon name="bi-pencil" />
                  </button>
                  <button type="button" className="menu-category-icon delete" onClick={() => handleDelete(row)} aria-label="Удалить">
                    <Icon name="bi-trash3" />
                  </button>
                </article>
              ))}

          {!loading && !visible.length ? (
            <div className="menu-category-empty">
              <Icon name="bi-inbox" />
              <span>Категорий пока нет.</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
