import { Fragment, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../api/client";
import DemoNotice from "../components/DemoNotice";
import DatePicker from "../components/DatePicker";
import Icon from "../components/Icon";
import { formatMoney } from "../api/client";
import { todayInputValue } from "../utils/date";

const exchangeRate = 12650;

const parties = [
  {
    id: "cl-001",
    type: "debtors",
    name: "Клиент",
    category: "Гость",
    phone: "+998 90 120 45 77",
    owner: "Администратор",
    amount: 354919,
    dueDate: "2026-06-25",
    status: "active",
    note: "Постоплата по банкетному заказу.",
    operations: [
      { date: "2026-06-22", document: "Заказ #1048", amount: 224900 },
      { date: "2026-06-23", document: "Заказ #1057", amount: 130019 },
    ],
  },
  {
    id: "cl-002",
    type: "debtors",
    name: "Dilnoza Catering",
    category: "Партнер",
    phone: "+998 93 501 22 10",
    owner: "Менеджер",
    amount: 2480000,
    dueDate: "2026-06-28",
    status: "watch",
    note: "Ожидается оплата по корпоративному обеду.",
    operations: [
      { date: "2026-06-21", document: "Счет #DC-14", amount: 1720000 },
      { date: "2026-06-23", document: "Доставка #118", amount: 760000 },
    ],
  },
  {
    id: "cl-003",
    type: "debtors",
    name: "VIP зал",
    category: "Внутренний счет",
    phone: "+998 71 200 80 08",
    owner: "Кассир",
    amount: 1195000,
    dueDate: "2026-06-24",
    status: "active",
    note: "Закрытие после сверки с гостем.",
    operations: [
      { date: "2026-06-23", document: "Стол #7", amount: 1195000 },
    ],
  },
  {
    id: "cr-001",
    type: "creditors",
    name: "Fresh Market",
    category: "Поставщик",
    phone: "+998 95 010 11 12",
    owner: "Склад",
    amount: 17859000,
    dueDate: "2026-06-26",
    status: "overdue",
    note: "Поставка овощей и зелени, требуется сверка накладной.",
    operations: [
      { date: "2026-06-20", document: "Накладная #FM-883", amount: 12450000 },
      { date: "2026-06-22", document: "Накладная #FM-891", amount: 5409000 },
    ],
  },
  {
    id: "cr-002",
    type: "creditors",
    name: "Premium Meat",
    category: "Поставщик",
    phone: "+998 99 711 40 00",
    owner: "Шеф-повар",
    amount: 6900000,
    dueDate: "2026-06-29",
    status: "active",
    note: "Оплата мясной поставки после проверки качества.",
    operations: [
      { date: "2026-06-23", document: "Накладная #PM-217", amount: 6900000 },
    ],
  },
];

const tabLabels = {
  debtors: "Дебиторы",
  creditors: "Кредиторы",
};

const statusLabels = {
  active: "В работе",
  watch: "Контроль",
  overdue: "Просрочено",
};

function displayAmount(value, currency) {
  if (currency === "USD") {
    return `$${(Number(value || 0) / exchangeRate).toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return formatMoney(value, "UZS");
}

function formatDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

export default function DebtorsCreditorsReportPage() {
  const { selectedDate = todayInputValue(), setSelectedDate } = useOutletContext();
  const [activeTab, setActiveTab] = useState("debtors");
  const [currency, setCurrency] = useState("UZS");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState("cl-001");
  const [rows, setRows] = useState(parties);
  const [isDemo, setIsDemo] = useState(true);

  useEffect(() => {
    api.get("/reports/debt-credit")
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : data?.items || data?.parties || [];
        if (items.length) {
          setRows(items.map((item) => ({
            id: String(item.id || ""),
            type: item.type || "debtors",
            name: item.name || "",
            category: item.category || "",
            phone: item.phone || "",
            owner: item.owner || "",
            amount: Number(item.amount || 0),
            dueDate: item.due_date || item.dueDate || "",
            status: item.status || "active",
            note: item.note || "",
            operations: item.operations || [],
          })));
          setIsDemo(false);
        }
      })
      .catch(() => {});
  }, []);

  const totals = useMemo(() => {
    const debtors = rows.filter((party) => party.type === "debtors");
    const creditors = rows.filter((party) => party.type === "creditors");
    const debt = debtors.reduce((sum, party) => sum + party.amount, 0);
    const credit = creditors.reduce((sum, party) => sum + party.amount, 0);
    return {
      debt,
      credit,
      balance: debt - credit,
      debtorsCount: debtors.length,
      creditorsCount: creditors.length,
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows
      .filter((party) => party.type === activeTab)
      .filter((party) => {
        if (!needle) return true;
        return [party.name, party.category, party.phone, party.owner]
          .some((value) => value.toLowerCase().includes(needle));
      });
  }, [rows, activeTab, search]);

  const activeTotal = activeTab === "debtors" ? totals.debt : totals.credit;

  return (
    <section className="dc-report-page">
      <article className="dc-report-card">
        {isDemo && (
          <DemoNotice />
        )}
        <div className="dc-report-head">
          <div>
            <span className="dc-report-eyebrow">Marjon finance</span>
            <h2>Дебиторы и кредиторы</h2>
            <p>Сводка задолженностей по гостям, партнерам и поставщикам на выбранную дату.</p>
          </div>
          <DatePicker
            value={selectedDate}
            max={todayInputValue()}
            onChange={setSelectedDate}
          />
        </div>

        <div className="dc-summary-grid">
          <article className="dc-summary-card dc-summary-card--debt">
            <div className="dc-summary-card__top">
              <span>Дебиторская задолженность</span>
              <Icon name="bi-arrow-down-left-circle" size={22} />
            </div>
            <strong>{displayAmount(totals.debt, currency)}</strong>
            <small>Количество контрагентов: {totals.debtorsCount}</small>
          </article>
          <article className="dc-summary-card dc-summary-card--credit">
            <div className="dc-summary-card__top">
              <span>Кредиторская задолженность</span>
              <Icon name="bi-arrow-up-right-circle" size={22} />
            </div>
            <strong>{displayAmount(totals.credit, currency)}</strong>
            <small>Количество контрагентов: {totals.creditorsCount}</small>
          </article>
          <article className="dc-summary-card dc-summary-card--balance">
            <div className="dc-summary-card__top">
              <span>Сальдо</span>
              <Icon name="bi-bank" size={22} />
            </div>
            <strong>{displayAmount(totals.balance, currency)}</strong>
            <small>Разница между дебиторской и кредиторской задолженностью</small>
          </article>
        </div>

        <div className="dc-toolbar">
          <div className="dc-tabs" role="tablist" aria-label="Тип задолженности">
            {Object.entries(tabLabels).map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={activeTab === key ? "is-active" : ""}
                onClick={() => {
                  setActiveTab(key);
                  setExpandedId("");
                }}
                role="tab"
                aria-selected={activeTab === key}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="dc-toolbar__right">
            <div className="dc-currency" role="group" aria-label="Валюта">
              {["UZS", "USD"].map((item) => (
                <button
                  type="button"
                  key={item}
                  className={currency === item ? "is-active" : ""}
                  onClick={() => setCurrency(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="dc-search">
              <Icon name="bi-search" size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по контрагенту"
              />
            </label>
          </div>
        </div>

        <div className="dc-table-wrap">
          <table className="dc-table">
            <thead>
              <tr>
                <th>Контрагент</th>
                <th>Категория</th>
                <th>Ответственный</th>
                <th>Срок оплаты</th>
                <th className="dc-table__amount">{activeTab === "debtors" ? "Дебет" : "Кредит"}</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr className="dc-total-row">
                <td colSpan="4">Итого {activeTab === "debtors" ? "дебиторка" : "кредиторка"}</td>
                <td className="dc-table__amount">{displayAmount(activeTotal, currency)}</td>
                <td>{visibleRows.length} строк</td>
              </tr>
              {visibleRows.map((party) => {
                const expanded = expandedId === party.id;
                return (
                  <Fragment key={party.id}>
                    <tr
                      className={`dc-party-row ${expanded ? "is-expanded" : ""}`}
                      onClick={() => setExpandedId(expanded ? "" : party.id)}
                    >
                      <td>
                        <div className="dc-party">
                          <button type="button" aria-label={expanded ? "Свернуть строку" : "Раскрыть строку"}>
                            <Icon name={expanded ? "bi-dash" : "bi-plus"} size={16} />
                          </button>
                          <div>
                            <strong>{party.name}</strong>
                            <span>{party.phone}</span>
                          </div>
                        </div>
                      </td>
                      <td>{party.category}</td>
                      <td>{party.owner}</td>
                      <td>{formatDate(party.dueDate)}</td>
                      <td className="dc-table__amount">{displayAmount(party.amount, currency)}</td>
                      <td><span className={`dc-status dc-status--${party.status}`}>{statusLabels[party.status]}</span></td>
                    </tr>
                    {expanded ? (
                      <tr className="dc-detail-row">
                        <td colSpan="6">
                          <div className="dc-detail">
                            <p>{party.note}</p>
                            <div className="dc-detail__operations">
                              {party.operations.map((operation) => (
                                <div key={`${party.id}-${operation.document}`}>
                                  <span>{formatDate(operation.date)}</span>
                                  <strong>{operation.document}</strong>
                                  <em>{displayAmount(operation.amount, currency)}</em>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!visibleRows.length ? (
                <tr className="dc-empty-row">
                  <td colSpan="6">По запросу ничего не найдено</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
