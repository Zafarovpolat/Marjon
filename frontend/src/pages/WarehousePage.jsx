import { useEffect, useMemo, useState } from "react";
import { warehouseService } from "../api/warehouse";
import { isAbortError, useLatestRequest } from "../hooks/useAsyncSafety";
import Icon from "../components/Icon";

const ACTIVE = "active";
const ARCHIVE = "archive";

const sectionAliases = {
  "stock-in": "incoming",
  "stock-out": "outgoing",
  balance: "stock",
  "income-log": "incoming-journal",
  expense: "outgoing",
};

const warehouseConfigs = {
  incoming: {
    title: "Приход товаров",
    primaryAction: "Новый приход +",
    drawerTitle: "Новый приход",
    importExcel: true,
    tabs: true,
    editable: true,
    itemDrawer: true,
    summary: [
      { label: "Всего приходов", icon: "bi-box-arrow-in-down", tone: "blue" },
      { label: "Сумма прихода", icon: "bi-cash-stack", tone: "green" },
      { label: "Поставщиков", icon: "bi-people", tone: "purple" },
      { label: "Черновики", icon: "bi-journal-text", tone: "orange" },
    ],
    filters: [
      ["date", "Дата", "01.06.2026 - 23.06.2026"],
      ["warehouse", "Склад", "Все"],
      ["supplier", "Поставщик", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["№", "Документ", "Поставщик", "Склад", "Сумма", "Статус", "Дата", "Действия"],
  },
  outgoing: {
    title: "Расход товаров",
    primaryAction: "Новый расход +",
    drawerTitle: "Новый расход",
    tabs: true,
    editable: true,
    summary: [
      { label: "Всего расходов", icon: "bi-box-arrow-up", tone: "blue" },
      { label: "Сумма расхода", icon: "bi-cash-stack", tone: "green" },
      { label: "Проведено", icon: "bi-check2-circle", tone: "purple" },
      { label: "В ожидании", icon: "bi-clock-history", tone: "orange" },
    ],
    filters: [
      ["warehouse", "Склад", "Все"],
      ["receiver", "Получатель", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["№", "Документ", "Получатель / Категория", "Склад", "Сумма", "Статус", "Дата", "Действия"],
  },
  stock: {
    title: "Остаток товаров",
    primaryAction: "",
    summary: [
      { label: "Всего позиций", icon: "bi-boxes", tone: "blue" },
      { label: "Общая стоимость", icon: "bi-cash-stack", tone: "green" },
      { label: "Низкий остаток", icon: "bi-exclamation-triangle", tone: "orange" },
      { label: "Складов", icon: "bi-building", tone: "purple" },
    ],
    filters: [
      ["category", "Категория", "Все"],
      ["warehouse", "Склад", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["Товар", "Категория", "Склад", "Остаток", "Мин. остаток", "Ед. изм", "Цена", "Сумма", "Статус"],
  },
  "incoming-journal": {
    title: "Журнал приходов",
    filters: [
      ["warehouse", "Склад", "Все"],
      ["supplier", "Поставщик", "Все"],
    ],
    columns: ["Дата", "Документ", "Поставщик", "Товар", "Кол-во", "Цена", "Сумма", "Автор"],
  },
  transfer: {
    title: "Перемещение",
    primaryAction: "Новое перемещение +",
    drawerTitle: "Новое перемещение",
    tabs: true,
    editable: true,
    filters: [
      ["from", "Со склада", "Все"],
      ["to", "На склад", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["№", "Документ", "Со склада", "На склад", "Кол-во позиций", "Сумма", "Статус", "Дата", "Действия"],
  },
  inventory: {
    title: "Инвентаризация",
    primaryAction: "Новая инвентаризация +",
    drawerTitle: "Новая инвентаризация",
    tabs: true,
    editable: true,
    filters: [
      ["warehouse", "Склад", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["№", "Документ", "Склад", "Плановый остаток", "Фактический остаток", "Расхождение", "Статус", "Дата", "Действия"],
  },
  "write-off": {
    title: "Списание",
    primaryAction: "Новое списание +",
    drawerTitle: "Новое списание",
    tabs: true,
    editable: true,
    summary: [
      { label: "Всего списаний", icon: "bi-trash3", tone: "blue" },
      { label: "Сумма списаний", icon: "bi-cash-stack", tone: "green" },
      { label: "Проведено", icon: "bi-check2-circle", tone: "purple" },
      { label: "В ожидании", icon: "bi-clock-history", tone: "orange" },
    ],
    filters: [
      ["category", "Категория", "Все"],
      ["warehouse", "Склад", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["№", "Документ", "Категория", "Склад", "Сумма", "Статус", "Дата", "Действия"],
  },
  "write-off-categories": {
    title: "Категории списания",
    primaryAction: "Добавить категорию +",
    drawerTitle: "Категория списания",
    tabs: true,
    editable: true,
    filters: [["status", "Статус", "Все"]],
    columns: ["Название", "Описание", "Кол-во списаний", "Сумма", "Статус", "Действия"],
  },
  waste: {
    title: "Отход товаров",
    primaryAction: "Добавить отход +",
    drawerTitle: "Добавить отход",
    tabs: true,
    editable: true,
    summary: [
      { label: "Всего отходов", icon: "bi-recycle", tone: "blue" },
      { label: "Сумма отходов", icon: "bi-cash-stack", tone: "green" },
      { label: "Автоотход", icon: "bi-gear", tone: "purple" },
      { label: "Ручной отход", icon: "bi-pencil", tone: "orange" },
    ],
    filters: [
      ["category", "Категория", "Все"],
      ["author", "Автор", "Все"],
    ],
    columns: ["Дата", "Категория", "Товар", "Ед. изм", "Кол-во", "Сумма", "Автор", "Причина", "Действия"],
  },
};

const sectionUnavailableMessages = {
  outgoing: "Расход товаров недоступен: подтверждённый backend contract не соответствует семантике этого экрана.",
  stock: "Товарные остатки недоступны до завершения Inventory Core.",
  "incoming-journal": "Журнал приходов недоступен: подтверждённый backend contract не предоставляет строки товаров.",
  inventory: "Инвентаризация недоступна до завершения Inventory Core.",
  "write-off": "Документы списания недоступны: подтверждённый backend contract не соответствует семантике этого экрана.",
  "write-off-categories": "Категории списания недоступны: подтверждённый backend contract не подключён.",
  waste: "Отходы товаров недоступны: подтверждённый backend contract не подключён.",
};

const WAREHOUSE_WRITE_UNAVAILABLE = "Изменения недоступны до подключения подтверждённого Warehouse write contract.";

function normalizeSection(section) {
  return sectionAliases[section] || section || "incoming";
}

function formatAmount(value) {
  return `${new Intl.NumberFormat("ru-RU").format(Number(value) || 0)} UZS`;
}

function mapWarehouseReadRow(section, item) {
  if (section === "incoming") {
    return {
      id: item.id,
      document: item.number == null ? "—" : String(item.number),
      supplier: item.supplier || "—",
      warehouse: item.warehouse_name || "—",
      total: item.total_amount == null ? "—" : formatAmount(item.total_amount),
      status: item.status || "",
      date: item.date || "",
      positions: String(item.items_count ?? "—"),
      registeredAt: item.registered_at || "",
      acceptedAt: item.accepted_at || "",
      author: item.created_by_name || "",
      archiveState: ACTIVE,
    };
  }

  if (section === "transfer") {
    return {
      id: item.id,
      document: "—",
      from: item.from_warehouse_name || "—",
      to: item.to_warehouse_name || "—",
      positions: String(item.items_count ?? "—"),
      total: "—",
      status: item.status || "",
      date: item.date || "",
      archiveState: ACTIVE,
    };
  }

  return { id: item.id, archiveState: ACTIVE };
}

function rowSearchText(row) {
  return Object.values(row).filter((value) => typeof value !== "object").join(" ").toLowerCase();
}

function statusTone(status) {
  if (["Проведено", "Завершено", "Активно", "Норма"].includes(status)) return "green";
  if (["Черновик", "В ожидании", "Низкий остаток"].includes(status)) return "orange";
  if (["Отменено", "Нет в наличии"].includes(status)) return "red";
  return "gray";
}

function WarehousePage({ initialSection = "incoming" }) {
  const section = normalizeSection(initialSection);
  const config = warehouseConfigs[section] || warehouseConfigs.incoming;
  const unavailableMessage = sectionUnavailableMessages[section] || "";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(ACTIVE);
  const [draftFilters, setDraftFilters] = useState({ search: "", date: "01.06.2026 - 23.06.2026", warehouse: "", supplier: "", status: "", receiver: "", category: "", author: "", from: "", to: "" });
  const [filters, setFilters] = useState(draftFilters);
  const beginRequest = useLatestRequest();

  useEffect(() => {
    const request = beginRequest();
    if (unavailableMessage) {
      setRows([]);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    Promise.resolve().then(() => warehouseService.list(section, { signal: request.signal }))
      .then(({ data }) => {
        if (!request.isCurrent()) return;
        const items = Array.isArray(data) ? data : data?.items || [];
        setRows(items.map((item) => mapWarehouseReadRow(section, item)));
        setLoading(false);
      })
      .catch((err) => {
        if (!request.isCurrent() || isAbortError(err)) return;
        setRows([]);
        setError(err.response?.data?.detail || "Не удалось загрузить складские данные.");
        setLoading(false);
      });
  }, [beginRequest, section, unavailableMessage]);

  const computedSummary = useMemo(() => {
    if (!config.summary || loading || error) return null;
    const activeRows = rows.filter((r) => r.archiveState === ACTIVE);
    const totalCount = activeRows.length;
    const totalSum = activeRows.reduce((sum, r) => {
      const num = Number(String(r.total || "0").replace(/[^\d]/g, ""));
      return sum + num;
    }, 0);
    const uniqueSuppliers = new Set(activeRows.map((r) => r.supplier).filter(Boolean)).size;
    const uniqueWarehouses = new Set(activeRows.map((r) => r.warehouse).filter(Boolean)).size;
    const drafts = activeRows.filter((r) => (r.status || "").toLowerCase().includes("черновик")).length;
    const completed = activeRows.filter((r) => /проведено|завершено/i.test(r.status || "")).length;
    const pending = activeRows.filter((r) => /ожидани/i.test(r.status || "")).length;
    const lowStock = activeRows.filter((r) => (
      /низк/i.test(r.status || "")
      || (Number.isFinite(Number(r.stock)) && Number.isFinite(Number(r.minStock)) && Number(r.stock) < Number(r.minStock))
    )).length;
    const hasWasteMode = activeRows.some((r) => r.isAutomatic != null || r.mode || r.source);
    const automaticWaste = activeRows.filter((r) => r.isAutomatic === true || /авто|automatic/i.test(`${r.mode || ""} ${r.source || ""}`)).length;
    const manualWaste = activeRows.filter((r) => r.isAutomatic === false || /ручн|manual/i.test(`${r.mode || ""} ${r.source || ""}`)).length;

    return config.summary.map((item) => {
      if (item.label.includes("Всего")) return { ...item, value: String(totalCount) };
      if (item.label.includes("Сумма") || item.label.includes("стоимость")) return { ...item, value: `${totalSum.toLocaleString("ru-RU")} UZS` };
      if (item.label.includes("Поставщик")) return { ...item, value: String(uniqueSuppliers) };
      if (item.label.includes("Черновик")) return { ...item, value: String(drafts) };
      if (item.label.includes("Позиций") || item.label.includes("Товаров") || item.label.includes("Категорий")) return { ...item, value: String(totalCount) };
      if (item.label === "Проведено") return { ...item, value: String(completed) };
      if (item.label === "В ожидании") return { ...item, value: String(pending) };
      if (item.label === "Низкий остаток") return { ...item, value: String(lowStock) };
      if (item.label === "Складов") return { ...item, value: String(uniqueWarehouses) };
      if (item.label === "Автоотход") return { ...item, value: activeRows.length && !hasWasteMode ? "—" : String(automaticWaste) };
      if (item.label === "Ручной отход") return { ...item, value: activeRows.length && !hasWasteMode ? "—" : String(manualWaste) };
      return { ...item, value: "—" };
    });
  }, [rows, config.summary, error, loading]);

  const visibleRows = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesTab = !config.tabs || row.archiveState === activeTab;
      const matchesSearch = !query || rowSearchText(row).includes(query);
      const matchesFilters = Object.entries(filters).every(([key, value]) => {
        if (!value || key === "search" || key === "date") return true;
        return String(row[key] || "").toLowerCase().includes(String(value).toLowerCase());
      });
      return matchesTab && matchesSearch && matchesFilters;
    });
  }, [activeTab, config.tabs, filters, rows]);

  if (unavailableMessage) {
    return (
      <div className="warehouse-page">
        <section className="warehouse-card">
          <header className="warehouse-header">
            <div className="warehouse-title-group">
              <span className="warehouse-accent-bar" />
              <div>
                <p>Склад</p>
                <h1>{config.title}</h1>
              </div>
            </div>
          </header>
          <div className="warehouse-empty-cell" role="status">{unavailableMessage}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="warehouse-page">
      <section className="warehouse-card">
        {loading ? <div className="warehouse-empty-cell" role="status">Загрузка складских данных...</div> : null}
        {error ? <div className="login-error" role="alert">{error}</div> : null}
        <header className="warehouse-header">
          <div className="warehouse-title-group">
            <span className="warehouse-accent-bar" />
            <div>
              <p>Склад</p>
              <h1>{config.title}</h1>
            </div>
          </div>
          <div className="warehouse-actions">
            {config.importExcel ? <button type="button" onClick={() => window.alert("Импорт Excel будет доступен в следующей версии")}><Icon name="bi-file-earmark-spreadsheet" size={17} />Импорт Excel</button> : null}
            {config.primaryAction ? <button type="button" className="warehouse-primary-action" disabled title={WAREHOUSE_WRITE_UNAVAILABLE}>{config.primaryAction}</button> : null}
          </div>
        </header>

        {computedSummary ? (
          <div className="warehouse-summary-grid">
            {computedSummary.map((item) => (
              <article className={`warehouse-summary-card warehouse-summary-card--${item.tone}`} key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
                <i><Icon name={item.icon} size={25} /></i>
              </article>
            ))}
          </div>
        ) : null}

        {config.tabs ? (
          <div className="warehouse-tabs">
            <button type="button" className={activeTab === ACTIVE ? "is-active" : ""} onClick={() => setActiveTab(ACTIVE)}>Активные</button>
            <button type="button" className={activeTab === ARCHIVE ? "is-active" : ""} disabled title={WAREHOUSE_WRITE_UNAVAILABLE}>Архив</button>
          </div>
        ) : null}

        <div className="warehouse-filters">
          <label className="warehouse-search-control">
            <span>Поиск</span>
            <input value={draftFilters.search} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Документ, поставщик, товар..." />
          </label>
          {(config.filters || []).map(([key, label, placeholder]) => (
            <label key={key}>
              <span>{label}</span>
              <input value={draftFilters[key] || ""} onChange={(event) => setDraftFilters((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} />
            </label>
          ))}
          <div className="warehouse-filter-actions">
            <button type="button" onClick={() => setFilters(draftFilters)}><Icon name="bi-funnel" size={15} />Фильтровать</button>
            <button type="button" className="warehouse-clear-action" onClick={() => {
              const reset = { search: "", date: "01.06.2026 - 23.06.2026", warehouse: "", supplier: "", status: "", receiver: "", category: "", author: "", from: "", to: "" };
              setDraftFilters(reset);
              setFilters(reset);
            }}>Очистить</button>
          </div>
        </div>

        <div className="warehouse-table-wrapper">
          <table className="warehouse-table">
            <thead>
              <tr>{config.columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={`${row.id || row.document || row.product || row.name}-${index}`}>
                  {renderWarehouseCells(section, row, index, config.editable)}
                </tr>
              ))}
              {!loading && !error && !visibleRows.length ? <tr><td className="warehouse-empty-cell" colSpan={config.columns.length}>Нет данных</td></tr> : null}
            </tbody>
          </table>
        </div>

        <footer className="warehouse-pagination">
          <span>Показано 1 - {Math.min(visibleRows.length, 10)} из {visibleRows.length}</span>
          <div>
            {[1, 2, 3, 4].map((page) => <button key={page} type="button" className={page === 1 ? "is-active" : ""}>{page}</button>)}
          </div>
          <select defaultValue="10"><option value="10">10 / стр.</option><option value="20">20 / стр.</option></select>
        </footer>
      </section>

    </div>
  );
}

function renderWarehouseCells(section, row, index, editable) {
  const actions = editable ? (
    <td>
      <div className="warehouse-row-actions">
        <button type="button" className="edit-action-button" disabled title={WAREHOUSE_WRITE_UNAVAILABLE} aria-label="Редактирование недоступно"><Icon name="bi-pencil" size={15} /></button>
        <button type="button" className={row.archiveState === ARCHIVE ? "is-restore" : "is-danger"} disabled title={WAREHOUSE_WRITE_UNAVAILABLE} aria-label="Архивирование недоступно">
          <Icon name={row.archiveState === ARCHIVE ? "bi-recycle" : "bi-trash3"} size={15} />
        </button>
      </div>
    </td>
  ) : null;

  const status = row.status ? <span className={`warehouse-status-badge warehouse-status-badge--${statusTone(row.status)}`}>{row.status}</span> : null;

  if (section === "stock") return <><td>{row.product}</td><td>{row.category}</td><td>{row.warehouse}</td><td>{row.stock}</td><td>{row.minStock}</td><td>{row.unit}</td><td>{row.price}</td><td>{row.total}</td><td>{status}</td></>;
  if (section === "incoming-journal") return <><td>{row.date}</td><td>{row.document}</td><td>{row.supplier}</td><td>{row.product}</td><td>{row.quantity}</td><td>{row.price}</td><td>{row.total}</td><td>{row.author}</td></>;
  if (section === "transfer") return <><td>{index + 1}</td><td>{row.document}</td><td>{row.from}</td><td>{row.to}</td><td>{row.positions}</td><td>{row.total}</td><td>{status}</td><td>{row.date}</td>{actions}</>;
  if (section === "inventory") return <><td>{index + 1}</td><td>{row.document}</td><td>{row.warehouse}</td><td>{row.expected}</td><td>{row.actual}</td><td>{row.difference}</td><td>{status}</td><td>{row.date}</td>{actions}</>;
  if (section === "write-off-categories") return <><td>{row.name}</td><td>{row.description}</td><td>{row.count}</td><td>{row.total}</td><td>{status}</td>{actions}</>;
  if (section === "waste") return <><td>{row.date}</td><td>{row.category}</td><td>{row.product}</td><td>{row.unit}</td><td>{row.quantity}</td><td>{row.total}</td><td>{row.author}</td><td>{row.reason}</td>{actions}</>;
  if (section === "outgoing") return <><td>{index + 1}</td><td>{row.document}</td><td>{row.receiver}</td><td>{row.warehouse}</td><td>{row.total}</td><td>{status}</td><td>{row.date}</td>{actions}</>;
  return <><td>{index + 1}</td><td>{row.document}</td><td>{row.supplier}</td><td>{row.warehouse}</td><td>{row.total}</td><td>{status}</td><td>{row.date}</td>{actions}</>;
}

export default WarehousePage;
