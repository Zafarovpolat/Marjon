import { useEffect, useRef, useState } from "react";
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

function ReportSelect({ field }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const ref = useRef(null);
  const value = selected || field.label;

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!ref.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={`z-report-select ${open ? "is-open" : ""}`} ref={ref}>
      <button
        className="z-report-select__trigger z-report-filter z-report-print-table__field"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}</span>
        <Icon name="bi-chevron-down" size={18} />
      </button>
      {open ? (
        <div className="z-report-select__menu" role="listbox">
          {field.options.map((option) => {
            const active = option === selected || (!selected && option === field.options[0]);
            return (
              <button
                className={active ? "is-active" : ""}
                type="button"
                role="option"
                aria-selected={active}
                key={option}
                onClick={() => {
                  setSelected(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ReportField({ field }) {
  if (!field) {
    return <span className="z-report-print-table__empty">—</span>;
  }

  if (field.type === "select") {
    return <ReportSelect field={field} />;
  }

  return (
    <label className="z-report-filter z-report-print-table__field z-report-print-table__field--input">
      <input placeholder={field.label} inputMode="decimal" />
      {field.suffix ? <span>{field.suffix}</span> : null}
    </label>
  );
}

export default function ZReportPage() {
  function handlePrint() {
    window.print();
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
                    <ReportField field={reportItem.fields[0]} />
                  </td>
                  <td>
                    <ReportField field={reportItem.fields[1]} />
                  </td>
                  <td>
                    <button className="z-report-print-row__action" type="button" onClick={handlePrint}>
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
