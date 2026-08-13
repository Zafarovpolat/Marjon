import { useEffect, useMemo, useState } from "react";
import { getCategories } from "../api/categories";
import { catalogService } from "../api/catalog";
import Icon from "../components/Icon";

const TYPE_CONFIG = {
  dishes: { label: "Категории блюд", title: "Меню", slug_prefix: "dish" },
  raw: { label: "Категории сырья", title: "Категории сырья", slug_prefix: "raw" },
  semi: { label: "Категории полуфабрикатов", title: "Категории полуфабрикатов", slug_prefix: "semi" },
  sales: { label: "Категории реализации", title: "Категории реализации", slug_prefix: "sales" },
};

const DEFAULT_FORM = { name: "", slug: "", sort_order: 0 };

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
  if (type === "raw" || type === "semi") {
    const config = TYPE_CONFIG[type];
    return (
      <section className="nomenclature-page menu-categories-page">
        <div className="menu-categories-card">
          <div className="menu-categories-header">
            <div className="menu-categories-title">
              <span className="menu-categories-accent" />
              <div><h1>{config.title}</h1><p>Функция пока недоступна: отдельный backend-контракт категорий сырья не зафиксирован.</p></div>
            </div>
          </div>
          <div className="menu-category-empty" role="status"><Icon name="bi-inbox" /><span>ProductCategory не используется как категория сырья или полуфабриката.</span></div>
        </div>
      </section>
    );
  }
  return <ProductCategoriesPage type={type} />;
}

function ProductCategoriesPage({ type }) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.dishes;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data } = await getCategories();
      const loadedCategories = Array.isArray(data) ? data : [];
      setRows(loadedCategories);
    } catch (err) {
      setRows([]);
      setError(err.response?.data?.detail || "Не удалось загрузить категории.");
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
    setError(`Редактирование категории «${row.name}» пока не подключено к backend.`);
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
      if (!editingId) {
        const { data } = await catalogService.createCategory(categoryPayload);
        if (data?.id) {
          setRows((current) => [...current, data]);
        } else {
          await load();
        }
      }
      closeForm();
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось сохранить категорию.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(row) {
    setError(`Удаление категории «${row.name}» пока не подключено к backend.`);
  }

  const visible = useMemo(() => [...rows].sort(sortCategories), [rows]);

  return (
    <section className="nomenclature-page menu-categories-page">
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

          {!loading && !error && !visible.length ? (
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
