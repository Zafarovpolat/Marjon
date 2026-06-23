import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import FinanceTransactionDrawer from "./FinanceTransactionDrawer";

const initialTransactions = [
  { id: 1, date: "22 Jun 2026 / 20:57", amount: 40600, type: "income", paymentType: "CLICK", counterparty: "-", category: "Приход от продаж", comment: "Заказ № 39957057" },
  { id: 2, date: "22 Jun 2026 / 20:57", amount: 10000, type: "income", paymentType: "NAXT", counterparty: "-", category: "Приход от продаж", comment: "Заказ № 39957057" },
  { id: 3, date: "22 Jun 2026 / 20:56", amount: 177100, type: "income", paymentType: "Terminal", counterparty: "-", category: "Приход от продаж", comment: "Заказ № 39661785" },
  { id: 4, date: "22 Jun 2026 / 20:56", amount: 93500, type: "income", paymentType: "Terminal", counterparty: "-", category: "Приход от продаж", comment: "Заказ № 39663407" },
  { id: 5, date: "10 Jun 2026 / 17:59", amount: 110000, type: "expense", paymentType: "Vip", counterparty: "-", category: "Продажа в VIP", comment: "Заказ № 39382298 | uut" },
  { id: 6, date: "10 Jun 2026 / 17:59", amount: 110000, type: "income", paymentType: "Vip", counterparty: "-", category: "Приход от продаж", comment: "Заказ № 39382298 | uut" },
  { id: 7, date: "10 Jun 2026 / 17:59", amount: 100000000000, type: "expense", paymentType: "Vip", counterparty: "-", category: "Продажа в VIP", comment: "Заказ № 39374559 | uut" },
  { id: 8, date: "10 Jun 2026 / 17:59", amount: 100000000000, type: "income", paymentType: "Vip", counterparty: "-", category: "Приход от продаж", comment: "Заказ № 39374559 | uut" },
  { id: 9, date: "10 Jun 2026 / 17:59", amount: 250000000000, type: "income", paymentType: "Terminal", counterparty: "-", category: "Приход от продаж", comment: "Заказ № 39374559 | uut" },
  { id: 10, date: "10 Jun 2026 / 17:59", amount: 100000000000, type: "income", paymentType: "CLICK", counterparty: "-", category: "Приход от продаж", comment: "Заказ № 39374559 | uut" },
];

const emptyForm = {
  type: "income",
  date: "23 Jun 2026 / 12:00",
  amount: "0",
  currency: "UZS",
  paymentType: "NAXT",
  counterparty: "-",
  category: "Приход от продаж",
  comment: "",
};

function parseAmount(value) {
  return Number(String(value || "").replace(/[^\d.-]/g, "")) || 0;
}

function formatMoney(value) {
  return `${new Intl.NumberFormat("ru-RU").format(Number(value) || 0)} UZS`;
}

function FinanceTransactionsPage() {
  const [rows, setRows] = useState(initialTransactions);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ type: "all", paymentType: "", category: "", counterparty: "", min: "", max: "", dateFrom: "", dateTo: "" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const totals = useMemo(() => rows.reduce((acc, row) => {
    acc[row.type] += Number(row.amount || 0);
    return acc;
  }, { income: 0, expense: 0 }), [rows]);

  const visibleRows = useMemo(() => rows.filter((row) => {
    if (filters.type !== "all" && row.type !== filters.type) return false;
    if (filters.paymentType && row.paymentType !== filters.paymentType) return false;
    if (filters.category && !row.category.toLowerCase().includes(filters.category.toLowerCase())) return false;
    if (filters.counterparty && !row.counterparty.toLowerCase().includes(filters.counterparty.toLowerCase())) return false;
    if (filters.min && row.amount < parseAmount(filters.min)) return false;
    if (filters.max && row.amount > parseAmount(filters.max)) return false;
    return true;
  }), [filters, rows]);

  const openCreate = (type) => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      type,
      category: type === "income" ? "Приход от продаж" : "Продажа в VIP",
    });
    setDrawerOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({ ...emptyForm, ...row, amount: String(row.amount), currency: "UZS" });
    setDrawerOpen(true);
  };

  const save = () => {
    const next = {
      id: editingId || Date.now(),
      date: form.date,
      amount: parseAmount(form.amount),
      type: form.type,
      paymentType: form.paymentType,
      counterparty: form.counterparty || "-",
      category: form.category,
      comment: form.comment,
    };

    setRows((current) => editingId ? current.map((row) => row.id === editingId ? next : row) : [next, ...current]);
    setDrawerOpen(false);
  };

  return (
    <div className="finance-page">
      <section className="finance-card">
        <header className="finance-header finance-header--transactions">
          <button type="button" className="finance-date-button">
            <Icon name="bi-calendar3" size={17} />
            Выберите дату
          </button>
          <div className="finance-summary-row">
            <article className="finance-summary-pill finance-income-pill">
              <span>Приход</span>
              <strong>{formatMoney(totals.income)}</strong>
            </article>
            <article className="finance-summary-pill finance-expense-pill">
              <span>Расход</span>
              <strong>{formatMoney(totals.expense)}</strong>
            </article>
          </div>
          <div className="finance-actions">
            <button type="button" className="finance-income-action" onClick={() => openCreate("income")}><span>+</span> ПРИХОД</button>
            <button type="button" className="finance-expense-action" onClick={() => openCreate("expense")}><span>-</span> РАСХОД</button>
            <button type="button" className="finance-excel-action" onClick={() => console.log("finance excel")}>Скачать Excel</button>
            <button type="button" onClick={() => setFilterOpen((value) => !value)}>Фильтровать</button>
          </div>
        </header>

        {filterOpen ? (
          <div className="finance-filters">
            <input placeholder="Дата от" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            <input placeholder="Дата до" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            <select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}>
              <option value="all">Все операции</option>
              <option value="income">Приход</option>
              <option value="expense">Расход</option>
            </select>
            <input placeholder="Тип оплаты" value={filters.paymentType} onChange={(event) => setFilters((current) => ({ ...current, paymentType: event.target.value }))} />
            <input placeholder="Категория" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} />
            <input placeholder="Контрагент" value={filters.counterparty} onChange={(event) => setFilters((current) => ({ ...current, counterparty: event.target.value }))} />
            <input placeholder="Мин. сумма" value={filters.min} onChange={(event) => setFilters((current) => ({ ...current, min: event.target.value }))} />
            <input placeholder="Макс. сумма" value={filters.max} onChange={(event) => setFilters((current) => ({ ...current, max: event.target.value }))} />
          </div>
        ) : null}

        <div className="finance-table-wrapper">
          <table className="finance-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Сумма</th>
                <th>Тип оплаты</th>
                <th>Контрагент</th>
                <th>Категория</th>
                <th>Комментария</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const [day, time] = row.date.split(" / ");
                return (
                  <tr key={row.id}>
                    <td><strong>{day}</strong><small>{time}</small></td>
                    <td className={row.type === "income" ? "finance-amount-income" : "finance-amount-expense"}>{row.type === "income" ? "+" : "-"} {formatMoney(row.amount)}</td>
                    <td>{row.paymentType}</td>
                    <td>{row.counterparty}</td>
                    <td>{row.category}</td>
                    <td>{row.comment}</td>
                    <td><button type="button" className="finance-action-edit" onClick={() => openEdit(row)}><Icon name="bi-pencil" size={15} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {drawerOpen ? <FinanceTransactionDrawer form={form} setForm={setForm} onClose={() => setDrawerOpen(false)} onSave={save} /> : null}
    </div>
  );
}

export default FinanceTransactionsPage;
