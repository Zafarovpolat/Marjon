import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import ReportDateRangePicker from "../components/ReportDateRangePicker";

const initialFilters = {
  zone: "all",
  table: "",
  paymentType: "all",
  waiter: "all",
  minAmount: "",
  maxAmount: "",
};

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

const tableRows = [
  {
    id: "table-8",
    tableNumber: "8 - Billiard",
    date: "10.06.2026 / 16:23",
    servicePrice: "0 UZS",
    serviceValue: 0,
    discount: "0 UZS",
    placePrice: "31 297 334 UZS",
    dishesAmount: "111 000 UZS",
    total: "31 408 334 UZS",
    totalValue: 31408334,
    transaction: "Terminal - 31 408 334 UZS",
    zone: "Billiard",
    paymentType: "Terminal",
    waiter: "Nurmuxammad",
    orders: [
      { number: "#1421", date: "10.06.2026 / 16:23", waiter: "Nurmuxammad", amount: "31 408 334 UZS", status: "Оплачен" },
      { number: "#1419", date: "10.06.2026 / 15:58", waiter: "Nurmuxammad", amount: "111 000 UZS", status: "Закрыт" },
    ],
  },
  {
    id: "table-6",
    tableNumber: "6 - ЗАЛЛ",
    date: "10.06.2026 / 16:23",
    servicePrice: "8 500 UZS",
    serviceValue: 8500,
    discount: "0 UZS",
    placePrice: "0 UZS",
    dishesAmount: "85 000 UZS",
    total: "93 500 UZS",
    totalValue: 93500,
    transaction: "NAXT - 93 500 UZS",
    zone: "ЗАЛЛ",
    paymentType: "NAXT",
    waiter: "САБИНА",
    orders: [
      { number: "#1408", date: "10.06.2026 / 16:23", waiter: "САБИНА", amount: "93 500 UZS", status: "Оплачен" },
    ],
  },
  {
    id: "table-3",
    tableNumber: "3 - ЗАЛЛ",
    date: "10.06.2026 / 16:23",
    servicePrice: "6 500 UZS",
    serviceValue: 6500,
    discount: "0 UZS",
    placePrice: "0 UZS",
    dishesAmount: "97 000 UZS",
    total: "103 500 UZS",
    totalValue: 103500,
    transaction: "NAXT - 103 500 UZS",
    zone: "ЗАЛЛ",
    paymentType: "NAXT",
    waiter: "Азизбек",
    orders: [
      { number: "#1407", date: "10.06.2026 / 16:23", waiter: "Азизбек", amount: "103 500 UZS", status: "Оплачен" },
    ],
  },
  {
    id: "table-2",
    tableNumber: "2 - КАБИНА",
    date: "10.06.2026 / 16:23",
    servicePrice: "10 400 UZS",
    serviceValue: 10400,
    discount: "0 UZS",
    placePrice: "0 UZS",
    dishesAmount: "52 000 UZS",
    total: "62 400 UZS",
    totalValue: 62400,
    transaction: "NAXT - 62 400 UZS",
    zone: "КАБИНА",
    paymentType: "NAXT",
    waiter: "Дилноза",
    orders: [
      { number: "#1403", date: "10.06.2026 / 16:23", waiter: "Дилноза", amount: "62 400 UZS", status: "Оплачен" },
    ],
  },
  {
    id: "table-7",
    tableNumber: "7 - Billiard",
    date: "01.05.2026 / 14:21",
    servicePrice: "0 UZS",
    serviceValue: 0,
    discount: "0 UZS",
    placePrice: "112 UZS",
    dishesAmount: "99 000 UZS",
    total: "99 112 UZS",
    totalValue: 99112,
    transaction: "NAXT - 99 112 UZS",
    zone: "Billiard",
    paymentType: "NAXT",
    waiter: "Сардор",
    orders: [
      { number: "#1201", date: "01.05.2026 / 14:21", waiter: "Сардор", amount: "99 112 UZS", status: "Оплачен" },
    ],
  },
  {
    id: "table-1",
    tableNumber: "1 - VIP",
    date: "01.05.2026 / 13:02",
    servicePrice: "0 UZS",
    serviceValue: 0,
    discount: "0 UZS",
    placePrice: "0 UZS",
    dishesAmount: "0 UZS",
    total: "0 UZS",
    totalValue: 0,
    transaction: "NAXT - 0 UZS",
    zone: "VIP",
    paymentType: "NAXT",
    waiter: "Менеджер",
    orders: [
      { number: "#1194", date: "01.05.2026 / 13:02", waiter: "Менеджер", amount: "0 UZS", status: "Закрыт" },
    ],
  },
];

const summaries = [
  { key: "service", label: "Цена обслуживания", value: "25 400 UZS", className: "tables-summary-service", icon: "bi-percent" },
  { key: "place", label: "Цена места", value: "31 297 446 UZS", className: "tables-summary-place", icon: "bi-grid-3x3-gap" },
  { key: "dishes", label: "Сумма блюд", value: "444 000 UZS", className: "tables-summary-dishes", icon: "bi-cup-hot" },
  { key: "total", label: "Сумма", value: "31 766 846 UZS", className: "tables-summary-total", icon: "bi-cash-stack" },
];

export default function TablesReportPage() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ preset: "", start: "01.06.2026", end: "01.07.2026" });
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [selectedTable, setSelectedTable] = useState(null);

  const zones = useMemo(() => Array.from(new Set(tableRows.map((row) => row.zone))), []);
  const waiters = useMemo(() => Array.from(new Set(tableRows.map((row) => row.waiter))), []);
  const paymentTypes = useMemo(() => Array.from(new Set(tableRows.map((row) => row.paymentType))), []);

  const filteredRows = useMemo(() => tableRows.filter((row) => {
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
  }), [appliedFilters]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setAppliedFilters(filters);
  }

  function downloadExcel() {
    window.alert("Excel-экспорт будет доступен в следующей версии");
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
            <ReportDateRangePicker value={dateRange} onChange={setDateRange} />
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
