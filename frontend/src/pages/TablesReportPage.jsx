import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import Icon from "../components/Icon";
import ReportDateRangePicker from "../components/ReportDateRangePicker";
import { exportToExcel } from "../utils/excel";

const initialFilters = {
  zone: "all",
  table: "",
  paymentType: "all",
  waiter: "all",
  minAmount: "",
  maxAmount: "",
};

const tableColumnOptions = [
  { key: "tableNumber", label: "Номер стола" },
  { key: "date", label: "Дата" },
  { key: "servicePrice", label: "Цена обслуживания" },
  { key: "discount", label: "Скидка" },
  { key: "placePrice", label: "Цена места" },
  { key: "dishesAmount", label: "Сумма блюд" },
  { key: "total", label: "Сумма" },
  { key: "transaction", label: "Транзакции" },
  { key: "action", label: "Действие" },
];

const defaultTableColumnVisibility = tableColumnOptions.reduce((acc, column) => ({
  ...acc,
  [column.key]: true,
}), {});
const tableColumnsStorageKey = "marjon.tables-report.visible-columns";

function getStoredTableColumnVisibility() {
  if (typeof window === "undefined") {
    return defaultTableColumnVisibility;
  }

  try {
    const stored = window.localStorage.getItem(tableColumnsStorageKey);
    if (!stored) {
      return defaultTableColumnVisibility;
    }

    const parsed = JSON.parse(stored);
    const next = { ...defaultTableColumnVisibility };
    tableColumnOptions.forEach((column) => {
      if (typeof parsed?.[column.key] === "boolean") {
        next[column.key] = parsed[column.key];
      }
    });

    return tableColumnOptions.some((column) => next[column.key] !== false)
      ? next
      : defaultTableColumnVisibility;
  } catch {
    return defaultTableColumnVisibility;
  }
}

const datePresets = [
  "Сегодня",
  "Вчера",
  "Эта неделя",
  "Этот месяц",
  "Прошлый месяц",
  "Этот квартал",
  "Прошлый квартал",
  "Этот год",
  "Прошлый год",
];

