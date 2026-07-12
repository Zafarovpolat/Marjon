import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";

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

export default function ZReportPage() {
  return (
    <section className="z-report-page z-report-page--print-only">
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
