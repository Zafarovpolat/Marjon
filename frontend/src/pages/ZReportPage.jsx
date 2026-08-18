import { useEffect, useMemo, useRef, useState } from "react";
import { reportsService } from "../api/reports";
import { staffService } from "../api/staff";
import { settingsService } from "../api/settings";
import { getCategories } from "../api/categories";
import { isAbortError, useLatestRequest } from "../hooks/useAsyncSafety";
import Icon from "../components/Icon";
import { todayInputValue } from "../utils/date";
import { formatMoney } from "./reports/reportMoney";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNullable(value) {
  return value == null || value === "" ? "Недоступно" : String(value);
}

function apiList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function hasRole(user, slug) {
  const slugs = Array.isArray(user?.role_slugs)
    ? user.role_slugs
    : user?.role_slug
      ? [user.role_slug]
      : [];
  return slugs.includes(slug);
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

// Five per-entity report generators. Their backend contracts (report by
// cashier/cook, per-entity waiter/place/menu filtering, waiter %) do NOT exist
// yet on the authoritative backend, so every per-entity Print is a truthful
// DEFERRED state ("Скоро" / "Отчёт ещё не подключён") — NOT an error, NOT fake
// output. Selector options come from real (currently empty) backend lists.
const REPORT_ROWS = [
  { key: "cashier", title: "Отчёт по кассирам", empty: "Нет кассиров", role: "cashier", multi: true },
  { key: "waiter", title: "Отчёт по официантам", empty: "Нет официантов", role: "waiter", multi: true, percent: true },
  { key: "cook", title: "Отчёт по поварам", empty: "Нет поваров", role: "cook", multi: true },
  { key: "place", title: "Отчёт по местам", empty: "Нет мест", source: "places" },
  { key: "menu", title: "Отчёт по меню", empty: "Нет категорий", source: "categories" },
];

function optionLabel(item) {
  return item.name || item.title || item.full_name || item.label || "—";
}
function optionValue(item) {
  return String(item.id ?? item.slug ?? item.name ?? "");
}

// Checkbox multi-select dropdown (cashier/waiter/cook). Marjon visual language,
// not a native multi listbox. Multiple employees can be selected/deselected;
// picking a second does not replace the first. Empty list → disabled.
function EmployeeMultiSelect({ label, emptyLabel, options, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const disabled = options.length === 0;

  useEffect(() => {
    if (!open) return undefined;
    function onDocDown(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  let summary;
  if (disabled) summary = emptyLabel;
  else if (selected.length === 0) summary = "Не выбрано";
  else if (selected.length === 1) {
    const one = options.find((item) => optionValue(item) === selected[0]);
    summary = one ? optionLabel(one) : "Выбрано: 1";
  } else summary = `Выбрано: ${selected.length}`;

  return (
    <div className={`owner-msel${open ? " is-open" : ""}`} ref={ref}>
      <button
        type="button"
        className="owner-msel__button owner-report-row__select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={selected.length ? "" : "owner-msel__placeholder"}>{summary}</span>
        {!disabled ? <Icon name="bi-chevron-down" size={14} /> : null}
      </button>
      {open && !disabled ? (
        <ul className="owner-msel__menu" role="listbox" aria-multiselectable="true">
          {options.map((item) => {
            const value = optionValue(item);
            const checked = selected.includes(value);
            return (
              <li key={value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className={`owner-msel__option${checked ? " is-checked" : ""}`}
                  onClick={() => onToggle(value)}
                >
                  <span className="owner-msel__check" aria-hidden="true">
                    {checked ? (
                      <svg className="owner-msel__tick" viewBox="0 0 16 16" width="12" height="12">
                        <path d="M13 4.5 6.5 11 3 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                  {optionLabel(item)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export default function ZReportPage() {
  const [selectedDate, setSelectedDate] = useState(todayInputValue());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const beginRequest = useLatestRequest();
  const [staff, setStaff] = useState([]);
  const [places, setPlaces] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selection, setSelection] = useState({ cashier: [], waiter: [], cook: [], place: "", menu: "" });

  function toggleMulti(key, value) {
    setSelection((prev) => {
      const current = prev[key];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }

  // Whole-shift Z-report (the one real, backend-supported report) — for print.
  useEffect(() => {
    const request = beginRequest();
    setLoading(true);
    setError("");
    setReport(null);
    reportsService.getZReport(selectedDate, { signal: request.signal })
      .then(({ data }) => {
        if (!data || typeof data !== "object" || !Array.isArray(data.payment_methods)) {
          throw new Error("Invalid Z-report response");
        }
        if (request.isCurrent()) setReport(data);
      })
      .catch((err) => {
        if (!request.isCurrent() || isAbortError(err)) return;
        setError(err.response?.status === 403
          ? "Доступ к Z-отчёту запрещён."
          : err.response?.data?.detail || "Не удалось загрузить Z-отчёт.");
      })
      .finally(() => {
        if (request.isCurrent()) setLoading(false);
      });
  }, [beginRequest, selectedDate]);

  // Real selector lists (empty on a new company). Failures leave the selector
  // truthfully empty rather than fabricating names.
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    Promise.allSettled([
      staffService.listStaffUsers({ signal: controller.signal }),
      settingsService.listDashboardPlaces({ signal: controller.signal }),
      getCategories({ signal: controller.signal }),
    ]).then(([staffRes, placesRes, categoriesRes]) => {
      if (!alive) return;
      if (staffRes.status === "fulfilled") setStaff(apiList(staffRes.value.data));
      if (placesRes.status === "fulfilled") setPlaces(apiList(placesRes.value.data));
      if (categoriesRes.status === "fulfilled") setCategories(apiList(categoriesRes.value.data));
    });
    return () => { alive = false; controller.abort(); };
  }, []);

  const optionsByKey = useMemo(() => ({
    cashier: staff.filter((user) => hasRole(user, "cashier")),
    waiter: staff.filter((user) => hasRole(user, "waiter")),
    cook: staff.filter((user) => hasRole(user, "cook")),
    place: places,
    menu: categories,
  }), [staff, places, categories]);

  function handleShiftPrint() {
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

  const shiftPrintDisabled = !report || loading || Boolean(error);

  return (
    <section className="owner-reports-page">
      <header className="owner-reports__head">
        <h1 className="owner-reports__title">Z-отчёт</h1>
        <div className="owner-reports__head-actions">
          <input
            className="owner-reports__date"
            type="date"
            aria-label="Дата Z-отчёта"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
          <button
            className="owner-reports__shift-print"
            type="button"
            onClick={handleShiftPrint}
            disabled={shiftPrintDisabled}
          >
            <Icon name="bi-printer" size={16} /> Печать общего Z-отчёта
          </button>
        </div>
      </header>

      {error ? (
        <div className="owner-reports__note owner-reports__note--error" role="alert">Общий Z-отчёт недоступен: {error}</div>
      ) : null}

      <section className="owner-reports__panel">
        <h2 className="owner-reports__panel-title">Детализированные отчёты</h2>
        <div className="owner-reports__rows">
        {REPORT_ROWS.map((row) => {
          const options = optionsByKey[row.key] || [];
          const hasOptions = options.length > 0;
          return (
            <div className="owner-report-row" key={row.key}>
              <div className="owner-report-row__title">{row.title}</div>
              <div className="owner-report-row__controls">
                {row.multi ? (
                  <EmployeeMultiSelect
                    label={row.title}
                    emptyLabel={row.empty}
                    options={options}
                    selected={selection[row.key]}
                    onToggle={(value) => toggleMulti(row.key, value)}
                  />
                ) : (
                  <select
                    className="owner-report-row__select"
                    aria-label={row.title}
                    value={hasOptions ? (selection[row.key] || optionValue(options[0])) : ""}
                    disabled={!hasOptions}
                    onChange={(event) => setSelection((prev) => ({ ...prev, [row.key]: event.target.value }))}
                  >
                    {hasOptions ? (
                      options.map((item) => (
                        <option key={optionValue(item)} value={optionValue(item)}>{optionLabel(item)}</option>
                      ))
                    ) : (
                      <option value="">{row.empty}</option>
                    )}
                  </select>
                )}
                {row.percent ? (
                  <input
                    className="owner-report-row__percent"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="100"
                    placeholder="%"
                    aria-label="Процент официанта"
                    disabled
                  />
                ) : null}
              </div>
              <div className="owner-report-row__action">
                <button
                  className="owner-report-row__print"
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Отчёт ещё не подключён"
                >
                  <Icon name="bi-printer" size={16} /> Печать
                </button>
                <span className="owner-report-row__deferred">Скоро</span>
              </div>
            </div>
          );
        })}
        </div>
      </section>
    </section>
  );
}
