import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import Icon from "../components/Icon";

const ACTIVE = "active";
const ARCHIVE = "archive";

const emptyProductItem = { product: "", quantity: 0, unit: "кг", price: 0 };

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

const sectionApiEndpoints = {
  incoming: "/warehouse/purchases",
  outgoing: "/warehouse/write-offs",
  "incoming-journal": "/warehouse/purchases",
  transfer: "/warehouse/transfers",
  inventory: "/warehouse/inventory-checks",
  "write-off": "/warehouse/write-offs",
};

const sectionUnavailableMessages = {
  stock: "Товарные остатки недоступны до завершения Inventory Core.",
  "write-off-categories": "Категории списания недоступны: подтверждённый backend contract не подключён.",
  waste: "Отходы товаров недоступны: подтверждённый backend contract не подключён.",
};

function normalizeSection(section) {
  return sectionAliases[section] || section || "incoming";
}

function parseAmount(value) {
  return Number(String(value || "").replace(/[^\d.-]/g, "")) || 0;
}

function formatAmount(value) {
  return `${new Intl.NumberFormat("ru-RU").format(Number(value) || 0)} UZS`;
}

function defaultForm(section, config) {
  if (section === "incoming") {
    return {
      supplier: "Bozor",
      warehouse: "Основной склад",
      date: "23.06.2026",
      document: "Приход #IN-223",
      comment: "",
      items: [{ ...emptyProductItem }],
    };
  }

  return {
    document: `${config.title} #NEW`,
    date: "23.06.2026",
    supplier: "Bozor",
    receiver: "Кухня",
    warehouse: "Основной склад",
    from: "Основной склад",
    to: "Кухня",
    category: "Кухня",
    product: "Говядина",
    quantity: "1",
    unit: "кг",
    price: "78 000",
    total: "78 000 UZS",
    status: "Черновик",
    comment: "",
  };
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => defaultForm(section, config));

  useEffect(() => {
    if (unavailableMessage) {
      setRows([]);
      setError("");
      setLoading(false);
      return;
    }
    const endpoint = sectionApiEndpoints[section];
    if (!endpoint) {
      setRows([]);
      setLoading(false);
      setError("Данные недоступны: backend contract не подключён.");
      return;
    }
    setLoading(true);
    setError("");
    api.get(endpoint)
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : data?.items || [];
        setRows(items.map((item) => ({
            ...item,
            id: item.id,
            document: item.document_number || item.document || "",
            supplier: item.supplier_name || item.supplier || "",
            receiver: item.receiver_name || item.receiver || "",
            warehouse: item.warehouse_name || item.warehouse || "",
            from: item.from_warehouse || item.from || "",
            to: item.to_warehouse || item.to || "",
            category: item.category_name || item.category || "",
            product: item.product_name || item.product || "",
            total: item.total != null ? formatAmount(item.total) : item.total_formatted || "—",
            price: item.price != null ? formatAmount(item.price) : "—",
            status: item.status_label || item.status || "",
            date: item.date || item.created_at?.split("T")[0] || "",
            name: item.name || "",
            description: item.description || "",
            count: String(item.count ?? "—"),
            unit: item.unit || "—",
            quantity: String(item.quantity ?? ""),
            expected: String(item.expected ?? ""),
            actual: String(item.actual ?? ""),
            difference: String(item.difference ?? ""),
            positions: String(item.positions_count ?? item.positions ?? ""),
            minStock: String(item.min_stock ?? ""),
            stock: String(item.stock ?? ""),
            author: item.author_name || item.author || "",
            reason: item.reason || "",
            archiveState: item.is_archived ? ARCHIVE : ACTIVE,
          })));
        setLoading(false);
      })
      .catch((err) => {
        setRows([]);
        setError(err.response?.data?.detail || "Не удалось загрузить складские данные.");
        setLoading(false);
      });
  }, [section, unavailableMessage]);

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

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm(section, config));
    setDrawerOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id || row.document || row.name);
    setForm({
      ...defaultForm(section, config),
      ...row,
      items: row.items || [],
      date: row.date || "23.06.2026",
    });
    setDrawerOpen(true);
  };

  const archiveRow = async (row) => {
    const rowId = row.id || row.document || row.name || row.product;
    if (!row.id) {
      window.alert("Архивирование недоступно: backend identity не подтверждён.");
      return;
    }
    try {
      await api.delete(`${sectionApiEndpoints[section]}/${row.id}`);
    } catch (err) {
      window.alert(err.response?.data?.detail || "Ошибка архивирования");
      return;
    }
    setRows((current) => current.map((item) => ((item.id || item.document || item.name || item.product) === rowId ? { ...item, archiveState: ARCHIVE } : item)));
  };

  const restoreRow = (row) => {
    void row;
    window.alert("Восстановление недоступно: backend mutation contract не подключён.");
  };

  const saveDocument = async (status) => {
    const incomingTotal = section === "incoming" ? form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0) : parseAmount(form.total);
    const nextRow = buildRowFromForm(section, form, status, rows.length + 1, incomingTotal);

    const endpoint = sectionApiEndpoints[section];
    if (endpoint) {
      const payload = { ...form, status, total: incomingTotal };
      try {
        if (editingId && typeof editingId === "number") {
          await api.patch(`${endpoint}/${editingId}`, payload);
        } else {
          const { data } = await api.post(endpoint, payload);
          if (data?.id) nextRow.id = data.id;
        }
      } catch (err) {
        window.alert(err.response?.data?.detail || "Ошибка сохранения");
        return;
      }
    }

    if (editingId) {
      setRows((current) => current.map((row) => ((row.id || row.document || row.name) === editingId ? { ...row, ...nextRow, id: row.id, archiveState: row.archiveState } : row)));
    } else {
      setRows((current) => [{ ...nextRow, id: nextRow.id || Date.now(), archiveState: ACTIVE }, ...current]);
    }
    setDrawerOpen(false);
  };

  const updateItem = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }));
  };

  const removeItem = (index) => {
    setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  };

  const addItem = () => {
    setForm((current) => ({ ...current, items: [...current.items, { ...emptyProductItem }] }));
  };

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
            {config.primaryAction ? <button type="button" className="warehouse-primary-action" onClick={openCreate}>{config.primaryAction}</button> : null}
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
            <button type="button" className={activeTab === ARCHIVE ? "is-active" : ""} onClick={() => setActiveTab(ARCHIVE)}>Архив</button>
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
                  {renderWarehouseCells(section, row, index, config.editable, activeTab === ARCHIVE ? restoreRow : archiveRow, openEdit)}
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

      {drawerOpen ? (
        <WarehouseDrawer
          config={config}
          form={form}
          section={section}
          setForm={setForm}
          onClose={() => setDrawerOpen(false)}
          onSave={() => saveDocument("Черновик")}
          onCommit={() => saveDocument(section === "inventory" ? "Завершено" : "Проведено")}
          addItem={addItem}
          removeItem={removeItem}
          updateItem={updateItem}
        />
      ) : null}
    </div>
  );
}

