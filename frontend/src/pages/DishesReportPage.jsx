import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import Icon from "../components/Icon";
import ReportDateRangePicker from "../components/ReportDateRangePicker";
import { exportToExcel } from "../utils/excel";

const initialFilters = {
  query: "",
  author: "all",
  chef: "all",
  product: "all",
  orderType: "all",
  orderStatus: "all",
  category: "all",
  paymentType: "all",
};

const filterNames = {
  query: "Поиск",
  author: "Автор",
  chef: "Повар",
  product: "Продукт",
  orderType: "Тип заказа",
  orderStatus: "Статус",
  category: "Категория",
  paymentType: "Тип оплаты",
};

function optionLabel(value) {
  return value === "all" ? "" : value;
}

function formatReportMoney(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} UZS`;
}

export default function DishesReportPage() {
  const [dateRange, setDateRange] = useState({ preset: "", start: "01.04.2026", end: "01.07.2026" });
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [expandedRow, setExpandedRow] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.get("/reports/dishes", { params: { start: dateRange.start, end: dateRange.end } })
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : data?.items || data?.dishes || [];
        setRows(items.map((item, index) => {
          const quantityValue = Number(item.quantity || 0);
          const priceValue = Number(item.price || 0);
          const amountValue = Number(item.amount || 0);
          const costValue = Number(item.cost_price || item.cost || 0);
          const profitValue = Number(item.profit || 0);

          return {
            id: String(item.id || item.name || index),
            name: `${index + 1}. ${item.name || ""}`,
            unit: item.unit || "Порция (пр)",
            quantity: String(quantityValue),
            quantityValue,
            price: formatReportMoney(priceValue),
            priceValue,
            amount: formatReportMoney(amountValue),
            amountValue,
            cost: formatReportMoney(costValue),
            costValue,
            profit: formatReportMoney(profitValue),
            profitValue,
            status: item.status || "Завершено",
            details: item.details || undefined,
          };
        }));
      })
      .catch(() => setRows([]));
  }, [dateRange.start, dateRange.end]);

  const filteredRows = useMemo(() => {
    const query = appliedFilters.query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!query) return true;
      return row.name.toLowerCase().includes(query);
    });
  }, [rows, appliedFilters]);
  const totalRow = useMemo(() => {
    const sum = (key) => filteredRows.reduce((total, row) => total + Number(row[key] || 0), 0);

    return {
      name: "Итого",
      unit: "",
      quantity: String(sum("quantityValue").toLocaleString("ru-RU")),
      price: "",
      amount: formatReportMoney(sum("amountValue")),
      cost: formatReportMoney(sum("costValue")),
      profit: formatReportMoney(sum("profitValue")),
      status: "",
    };
  }, [filteredRows]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setAppliedFilters(filters);
  }

  function clearFilters() {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setExpandedRow("");
  }

  function downloadExcel() {
    const cols = [
      { key: "name", label: "Название" },
      { key: "unit", label: "Ед изм" },
      { key: "quantity", label: "Кол-во" },
      { key: "price", label: "Цена" },
      { key: "total", label: "Сумма" },
      { key: "cost", label: "Себестоимость" },
      { key: "profit", label: "Прибыль" },
    ];
    exportToExcel(filteredRows, cols, "dishes-report");
  }

  return (
    <section className="dishes-report-page">
      <article className="report-page-card">
        <div className="report-page-header">
          <div className="report-title-group">
            <span className="report-accent-bar" aria-hidden="true" />
            <div>
              <span className="report-eyebrow">Marjon reports</span>
              <h2>Отчёт по блюдам</h2>
            </div>
          </div>
          <div className="report-actions">
            <ReportDateRangePicker value={dateRange} onChange={setDateRange} showDropdownIcon />
            <button className="report-excel-button" type="button" onClick={downloadExcel}>
              <Icon name="bi-file-earmark-excel" size={18} />
              Скачать Excel
            </button>
          </div>
        </div>

        <div className="report-filters-grid">
          <label className="report-filter-input">
            <Icon name="bi-search" size={17} />
            <input value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} placeholder="Поиск" />
          </label>
          <label className="report-filter-select">
            <select value={filters.author} onChange={(event) => updateFilter("author", event.target.value)}>
              <option value="all">Выберите автора</option>
              <option value="Admin">Admin</option>
              <option value="SARDORKASSA">SARDORKASSA</option>
            </select>
            <Icon name="bi-chevron-down" size={16} />
          </label>
          <label className="report-filter-select">
            <select value={filters.chef} onChange={(event) => updateFilter("chef", event.target.value)}>
              <option value="all">Выберите повара</option>
              <option value="hot">Горячий цех</option>
              <option value="cold">Холодный цех</option>
            </select>
            <Icon name="bi-chevron-down" size={16} />
          </label>
          <label className="report-filter-select">
            <select value={filters.product} onChange={(event) => updateFilter("product", event.target.value)}>
              <option value="all">Продукт</option>
              <option value="soup">Супы</option>
              <option value="main">Основные блюда</option>
            </select>
            <Icon name="bi-chevron-down" size={16} />
          </label>
          <label className="report-filter-select">
            <select value={filters.orderType} onChange={(event) => updateFilter("orderType", event.target.value)}>
              <option value="all">Выберите тип заказа</option>
              <option value="hall">На стол</option>
              <option value="delivery">Доставка</option>
            </select>
            <Icon name="bi-chevron-down" size={16} />
          </label>
          <label className="report-filter-select">
            <select value={filters.orderStatus} onChange={(event) => updateFilter("orderStatus", event.target.value)}>
              <option value="all">Выберите статус заказа</option>
              <option value="done">Завершено</option>
              <option value="paid">Оплачено</option>
            </select>
            <Icon name="bi-chevron-down" size={16} />
          </label>
          <label className="report-filter-select">
            <select value={filters.category} onChange={(event) => updateFilter("category", event.target.value)}>
              <option value="all">Категория</option>
              <option value="first">Первые блюда</option>
              <option value="fast">Фастфуд</option>
            </select>
            <Icon name="bi-chevron-down" size={16} />
          </label>
          <label className="report-filter-select">
            <select value={filters.paymentType} onChange={(event) => updateFilter("paymentType", event.target.value)}>
              <option value="all">Тип оплаты</option>
              <option value="cash">Наличные</option>
              <option value="card">Карта</option>
            </select>
            <Icon name="bi-chevron-down" size={16} />
          </label>
          <div className="report-filter-buttons">
            <button type="button" className="report-filter-apply" onClick={applyFilters}>
              <Icon name="bi-sliders" size={17} />
              Фильтровать
            </button>
            <button type="button" className="report-filter-clear" onClick={clearFilters}>
              <Icon name="bi-x-circle" size={17} />
              Очистить
            </button>
          </div>
        </div>

        <div className="report-active-filters" aria-label="Активные фильтры">
          {Object.entries(appliedFilters).some(([, value]) => value && value !== "all") ? (
            Object.entries(appliedFilters).map(([key, value]) => (
              value && value !== "all" ? <span key={key}>{filterNames[key]}: {optionLabel(value)}</span> : null
            ))
          ) : (
            <span>Показаны все блюда за выбранный период</span>
          )}
        </div>

        <div className="report-table-wrapper">
          <table className="report-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Ед изм</th>
                <th>Кол-во</th>
                <th>Цена</th>
                <th>Сумма</th>
                <th>Себестоимость</th>
                <th>Прибыль</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr className="report-total-row">
                <td>{totalRow.name}</td>
                <td>{totalRow.unit}</td>
                <td>{totalRow.quantity}</td>
                <td>{totalRow.price}</td>
                <td>{totalRow.amount}</td>
                <td>{totalRow.cost}</td>
                <td className="report-profit-positive">{totalRow.profit}</td>
                <td>{totalRow.status}</td>
              </tr>
              {filteredRows.map((row) => {
                const expanded = expandedRow === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td>
                        <div className="report-dish-name">
                          {row.details ? (
                            <button type="button" onClick={() => setExpandedRow(expanded ? "" : row.id)} aria-label={expanded ? "Скрыть детали" : "Показать детали"}>
                              <Icon name={expanded ? "bi-dash" : "bi-plus"} size={15} />
                            </button>
                          ) : <span className="report-dish-name__spacer" />}
                          <a href="#dish" onClick={(event) => event.preventDefault()}>{row.name}</a>
                        </div>
                      </td>
                      <td>{row.unit}</td>
                      <td>{row.quantity}</td>
                      <td>{row.price}</td>
                      <td>{row.amount}</td>
                      <td>{row.cost}</td>
                      <td className={row.profitValue < 0 ? "report-profit-negative" : "report-profit-positive"}>{row.profit}</td>
                      <td><span className="report-status-badge">{row.status}</span></td>
                    </tr>
                    {expanded && row.details ? (
                      <tr className="report-detail-row">
                        <td colSpan="8">
                          <div className="report-detail-grid">
                            <div><span>Заказы</span><strong>{row.details.orders}</strong></div>
                            <div><span>Повар</span><strong>{row.details.chef}</strong></div>
                            <div><span>Категория</span><strong>{row.details.category}</strong></div>
                            <div><span>Тип оплаты</span><strong>{row.details.paymentType}</strong></div>
                            <div><span>Комментарий</span><strong>{row.details.comment}</strong></div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!filteredRows.length ? (
                <tr className="report-empty-row">
                  <td colSpan="8">По выбранным фильтрам блюд не найдено</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
