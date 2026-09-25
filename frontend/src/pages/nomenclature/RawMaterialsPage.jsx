import { useEffect, useMemo, useState } from "react";
import { formatMoney, formatNumber } from "../../api/client";
import { nomenclatureService } from "../../api/nomenclature";
import Icon from "../../components/Icon";
import { isAbortError, useLatestRequest, useMutationLocks } from "../../hooks/useAsyncSafety";

const UNITS = ["кг", "г", "л", "мл", "шт", "порция", "упак"];
const EMPTY_FORM = { name: "", unit: "кг", category: "", supplier_name: "" };

// Сырьё (ингредиенты). CRUD против /inventory/ingredients; жёсткого DELETE нет —
// «удаление» = мягкий архив (is_active:false), поэтому есть вкладки активные/архив
// и действия архивировать/восстановить. Остаток, мин. остаток и цена закупки —
// read-only агрегаты со склада, клиент их не редактирует. Шаблон 1-в-1 со
// страницей «Сотрудники» (staff-*): та же шапка/вкладки/таблица/drawer, поэтому
// модалка сама уходит под топбар (правило body:has(.staff-modal) в overrides).
export default function RawMaterialsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const beginRequest = useLatestRequest();
  const { acquire, release } = useMutationLocks();

  async function load() {
    const request = beginRequest();
    setLoading(true);
    setError("");
    try {
      const { data } = await nomenclatureService.listIngredients({ signal: request.signal });
      if (!request.isCurrent()) return;
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      if (!request.isCurrent() || isAbortError(err)) return;
      setRows([]);
      setError(err.response?.data?.detail || "Не удалось загрузить сырьё.");
    } finally {
      if (request.isCurrent()) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => (showArchived ? row.is_active === false : row.is_active !== false))
      .filter((row) => !term || `${row.name || ""} ${row.category || ""} ${row.supplier_name || ""}`.toLowerCase().includes(term));
  }, [rows, search, showArchived]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setActionError("");
    setDrawerOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      name: row.name || "",
      unit: row.unit || "кг",
      category: row.category || "",
      supplier_name: row.supplier_name || "",
    });
    setActionError("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (saving) return;
    setDrawerOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function save(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setActionError("Укажите название.");
      return;
    }
    if (!acquire("ingredient-save")) return;
    const payload = {
      name: form.name.trim(),
      unit: form.unit || "кг",
      category: form.category.trim() || null,
      supplier_name: form.supplier_name.trim() || null,
    };
    setSaving(true);
    setActionError("");
    try {
      if (editing) {
        const { data } = await nomenclatureService.updateIngredient(editing.id, payload);
        setRows((cur) => cur.map((r) => (r.id === editing.id ? { ...r, ...(data || payload) } : r)));
      } else {
        const { data } = await nomenclatureService.createIngredient(payload);
        if (data?.id) setRows((cur) => [...cur, data]);
        else await load();
      }
      setDrawerOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      setActionError(err.response?.data?.detail || "Не удалось сохранить ингредиент.");
    } finally {
      setSaving(false);
      release("ingredient-save");
    }
  }

  async function toggleArchive(row) {
    if (!acquire(`ingredient-${row.id}`)) return;
    setBusyId(row.id);
    setActionError("");
    const archiving = row.is_active !== false;
    try {
      const { data } = archiving
        ? await nomenclatureService.archiveIngredient(row.id)
        : await nomenclatureService.restoreIngredient(row.id);
      setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, ...(data || { is_active: !archiving }) } : r)));
    } catch (err) {
      setActionError(err.response?.data?.detail || "Не удалось изменить статус ингредиента.");
    } finally {
      setBusyId(null);
      release(`ingredient-${row.id}`);
    }
  }

  return (
    <div className="staff-page">
      <section className="staff-card">
        <header className="staff-header">
          <div className="staff-header__title">
            <span className="staff-header__accent" />
            <div>
              <p className="staff-header__eyebrow">Номенклатура</p>
              <h1>Сырьё</h1>
            </div>
          </div>
          <button type="button" className="staff-add-button" onClick={openCreate}>
            <Icon name="bi-plus" size={18} /> Добавить +
          </button>
        </header>

        <div className="staff-tabs" role="tablist" aria-label="Фильтр по статусу">
          <button type="button" role="tab" aria-selected={!showArchived} className={!showArchived ? "is-active" : ""} onClick={() => setShowArchived(false)}>
            Активные
          </button>
          <button type="button" role="tab" aria-selected={showArchived} className={showArchived ? "is-active" : ""} onClick={() => setShowArchived(true)}>
            Архивированные
          </button>
        </div>

        <div className="staff-filters staff-filters--search">
          <label>
            <span>Поиск</span>
            <div className="staff-filter-control">
              <Icon name="bi-search" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название, категория, поставщик" />
            </div>
          </label>
        </div>

        {actionError ? <div className="login-error" role="alert">{actionError}</div> : null}

        {error ? (
          <div className="login-error" role="alert">{error}</div>
        ) : (
          <div className="staff-table-wrapper">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Название</th><th>Категория</th><th>Ед. изм</th><th>Остаток</th>
                  <th>Мин. остаток</th><th>Цена закупки</th><th>Поставщик</th><th>Статус</th><th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="staff-empty-cell" colSpan={9} role="status" aria-busy="true">Загрузка…</td></tr>
                ) : !visible.length ? (
                  <tr><td className="staff-empty-cell" colSpan={9}>{showArchived ? "Архивного сырья пока нет." : "Сырьё пока не добавлено."}</td></tr>
                ) : (
                  visible.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.category ? <span className="staff-role-badge">{row.category}</span> : "—"}</td>
                      <td>{row.unit || "—"}</td>
                      <td>{formatNumber(row.stock || 0)}</td>
                      <td>{formatNumber(row.min_stock || 0)}</td>
                      <td>{row.purchase_price != null ? formatMoney(row.purchase_price) : "—"}</td>
                      <td>{row.supplier_name || "—"}</td>
                      <td><span className={`staff-status-badge ${row.is_active === false ? "is-archived" : ""}`}>{row.is_active === false ? "Архив" : "Активно"}</span></td>
                      <td>
                        <div className="staff-actions">
                          <button type="button" className="edit-action-button" onClick={() => openEdit(row)} disabled={busyId === row.id} aria-label="Изменить"><Icon name="bi-pencil" /></button>
                          {row.is_active === false ? (
                            <button type="button" className="staff-restore-action" onClick={() => toggleArchive(row)} disabled={busyId === row.id} aria-label="Восстановить"><Icon name="bi-arrow-counterclockwise" /></button>
                          ) : (
                            <button type="button" className="staff-delete-action" onClick={() => toggleArchive(row)} disabled={busyId === row.id} aria-label="Архивировать"><Icon name="bi-archive" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drawerOpen ? (
        <div className="staff-modal">
          <div className="staff-modal__backdrop" onClick={closeDrawer} />
          <form className="staff-form" onSubmit={save}>
            <div className="staff-form__header">
              <div>
                <p>Сырьё</p>
                <h2>{editing ? "Изменить ингредиент" : "Новый ингредиент"}</h2>
              </div>
              <button type="button" onClick={closeDrawer} aria-label="Закрыть"><Icon name="bi-x-lg" /></button>
            </div>
            <div className="staff-form__grid">
              <label className="staff-form__comment">
                <span>Название *</span>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Напр. Мука" />
              </label>
              <label>
                <span>Ед. изм</span>
                <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
              <label>
                <span>Категория</span>
                <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Напр. Бакалея" />
              </label>
              <label className="staff-form__comment">
                <span>Поставщик</span>
                <input value={form.supplier_name} onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))} placeholder="Необязательно" />
              </label>
            </div>
            <div className="staff-form__footer">
              <button type="button" onClick={closeDrawer} disabled={saving}>Отмена</button>
              <button type="submit" disabled={saving || !form.name.trim()}>{saving ? "Сохранение…" : "Сохранить"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
