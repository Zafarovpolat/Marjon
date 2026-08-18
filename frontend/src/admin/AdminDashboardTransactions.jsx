import { Fragment, useEffect, useMemo, useState } from "react";

import { adminFinanceApi } from "./financeApi";

import Icon from '../components/Icon';

import ReportDateRangePicker from "../components/ReportDateRangePicker";

import { createPortal } from "react-dom";

import { isAbortError, useLatestRequest } from "../hooks/useAsyncSafety";

import { ADMIN_DASHBOARD_DATE_PRESET_LABELS, AdminPageSizeDropdown, buildAdminDashboardDateRange, formatAdminDashboardDateRangeButton, formatAdminMoney, getAdminFinanceLoadMessage, getPageList, keepWheelInsideScroller, normalizeAdminReportRange } from "./AdminShared";

const transactionColumnKeys = [
  "id", "uuid", "date", "orgId", "name", "payType",
  "amount", "kind", "status", "paymentFor", "comment", "actions",
];

const TRANSACTION_COLUMN_SETTINGS_STORAGE_KEY = "marjon.admin.transactions.columns.v1";

const TRANSACTION_COLUMN_SETTINGS_LAYOUT_VERSION = 2;

const defaultTransactionColumnOrder = [
  "id", "uuid", "name", "date", "orgId", "payType",
  "amount", "kind", "status", "paymentFor", "comment", "actions",
];

