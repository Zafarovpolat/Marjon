import { useEffect, useRef, useState } from "react";
import { api, formatMoney } from "../api/client";
import DemoNotice from "../components/DemoNotice";
import Icon from "../components/Icon";

const DEMO_Z_REPORT = {
  date: new Date().toISOString().slice(0, 10),
  shift_opened_at: "09:00",
  shift_closed_at: null,
  is_closed: false,
  orders_count: 47,
  cancelled_orders_count: 3,
  payments_count: 44,
  fiscal_receipts_count: 42,
  gross_sales: 12450000,
  discounts_total: 350000,
  service_fee_total: 0,
  tax_total: 1452000,
  refunds_total: 0,
  net_sales: 12100000,
  cash_total: 5200000,
  cash_received_total: 5500000,
  change_given_total: 300000,
  non_cash_total: 6900000,
  avg_check: 275000,
  payment_methods: [
    { method: "cash", count: 20, amount: 5200000 },
    { method: "card", count: 14, amount: 3900000 },
    { method: "payme", count: 6, amount: 1800000 },
    { method: "click", count: 4, amount: 1200000 },
  ],
};

const printReports = [
  { key: "cashiers", title: "Отчет по кассирам", icon: "bi-person-badge", fields: [{ type: "select", label: "Кассир", options: ["Все кассиры", "Administrator", "Кассир 1"] }] },
  { key: "waiters", title: "Отчет по официантам", icon: "bi-person-lines-fill", fields: [{ type: "select", label: "Официант", options: ["Все официанты", "Азизбек", "Алишер"] }, { type: "input", label: "Процент", suffix: "%" }] },
  { key: "cooks", title: "Отчет по поварам", icon: "bi-egg-fried", fields: [{ type: "select", label: "Повар", options: ["Все повара", "Повар 1", "Повар 2"] }] },
  { key: "places", title: "Отчет по местам", icon: "bi-grid-3x3-gap", fields: [{ type: "select", label: "Место", options: ["Все места", "Основной зал", "Летняя зона"] }] },
  { key: "menu", title: "Отчет по меню", icon: "bi-journal-text", fields: [{ type: "select", label: "Категория", options: ["Все категории", "Горячее", "Напитки", "Салаты"] }] },
];

function ReportSelect({ field }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const ref = useRef(null);
  const value = selected || field.label;

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
    function handleKeyDown(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("mousedown", handlePointerDown); document.removeEventListener("keydown", handleKeyDown); };
  }, [open]);

  return (
    <div className={`z-report-select ${open ? "is-open" : ""}`} ref={ref}>
      <button className="z-report-select__trigger z-report-filter z-report-print-table__field" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((c) => !c)}>
        <span>{value}</span>
        <Icon name="bi-chevron-down" size={18} />
      </button>
      {open ? (
        <div className="z-report-select__menu" role="listbox">
          {field.options.map((opt) => {
            const active = opt === selected || (!selected && opt === field.options[0]);
            return <button className={active ? "is-active" : ""} type="button" role="option" aria-selected={active} key={opt} onClick={() => { setSelected(opt); setOpen(false); }}>{opt}</button>;
          })}
        </div>
      ) : null}
    </div>
  );
}

function ReportField({ field }) {
  if (!field) return <span className="z-report-print-table__empty">—</span>;
  if (field.type === "select") return <ReportSelect field={field} />;
  return (
    <label className="z-report-filter z-report-print-table__field z-report-print-table__field--input">
      <input placeholder={field.label} inputMode="decimal" />
      {field.suffix ? <span>{field.suffix}</span> : null}
    </label>
  );
}

function fmt(v) {
  return formatMoney ? formatMoney(v) : Number(v || 0).toLocaleString("ru-RU") + " UZS";
}

