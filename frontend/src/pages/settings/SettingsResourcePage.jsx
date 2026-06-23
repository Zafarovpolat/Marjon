import { useMemo, useState } from "react";
import Icon from "../../components/Icon";

const STATUS_ACTIVE = "#активно";
const STATUS_INACTIVE = "#не активно";
const STATUS_PENDING = "#не подтверждено";
const STATUS_ARCHIVE = "#архив";

function SettingsResourcePage({ title, addLabel = "Добавить +", tabs, columns, initialRows, formFields, searchable = true, filterOptions, transactionHistory = false }) {
  const [rows, setRows] = useState(initialRows);
  const [activeTab, setActiveTab] = useState(tabs?.[0]?.key || "");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [drawerMode, setDrawerMode] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [historyRow, setHistoryRow] = useState(null);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesTab = !tabs || row.type === activeTab;
      const matchesArchive = row.status !== STATUS_ARCHIVE;
      const matchesSearch = !query || `${row.name || ""} ${row.phone || ""}`.toLowerCase().includes(query);
      const matchesFilter = !filter || row.kind === filter || row.status === filter || row.typeLabel === filter;
      return matchesTab && matchesArchive && matchesSearch && matchesFilter;
    });
  }, [activeTab, filter, rows, search, tabs]);

  const openAdd = () => {
    const defaults = formFields.reduce((acc, field) => ({ ...acc, [field.key]: field.defaultValue || "" }), {});
    setEditingId(null);
    setForm({ ...defaults, type: activeTab || tabs?.[0]?.key || "", status: STATUS_ACTIVE });
    setDrawerMode("edit");
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({ ...row });
    setDrawerMode("edit");
  };

  const save = (event) => {
    event.preventDefault();
    const next = { ...form, id: editingId || Date.now(), type: form.type || activeTab };
    setRows((current) => editingId ? current.map((row) => row.id === editingId ? next : row) : [next, ...current]);
    setDrawerMode(null);
  };

  const archive = (row) => {
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: STATUS_ARCHIVE } : item));
  };

  return (
    <div className="settings-page">
      <section className="settings-card">
        <header className="settings-header">
          <div className="settings-title-group">
            <span className="settings-accent-bar" />
            <div>
              <p>Настройки</p>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="settings-actions">
            {searchable ? <input className="settings-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" /> : null}
            {filterOptions ? (
              <select className="settings-search" value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="">Все</option>
                {filterOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : null}
            <button type="button" onClick={openAdd}>{addLabel}</button>
          </div>
        </header>

        {tabs ? (
          <div className="settings-tabs">
            {tabs.map((tab) => (
              <button key={tab.key} type="button" className={activeTab === tab.key ? "is-active" : ""} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
            ))}
          </div>
        ) : null}

        <div className="settings-table-wrapper">
          <table className="settings-table">
            <thead>
              <tr>
                {columns.map((column) => <th key={column.key}>{column.label}</th>)}
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      {column.key === "status" ? <StatusBadge status={row.status} /> : renderCell(column, row, setForm)}
                    </td>
                  ))}
                  <td>
                    <div className="settings-row-actions">
                      {transactionHistory ? <button type="button" onClick={() => setHistoryRow(row)}>История транзакций</button> : null}
                      {row.testPrint ? <button type="button" onClick={() => console.log("test print", row.name)}>Тест печати</button> : null}
                      <button type="button" className="settings-action-edit" onClick={() => openEdit(row)}><Icon name="bi-pencil" size={15} /></button>
                      <button type="button" className="settings-action-delete" onClick={() => archive(row)}><Icon name="bi-trash3" size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleRows.length ? <tr><td colSpan={columns.length + 1}><div className="settings-empty-state">Нет данных</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {drawerMode === "edit" ? (
        <div className="settings-drawer" role="dialog" aria-modal="true">
          <div className="settings-drawer__backdrop" onClick={() => setDrawerMode(null)} />
          <form className="settings-form" onSubmit={save}>
            <header className="settings-form__header">
              <span className="settings-accent-bar" />
              <div>
                <p>{editingId ? "Редактирование" : "Новая запись"}</p>
                <h2>{title}</h2>
              </div>
              <button type="button" onClick={() => setDrawerMode(null)}><Icon name="bi-x-lg" size={20} /></button>
            </header>
            <div className="settings-form__grid">
              {formFields.map((field) => (
                <label key={field.key} className={field.type === "textarea" ? "settings-form__wide" : ""}>
                  <span>{field.label}</span>
                  {field.type === "select" ? (
                    <select value={form[field.key] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}>
                      {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea value={form[field.key] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} />
                  ) : (
                    <input value={form[field.key] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} />
                  )}
                </label>
              ))}
            </div>
            <footer className="settings-form__footer">
              <button type="button" onClick={() => setDrawerMode(null)}>Отмена</button>
              <button type="submit">Сохранить</button>
            </footer>
          </form>
        </div>
      ) : null}

      {historyRow ? (
        <div className="settings-drawer" role="dialog" aria-modal="true">
          <div className="settings-drawer__backdrop" onClick={() => setHistoryRow(null)} />
          <aside className="settings-form">
            <header className="settings-form__header">
              <span className="settings-accent-bar" />
              <div>
                <p>История</p>
                <h2>{historyRow.name}</h2>
              </div>
              <button type="button" onClick={() => setHistoryRow(null)}><Icon name="bi-x-lg" size={20} /></button>
            </header>
            <div className="settings-history-list">
              {[
                ["22.06.2026", "Приход", "120 000 UZS", "Заказ №39957057"],
                ["21.06.2026", "Расход", "35 000 UZS", "Корректировка"],
                ["20.06.2026", "Приход", "80 000 UZS", "Оплата"],
              ].map(([date, type, amount, comment]) => (
                <div key={`${date}-${comment}`}>
                  <span>{date}</span>
                  <strong>{type}</strong>
                  <b>{amount}</b>
                  <p>{comment}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function renderCell(column, row, setForm) {
  if (column.inlineSort) {
    return <input className="settings-inline-input" value={row[column.key]} onChange={(event) => setForm((current) => ({ ...current, [column.key]: event.target.value }))} readOnly />;
  }
  if (column.link) return <span className="settings-link-cell">{row[column.key]}</span>;
  return row[column.key] || "-";
}

function StatusBadge({ status }) {
  const tone = status === STATUS_ACTIVE || status === "Активно" ? "is-active" : status === STATUS_PENDING ? "is-pending" : "is-inactive";
  return <span className={`settings-status-badge ${tone}`}>{status}</span>;
}

export { STATUS_ACTIVE, STATUS_INACTIVE, STATUS_PENDING };
export default SettingsResourcePage;
