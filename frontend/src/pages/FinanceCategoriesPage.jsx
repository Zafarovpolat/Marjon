import { useMemo, useState } from "react";
import Icon from "../components/Icon";

function FinanceCategoriesPage({ title, initialRows }) {
  const [rows, setRows] = useState(initialRows.map((row, index) => ({ ...row, id: index + 1, status: "Активно" })));
  const [activeTab, setActiveTab] = useState("Активно");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", operations: "0", total: "0 UZS", status: "Активно" });

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => row.status === activeTab && (!query || row.name.toLowerCase().includes(query)));
  }, [activeTab, rows, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", description: "", operations: "0", total: "0 UZS", status: "Активно" });
    setDrawerOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm(row);
    setDrawerOpen(true);
  };

  const archive = (row) => {
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: "Архив" } : item));
  };

  const restore = (row) => {
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: "Активно" } : item));
  };

  const save = (event) => {
    event.preventDefault();
    if (editingId) {
      setRows((current) => current.map((row) => row.id === editingId ? { ...form, id: editingId } : row));
    } else {
      setRows((current) => [{ ...form, id: Date.now(), status: form.status || "Активно" }, ...current]);
    }
    setDrawerOpen(false);
  };

  return (
    <div className="finance-page">
      <section className="finance-card">
        <header className="finance-header">
          <div className="finance-title-group">
            <span className="finance-accent-bar" />
            <div>
              <p>Финансы</p>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="finance-actions">
            <button type="button" className="finance-primary-action" onClick={openCreate}>Добавить категорию +</button>
          </div>
        </header>

        <div className="finance-tabs">
          {["Активно", "Архив"].map((tab) => (
            <button key={tab} type="button" className={activeTab === tab ? "is-active" : ""} onClick={() => setActiveTab(tab)}>
              {tab === "Активно" ? "Активные" : "Архив"}
            </button>
          ))}
        </div>

        <div className="finance-filters finance-filters--categories">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по названию" />
        </div>

        <div className="finance-table-wrapper">
          <table className="finance-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Описание</th>
                <th>Кол-во операций</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.description}</td>
                  <td>{row.operations}</td>
                  <td>{row.total}</td>
                  <td><span className={`finance-status-badge ${row.status === "Архив" ? "is-archived" : ""}`}>{row.status}</span></td>
                  <td>
                    <div className="finance-category-actions">
                      <button type="button" className="finance-action-edit" onClick={() => openEdit(row)}><Icon name="bi-pencil" size={15} /></button>
                      <button type="button" className={row.status === "Архив" ? "is-restore" : "is-danger"} onClick={() => row.status === "Архив" ? restore(row) : archive(row)}>
                        <Icon name={row.status === "Архив" ? "bi-recycle" : "bi-trash3"} size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {drawerOpen ? (
        <div className="finance-drawer" role="dialog" aria-modal="true">
          <div className="finance-drawer__backdrop" onClick={() => setDrawerOpen(false)} />
          <form className="finance-form" onSubmit={save}>
            <header className="finance-form__header">
              <span className="finance-accent-bar" />
              <div>
                <p>Категория</p>
                <h2>{title}</h2>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}><Icon name="bi-x-lg" size={20} /></button>
            </header>
            <div className="finance-form__grid">
              <label><span>Название</span><input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label><span>Кол-во операций</span><input value={form.operations} onChange={(event) => setForm((current) => ({ ...current, operations: event.target.value }))} /></label>
              <label><span>Сумма</span><input value={form.total} onChange={(event) => setForm((current) => ({ ...current, total: event.target.value }))} /></label>
              <label><span>Статус</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option>Активно</option><option>Архив</option></select></label>
              <label className="finance-form__wide"><span>Описание</span><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
            </div>
            <footer className="finance-form__footer">
              <button type="button" onClick={() => setDrawerOpen(false)}>Отмена</button>
              <button type="submit">Сохранить</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default FinanceCategoriesPage;
