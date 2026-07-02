import { useState } from "react";
import Icon from "../components/Icon";

const printReports = [
  {
    key: "cashiers",
    title: "Отчет по кассирам",
    icon: "bi-person-badge",
    fields: [{ type: "select", label: "Кассир", options: ["Все кассиры", "Administrator", "Кассир 1"] }],
  },
  {
    key: "waiters",
    title: "Отчет по официантам",
    icon: "bi-person-lines-fill",
    fields: [
      { type: "select", label: "Официант", options: ["Все официанты", "Азизбек", "Алишер", "Дилноза", "Сардор"] },
      { type: "input", label: "Процент", suffix: "%" },
    ],
  },
  {
    key: "cooks",
    title: "Отчет по поварам",
    icon: "bi-egg-fried",
    fields: [{ type: "select", label: "Повар", options: ["Все повара", "Повар 1", "Повар 2"] }],
  },
  {
    key: "places",
    title: "Отчет по местам",
    icon: "bi-grid-3x3-gap",
    fields: [{ type: "select", label: "Место", options: ["Все места", "Основной зал", "Летняя зона"] }],
  },
  {
    key: "menu",
    title: "Отчет по меню",
    icon: "bi-journal-text",
    fields: [{ type: "select", label: "Категория", options: ["Все категории", "Горячее", "Напитки", "Салаты"] }],
  },
];

const TEST_STATS = {
  cashiers: [
    ["Кассир", "Заказов", "Сумма"],
    ["Administrator", "34", "1 820 000 UZS"],
    ["Кассир 1", "28", "1 540 000 UZS"],
    ["ИТОГО", "62", "3 360 000 UZS"],
  ],
  waiters: [
    ["Официант", "Заказов", "Сумма", "% сервис"],
    ["Азизбек", "18", "920 000 UZS", "46 000"],
    ["Алишер", "15", "780 000 UZS", "39 000"],
    ["Дилноза", "12", "540 000 UZS", "27 000"],
    ["Сардор", "17", "890 000 UZS", "44 500"],
    ["ИТОГО", "62", "3 130 000 UZS", "156 500"],
  ],
  cooks: [
    ["Повар", "Блюд", "Ср. время"],
    ["Повар 1", "87", "14 мин"],
    ["Повар 2", "63", "11 мин"],
    ["ИТОГО", "150", "12 мин"],
  ],
  places: [
    ["Место", "Заказов", "Сумма"],
    ["Основной зал", "44", "2 310 000 UZS"],
    ["Летняя зона", "18", "1 050 000 UZS"],
    ["ИТОГО", "62", "3 360 000 UZS"],
  ],
  menu: [
    ["Категория", "Позиций", "Кол-во", "Сумма"],
    ["Горячее", "8", "127", "2 100 000 UZS"],
    ["Напитки", "5", "94", "640 000 UZS"],
    ["Салаты", "4", "48", "620 000 UZS"],
    ["ИТОГО", "17", "269", "3 360 000 UZS"],
  ],
};

