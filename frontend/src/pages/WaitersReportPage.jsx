import { useEffect, useState } from "react";
import { api, formatMoney } from "../api/client";
import Icon from "../components/Icon";

const demoWaiters = [
  { id: "demo-1", name: "Азизбек" },
  { id: "demo-2", name: "Алишер" },
  { id: "demo-3", name: "Дилноза" },
  { id: "demo-4", name: "Сардор" },
];

const waiterColumns = [
  { key: "orders", label: "Сумма заказов", checked: true },
  { key: "takeaway", label: "Сумма заказов на вынос", checked: false },
  { key: "service", label: "Сумма услуги", checked: false },
  { key: "waiterService", label: "Обслуга официанта", checked: false },
  { key: "dishes", label: "Блюди", checked: false },
];

function isWaiter(employee) {
  const role = String(employee.role || employee.position || employee.role_label || "").toLowerCase();
  return role.includes("официант") || role.includes("waiter");
}

function normalizeWaiter(employee, index) {
  return {
    id: employee.id || employee.employee_id || `waiter-${index}`,
    name: employee.full_name || employee.name || employee.username || employee.phone || `Официант ${index + 1}`,
  };
}

export default function WaitersReportPage() {
  const [waiters, setWaiters] = useState(demoWaiters);

  useEffect(() => {
    let mounted = true;
    api.get("/hr/employees")
      .then(({ data }) => {
        if (!mounted) return;
        const loaded = Array.isArray(data) ? data.filter(isWaiter).map(normalizeWaiter) : [];
        setWaiters(loaded.length ? loaded : demoWaiters);
      })
      .catch(() => {
        if (mounted) setWaiters(demoWaiters);
      });
    return () => { mounted = false; };
  }, []);

  function handleExport() {
    window.print();
  }

  return (
    <section className="waiters-report-page">
      <article className="waiters-report-card z-waiters-report">
        <div className="z-waiters-report__head">
          <div className="z-waiters-report__title">
            <span aria-hidden="true" />
            <strong>Отчет по официантам</strong>
          </div>
          <div className="z-waiters-report__controls">
            <label className="z-waiters-report__percent">
              <input defaultValue="0" inputMode="decimal" aria-label="Процент" />
              <span>%</span>
            </label>
            <label className="z-waiters-report__select">
              <select defaultValue="">
                <option value="" disabled>Выберите официанта</option>
                <option value="all">Все официанты</option>
                {waiters.map((waiter) => <option value={waiter.id} key={waiter.id}>{waiter.name}</option>)}
              </select>
              <Icon name="bi-chevron-down" size={18} />
            </label>
            <button className="z-waiters-report__excel" type="button" onClick={handleExport}>
              <Icon name="bi-file-earmark-excel" size={18} />
              Скачать на EXCEL
            </button>
          </div>
        </div>

        <div className="z-waiters-report__table" role="table" aria-label="Отчет по официантам">
          <div className="z-waiters-report__row z-waiters-report__row--head" role="row">
            <div role="columnheader">Имя</div>
            {waiterColumns.map((column) => (
              <label key={column.key} role="columnheader">
                <input type="checkbox" defaultChecked={column.checked} />
                <span>{column.label}</span>
              </label>
            ))}
          </div>
          <div className="z-waiters-report__row z-waiters-report__row--total" role="row">
            <strong role="cell">Всего</strong>
            <strong role="cell">{formatMoney(0)}</strong>
            <span role="cell">{formatMoney(0)}</span>
            <strong role="cell">{formatMoney(0)}</strong>
            <strong role="cell">{formatMoney(0)}</strong>
            <span role="cell">—</span>
          </div>
        </div>
      </article>
    </section>
  );
}