function normalizeTransactionColumnKeys(keys) {
  const seen = new Set();
  return (Array.isArray(keys) ? keys : []).filter((key) => {
    if (!transactionColumnKeys.includes(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeTransactionColumnSettings(settings) {
  const savedOrder = settings?.layoutVersion === TRANSACTION_COLUMN_SETTINGS_LAYOUT_VERSION
    ? normalizeTransactionColumnKeys(settings?.order)
    : [];
  const order = [
    ...savedOrder,
    ...defaultTransactionColumnOrder.filter((key) => !savedOrder.includes(key)),
    ...transactionColumnKeys.filter((key) => !savedOrder.includes(key) && !defaultTransactionColumnOrder.includes(key)),
  ];
  const visibleSource = Array.isArray(settings) ? settings : settings?.visible;
  const visible = normalizeTransactionColumnKeys(visibleSource || transactionColumnKeys)
    .filter((key) => order.includes(key));

  return {
    layoutVersion: TRANSACTION_COLUMN_SETTINGS_LAYOUT_VERSION,
    order,
    visible: visible.length ? visible : [order[0]],
  };
}

function loadTransactionColumnSettings() {
  if (typeof window === "undefined") {
    return normalizeTransactionColumnSettings();
  }

  try {
    return normalizeTransactionColumnSettings(JSON.parse(window.localStorage.getItem(TRANSACTION_COLUMN_SETTINGS_STORAGE_KEY)));
  } catch {
    return normalizeTransactionColumnSettings();
  }
}

function saveTransactionColumnSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      TRANSACTION_COLUMN_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizeTransactionColumnSettings(settings)),
    );
  } catch {
    // localStorage can be unavailable in private mode; the current session still keeps the setting.
  }
}

function formatTransactionAmountParts(value) {
  const source = String(value ?? "").replace(/\u00a0/g, " ").trim();
  const currencyMatch = source.match(/\s+([A-Za-zА-Яа-я]{3,})$/);
  const currency = currencyMatch?.[1] || "UZS";
  const numberSource = currencyMatch ? source.slice(0, currencyMatch.index).trim() : source;
  const numericValue = Number(numberSource.replace(/[^\d-]/g, ""));

  if (!Number.isFinite(numericValue)) {
    return { value: numberSource || "0", currency };
  }

  return {
    value: formatAdminMoney(numericValue),
    currency,
  };
}

function formatTransactionAmountDraft(value) {
  const numericValue = Number(String(value ?? "").replace(/[^\d-]/g, ""));
  return Number.isFinite(numericValue) ? formatAdminMoney(Math.abs(numericValue)) : "0";
}

export function normalizeHqDashboardTransaction(row, index = 0) {
  return {
    id: row.id_num || index + 1,
    uuid: row.id || "",
    date: row.date || row.created_at || "",
    orgId: row.organization_id || "",
    name: row.organization_name || row.counterparty_name || "",
    payType: row.payment_type_name || row.payment_type || "",
    amount: row.amount != null ? `${Number(row.amount).toLocaleString("ru-RU")} UZS` : "—",
    kind: row.direction === "income" ? "Приход" : "Расход",
    status: "—",
    paymentFor: row.payment_for || row.category_name || "",
    comment: row.comment || "",
  };
}

export function TransactionsTable({ onNotify }) {
  const [rows, setRows] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSizeOptions = [10, 20, 50];
  const [pageSize, setPageSize] = useState(20);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnSettings, setColumnSettings] = useState(loadTransactionColumnSettings);
  const [dragColumnKey, setDragColumnKey] = useState("");
  const [dragColumnTarget, setDragColumnTarget] = useState(null);
  const [transactionEditor, setTransactionEditor] = useState(null);
  const visibleColumns = columnSettings.visible;
  const beginRequest = useLatestRequest();

  useEffect(() => {
    const request = beginRequest();
    setLoadState("loading");
    adminFinanceApi.listTransactions({ size: 50 }, { signal: request.signal })
      .then(({ data }) => {
        if (!request.isCurrent()) return;
        const items = Array.isArray(data) ? data : data?.items || [];
        setRows(items.map(normalizeHqDashboardTransaction));
        setLoadState(items.length ? "success" : "empty");
      })
      .catch((error) => {
        if (!request.isCurrent() || isAbortError(error)) return;
        setRows([]);
        setLoadState("error");
        onNotify?.(getAdminFinanceLoadMessage(error));
      });
  }, [beginRequest, onNotify]);

  useEffect(() => { setPage(1); }, [query, pageSize]);

  useEffect(() => {
    saveTransactionColumnSettings(columnSettings);
  }, [columnSettings]);

  useEffect(() => {
    if (!transactionEditor) return undefined;

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setTransactionEditor(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [transactionEditor]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(q));
  }, [query, rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageRows = filteredRows.slice(startIndex, startIndex + pageSize);
  const pageList = getPageList(currentPage, totalPages);

  function goToPage(nextPage) {
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
  }

  function toggleColumn(key) {
    setColumnSettings((current) => {
      const normalized = normalizeTransactionColumnSettings(current);

      if (normalized.visible.includes(key)) {
        return {
          ...normalized,
          visible: normalized.visible.length > 1
            ? normalized.visible.filter((item) => item !== key)
            : normalized.visible,
        };
      }

      return {
        ...normalized,
        visible: normalized.order.filter((item) => item === key || normalized.visible.includes(item)),
      };
    });
  }

  function moveColumn(key, direction) {
    setColumnSettings((current) => {
      const normalized = normalizeTransactionColumnSettings(current);
      const currentIndex = normalized.order.indexOf(key);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= normalized.order.length) {
        return normalized;
      }

      const nextOrder = [...normalized.order];
      [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];

      return {
        ...normalized,
        order: nextOrder,
      };
    });
  }

  function moveColumnToDrop(sourceKey, targetKey, placement = "before") {
    if (!sourceKey || !targetKey || sourceKey === targetKey) {
      return;
    }

    setColumnSettings((current) => {
      const normalized = normalizeTransactionColumnSettings(current);
      const nextOrder = normalized.order.filter((key) => key !== sourceKey);
      const targetIndex = nextOrder.indexOf(targetKey);

      if (targetIndex < 0 || !normalized.order.includes(sourceKey)) {
        return normalized;
      }

      nextOrder.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, sourceKey);

      return {
        ...normalized,
        order: nextOrder,
      };
    });
  }

  function resetColumnSettings() {
    setColumnSettings(normalizeTransactionColumnSettings());
  }

  function openTransactionEditor(row) {
    void row;
    onNotify?.("Редактирование недоступно: backend mutation contract не подключён.");
  }

  function updateTransactionEditor(key, value) {
    setTransactionEditor((current) => (current ? { ...current, [key]: value } : current));
  }

  function saveTransactionEditor(event) {
    event.preventDefault();
    onNotify?.("Сохранение недоступно: backend mutation contract не подключён.");
  }

  const allColumns = [
    { key: "id", label: "ID", width: 66 },
    { key: "uuid", label: "UUID", width: 214 },
    { key: "date", label: "Дата", width: 150 },
    { key: "orgId", label: "ID Организация", width: 120 },
    { key: "name", label: "Названия", width: 200 },
    { key: "payType", label: "Тип оплаты", width: 120 },
    { key: "amount", label: "Сумма", width: 156 },
    { key: "kind", label: "Тип", width: 92 },
    { key: "status", label: "Status", width: 90 },
    { key: "paymentFor", label: "Оплата за", width: 180 },
    { key: "comment", label: "Комментария", width: 220 },
    { key: "actions", label: "", width: 58 },
  ];

  const orderedColumns = columnSettings.order
    .map((key) => allColumns.find((column) => column.key === key))
    .filter(Boolean);
  const columns = orderedColumns.filter((column) => visibleColumns.includes(column.key));
  const actionsColumnIsLast = columns.at(-1)?.key === "actions";

  function renderCell(column, row) {
    switch (column.key) {
      case "id": return <span className="admin-tx-id">{row.id}</span>;
      case "uuid": return <span className="admin-tx-uuid">{row.uuid}</span>;
      case "name": return <strong className="org-directory-name">{row.name}</strong>;
      case "amount": {
        const amount = formatTransactionAmountParts(row.amount);
        return (
          <span className="admin-tx-amount">
            <span className="admin-tx-amount__value">{amount.value}</span>
            <span className="admin-tx-amount__currency">{amount.currency}</span>
          </span>
        );
      }
      case "kind": return <span className={`org-directory-flag ${row.kind === "Расход" ? "org-directory-flag--warning" : "org-directory-flag--success"}`}>{row.kind}</span>;
      case "status": return <span className="org-directory-flag">{row.status}</span>;
      case "comment": return row.comment ? row.comment : "—";
      case "actions": return (
        <button type="button" className="admin-tx-edit" onClick={() => openTransactionEditor(row)} aria-label={`Редактировать транзакцию ${row.id}`}>
          <Icon name="bi-pencil" size={14} />
        </button>
      );
      default: return row[column.key];
    }
  }

  const transactionEditorModal = transactionEditor && typeof document !== "undefined"
    ? createPortal(
      <div
        className="admin-income-modal admin-transaction-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Редактировать транзакцию ${transactionEditor.id}`}
        onClick={() => setTransactionEditor(null)}
      >
        <form className="admin-income-dialog admin-transaction-dialog" onSubmit={saveTransactionEditor} onClick={(event) => event.stopPropagation()}>
          <div className="admin-income-dialog__head admin-transaction-dialog__head">
            <div>
              <h3>Редактировать транзакцию</h3>
              <p>ID {transactionEditor.id}. Изменения применятся к строке таблицы.</p>
            </div>
            <button type="button" className="admin-income-dialog__close" onClick={() => setTransactionEditor(null)} aria-label="Закрыть">
              <Icon name="bi-x-lg" size={16} />
            </button>
          </div>

          <div className="admin-transaction-dialog__grid">
            <label className="admin-income-field admin-transaction-field admin-transaction-field--wide">
              <span>Название</span>
              <input
                value={transactionEditor.name}
                onChange={(event) => updateTransactionEditor("name", event.target.value)}
                placeholder="Название организации"
                autoFocus
              />
            </label>

            <label className="admin-income-field admin-transaction-field">
              <span>Сумма</span>
              <div className="admin-transaction-amount-input">
                <input
                  value={transactionEditor.amount}
                  inputMode="numeric"
                  onChange={(event) => updateTransactionEditor("amount", formatTransactionAmountDraft(event.target.value))}
                  placeholder="0"
                />
                <strong>UZS</strong>
              </div>
            </label>

            <label className="admin-income-field admin-transaction-field">
              <span>Дата и время</span>
              <input
                type="datetime-local"
                value={transactionEditor.date}
                onChange={(event) => updateTransactionEditor("date", event.target.value)}
              />
            </label>

            <label className="admin-income-field admin-transaction-field">
              <span>Тип</span>
              <select value={transactionEditor.kind} onChange={(event) => updateTransactionEditor("kind", event.target.value)}>
                <option value="Приход">Приход</option>
                <option value="Расход">Расход</option>
              </select>
            </label>

            <label className="admin-income-field admin-transaction-field">
              <span>Тип оплаты</span>
              <select value={transactionEditor.payType} onChange={(event) => updateTransactionEditor("payType", event.target.value)}>
                <option value={transactionEditor.payType}>{transactionEditor.payType || "Не указано"}</option>
              </select>
            </label>

            <label className="admin-income-field admin-transaction-field">
              <span>Status</span>
              <input value="Недоступно" disabled />
            </label>

            <label className="admin-income-field admin-transaction-field">
              <span>Оплата за</span>
              <input
                value={transactionEditor.paymentFor}
                onChange={(event) => updateTransactionEditor("paymentFor", event.target.value)}
                placeholder="Назначение оплаты"
              />
            </label>

            <label className="admin-income-field admin-transaction-field admin-transaction-field--wide">
              <span>Комментария</span>
              <textarea
                value={transactionEditor.comment}
                onChange={(event) => updateTransactionEditor("comment", event.target.value)}
                placeholder="Комментарий к транзакции"
                rows={3}
              />
            </label>
          </div>

          <div className="admin-income-dialog__actions admin-transaction-dialog__actions">
            <button type="button" className="is-ghost" onClick={() => setTransactionEditor(null)}>Отмена</button>
            <button type="submit" className="is-primary">Сохранить</button>
          </div>
        </form>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <section className="admin-table-card admin-transactions">
        <div className="admin-panel-head admin-transactions__head">
          <div>
            <h2>Последние транзакции</h2>
          </div>
          <button
            className={`admin-transactions__settings ${settingsOpen ? "is-open" : ""}`}
            type="button"
            onClick={() => setSettingsOpen((value) => !value)}
            aria-expanded={settingsOpen}
          >
            <Icon name="bi-sliders" size={15} />
            <span>Настроить таблицу</span>
          </button>
          <label className="org-directory-search admin-transactions__search">
            <Icon name="bi-search" size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск" />
          </label>
        </div>

      {settingsOpen ? (
        <div className="org-directory-column-panel admin-transactions__column-panel">
          <div className="admin-transactions__column-panel-head">
            <span>Столбцы</span>
            <button type="button" onClick={resetColumnSettings}>Сброс</button>
          </div>
          <div className="admin-transactions__column-list">
            {orderedColumns.map((column, index) => {
              const checked = visibleColumns.includes(column.key);
              const disabled = checked && visibleColumns.length === 1;
              const label = column.label || "Действия";
              const dropPosition = dragColumnTarget?.key === column.key ? dragColumnTarget.position : "";

              return (
                <div
                  className={`admin-transactions__column-item ${disabled ? "is-disabled" : ""} ${dragColumnKey === column.key ? "is-dragging" : ""} ${dropPosition ? `is-drop-${dropPosition}` : ""}`}
                  key={column.key}
                  draggable
                  onDragStart={(event) => {
                    setDragColumnKey(column.key);
                    setDragColumnTarget(null);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", column.key);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const sourceKey = event.dataTransfer.getData("text/plain") || dragColumnKey;

                    if (!sourceKey || sourceKey === column.key) {
                      setDragColumnTarget(null);
                      return;
                    }

                    const rect = event.currentTarget.getBoundingClientRect();
                    const position = event.clientX - rect.left > rect.width / 2 ? "after" : "before";
                    setDragColumnTarget((current) => (
                      current?.key === column.key && current?.position === position
                        ? current
                        : { key: column.key, position }
                    ));
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    moveColumnToDrop(
                      event.dataTransfer.getData("text/plain") || dragColumnKey,
                      column.key,
                      dragColumnTarget?.key === column.key ? dragColumnTarget.position : "before",
                    );
                    setDragColumnKey("");
                    setDragColumnTarget(null);
                  }}
                  onDragEnd={() => {
                    setDragColumnKey("");
                    setDragColumnTarget(null);
                  }}
                >
                  <label className="admin-transactions__column-toggle">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleColumn(column.key)}
                    />
                    <span>{label}</span>
                  </label>
                  <div className="admin-transactions__column-move" aria-label={`Порядок столбца ${label}`}>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveColumn(column.key, -1)}
                      aria-label={`Переместить ${label} левее`}
                    >
                      <Icon name="bi-chevron-left" size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={index === orderedColumns.length - 1}
                      onClick={() => moveColumn(column.key, 1)}
                      aria-label={`Переместить ${label} правее`}
                    >
                      <Icon name="bi-chevron-right" size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="org-directory-table-shell admin-transactions__table-shell" onWheelCapture={keepWheelInsideScroller}>
        <table className={`org-directory-table admin-transactions__table ${actionsColumnIsLast ? "is-actions-sticky" : ""}`}>
          <colgroup>
            {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
          </colgroup>
          <thead>
            <tr>{columns.map((column) => (
              <th className={`admin-transactions__cell admin-transactions__cell--${column.key}`} key={column.key}>
                {column.key === "actions" ? (
                  <span className="admin-transactions__actions-head" aria-hidden="true">
                    <Icon name="bi-sliders" size={15} />
                  </span>
                ) : column.label}
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td className={`admin-transactions__cell admin-transactions__cell--${column.key}`} key={column.key}>{renderCell(column, row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {loadState === "loading" ? <div className="org-directory-empty" role="status">Загрузка транзакций...</div> : null}
        {loadState === "error" ? <div className="org-directory-empty" role="alert">Не удалось загрузить транзакции.</div> : null}
        {loadState === "empty" || (loadState === "success" && !pageRows.length) ? <div className="org-directory-empty">Транзакции не найдены.</div> : null}
      </div>

      <div className="org-directory-footer admin-transactions__footer">
        <span className="org-directory-footer__summary">
          {filteredRows.length ? `${startIndex + 1}-${Math.min(startIndex + pageSize, filteredRows.length)} из ${filteredRows.length}` : "0 из 0"}
          <small>Страница {currentPage} из {totalPages}</small>
        </span>
        <div className="org-directory-pager admin-transactions__pager">
          <AdminPageSizeDropdown value={pageSize} options={pageSizeOptions} onChange={setPageSize} />
          <button type="button" disabled={currentPage === 1} onClick={() => goToPage(1)} aria-label="Первая страница">
            <span className="org-directory-double-icon" aria-hidden="true">
              <Icon name="bi-chevron-left" size={13} />
              <Icon name="bi-chevron-left" size={13} />
            </span>
          </button>
          <button type="button" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} aria-label="Предыдущая страница">
            <Icon name="bi-chevron-left" size={15} />
          </button>
          {pageList.map((item, index) => (
            item === "…" ? (
              <span className="org-directory-ellipsis" key={`gap-${index}`}>…</span>
            ) : (
              <button
                type="button"
                key={item}
                className={`org-directory-page-btn ${item === currentPage ? "is-active" : ""}`}
                onClick={() => goToPage(item)}
                aria-current={item === currentPage ? "page" : undefined}
              >
                {item}
              </button>
            )
          ))}
          <button type="button" disabled={currentPage === totalPages} onClick={() => goToPage(currentPage + 1)} aria-label="Следующая страница">
            <Icon name="bi-chevron-right" size={15} />
          </button>
          <button type="button" disabled={currentPage === totalPages} onClick={() => goToPage(totalPages)} aria-label="Последняя страница">
            <span className="org-directory-double-icon" aria-hidden="true">
              <Icon name="bi-chevron-right" size={13} />
              <Icon name="bi-chevron-right" size={13} />
            </span>
          </button>
        </div>
      </div>
      </section>
      {transactionEditorModal}
    </>
  );
}

export function DashboardTransactionsReportPage() {
  const [openRows, setOpenRows] = useState(() => ({}));
  const [dateRange, setDateRange] = useState(() => buildAdminDashboardDateRange("Этот год"));
  const datePresets = useMemo(() => (
    ADMIN_DASHBOARD_DATE_PRESET_LABELS.map((label) => ({
      label,
      getRange: () => buildAdminDashboardDateRange(label),
    }))
  ), []);

  function toggleRow(rowId) {
    setOpenRows((current) => ({
      ...current,
      [rowId]: !current[rowId],
    }));
  }

  return (
    <section className="admin-dashboard-transactions-report">
      <div className="org-directory-empty" role="status">Backend источник отчёта транзакций не подключён.</div>
      <div className="admin-dashboard-transactions-report__filters">
        <div className="admin-dashboard-transactions-report__date-picker admin-chart-filter-date-picker admin-revenue-range">
          <ReportDateRangePicker
            value={dateRange}
            onChange={(nextRange) => setDateRange(normalizeAdminReportRange(nextRange))}
            buttonClassName="admin-chart-filter admin-chart-filter--date admin-dashboard-transactions-report__date"
            showTime={false}
            presets={datePresets}
            formatButtonLabel={formatAdminDashboardDateRangeButton}
            blockPageScrollOnWheel
            applyPresetOnSelect
            showMenuOk={false}
            leadingIconName="bi-calendar3"
            leadingIconSize={16}
          />
        </div>
        <button className="admin-dashboard-transactions-report__branch" type="button">
          <Icon name="bi-geo-alt" size={16} />
          <span>Филиал недоступен</span>
        </button>
      </div>

      <div className="admin-dashboard-transactions-report__card">
        <div className="admin-dashboard-transactions-report__table-wrap">
          <table className="admin-dashboard-transactions-report__table">
            <thead>
              <tr>
                <th>№</th>
                <th>Модуль</th>
                <th>По договору</th>
                <th>Выполненный</th>
                <th>Оплачено</th>
                <th>Не оплачено</th>
                <th>Сумма активных заказов</th>
                <th>Отклонено</th>
                <th>Просроченный долг</th>
              </tr>
            </thead>
            <tbody>
              {[].map((row, index) => {
                const isOpen = Boolean(openRows[row.id]);

                return (
                  <Fragment key={row.id}>
                    <tr className={`is-parent${isOpen ? " is-open" : ""}`}>
                      <td>{index + 1}</td>
                      <td>
                        <span className="admin-dashboard-transactions-report__module">
                          <strong>{row.module}</strong>
                          <button
                            type="button"
                            onClick={() => toggleRow(row.id)}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Скрыть" : "Показать"} ${row.module}`}
                          >
                            <span aria-hidden="true" />
                          </button>
                        </span>
                      </td>
                      <td>{row.contract}</td>
                      <td>{row.completed}</td>
                      <td>{row.paid}</td>
                      <td>{row.unpaid}</td>
                      <td>{row.activeOrders}</td>
                      <td>{row.rejected}</td>
                      <td>{row.overdue}</td>
                    </tr>
                    {isOpen ? row.children.map((child, childIndex) => (
                      <tr className="is-child" key={child.id}>
                        <td />
                        <td>{childIndex + 1}. {child.module}</td>
                        <td>{child.contract}</td>
                        <td>{child.completed}</td>
                        <td>{child.paid}</td>
                        <td>{child.unpaid}</td>
                        <td>{child.activeOrders}</td>
                        <td>{child.rejected}</td>
                        <td>{child.overdue}</td>
                      </tr>
                    )) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function DashboardSalesReportPage() {
  const [openRows, setOpenRows] = useState(() => ({}));
  const [dateRange, setDateRange] = useState(() => buildAdminDashboardDateRange("Этот год"));
  const datePresets = useMemo(() => (
    ADMIN_DASHBOARD_DATE_PRESET_LABELS.map((label) => ({
      label,
      getRange: () => buildAdminDashboardDateRange(label),
    }))
  ), []);

  function toggleRow(rowId) {
    setOpenRows((current) => ({
      ...current,
      [rowId]: !current[rowId],
    }));
  }

  return (
    <section className="admin-dashboard-transactions-report admin-dashboard-sales-report">
      <div className="org-directory-empty" role="status">Backend источник отчёта продаж не подключён.</div>
      <div className="admin-dashboard-transactions-report__filters">
        <div className="admin-dashboard-transactions-report__date-picker admin-chart-filter-date-picker admin-revenue-range">
          <ReportDateRangePicker
            value={dateRange}
            onChange={(nextRange) => setDateRange(normalizeAdminReportRange(nextRange))}
            buttonClassName="admin-chart-filter admin-chart-filter--date admin-dashboard-transactions-report__date"
            showTime={false}
            presets={datePresets}
            formatButtonLabel={formatAdminDashboardDateRangeButton}
            blockPageScrollOnWheel
            applyPresetOnSelect
            showMenuOk={false}
            leadingIconName="bi-calendar3"
            leadingIconSize={16}
          />
        </div>
        <button className="admin-dashboard-transactions-report__branch" type="button">
          <Icon name="bi-geo-alt" size={16} />
          <span>Филиал недоступен</span>
        </button>
      </div>

      <div className="admin-dashboard-transactions-report__card">
        <div className="admin-dashboard-transactions-report__table-wrap">
          <table className="admin-dashboard-transactions-report__table">
            <thead>
              <tr>
                <th>№</th>
                <th>Сотрудник</th>
                <th>По договору</th>
                <th>Выполненный</th>
                <th>Оплачено</th>
                <th>Не оплачено</th>
                <th>Сумма активных заказов</th>
                <th>Отклонено</th>
                <th>Просроченный долг</th>
              </tr>
            </thead>
            <tbody>
              {[].map((row, index) => {
                const hasChildren = row.children.length > 0;
                const isOpen = Boolean(openRows[row.id]);

                return (
                  <Fragment key={row.id}>
                    <tr className={`is-parent${isOpen ? " is-open" : ""}`}>
                      <td>{index + 1}</td>
                      <td>
                        <span className="admin-dashboard-transactions-report__module">
                          <strong>{row.employee}</strong>
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={() => toggleRow(row.id)}
                              aria-expanded={isOpen}
                              aria-label={`${isOpen ? "Скрыть" : "Показать"} ${row.employee}`}
                            >
                              <span aria-hidden="true" />
                            </button>
                          ) : null}
                        </span>
                      </td>
                      <td>{row.contract}</td>
                      <td>{row.completed}</td>
                      <td>{row.paid}</td>
                      <td>{row.unpaid}</td>
                      <td>{row.activeOrders}</td>
                      <td>{row.rejected}</td>
                      <td>{row.overdue}</td>
                    </tr>
                    {isOpen ? row.children.map((child, childIndex) => (
                      <tr className="is-child" key={child.id}>
                        <td />
                        <td>{childIndex + 1}. {child.employee}</td>
                        <td>{child.contract}</td>
                        <td>{child.completed}</td>
                        <td>{child.paid}</td>
                        <td>{child.unpaid}</td>
                        <td>{child.activeOrders}</td>
                        <td>{child.rejected}</td>
                        <td>{child.overdue}</td>
                      </tr>
                    )) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