function buildReceiptHtml(reportItem, fieldValues) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ru-RU");
  const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const stats = TEST_STATS[reportItem.key] || [];
  const [header, ...rows] = stats;

  const headerCells = (header || []).map((h) => `<th>${h}</th>`).join("");
  const bodyRows = rows.map((row) => {
    const isTotal = row[0] === "ИТОГО";
    const cells = row.map((cell) => `<td>${cell}</td>`).join("");
    return `<tr class="${isTotal ? "total-row" : ""}">${cells}</tr>`;
  }).join("");

  const params = reportItem.fields
    .map((f, i) => (fieldValues[i] ? `${f.label}: ${fieldValues[i]}` : null))
    .filter(Boolean)
    .join(" | ");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>${reportItem.title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: #000;
    background: #fff;
    padding: 20px;
    max-width: 420px;
    margin: 0 auto;
  }
  .receipt-header {
    text-align: center;
    border-bottom: 2px dashed #000;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }
  .receipt-header h1 {
    font-size: 18px;
    font-weight: bold;
    letter-spacing: 3px;
    text-transform: uppercase;
  }
  .receipt-header p { font-size: 11px; margin-top: 3px; }
  .receipt-meta {
    font-size: 11px;
    margin-bottom: 10px;
    border-bottom: 1px dashed #000;
    padding-bottom: 8px;
    line-height: 1.7;
  }
  .receipt-title {
    font-size: 13px;
    font-weight: bold;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 8px;
    border-bottom: 2px solid #000;
    padding-bottom: 6px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th {
    text-align: left;
    font-weight: bold;
    padding: 4px 3px;
    border-bottom: 1px solid #000;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  td {
    padding: 4px 3px;
    border-bottom: 1px dashed #bbb;
    vertical-align: top;
  }
  tr.total-row td {
    border-top: 2px solid #000;
    border-bottom: none;
    font-weight: bold;
    padding-top: 6px;
    font-size: 12px;
  }
  .receipt-footer {
    margin-top: 12px;
    border-top: 2px dashed #000;
    padding-top: 8px;
    text-align: center;
    font-size: 10px;
    color: #444;
    line-height: 1.8;
  }
  @media print {
    body { padding: 4px; }
  }
</style>
</head>
<body>
  <div class="receipt-header">
    <h1>MARJON</h1>
    <p>Ресторан • г. Ташкент</p>
  </div>
  <div class="receipt-meta">
    <div>Дата: ${dateStr} ${timeStr}</div>
    <div>Смена: #0042</div>
    ${params ? `<div>Параметры: ${params}</div>` : ""}
  </div>
  <div class="receipt-title">${reportItem.title}</div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="receipt-footer">
    <div>★ MARJON POS — Тестовый отчёт ★</div>
    <div>${dateStr}</div>
  </div>
  <script>
    window.onload = function () {
      window.print();
      window.onafterprint = function () { window.close(); };
    };
  </script>
</body>
</html>`;
}

function ReportField({ reportKey, fieldIndex, field, fieldValues, setFieldValues }) {
  const key = `${reportKey}-${fieldIndex}`;

  if (!field) {
    return <span className="z-report-print-table__empty">—</span>;
  }

  if (field.type === "select") {
    return (
      <label className="z-report-filter z-report-print-table__field">
        <select
          value={fieldValues[key] || ""}
          onChange={(e) => setFieldValues((prev) => ({ ...prev, [key]: e.target.value }))}
        >
          <option value="" disabled>{field.label}</option>
          {field.options.map((option) => (
            <option value={option} key={option}>{option}</option>
          ))}
        </select>
        <Icon name="bi-chevron-down" size={18} />
      </label>
    );
  }

  return (
    <label className="z-report-filter z-report-print-table__field z-report-print-table__field--input">
      <input
        placeholder={field.label}
        inputMode="decimal"
        value={fieldValues[key] || ""}
        onChange={(e) => setFieldValues((prev) => ({ ...prev, [key]: e.target.value }))}
      />
      {field.suffix ? <span>{field.suffix}</span> : null}
    </label>
  );
}

export default function ZReportPage() {
  const [fieldValues, setFieldValues] = useState({});

  function handlePrint(reportItem) {
    const values = reportItem.fields.map((_, i) => fieldValues[`${reportItem.key}-${i}`] || "");
    const html = buildReceiptHtml(reportItem, values);
    const win = window.open("", "_blank", "width=480,height=600,toolbar=no,menubar=no");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  return (
    <section className="z-report-page z-report-page--print-only">
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
              {printReports.map((reportItem, index) => (
                <tr key={reportItem.key}>
                  <td className="z-report-print-table__number">{index + 1}</td>
                  <td>
                    <div className="z-report-print-table__report">
                      <span className="z-report-print-table__icon">
                        <Icon name={reportItem.icon} size={18} />
                      </span>
                      <strong>{reportItem.title}</strong>
                    </div>
                  </td>
                  <td>
                    <ReportField
                      reportKey={reportItem.key}
                      fieldIndex={0}
                      field={reportItem.fields[0]}
                      fieldValues={fieldValues}
                      setFieldValues={setFieldValues}
                    />
                  </td>
                  <td>
                    <ReportField
                      reportKey={reportItem.key}
                      fieldIndex={1}
                      field={reportItem.fields[1]}
                      fieldValues={fieldValues}
                      setFieldValues={setFieldValues}
                    />
                  </td>
                  <td>
                    <button
                      className="z-report-print-row__action"
                      type="button"
                      onClick={() => handlePrint(reportItem)}
                    >
                      <Icon name="bi-printer" size={18} />
                      Печатать отчет
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