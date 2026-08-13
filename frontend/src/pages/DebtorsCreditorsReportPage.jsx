import { useEffect, useMemo, useState } from "react";
import { reportsService } from "../api/reports";
import Icon from "../components/Icon";
import ReportDateRangePicker from "../components/ReportDateRangePicker";
import { exportToExcel } from "../utils/excel";

function toApiDate(value) {
  if (!value) return undefined;
  const [day, month, year] = value.split(".");
  return `${year}-${month}-${day}`;
}

function currentMonthRange() {
  const now = new Date();
  return {
    preset: "",
    start: `01.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`,
    end: `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`,
  };
}

function displayAmount(value) {
  return `${new Intl.NumberFormat("ru-RU").format(Number(value))} UZS`;
}

export default function DebtorsCreditorsReportPage() {
  const [dateRange, setDateRange] = useState(currentMonthRange);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    reportsService.listDebtCredit(toApiDate(dateRange.start), toApiDate(dateRange.end))
      .then(({ data }) => {
        if (!Array.isArray(data)) throw new Error("Invalid debt-credit report response");
        const items = data;
        setRows(items.map((item) => ({
          id: String(item.counterparty_id),
          name: item.counterparty_name,
          openingBalance: Number(item.opening_balance),
          debit: Number(item.debit),
          credit: Number(item.credit),
          closingBalance: Number(item.closing_balance),
        })));
      })
      .catch((err) => {
        setRows([]);
        setError(err.response?.data?.detail || "Не удалось загрузить отчёт по дебету и кредиту.");
      })
      .finally(() => setLoading(false));
  }, [dateRange.start, dateRange.end]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? rows.filter((row) => row.name.toLowerCase().includes(query)) : rows;
  }, [rows, search]);
  const totals = useMemo(() => visibleRows.reduce((acc, row) => ({
    openingBalance: acc.openingBalance + row.openingBalance,
    debit: acc.debit + row.debit,
    credit: acc.credit + row.credit,
    closingBalance: acc.closingBalance + row.closingBalance,
  }), { openingBalance: 0, debit: 0, credit: 0, closingBalance: 0 }), [visibleRows]);

  function downloadExcel() {
    exportToExcel(visibleRows, [
      { key: "id", label: "ID контрагента" },
      { key: "name", label: "Контрагент" },
      { key: "openingBalance", label: "Начальный остаток" },
      { key: "debit", label: "Дебет" },
      { key: "credit", label: "Кредит" },
      { key: "closingBalance", label: "Конечный остаток" },
    ], "debt-credit-report");
  }

  if (loading) return <section className="debt-credit-page"><div className="dashboard-empty" role="status">Загрузка отчёта...</div></section>;
  if (error) return <section className="debt-credit-page"><div className="login-error" role="alert">{error}</div></section>;

  return (
    <section className="debt-credit-page">
      <article className="debt-credit-card">
        <div className="dc-page-head">
          <div><span className="report-accent-bar" aria-hidden="true" /><div><span>Marjon reports</span><h2>Дебиторы и кредиторы</h2></div></div>
          <div className="report-actions"><ReportDateRangePicker value={dateRange} onChange={setDateRange} showDropdownIcon /><button className="report-excel-button" type="button" onClick={downloadExcel}><Icon name="bi-file-earmark-excel" size={18} /> Скачать Excel</button></div>
        </div>

        <div className="dc-summary-grid">
          <article className="dc-summary-card dc-summary-card--debt"><div className="dc-summary-card__top"><span>Дебет</span><Icon name="bi-arrow-down-left-circle" size={22} /></div><strong>{displayAmount(totals.debit)}</strong></article>
          <article className="dc-summary-card dc-summary-card--credit"><div className="dc-summary-card__top"><span>Кредит</span><Icon name="bi-arrow-up-right-circle" size={22} /></div><strong>{displayAmount(totals.credit)}</strong></article>
          <article className="dc-summary-card dc-summary-card--balance"><div className="dc-summary-card__top"><span>Конечный остаток</span><Icon name="bi-bank" size={22} /></div><strong>{displayAmount(totals.closingBalance)}</strong></article>
        </div>

        <div className="dc-toolbar"><label className="dc-search"><Icon name="bi-search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по контрагенту" /></label></div>

        <div className="dc-table-wrap">
          <table className="dc-table">
            <thead><tr><th>Контрагент</th><th>Начальный остаток</th><th>Дебет</th><th>Кредит</th><th>Конечный остаток</th></tr></thead>
            <tbody>
              <tr className="dc-total-row"><td>Итого</td><td>{displayAmount(totals.openingBalance)}</td><td>{displayAmount(totals.debit)}</td><td>{displayAmount(totals.credit)}</td><td>{displayAmount(totals.closingBalance)}</td></tr>
              {visibleRows.map((row) => <tr className="dc-party-row" key={row.id} data-counterparty-id={row.id}><td><strong>{row.name}</strong></td><td>{displayAmount(row.openingBalance)}</td><td>{displayAmount(row.debit)}</td><td>{displayAmount(row.credit)}</td><td>{displayAmount(row.closingBalance)}</td></tr>)}
              {!visibleRows.length ? <tr className="dc-empty-row"><td colSpan={5}>По запросу ничего не найдено</td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
