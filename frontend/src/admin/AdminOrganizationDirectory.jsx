import { useEffect, useMemo, useRef, useState } from "react";

import Icon from "../components/Icon";
import { AdminPageSizeDropdown, getPageList, keepWheelInsideScroller } from "./AdminShared";
import { hqService } from "./hqService";

export const organizationRows = [];

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const COLUMN_KEYS = [
  "number", "message", "name", "clientId", "type", "owner", "admin", "branches",
  "tariff", "workingDays", "installed", "accessStatus", "lifecycle", "onlineMenu",
  "warehouse", "cashBalance", "actions",
];
const DEFAULT_VISIBLE_COLUMNS = [...COLUMN_KEYS];
const COLUMN_STORAGE_KEY = "marjon.admin.organizations.truthful-columns.v1";

const EMPTY_ORGANIZATION_FORM = Object.freeze({
  name: "",
  type: "restaurant",
  tariffPrice: "",
  workingDays: "",
  tin: "",
  installationDate: "",
  organizationStatusId: "",
  lifecycleStatus: "active",
  onlineMenu: false,
  storageIntegration: false,
  isSolvent: true,
  billingAutoblock: false,
});

function loadVisibleColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) || "null");
    if (!Array.isArray(saved)) return DEFAULT_VISIBLE_COLUMNS;
    const normalized = COLUMN_KEYS.filter((key) => saved.includes(key));
    return normalized.length ? normalized : DEFAULT_VISIBLE_COLUMNS;
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

function nullableText(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString("ru-RU") : String(value);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("ru-RU");
}

function lifecycleLabel(status) {
  if (status === "active") return "Активна";
  if (status === "blocked") return "Заблокирована";
  return nullableText(status);
}

function booleanLabel(value) {
  if (value === true) return "Активно";
  if (value === false) return "Неактивно";
  return "—";
}

function errorMessage(error, fallback) {
  const detail = typeof error?.detail === "string" ? error.detail : "";
  const message = detail || (typeof error?.message === "string" ? error.message : "");
  return message && message.length <= 240 ? message : fallback;
}

export function normalizeOrganizationStatus(raw) {
  return {
    id: String(raw?.id || ""),
    name: nullableText(raw?.name),
    sort: raw?.sort !== null && raw?.sort !== undefined && Number.isFinite(Number(raw.sort))
      ? Number(raw.sort)
      : null,
    active: raw?.status === true,
  };
}

export function normalizeOrganization(raw, statusNames = new Map()) {
  const organizationStatusId = raw?.organization_status_id ? String(raw.organization_status_id) : "";
  const linkedStatus = organizationStatusId
    ? statusNames.get(organizationStatusId) || `ID: ${organizationStatusId}`
    : "—";

  return {
    id: String(raw?.id || ""),
    name: nullableText(raw?.name),
    clientId: String(raw?.id || ""),
    type: nullableText(raw?.type),
    owner: nullableText(raw?.owner_name),
    admin: nullableText(raw?.admin_name),
    branches: raw?.branches_count === null || raw?.branches_count === undefined
      ? "—"
      : String(raw.branches_count),
    tariff: formatNumber(raw?.tariff_price),
    workingDays: formatNumber(raw?.working_days),
    installed: formatDate(raw?.installation_date),
    accessStatus: linkedStatus,
    organizationStatusId,
    lifecycle: lifecycleLabel(raw?.status),
    lifecycleValue: raw?.status || "",
    onlineMenu: booleanLabel(raw?.online_menu),
    warehouse: booleanLabel(raw?.enabled_storage_integration),
    cashBalance: formatNumber(raw?.cash_balance),
    raw,
  };
}

function organizationToForm(raw = {}) {
  return {
    name: raw.name ?? "",
    type: raw.type ?? "",
    tariffPrice: raw.tariff_price ?? "",
    workingDays: raw.working_days ?? "",
    tin: raw.tin ?? "",
    installationDate: raw.installation_date ?? "",
    organizationStatusId: raw.organization_status_id ?? "",
    lifecycleStatus: raw.status ?? "",
    onlineMenu: raw.online_menu === true,
    storageIntegration: raw.enabled_storage_integration === true,
    isSolvent: raw.is_solvent === true,
    billingAutoblock: raw.is_billing_autoblock === true,
  };
}