function padDate(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${padDate(date.getDate())}.${padDate(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatPeriodLabel(range) {
  return range.preset || `${range.start} - ${range.end}`;
}

function presetRange(label) {
  const today = new Date(2026, 5, 27);
  const start = new Date(today);
  const end = new Date(today);

  if (label === "Вчера") {
    start.setDate(today.getDate() - 1);
    end.setDate(today.getDate() - 1);
  } else if (label === "Эта неделя") {
    start.setDate(today.getDate() - 6);
  } else if (label === "Этот месяц") {
    start.setDate(1);
  } else if (label === "Прошлый месяц") {
    start.setMonth(today.getMonth() - 1, 1);
    end.setMonth(today.getMonth(), 0);
  } else if (label === "Этот квартал") {
    start.setMonth(Math.floor(today.getMonth() / 3) * 3, 1);
  } else if (label === "Прошлый квартал") {
    const quarterStart = Math.floor(today.getMonth() / 3) * 3;
    start.setMonth(quarterStart - 3, 1);
    end.setMonth(quarterStart, 0);
  } else if (label === "Этот год") {
    start.setMonth(0, 1);
  } else if (label === "Прошлый год") {
    start.setFullYear(today.getFullYear() - 1, 0, 1);
    end.setFullYear(today.getFullYear() - 1, 11, 31);
  }

  return { preset: label, start: formatDate(start), end: formatDate(end) };
}

export default function TablesReportPage() {
  const tableSettingsRef = useRef(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tableSettingsOpen, setTableSettingsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => getStoredTableColumnVisibility());
  const [dateRange, setDateRange] = useState({ preset: "", start: "01.06.2026", end: "01.07.2026" });
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [selectedTable, setSelectedTable] = useState(null);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.get("/reports/tables", { params: { start: dateRange.start, end: dateRange.end } })
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : data?.items || data?.tables || [];
        setRows(items.map((item) => ({
            id: String(item.id || ""),
            tableNumber: item.table_number || item.tableNumber || "",
            date: item.date || "",
            servicePrice: item.service_price ? `${Number(item.service_price).toLocaleString("ru-RU")} UZS` : "0 UZS",
            serviceValue: Number(item.service_price || 0),
            discount: item.discount ? `${Number(item.discount).toLocaleString("ru-RU")} UZS` : "0 UZS",
            placePrice: item.place_price ? `${Number(item.place_price).toLocaleString("ru-RU")} UZS` : "0 UZS",
            placeValue: Number(item.place_price || 0),
            dishesAmount: item.dishes_amount ? `${Number(item.dishes_amount).toLocaleString("ru-RU")} UZS` : "0 UZS",
            dishesValue: Number(item.dishes_amount || 0),
            total: item.total ? `${Number(item.total).toLocaleString("ru-RU")} UZS` : "0 UZS",
            totalValue: Number(item.total || 0),
            transaction: item.transaction || "",
            zone: item.zone || "",
            paymentType: item.payment_type || item.paymentType || "",
            waiter: item.waiter_name || item.waiter || "",
            orders: item.orders || [],
          })));
      })
      .catch(() => setRows([]));
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    try {
      window.localStorage.setItem(tableColumnsStorageKey, JSON.stringify(visibleColumns));
    } catch {
      // localStorage can be unavailable in restricted browser modes.
    }
  }, [visibleColumns]);

  useEffect(() => {
    if (!tableSettingsOpen) {
      return undefined;
    }

    function closeOnOutsideClick(event) {
      if (!tableSettingsRef.current?.contains(event.target)) {
        setTableSettingsOpen(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setTableSettingsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [tableSettingsOpen]);

  const zones = useMemo(() => Array.from(new Set(rows.map((row) => row.zone))), [rows]);
  const waiters = useMemo(() => Array.from(new Set(rows.map((row) => row.waiter))), [rows]);
  const paymentTypes = useMemo(() => Array.from(new Set(rows.map((row) => row.paymentType))), [rows]);
  const visibleTableColumns = useMemo(
    () => tableColumnOptions.filter((column) => visibleColumns[column.key] !== false),
    [visibleColumns],
  );

  const filteredRows = useMemo(() => rows.filter((row) => {
    const min = appliedFilters.minAmount ? Number(appliedFilters.minAmount) : null;
    const max = appliedFilters.maxAmount ? Number(appliedFilters.maxAmount) : null;
    return (
      (appliedFilters.zone === "all" || row.zone === appliedFilters.zone) &&
      (!appliedFilters.table || row.tableNumber.toLowerCase().includes(appliedFilters.table.toLowerCase())) &&
      (appliedFilters.paymentType === "all" || row.paymentType === appliedFilters.paymentType) &&
      (appliedFilters.waiter === "all" || row.waiter === appliedFilters.waiter) &&
      (min === null || row.totalValue >= min) &&
      (max === null || row.totalValue <= max)
    );
  }), [rows, appliedFilters]);
  const summaries = useMemo(() => {
    const sum = (key) => filteredRows.reduce((total, row) => total + Number(row[key] || 0), 0);
    const format = (value) => `${Number(value || 0).toLocaleString("ru-RU")} UZS`;

    return [
      { key: "service", label: "Цена обслуживания", value: format(sum("serviceValue")), className: "tables-summary-service", icon: "bi-percent" },
      { key: "place", label: "Цена места", value: format(sum("placeValue")), className: "tables-summary-place", icon: "bi-grid-3x3-gap" },
      { key: "dishes", label: "Сумма блюд", value: format(sum("dishesValue")), className: "tables-summary-dishes", icon: "bi-cup-hot" },
      { key: "total", label: "Сумма", value: format(sum("totalValue")), className: "tables-summary-total", icon: "bi-cash-stack" },
    ];
  }, [filteredRows]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setAppliedFilters(filters);
  }

  function toggleColumn(key) {
    setVisibleColumns((current) => {
      const isVisible = current[key] !== false;
      const visibleCount = tableColumnOptions.filter((column) => current[column.key] !== false).length;
      if (isVisible && visibleCount <= 1) {
        return current;
      }
      return { ...current, [key]: !isVisible };
    });
  }

  function downloadExcel() {
    const cols = [
      { key: "table", label: "Номер стола" },
      { key: "date", label: "Дата" },
      { key: "service", label: "Цена обслуживания" },
      { key: "discount", label: "Скидка" },
      { key: "dishes", label: "Сумма блюд" },
      { key: "total", label: "Сумма" },
    ];
    exportToExcel(filteredRows, cols, "tables-report");
  }

  return (
    <section className="tables-report-page">
      <article className="report-page-card">
        <div className="report-page-header">
          <div className="report-title-group">
            <span className="report-accent-bar" aria-hidden="true" />
            <div>
              <span className="report-eyebrow">Marjon reports</span>
              <h2>Отчёт по столам</h2>
            </div>
          </div>
          <div className="report-actions">
            <div className="tables-table-settings" ref={tableSettingsRef}>
              <button className="tables-table-settings-button" type="button" onClick={() => setTableSettingsOpen((value) => !value)} aria-expanded={tableSettingsOpen}>
                <Icon name="bi-gear-wide-connected" size={18} />
                Настроить таблицу
              </button>
              {tableSettingsOpen ? (
                <div className="tables-table-settings-popover">
                  <div className="tables-table-settings-head">
                    <strong>Столбцы таблицы</strong>
                    <button type="button" onClick={() => setVisibleColumns(defaultTableColumnVisibility)}>Сбросить</button>
                  </div>
                  <div className="tables-table-settings-list">
                    {tableColumnOptions.map((column) => {
                      const checked = visibleColumns[column.key] !== false;
                      const disabled = checked && visibleTableColumns.length <= 1;
                      return (
                        <label key={column.key}>
                          <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleColumn(column.key)} />
                          <span>{column.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <ReportDateRangePicker value={dateRange} onChange={setDateRange} showDropdownIcon />
            <button className="tables-filter-toggle" type="button" onClick={() => setFiltersOpen((value) => !value)}>
              <Icon name="bi-sliders" size={18} />
              Фильтровать
            </button>
            <button className="report-excel-button" type="button" onClick={downloadExcel}>
              <Icon name="bi-file-earmark-excel" size={18} />
              Скачать Excel
            </button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="report-filter-panel">
            <label>
              <span>Зона / зал</span>
              <select value={filters.zone} onChange={(event) => updateFilter("zone", event.target.value)}>
                <option value="all">Все зоны</option>
                {zones.map((zone) => <option value={zone} key={zone}>{zone}</option>)}
              </select>
            </label>
            <label>
              <span>Номер стола</span>
              <input value={filters.table} onChange={(event) => updateFilter("table", event.target.value)} placeholder="Например: 8" />
            </label>
            <label>
              <span>Тип оплаты</span>
              <select value={filters.paymentType} onChange={(event) => updateFilter("paymentType", event.target.value)}>
                <option value="all">Все типы</option>
                {paymentTypes.map((type) => <option value={type} key={type}>{type}</option>)}
              </select>
            </label>
            <label>
              <span>Официант</span>
              <select value={filters.waiter} onChange={(event) => updateFilter("waiter", event.target.value)}>
                <option value="all">Все официанты</option>
                {waiters.map((waiter) => <option value={waiter} key={waiter}>{waiter}</option>)}
              </select>
            </label>
            <label>
              <span>Минимальная сумма</span>
              <input value={filters.minAmount} onChange={(event) => updateFilter("minAmount", event.target.value)} inputMode="numeric" placeholder="0" />
            </label>
            <label>
              <span>Максимальная сумма</span>
              <input value={filters.maxAmount} onChange={(event) => updateFilter("maxAmount", event.target.value)} inputMode="numeric" placeholder="500000" />
            </label>
            <button type="button" onClick={applyFilters}>
              <Icon name="bi-check2" size={18} />
              Применить
            </button>
          </div>
        ) : null}

        <div className="report-summary-grid">
          {summaries.map((summary) => (
            <article className={`report-summary-card ${summary.className}`} key={summary.key}>
              <div>
                <span>{summary.label}</span>
                <strong>{summary.value}</strong>
              </div>
              <Icon name={summary.icon} size={22} />
            </article>
          ))}
        </div>

        <style>
          {tableColumnOptions.map((column, index) => (
            visibleColumns[column.key] === false
              ? `.tables-report-page .report-table thead th:nth-child(${index + 1}), .tables-report-page .report-table tbody tr:not(.report-empty-row) td:nth-child(${index + 1}) { display: none !important; }`
              : ""
          )).join("\n")}
        </style>

        <div className="report-table-wrapper">
          <table className="report-table">
            <thead>
              <tr>
                <th>Номер стола</th>
                <th>Дата</th>
                <th>Цена обслуживания</th>
                <th>Скидка</th>
                <th>Цена места</th>
                <th>Сумма блюд</th>
                <th>Сумма</th>
                <th>Транзакции</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.tableNumber}</strong></td>
                  <td>{row.date}</td>
                  <td>{row.servicePrice}</td>
                  <td>{row.discount}</td>
                  <td>{row.placePrice}</td>
                  <td>{row.dishesAmount}</td>
                  <td className="tables-total-cell">{row.total}</td>
                  <td>{row.transaction}</td>
                  <td>
                    <button className="report-link-action" type="button" onClick={() => setSelectedTable(row)}>
                      Посмотреть заказы
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr className="report-empty-row">
                  <td colSpan="9">По выбранным фильтрам столов не найдено</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      {selectedTable ? (
        <div className="report-drawer" role="dialog" aria-label="Заказы стола">
          <div className="report-drawer__backdrop" onClick={() => setSelectedTable(null)} />
          <aside className="report-drawer__panel">
            <div className="report-drawer__head">
              <div>
                <span>Стол</span>
                <h3>{selectedTable.tableNumber}</h3>
              </div>
              <button type="button" onClick={() => setSelectedTable(null)} aria-label="Закрыть">
                <Icon name="bi-x-lg" size={18} />
              </button>
            </div>
            <div className="report-drawer__orders">
              {selectedTable.orders.map((order) => (
                <article key={order.number}>
                  <div>
                    <strong>{order.number}</strong>
                    <span>{order.date}</span>
                  </div>
                  <div>
                    <span>Официант</span>
                    <strong>{order.waiter}</strong>
                  </div>
                  <div>
                    <span>Сумма</span>
                    <strong>{order.amount}</strong>
                  </div>
                  <em>{order.status}</em>
                </article>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
