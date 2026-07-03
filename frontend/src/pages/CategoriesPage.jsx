import { useEffect, useState } from "react";
import { api } from "../api/client";
import Icon from "../components/Icon";

const TYPE_CONFIG = {
  dishes: { label: "Категории блюд", slug_prefix: "dish" },
  raw: { label: "Категории сырья", slug_prefix: "raw" },
  semi: { label: "Категории полуфабрикатов", slug_prefix: "semi" },
  sales: { label: "Категории реализации", slug_prefix: "sales" },
};

export default function CategoriesPage({ type = "dishes" }) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.dishes;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/inventory/categories");
      setRows(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось загрузить категории.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [type]);

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const slug = form.slug.trim() ||
        `${config.slug_prefix}-${form.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;
      await api.post("/inventory/categories", {
        name: form.name.trim(),
        slug,
        sort_order: Number(form.sort_order || 0),
      });
      setShowForm(false);
      setForm({ name: "", slug: "", sort_order: 0 });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось сохранить категорию.");
    } finally {
      setSaving(false);
    }
  }

  const visible = search.trim()
    ? rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : rows;

  return (
    <section className="nomenclature-page">
      <div className="nomenclature-card">
        <div className="nomenclature-header">
          <div className="report-title-group">
            <span className="report-accent-bar" />
            <div>
              <h1>{config.label}</h1>
              <p>Управление категориями номенклатуры.</p>
            </div>
          </div>
          <div className="nomenclature-actions">
            <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
              <Icon name="bi-plus" /> Добавить
            </button>
          </div>
        </div>

        {error ? <div className="login-error">{error}</div> : null}

        {showForm ? (
          <div style={{ background: "var(--neutral-50)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Новая категория</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ flex: "1 1 200px" }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Название *</label>
                <input className="pos-search-input" placeholder="Название категории" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Slug (авто)</label>
                <input className="pos-search-input" placeholder="my-category" value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
              </div>
              <div style={{ flex: "0 1 120px" }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Порядок</label>
                <input className="pos-search-input" type="number" value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" type="button" disabled={saving || !form.name.trim()} onClick={handleSave}>
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
              <button className="btn-soft" type="button" onClick={() => setShowForm(false)}>Отмена</button>
            </div>
          </div>
        ) : null}

        <div className="nomenclature-filters">
          <label>
            <Icon name="bi-search" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по названию" />
          </label>
        </div>

        <div className="nomenclature-table-wrapper">
          <table className="nomenclature-table">
            <thead>
              <tr><th>Название</th><th>Slug</th><th>Порядок</th><th>Статус</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 24 }}>Загрузка...</td></tr>
              ) : visible.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td><code style={{ fontSize: 12 }}>{row.slug}</code></td>
                  <td>{row.sort_order}</td>
                  <td><span className={`nomenclature-status-badge ${row.is_active ? "" : "archived"}`}>
                    {row.is_active ? "Активно" : "Архив"}
                  </span></td>
                </tr>
              ))}
              {!loading && !visible.length ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 24 }}>Категорий пока нет.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}