function organizationPayload(form) {
  const name = form.name.trim();
  const type = form.type.trim();
  if (!name) throw new Error("Укажите название организации.");
  if (!type) throw new Error("Укажите тип организации.");

  const tariffPrice = form.tariffPrice === "" ? 0 : Number(form.tariffPrice);
  const workingDays = form.workingDays === "" ? 0 : Number(form.workingDays);
  if (!Number.isFinite(tariffPrice) || tariffPrice < 0) throw new Error("Цена тарифа должна быть неотрицательным числом.");
  if (!Number.isInteger(workingDays) || workingDays < 0) throw new Error("Рабочие дни должны быть целым неотрицательным числом.");

  return {
    name,
    type,
    tariff_price: tariffPrice,
    working_days: workingDays,
    tin: form.tin.trim() || null,
    installation_date: form.installationDate || null,
    organization_status_id: form.organizationStatusId || null,
    status: form.lifecycleStatus,
    online_menu: form.onlineMenu,
    enabled_storage_integration: form.storageIntegration,
    is_solvent: form.isSolvent,
    is_billing_autoblock: form.billingAutoblock,
  };
}

function ModalShell({ title, description, onClose, busy, children, actions, tone = "default" }) {
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    const first = panelRef.current?.querySelector("input, select, button:not([disabled])");
    first?.focus();
    return () => returnFocusRef.current?.focus?.();
  }, []);

  function handleKeyDown(event) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...panelRef.current.querySelectorAll("input, select, button:not([disabled])")]
      .filter((element) => !element.hasAttribute("hidden"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="admin-modal org-directory-modal" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section
        ref={panelRef}
        className={`admin-modal__panel org-directory-modal__panel ${tone === "danger" ? "is-danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-directory-modal-title"
        aria-describedby="org-directory-modal-description"
        onKeyDown={handleKeyDown}
      >
        <div className="admin-modal__head">
          <div>
            <h3 id="org-directory-modal-title">{title}</h3>
            <p id="org-directory-modal-description">{description}</p>
          </div>
          <button className="admin-modal__close" type="button" onClick={onClose} disabled={busy} aria-label="Закрыть">
            <Icon name="bi-x-lg" size={16} />
          </button>
        </div>
        {children}
        <div className="admin-modal__actions">{actions}</div>
      </section>
    </div>
  );
}

function OrganizationFormModal({ mode, row, statuses, busy, error, onClose, onSubmit }) {
  const [form, setForm] = useState(() => mode === "edit" ? organizationToForm(row.raw) : { ...EMPTY_ORGANIZATION_FORM });
  const [validationError, setValidationError] = useState("");

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setValidationError("");
  }

  function submit(event) {
    event.preventDefault();
    try {
      onSubmit(organizationPayload(form));
    } catch (submitError) {
      setValidationError(submitError.message);
    }
  }

  const title = mode === "create" ? "Добавить организацию" : `Редактировать ${row.name}`;
  return (
    <ModalShell
      title={title}
      description="Поля соответствуют каноническому HQ-контракту организации."
      onClose={onClose}
      busy={busy}
      actions={<>
        <button type="button" className="admin-modal__btn is-ghost" onClick={onClose} disabled={busy}>Отмена</button>
        <button type="submit" form="organization-form" className="admin-modal__btn is-primary" disabled={busy}>
          {busy ? "Сохранение..." : "Сохранить"}
        </button>
      </>}
    >
      <form id="organization-form" className="org-directory-modal__form" onSubmit={submit}>
        <label className="is-wide"><span>Название</span><input value={form.name} onChange={(event) => setField("name", event.target.value)} required /></label>
        <label><span>Тип</span><input value={form.type} onChange={(event) => setField("type", event.target.value)} required /></label>
        <label><span>ИНН</span><input value={form.tin} onChange={(event) => setField("tin", event.target.value)} /></label>
        <label><span>Цена тарифа</span><input type="number" min="0" step="0.01" value={form.tariffPrice} onChange={(event) => setField("tariffPrice", event.target.value)} /></label>
        <label><span>Рабочие дни</span><input type="number" min="0" step="1" value={form.workingDays} onChange={(event) => setField("workingDays", event.target.value)} /></label>
        <label><span>Дата установки</span><input type="date" value={form.installationDate} onChange={(event) => setField("installationDate", event.target.value)} /></label>
        <label>
          <span>Статус организации</span>
          <select value={form.organizationStatusId} onChange={(event) => setField("organizationStatusId", event.target.value)}>
            <option value="">Не указан</option>
            {statuses.map((status) => <option value={status.id} key={status.id}>{status.name}</option>)}
          </select>
        </label>
        <label>
          <span>Состояние</span>
          <select value={form.lifecycleStatus} onChange={(event) => setField("lifecycleStatus", event.target.value)} required>
            <option value="active">Активна</option>
            <option value="blocked">Заблокирована</option>
          </select>
        </label>
        <div className="org-directory-modal__checks is-wide">
          <label><input type="checkbox" checked={form.onlineMenu} onChange={(event) => setField("onlineMenu", event.target.checked)} /> Онлайн-меню</label>
          <label><input type="checkbox" checked={form.storageIntegration} onChange={(event) => setField("storageIntegration", event.target.checked)} /> Интеграция склада</label>
          <label><input type="checkbox" checked={form.isSolvent} onChange={(event) => setField("isSolvent", event.target.checked)} /> Платёжеспособна</label>
          <label><input type="checkbox" checked={form.billingAutoblock} onChange={(event) => setField("billingAutoblock", event.target.checked)} /> Автоблокировка биллинга</label>
        </div>
        {validationError || error ? <div className="org-directory-modal__error is-wide" role="alert">{validationError || error}</div> : null}
      </form>
    </ModalShell>
  );
}

function DirectoryFlag({ value }) {
  const normalized = String(value).toLowerCase();
  const tone = normalized.includes("неактив") || normalized.includes("заблок") ? "danger"
    : value === "—" || normalized.startsWith("id:") ? "warning"
      : "success";
  return <span className={`org-directory-flag org-directory-flag--${tone}`}>{value}</span>;
}

export function OrganizationDirectoryPage({ search = "", onNotify, onInnerBackChange }) {
  const [rows, setRows] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const statusNamesRef = useRef(new Map());
  const [statusLoadFailed, setStatusLoadFailed] = useState(false);
  const [loadState, setLoadState] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [pageMeta, setPageMeta] = useState({ total: 0, page: 1, size: 20, pages: 1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [appliedLifecycle, setAppliedLifecycle] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("");
  const [visibleColumns, setVisibleColumns] = useState(loadVisibleColumns);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editor, setEditor] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    onInnerBackChange?.(null);
  }, [onInnerBackChange]);

  useEffect(() => {
    const controller = new AbortController();
    hqService.listOrganizationStatuses({ page: 1, size: 200, sort: "sort" }, { signal: controller.signal })
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : data?.items || [];
        const normalizedStatuses = items.map(normalizeOrganizationStatus);
        statusNamesRef.current = new Map(normalizedStatuses.map((status) => [status.id, status.name]));
        setStatuses(normalizedStatuses);
        setRows((current) => current.map((row) => normalizeOrganization(row.raw, statusNamesRef.current)));
        setStatusLoadFailed(false);
      })
      .catch((error) => {
        if (error?.isAborted || error?.code === "ABORTED") return;
        setStatuses([]);
        setStatusLoadFailed(true);
      });
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    const params = { page, size: pageSize };
    const canonicalSearch = appliedSearch || search.trim();
    if (canonicalSearch) params.search = canonicalSearch;
    if (appliedLifecycle) params.status = appliedLifecycle;
    if (appliedStatus) params.organization_status_id = appliedStatus;

    setLoadState("loading");
    setLoadError("");
    hqService.listOrganizations(params, { signal: controller.signal })
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : data?.items || [];
        setRows(items.map((item) => normalizeOrganization(item, statusNamesRef.current)));
        setPageMeta({
          total: Number(data?.total ?? items.length),
          page: Number(data?.page ?? page),
          size: Number(data?.size ?? pageSize),
          pages: Math.max(1, Number(data?.pages ?? 1)),
        });
        setLoadState(items.length ? "success" : "empty");
      })
      .catch((error) => {
        if (error?.isAborted || error?.code === "ABORTED") return;
        setRows([]);
        setLoadState("error");
        setLoadError(errorMessage(error, "Не удалось загрузить организации."));
      });
    return () => controller.abort();
  }, [appliedLifecycle, appliedSearch, appliedStatus, page, pageSize, reloadKey, search]);

  useEffect(() => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const pageList = getPageList(pageMeta.page, pageMeta.pages);
  const startIndex = (pageMeta.page - 1) * pageMeta.size;
  const endIndex = Math.min(startIndex + rows.length, pageMeta.total);
  const activeOnPage = rows.filter((row) => row.lifecycleValue === "active").length;
  const onlineOnPage = rows.filter((row) => row.raw?.online_menu === true).length;
  const hasFilters = Boolean(appliedSearch || search.trim() || appliedLifecycle || appliedStatus);

  function applyFilters(event) {
    event?.preventDefault();
    setPage(1);
    setAppliedSearch(searchDraft.trim());
    setAppliedLifecycle(lifecycleFilter);
    setAppliedStatus(statusFilter);
  }

  function resetFilters() {
    setSearchDraft("");
    setLifecycleFilter("");
    setStatusFilter("");
    setAppliedSearch("");
    setAppliedLifecycle("");
    setAppliedStatus("");
    setPage(1);
  }

  async function saveOrganization(payload) {
    if (mutationBusy) return;
    setMutationBusy(true);
    setMutationError("");
    try {
      if (editor.mode === "create") await hqService.createOrganization(payload);
      else await hqService.updateOrganization(editor.row.id, payload);
      onNotify?.(editor.mode === "create" ? "Организация создана." : "Организация обновлена.");
      setEditor(null);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setMutationError(errorMessage(error, "Не удалось сохранить организацию."));
    } finally {
      setMutationBusy(false);
    }
  }

  async function runConfirmedMutation() {
    if (!confirmation || mutationBusy) return;
    setMutationBusy(true);
    setMutationError("");
    try {
      if (confirmation.kind === "archive") {
        await hqService.archiveOrganization(confirmation.row.id);
        onNotify?.("Организация архивирована.");
        if (rows.length === 1 && page > 1) setPage((value) => value - 1);
        else setReloadKey((value) => value + 1);
      } else {
        await hqService.updateOrganization(confirmation.row.id, { status: confirmation.nextStatus });
        onNotify?.(confirmation.nextStatus === "blocked" ? "Организация заблокирована." : "Организация активирована.");
        setReloadKey((value) => value + 1);
      }
      setConfirmation(null);
    } catch (error) {
      setMutationError(errorMessage(error, "Не удалось изменить организацию."));
    } finally {
      setMutationBusy(false);
    }
  }

  const allColumns = useMemo(() => [
    { key: "number", label: "№", width: 58, render: (_, index) => startIndex + index + 1 },
    { key: "message", label: "Msg", width: 62, render: (row) => <button type="button" className="org-directory-icon" disabled title="Недоступно: HQ-контракт сообщений отсутствует." aria-label={`Сообщения ${row.name} недоступны`}><Icon name="bi-chat-square" size={15} /></button> },
    { key: "name", label: "Название", width: 200, render: (row) => <strong className="org-directory-name">{row.name}</strong> },
    { key: "clientId", label: "ID", width: 210, render: (row) => <span>{row.clientId}</span> },
    { key: "type", label: "Тип", width: 120, render: (row) => row.type },
    { key: "owner", label: "Владелец", width: 150, render: (row) => row.owner },
    { key: "admin", label: "Администратор", width: 150, render: (row) => row.admin },
    { key: "branches", label: "Филиалы", width: 86, render: (row) => row.branches },
    { key: "tariff", label: "Цена тарифа", width: 120, render: (row) => row.tariff },
    { key: "workingDays", label: "Рабочие дни", width: 110, render: (row) => row.workingDays },
    { key: "installed", label: "Установлена", width: 118, render: (row) => row.installed },
    { key: "accessStatus", label: "Статус организации", width: 170, render: (row) => <DirectoryFlag value={row.accessStatus} /> },
    { key: "lifecycle", label: "Состояние", width: 130, render: (row) => <DirectoryFlag value={row.lifecycle} /> },
    { key: "onlineMenu", label: "Онлайн-меню", width: 126, render: (row) => <DirectoryFlag value={row.onlineMenu} /> },
    { key: "warehouse", label: "Склад", width: 112, render: (row) => <DirectoryFlag value={row.warehouse} /> },
    { key: "cashBalance", label: "Баланс", width: 118, render: (row) => row.cashBalance },
    { key: "actions", label: "", width: 132, render: (row) => <div className="org-directory-row-actions">
      <button type="button" className="org-directory-edit" onClick={() => { setMutationError(""); setEditor({ mode: "edit", row }); }} aria-label={`Редактировать ${row.name}`}><Icon name="bi-pencil" size={15} /></button>
      <button type="button" className="org-directory-edit" onClick={() => { setMutationError(""); setConfirmation({ kind: "status", row, nextStatus: row.lifecycleValue === "blocked" ? "active" : "blocked" }); }} aria-label={`${row.lifecycleValue === "blocked" ? "Активировать" : "Заблокировать"} ${row.name}`}><Icon name={row.lifecycleValue === "blocked" ? "bi-unlock" : "bi-lock"} size={15} /></button>
      <button type="button" className="org-directory-edit is-danger" onClick={() => { setMutationError(""); setConfirmation({ kind: "archive", row }); }} aria-label={`Архивировать ${row.name}`}><Icon name="bi-archive" size={15} /></button>
    </div> },
  ], [startIndex]);

  const columns = allColumns.filter((column) => visibleColumns.includes(column.key));

  return (
    <section className="org-directory-page">
      <div className="org-directory-topbar">
        <div><h2>Организации</h2><p>Канонический реестр клиентов HQ с серверной пагинацией.</p></div>
        <button className="org-directory-add" type="button" onClick={() => { setMutationError(""); setEditor({ mode: "create", row: null }); }}>Добавить <Icon name="bi-plus-lg" size={16} /></button>
      </div>

      <div className="org-directory-metrics">
        <span><b>{pageMeta.total}</b> всего</span>
        <span><b>{rows.length}</b> на странице</span>
        <span><b>{activeOnPage}</b> активных на странице</span>
        <span><b>{onlineOnPage}</b> онлайн-меню на странице</span>
      </div>

      <form className="org-directory-toolbar" onSubmit={applyFilters}>
        <label className="org-directory-search"><Icon name="bi-search" size={15} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Поиск по названию или ИНН" /></label>
        <select value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value)} aria-label="Состояние организации">
          <option value="">Все состояния</option><option value="active">Активные</option><option value="blocked">Заблокированные</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Статус организации" disabled={statusLoadFailed}>
          <option value="">Все статусы</option>
          {statuses.map((status) => <option value={status.id} key={status.id}>{status.name}</option>)}
        </select>
        <button type="submit" className="org-directory-soft">Применить</button>
        <button type="button" className="org-directory-soft" onClick={resetFilters}>Сбросить</button>
        <button type="button" className={`org-directory-settings ${settingsOpen ? "is-open" : ""}`} onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen}><Icon name="bi-sliders" size={15} /> Столбцы</button>
      </form>

      {statusLoadFailed ? <div className="org-directory-notice" role="status">Справочник статусов недоступен: связанные значения показаны как ID.</div> : null}
      {loadState === "loading" ? <div className="org-directory-empty" role="status">Загрузка организаций...</div> : null}
      {loadState === "error" ? <div className="org-directory-empty" role="alert">{loadError}</div> : null}

      {settingsOpen ? <div className="org-directory-column-panel">
        {allColumns.map((column) => <label key={column.key}><input type="checkbox" checked={visibleColumns.includes(column.key)} disabled={visibleColumns.includes(column.key) && visibleColumns.length === 1} onChange={() => setVisibleColumns((current) => current.includes(column.key) ? current.filter((key) => key !== column.key) : COLUMN_KEYS.filter((key) => [...current, column.key].includes(key)))} /> {column.label || "Действия"}</label>)}
        <button type="button" className="org-directory-soft" onClick={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}>Сбросить столбцы</button>
      </div> : null}

      {loadState !== "error" ? <div className="org-directory-table-shell" onWheelCapture={keepWheelInsideScroller}>
        <table className="org-directory-table org-directory-table--configurable is-actions-sticky">
          <colgroup>{columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
          <thead><tr>{columns.map((column) => <th className={`org-directory-cell org-directory-cell--${column.key}`} key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>{rows.map((row, rowIndex) => <tr key={row.id}>{columns.map((column) => <td className={`org-directory-cell org-directory-cell--${column.key}`} key={column.key}>{column.render(row, rowIndex)}</td>)}</tr>)}</tbody>
        </table>
        {loadState === "empty" ? <div className="org-directory-empty">{hasFilters ? "По заданным условиям организации не найдены." : "Организации не найдены."}</div> : null}
      </div> : null}

      <div className="org-directory-footer">
        <span className="org-directory-footer__summary">{pageMeta.total ? `${startIndex + 1}-${endIndex} из ${pageMeta.total}` : "0 из 0"}<small>Страница {pageMeta.page} из {pageMeta.pages}</small></span>
        <div className="org-directory-pager">
          <AdminPageSizeDropdown value={pageSize} options={PAGE_SIZE_OPTIONS} onChange={(value) => { setPageSize(value); setPage(1); }} />
          <button type="button" disabled={pageMeta.page === 1 || loadState === "loading"} onClick={() => setPage(1)} aria-label="Первая страница"><Icon name="bi-chevron-double-left" size={14} /></button>
          <button type="button" disabled={pageMeta.page === 1 || loadState === "loading"} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Предыдущая страница"><Icon name="bi-chevron-left" size={15} /></button>
          {pageList.map((item, index) => item === "…" ? <span className="org-directory-ellipsis" key={`gap-${index}`}>…</span> : <button type="button" className={`org-directory-page-btn ${item === pageMeta.page ? "is-active" : ""}`} key={item} onClick={() => setPage(item)} aria-current={item === pageMeta.page ? "page" : undefined}>{item}</button>)}
          <button type="button" disabled={pageMeta.page === pageMeta.pages || loadState === "loading"} onClick={() => setPage((value) => Math.min(pageMeta.pages, value + 1))} aria-label="Следующая страница"><Icon name="bi-chevron-right" size={15} /></button>
          <button type="button" disabled={pageMeta.page === pageMeta.pages || loadState === "loading"} onClick={() => setPage(pageMeta.pages)} aria-label="Последняя страница"><Icon name="bi-chevron-double-right" size={14} /></button>
        </div>
      </div>

      {editor ? <OrganizationFormModal mode={editor.mode} row={editor.row} statuses={statuses.filter((status) => status.active || status.id === editor.row?.organizationStatusId)} busy={mutationBusy} error={mutationError} onClose={() => { if (!mutationBusy) setEditor(null); }} onSubmit={saveOrganization} /> : null}
      {confirmation ? <ModalShell
        title={confirmation.kind === "archive" ? "Архивировать организацию" : confirmation.nextStatus === "blocked" ? "Заблокировать организацию" : "Активировать организацию"}
        description={confirmation.kind === "archive" ? "Backend выполнит мягкое удаление: запись исчезнет из активного реестра, исторические данные сохранятся." : "Состояние будет изменено каноническим PATCH-запросом."}
        onClose={() => { if (!mutationBusy) setConfirmation(null); }} busy={mutationBusy} tone={confirmation.kind === "archive" ? "danger" : "default"}
        actions={<><button type="button" className="admin-modal__btn is-ghost" onClick={() => setConfirmation(null)} disabled={mutationBusy}>Отмена</button><button type="button" className="admin-modal__btn is-primary" onClick={runConfirmedMutation} disabled={mutationBusy}>{mutationBusy ? "Выполнение..." : "Подтвердить"}</button></>}
      >
        <p className="org-directory-modal__confirmation">{confirmation.row.name}</p>
        {mutationError ? <div className="org-directory-modal__error" role="alert">{mutationError}</div> : null}
      </ModalShell> : null}
    </section>
  );
}
