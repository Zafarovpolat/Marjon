import { useEffect, useState } from "react";
import { reportsService } from "../api/reports";
import Icon from "../components/Icon";
import { todayInputValue } from "../utils/date";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value) {
  return `${new Intl.NumberFormat("ru-RU").format(Number(value))} UZS`;
}

function formatNullable(value) {
  return value == null || value === "" ? "Недоступно" : String(value);
}

const financialRows = [
  ["Валовые продажи", "gross_sales"],
  ["Скидки", "discounts_total"],
  ["Сервисный сбор", "service_fee_total"],
  ["Налог", "tax_total"],
  ["Возвраты", "refunds_total"],
  ["Чистые продажи", "net_sales"],
  ["Наличные", "cash_total"],
  ["Получено наличными", "cash_received_total"],
  ["Выдано сдачи", "change_given_total"],
  ["Безналичные оплаты", "non_cash_total"],
  ["Средний чек", "avg_check"],
];

const countRows = [
  ["Заказы", "orders_count"],
  ["Отменённые заказы", "cancelled_orders_count"],
  ["Оплаты", "payments_count"],
  ["Фискальные чеки", "fiscal_receipts_count"],
];

export function buildPrintDocument(report) {
  const paymentRows = report.payment_methods.map((item) => `
    <tr><td>${escapeHtml(item.method)}</td><td>${escapeHtml(item.count)}</td><td>${escapeHtml(formatMoney(item.amount))}</td></tr>
  `).join("");
  const metrics = financialRows.map(([label, key]) => `
    <tr><td>${escapeHtml(label)}</td><td>${escapeHtml(formatMoney(report[key]))}</td></tr>
  `).join("");
  const counts = countRows.map(([label, key]) => `
    <tr><td>${escapeHtml(label)}</td><td>${escapeHtml(report[key])}</td></tr>
  `).join("");

  return `<!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><title>MARJON — Z-отчёт ${escapeHtml(report.date)}</title>
<style>body{font-family:Arial,sans-serif;color:#111827;margin:24px}h1{text-align:center}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #d1d5db;padding:8px;text-align:left}th{background:#f3f4f6}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}</style>
</head><body><h1>Z-отчёт</h1><div class="meta"><span>Дата: ${escapeHtml(report.date)}</span><span>Смена закрыта: ${report.is_closed ? "Да" : "Нет"}</span><span>Открыта: ${escapeHtml(formatNullable(report.shift_opened_at))}</span><span>Закрыта: ${escapeHtml(formatNullable(report.shift_closed_at))}</span></div>
<h2>Показатели</h2><table><tbody>${metrics}${counts}</tbody></table>
<h2>Способы оплаты</h2><table><thead><tr><th>Способ</th><th>Количество</th><th>Сумма</th></tr></thead><tbody>${paymentRows || '<tr><td colspan="3">Нет оплат за выбранную дату</td></tr>'}</tbody></table>
</body></html>`;
}

export default function ZReportPage() {
  const [selectedDate, setSelectedDate] = useState(todayInputValue());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setReport(null);
    reportsService.getZReport(selectedDate)
      .then(({ data }) => {
        if (!data || typeof data !== "object" || !Array.isArray(data.payment_methods)) {
          throw new Error("Invalid Z-report response");
        }
        if (active) setReport(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.response?.status === 403
          ? "Доступ к Z-отчёту запрещён."
          : err.response?.data?.detail || "Не удалось загрузить Z-отчёт.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [selectedDate]);

  function handlePrint() {
    if (!report || loading || error) return;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
    const printWindow = iframe.contentWindow;
    const printDocument = printWindow?.document;
    if (!printWindow || !printDocument) {
      iframe.remove();
      return;
    }
    printDocument.open();
    printDocument.write(buildPrintDocument(report));
    printDocument.close();
    printWindow.onafterprint = () => iframe.remove();
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      window.setTimeout(() => iframe.remove(), 60000);
    }, 120);
  }

  return (
    <section className="z-report-page z-report-page--print-only">
      <div className="z-report-period-toolbar report-actions" aria-label="Параметры Z-отчёта">
        <h1 className="z-report-page-title">Z-отчёт</h1>
        <input
          className="z-report-period-button"
          type="date"
          aria-label="Дата Z-отчёта"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
        />
        <button className="z-report-print-row__action" type="button" onClick={handlePrint} disabled={!report || loading || Boolean(error)}>
          <Icon name="bi-printer" size={18} /> Печать Z-отчёта
        </button>
      </div>

      {loading ? <div className="dashboard-empty" role="status">Загрузка Z-отчёта...</div> : null}
      {!loading && error ? <div className="login-error" role="alert">{error}</div> : null}
      {!loading && !error && report ? (
        <article className="z-report-card z-report-print-panel">
          <div className="report-summary-grid">
            <article className="report-summary-card"><div><span>Дата</span><strong>{report.date}</strong></div></article>
            <article className="report-summary-card"><div><span>Смена закрыта</span><strong>{report.is_closed ? "Да" : "Нет"}</strong></div></article>
            <article className="report-summary-card"><div><span>Открытие смены</span><strong>{formatNullable(report.shift_opened_at)}</strong></div></article>
            <article className="report-summary-card"><div><span>Закрытие смены</span><strong>{formatNullable(report.shift_closed_at)}</strong></div></article>
          </div>

          <div className="z-report-print-table-wrap">
            <table className="z-report-print-table">
              <thead><tr><th>Показатель</th><th>Значение</th></tr></thead>
              <tbody>
                {financialRows.map(([label, key]) => <tr key={key}><td>{label}</td><td>{formatMoney(report[key])}</td></tr>)}
                {countRows.map(([label, key]) => <tr key={key}><td>{label}</td><td>{report[key]}</td></tr>)}
              </tbody>
            </table>
          </div>

          <div className="z-report-print-table-wrap">
            <table className="z-report-print-table">
              <thead><tr><th>Способ оплаты</th><th>Количество</th><th>Сумма</th></tr></thead>
              <tbody>
                {report.payment_methods.map((item) => (
                  <tr key={item.method}><td>{item.method}</td><td>{item.count}</td><td>{formatMoney(item.amount)}</td></tr>
                ))}
                {!report.payment_methods?.length ? <tr><td colSpan={3}>Нет оплат за выбранную дату.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}
