import { useEffect, useMemo, useState } from "react";

import { hqService } from "./hqService";

import Icon from '../components/Icon';

export function OrganizationStatusPage({ search, onNotify }) {
  const [rows, setRows] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [sortDirection, setSortDirection] = useState("asc");
  const [editor, setEditor] = useState(null);

  useEffect(() => {
    let activeRequest = true;
    hqService.listOrganizationStatuses()
      .then(({ data }) => {
        if (!activeRequest) return;
        const items = Array.isArray(data) ? data : data?.items || [];
        const remoteRows = items.map((r, i) => ({
          id: r.id || String(i),
          name: r.name || "",
          sort: r.sort_order ?? r.sort ?? i + 1,
          active: r.status !== false,
        }));
        setRows(remoteRows);
        setLoadState(remoteRows.length ? "success" : "empty");
      })
      .catch(() => {
        if (!activeRequest) return;
        setRows([]);
        setLoadState("error");
      });
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = query
      ? rows.filter((row) => row.name.toLowerCase().includes(query) || String(row.sort).includes(query))
      : rows;
    return [...list].sort((a, b) => (
      sortDirection === "asc" ? a.sort - b.sort || a.name.localeCompare(b.name) : b.sort - a.sort || a.name.localeCompare(b.name)
    ));
  }, [rows, search, sortDirection]);

  function openCreate() {
    setEditor({ mode: "create", name: "", sort: rows.length + 1, active: true });
  }

  function openEdit(row) {
    setEditor({ mode: "edit", id: row.id, name: row.name, sort: row.sort, active: row.active });
  }

  function saveEditor() {
    onNotify?.("Сохранение статуса недоступно: backend mutation contract не подключён.");
  }

  function deleteRow(row) {
    void row;
    onNotify?.("Удаление статуса недоступно: backend mutation contract не подключён.");
  }

  function refreshRows() {
    setEditor(null);
    setLoadState("loading");
    hqService.listOrganizationStatuses()
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : data?.items || [];
        const remoteRows = items.map((r, i) => ({
          id: r.id || String(i),
          name: r.name || "",
          sort: r.sort_order ?? r.sort ?? i + 1,
          active: r.status !== false,
        }));
        setRows(remoteRows);
        setLoadState(remoteRows.length ? "success" : "empty");
        onNotify?.("Список статусов обновлен.");
      })
      .catch(() => {
        setRows([]);
        setLoadState("error");
        onNotify?.("Не удалось загрузить статусы организаций.");
      });
  }

  function toggleActive(row) {
    void row;
    onNotify?.("Изменение статуса недоступно: backend mutation contract не подключён.");
  }

  return (
    <section className="org-status-page">
      {loadState === "loading" ? <div className="org-directory-empty" role="status">Загрузка статусов...</div> : null}
      {loadState === "error" ? <div className="org-directory-empty" role="alert">Не удалось загрузить статусы организаций.</div> : null}
      <div className="org-status-header">
        <div className="org-status-title">
          <span aria-hidden="true" />
          <div>
            <h2>Статус Организации</h2>
            <p>Справочник состояний подключения и обслуживания клиентов.</p>
          </div>
        </div>
        <div className="org-status-actions">
          <button type="button" className="org-status-refresh" onClick={refreshRows}>
            <Icon name="bi-arrow-repeat" size={15} />
            Обновить список (devent)
          </button>
          <button type="button" className="org-status-add" onClick={openCreate}>
            Добавить <Icon name="bi-plus-lg" size={15} />
          </button>
        </div>
      </div>

      <div className="org-status-summary">
        <span><b>{rows.length}</b> всего</span>
        <span><b>{rows.filter((row) => row.active).length}</b> активно</span>
        <span><b>{filteredRows.length}</b> найдено</span>
      </div>

      {editor ? (
        <div className="org-status-editor">
          <label>
            <span>Название</span>
            <input value={editor.name} onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))} placeholder="Название статуса" autoFocus />
          </label>
          <label>
            <span>Sort</span>
            <input type="number" min="1" value={editor.sort} onChange={(event) => setEditor((current) => ({ ...current, sort: event.target.value }))} />
          </label>
          <button type="button" className={`org-status-toggle ${editor.active ? "is-on" : ""}`} onClick={() => setEditor((current) => ({ ...current, active: !current.active }))}>
            <span /> {editor.active ? "Активно" : "Не активно"}
          </button>
          <div>
            <button type="button" className="org-status-save" onClick={saveEditor}>Сохранить</button>
            <button type="button" className="org-status-cancel" onClick={() => setEditor(null)}>Отмена</button>
          </div>
        </div>
      ) : null}

      <div className="org-status-table-shell">
        <table className="org-status-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Название</th>
              <th>
                <button type="button" onClick={() => setSortDirection((value) => (value === "asc" ? "desc" : "asc"))}>
                  Sort <Icon name="bi-sort-down" size={14} />
                </button>
              </th>
              <th>Статус</th>
              <th aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, index) => (
              <tr key={row.id}>
                <td>{index + 1}</td>
                <td><strong>{row.name}</strong></td>
                <td><b>{row.sort}</b></td>
                <td>
                  <button type="button" className={`org-status-badge ${row.active ? "is-active" : "is-disabled"}`} onClick={() => toggleActive(row)}>
                    {row.active ? "#активно" : "#неактивно"}
                  </button>
                </td>
                <td>
                  <div className="org-status-row-actions">
                    <button type="button" className="is-edit" onClick={() => openEdit(row)} aria-label={`Редактировать ${row.name}`}>
                      <Icon name="bi-pencil" size={15} />
                    </button>
                    <button type="button" className="is-delete" onClick={() => deleteRow(row)} aria-label={`Удалить ${row.name}`}>
                      <Icon name="bi-trash3" size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loadState === "empty" || (loadState === "success" && !filteredRows.length) ? <div className="org-status-empty">Статусы не найдены.</div> : null}
      </div>
    </section>
  );
}