export default function ZReportPage() {
  const [report, setReport] = useState(DEMO_Z_REPORT);
  const [isDemo, setIsDemo] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [shiftLoading, setShiftLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/analytics/z-report", { params: { date: selectedDate } })
      .then(({ data }) => {
        if (data && data.orders_count !== undefined) {
          setReport(data);
          setIsDemo(false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedDate]);

  async function handleOpenShift() {
    setShiftLoading(true);
    try {
      const { data: branches } = await api.get("/companies/me/branches");
      const branchId = branches?.[0]?.id;
      if (!branchId) return;
      await api.post("/pos/shifts/open", { branch_id: branchId, opening_cash: 0 });
      const { data } = await api.get("/analytics/z-report", { params: { date: selectedDate } });
      if (data) { setReport(data); setIsDemo(false); }
    } catch (e) {
      window.alert(e.response?.data?.detail || "Ошибка открытия смены");
    } finally {
      setShiftLoading(false);
    }
  }

  async function handleCloseShift() {
    setShiftLoading(true);
    try {
      await api.post("/pos/shifts/close", { closing_cash: 0 });
      const { data } = await api.get("/analytics/z-report", { params: { date: selectedDate } });
      if (data) { setReport(data); setIsDemo(false); }
    } catch (e) {
      window.alert(e.response?.data?.detail || "Ошибка закрытия смены");
    } finally {
      setShiftLoading(false);
    }
  }

  const r = report;

  return (
    <section className="z-report-page z-report-page--print-only">
      {isDemo && <DemoNotice />}

      {/* Z-отчёт: сводка */}
      <article className="z-report-card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Z-Отчёт</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--neutral-200, #e2e8f0)", fontSize: 14 }} />
            {!r.is_closed ? (
              <>
                {!r.shift_opened_at ? (
                  <button className="z-report-print-row__action" type="button" disabled={shiftLoading} onClick={handleOpenShift}>
                    <Icon name="bi-play-circle" size={16} /> Открыть смену
                  </button>
                ) : (
                  <button className="z-report-print-row__action" type="button" disabled={shiftLoading} onClick={handleCloseShift} style={{ background: "var(--red-500, #ef4444)", color: "#fff" }}>
                    <Icon name="bi-stop-circle" size={16} /> Закрыть смену
                  </button>
                )}
              </>
            ) : (
              <span style={{ color: "var(--green-600, #16a34a)", fontWeight: 600 }}>Смена закрыта</span>
            )}
            <button className="z-report-print-row__action" type="button" onClick={() => window.print()}>
              <Icon name="bi-printer" size={16} /> Печать
            </button>
          </div>
        </div>

        {loading ? <div style={{ textAlign: "center", padding: 20, opacity: 0.5 }}>Загрузка...</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">Смена</div>
              <div className="z-report-summary-value">{r.shift_opened_at || "—"} — {r.shift_closed_at || "..."}</div>
            </div>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">Заказов</div>
              <div className="z-report-summary-value">{r.orders_count}</div>
            </div>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">Отмены</div>
              <div className="z-report-summary-value">{r.cancelled_orders_count}</div>
            </div>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">Выручка (брутто)</div>
              <div className="z-report-summary-value">{fmt(r.gross_sales)}</div>
            </div>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">Скидки</div>
              <div className="z-report-summary-value">−{fmt(r.discounts_total)}</div>
            </div>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">Выручка (нетто)</div>
              <div className="z-report-summary-value" style={{ color: "var(--green-600, #16a34a)", fontWeight: 700 }}>{fmt(r.net_sales)}</div>
            </div>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">НДС</div>
              <div className="z-report-summary-value">{fmt(r.tax_total)}</div>
            </div>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">Средний чек</div>
              <div className="z-report-summary-value">{fmt(r.avg_check)}</div>
            </div>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">Наличные</div>
              <div className="z-report-summary-value">{fmt(r.cash_total)}</div>
            </div>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">Безнал</div>
              <div className="z-report-summary-value">{fmt(r.non_cash_total)}</div>
            </div>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">Фискальных чеков</div>
              <div className="z-report-summary-value">{r.fiscal_receipts_count}</div>
            </div>
            <div className="z-report-summary-card">
              <div className="z-report-summary-label">Возвраты</div>
              <div className="z-report-summary-value">{fmt(r.refunds_total)}</div>
            </div>
          </div>
        )}

        {r.payment_methods?.length ? (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 8px" }}>Разбивка по способам оплаты</h3>
            <table className="z-report-print-table" style={{ width: "100%" }}>
              <thead>
                <tr><th>Способ</th><th>Кол-во</th><th>Сумма</th></tr>
              </thead>
              <tbody>
                {r.payment_methods.map((pm) => (
                  <tr key={pm.method}>
                    <td style={{ textTransform: "capitalize" }}>{pm.method}</td>
                    <td>{pm.count}</td>
                    <td>{fmt(pm.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </article>

      {/* Печатные отчёты */}
      <article className="z-report-card z-report-print-panel">
        <div className="z-report-print-table-wrap">
          <table className="z-report-print-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Отчет</th>
                <th>Параметр 1</th>
                <th>Параметр 2 (опционально)</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {printReports.map((item, i) => (
                <tr key={item.key}>
                  <td className="z-report-print-table__number">{i + 1}</td>
                  <td>
                    <div className="z-report-print-table__report">
                      <span className="z-report-print-table__icon"><Icon name={item.icon} size={18} /></span>
                      <strong>{item.title}</strong>
                    </div>
                  </td>
                  <td><ReportField field={item.fields[0]} /></td>
                  <td><ReportField field={item.fields[1]} /></td>
                  <td>
                    <button className="z-report-print-row__action" type="button" onClick={() => window.print()}>
                      <Icon name="bi-printer" size={18} /> Печатать отчет
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