function buildRowFromForm(section, form, status, nextIndex, total) {
  if (section === "incoming") {
    return {
      document: form.document || `Приход #IN-${220 + nextIndex}`,
      supplier: form.supplier,
      warehouse: form.warehouse,
      total: formatAmount(total),
      status,
      date: form.date,
      items: form.items,
    };
  }
  if (section === "write-off-categories") return { name: form.category || form.document, description: form.comment || "Новая категория", count: "0", total: "0 UZS", status: "Активно" };
  if (section === "waste") return { date: form.date, category: form.category, product: form.product, unit: form.unit, quantity: form.quantity, total: form.total, author: "SARDORKASSA", reason: form.comment || "Ручной отход", status: "Активно" };
  if (section === "transfer") return { document: form.document, from: form.from, to: form.to, positions: "1", total: form.total, status, date: form.date };
  if (section === "inventory") return { document: form.document, warehouse: form.warehouse, expected: "128", actual: form.quantity || "128", difference: "0", status, date: form.date };
  if (section === "outgoing") return { document: form.document, receiver: form.receiver, warehouse: form.warehouse, total: form.total, status, date: form.date };
  return { document: form.document, category: form.category, warehouse: form.warehouse, total: form.total, status, date: form.date };
}

function renderWarehouseCells(section, row, index, editable, archiveHandler, openEdit) {
  const actions = editable ? (
    <td>
      <div className="warehouse-row-actions">
        <button type="button" className="edit-action-button" onClick={() => openEdit(row)}><Icon name="bi-pencil" size={15} /></button>
        <button type="button" className={row.archiveState === ARCHIVE ? "is-restore" : "is-danger"} onClick={() => archiveHandler(row)}>
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

function WarehouseDrawer({ config, form, section, setForm, onClose, onSave, onCommit, addItem, removeItem, updateItem }) {
  const documentTotal = section === "incoming" ? form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0) : parseAmount(form.total);

  return (
    <div className="warehouse-drawer" role="dialog" aria-modal="true">
      <div className="warehouse-drawer__backdrop" onClick={onClose} />
      <aside className="warehouse-form">
        <header className="warehouse-form__header">
          <div>
            <p>Складской документ</p>
            <h2>{config.drawerTitle || config.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="bi-x-lg" size={20} /></button>
        </header>

        <div className="warehouse-form__grid">
          {section === "incoming" ? (
            <>
              <label><span>Поставщик *</span><input value={form.supplier} onChange={(event) => setForm((current) => ({ ...current, supplier: event.target.value }))} /></label>
              <label><span>Склад *</span><input value={form.warehouse} onChange={(event) => setForm((current) => ({ ...current, warehouse: event.target.value }))} /></label>
            </>
          ) : section === "transfer" ? (
            <>
              <label><span>Со склада</span><input value={form.from} onChange={(event) => setForm((current) => ({ ...current, from: event.target.value }))} /></label>
              <label><span>На склад</span><input value={form.to} onChange={(event) => setForm((current) => ({ ...current, to: event.target.value }))} /></label>
            </>
          ) : (
            <>
              <label><span>Получатель / категория</span><input value={form.receiver || form.category || ""} onChange={(event) => setForm((current) => ({ ...current, receiver: event.target.value, category: event.target.value }))} /></label>
              <label><span>Склад</span><input value={form.warehouse} onChange={(event) => setForm((current) => ({ ...current, warehouse: event.target.value }))} /></label>
            </>
          )}
          <label><span>Дата *</span><input value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label>
          <label><span>Номер документа *</span><input value={form.document} onChange={(event) => setForm((current) => ({ ...current, document: event.target.value }))} /></label>
        </div>

        {section === "incoming" ? (
          <div className="warehouse-products-box">
            <div className="warehouse-products-box__head">
              <strong>Товары *</strong>
              <span>Итого: {formatAmount(documentTotal)}</span>
            </div>
            {form.items.map((item, index) => {
              const lineTotal = Number(item.quantity || 0) * Number(item.price || 0);
              return (
                <div className="warehouse-product-row" key={`${item.product}-${index}`}>
                  <input value={item.product} onChange={(event) => updateItem(index, "product", event.target.value)} placeholder="Выберите товар" />
                  <input value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} />
                  <input value={item.unit} onChange={(event) => updateItem(index, "unit", event.target.value)} />
                  <input value={item.price} onChange={(event) => updateItem(index, "price", event.target.value)} />
                  <strong>{formatAmount(lineTotal)}</strong>
                  <button type="button" onClick={() => removeItem(index)}><Icon name="bi-trash3" size={14} /></button>
                </div>
              );
            })}
            <button type="button" className="warehouse-add-product" onClick={addItem}>+ Добавить товар</button>
          </div>
        ) : (
          <div className="warehouse-form__grid">
            <label><span>Товар</span><input value={form.product || ""} onChange={(event) => setForm((current) => ({ ...current, product: event.target.value }))} /></label>
            <label><span>Количество</span><input value={form.quantity || ""} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} /></label>
            <label><span>Цена / сумма</span><input value={form.total || ""} onChange={(event) => setForm((current) => ({ ...current, total: event.target.value }))} /></label>
          </div>
        )}

        <label className="warehouse-form__comment">
          <span>Комментарий</span>
          <textarea value={form.comment || ""} onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))} placeholder="Введите комментарий..." />
        </label>

        <footer className="warehouse-form__footer">
          <button type="button" onClick={onClose}>Отмена</button>
          <button type="button" onClick={onSave}>Сохранить</button>
          <button type="button" className="warehouse-commit-action" onClick={onCommit}>{section === "inventory" ? "Завершить" : "Провести"}</button>
        </footer>
      </aside>
    </div>
  );
}

export default WarehousePage;
