import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import Icon from "../../components/Icon";

const STATUS_ACTIVE = "#активно";
const STATUS_INACTIVE = "#не активно";
const STATUS_PENDING = "#не подтверждено";
const STATUS_ARCHIVE = "#архив";

function SettingsResourcePage({
  title,
  addLabel = "Добавить +",
  tabs,
  columns,
  initialRows,
  formFields,
  searchable = true,
  filterOptions,
  transactionHistory = false,
  pageClassName = "",
  compactHeader = false,
  actionsLabel = "Действия",
  statementHistory = false,
  apiEndpoint,
  apiMapRow,
  apiMapFormToPayload,
}) {
  const [rows, setRows] = useState([]);
  const [apiLoading, setApiLoading] = useState(!!apiEndpoint);
  const [apiError, setApiError] = useState(apiEndpoint ? "" : "Данные недоступны: backend contract для этого справочника не подключён.");
  const [activeTab, setActiveTab] = useState(tabs?.[0]?.key || "");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [drawerMode, setDrawerMode] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [historyRow, setHistoryRow] = useState(null);

  useEffect(() => {
    if (!apiEndpoint) return;
    setApiLoading(true);
    setApiError("");
    api.get(apiEndpoint)
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : data?.items || data?.results || [];
        setRows(apiMapRow ? items.map(apiMapRow) : []);
      })
      .catch((err) => {
        setRows([]);
        setApiError(err.response?.data?.detail || "Не удалось загрузить данные справочника.");
      })
      .finally(() => setApiLoading(false));
  }, [apiEndpoint]);

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
    if (!apiEndpoint) {
      setApiError("Создание недоступно: backend contract для этого справочника не подключён.");
      return;
    }
    const defaults = formFields.reduce((acc, field) => ({ ...acc, [field.key]: field.defaultValue || "" }), {});
    setEditingId(null);
    setForm({ ...defaults, type: activeTab || tabs?.[0]?.key || "", status: STATUS_ACTIVE });
    setDrawerMode("edit");
  };

  const openEdit = (row) => {
    if (!apiEndpoint) {
      setApiError("Редактирование недоступно: backend contract для этого справочника не подключён.");
      return;
    }
    setEditingId(row.id);
    setForm({ ...row });
    setDrawerMode("edit");
  };

  const save = (event) => {
    event.preventDefault();
    const payload = apiEndpoint && apiMapFormToPayload ? apiMapFormToPayload(form) : null;

    if (apiEndpoint && payload) {
      const request = editingId
        ? api.patch(`${apiEndpoint}/${editingId}`, payload)
        : api.post(apiEndpoint, payload);

      request
        .then(({ data }) => {
          const mapped = apiMapRow ? apiMapRow(data) : data;
          setRows((current) => editingId
            ? current.map((row) => row.id === editingId ? mapped : row)
            : [mapped, ...current]);
          setDrawerMode(null);
        })
        .catch(() => {
          window.alert("Не удалось сохранить. Попробуйте позже.");
        });
      return;
    }

    setApiError("Сохранение недоступно: backend contract для этого справочника не подключён.");
  };

  const archive = (row) => {
    if (apiEndpoint) {
      api.delete(`${apiEndpoint}/${row.id}`)
        .then(() => setRows((current) => current.filter((item) => item.id !== row.id)))
        .catch(() => window.alert("Не удалось удалить. Попробуйте позже."));
      return;
    }
    setApiError("Удаление недоступно: backend contract для этого справочника не подключён.");
  };

  const renderActions = () => (
    <div className="settings-actions">
      {searchable ? <input className="settings-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" /> : null}
      {filterOptions ? (
        <select className="settings-search" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">Все</option>
          {filterOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : null}
      <button type="button" onClick={openAdd} disabled={!apiEndpoint}>{addLabel}</button>
    </div>
  );

  const renderTabs = () => (
    tabs ? (
      <div className="settings-tabs">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" className={activeTab === tab.key ? "is-active" : ""} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
        ))}
      </div>
    ) : null
  );

  if (historyRow && statementHistory) {
    return (
      <div className={`settings-page ${pageClassName} client-statement-page`.trim()}>
        <section className="client-statement-card">
          <header className="client-statement-toolbar">
            <div className="client-statement-left">
              <button type="button" className="client-statement-back" onClick={() => setHistoryRow(null)} aria-label="Назад">
                <Icon name="bi-chevron-left" size={18} />
              </button>
            </div>
          </header>

          <div className="client-statement-panel">
            <div className="client-statement-heading">
              <span>История транзакций</span>
              <h1>Акт сверки</h1>
              <strong>{historyRow.name}</strong>
            </div>
            <div className="settings-empty-state" role="status">
              Финансовая история недоступна: backend contract для транзакций контрагента не подключён.
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`settings-page ${pageClassName}`.trim()}>
      <section className="settings-card">
        {compactHeader ? (
          <header className="settings-directory-toolbar">
            {renderTabs()}
            {renderActions()}
          </header>
        ) : (
          <>
            <header className="settings-header">
              <div className="settings-title-group">
                <span className="settings-accent-bar" />
                <div>
                  <p>Настройки</p>
                  <h1>{title}</h1>
                </div>
              </div>
              {renderActions()}
            </header>

            {renderTabs()}
          </>
        )}

        <div className="settings-table-wrapper">
          <table className="settings-table">
            <thead>
              <tr>
                {columns.map((column) => <th key={column.key}>{column.label}</th>)}
                <th>{actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      {column.key === "status" ? (
                        <StatusBadge status={row.status} />
                      ) : column.key === "history" && transactionHistory ? (
                        <button className="settings-history-button" type="button" onClick={() => setHistoryRow(row)}>
                          История транзакций <Icon name="bi-arrow-right" size={15} />
                        </button>
                      ) : renderCell(column, row, setForm)}
                    </td>
                  ))}
                  <td>
                    <div className="settings-row-actions">
                      {row.testPrint ? <button type="button" onClick={() => window.alert("Тест печати будет доступен в следующей версии")}>Тест печати</button> : null}
                      <button type="button" className="settings-action-edit" onClick={() => openEdit(row)}><Icon name="bi-pencil" size={15} /></button>
                      <button type="button" className="settings-action-delete" onClick={() => archive(row)}><Icon name="bi-trash3" size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {apiLoading ? <tr><td colSpan={columns.length + 1}><div className="settings-empty-state">Загрузка...</div></td></tr> : null}
              {!apiLoading && apiError ? <tr><td colSpan={columns.length + 1}><div className="settings-empty-state" role="alert">{apiError}</div></td></tr> : null}
              {!apiLoading && !apiError && !visibleRows.length ? <tr><td colSpan={columns.length + 1}><div className="settings-empty-state">Нет данных</div></td></tr> : null}
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
                      {(field.options || []).map((option) => {
                        const value = typeof option === "object" ? option.value : option;
                        const label = typeof option === "object" ? option.label : option;
                        return <option key={value} value={value}>{label}</option>;
                      })}
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
            <div className="settings-empty-state" role="status">
              История недоступна: backend contract для транзакций не подключён.
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
