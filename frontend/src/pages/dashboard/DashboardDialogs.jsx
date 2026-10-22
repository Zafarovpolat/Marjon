import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { formatMoney, formatNumber } from "../../api/client";
import { formatDateLabel } from "../../utils/date";
import Icon from "../../components/Icon";
import { useAnchoredDialogMotion } from "../../hooks/useAnchoredDialogMotion";
import "./revenueProducts.css";

// Модальные окна OWNER-дашборда: детализация KPI (с таблицей оплат/мест) и
// складской отчёт. Вынесено из OwnerDashboard.jsx (FE-07B) без изменений разметки.

function formatOrderCount(value) {
  const count = Math.round(Number(value) || 0);
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? "заказ"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "заказа"
      : "заказов";

  return `${formatNumber(count)} ${word}`;
}

function KpiPaymentTable({
  rows = [],
  labelColumn = "Способ оплаты",
  valueColumn = "Выручка",
  shareColumn = "Доля",
  formatValue = formatMoney,
  emptyText = "Нет оплат за выбранный день",
  showShare = true,
}) {
  const hasRows = rows.length > 0;

  return (
    <div className="kpi-payment-report">
      <div className="kpi-payment-report__table-wrap">
        <table className="kpi-payment-report__table">
          <thead>
            <tr>
              <th>{labelColumn}</th>
              <th>{valueColumn}</th>
              {showShare ? <th>{shareColumn}</th> : null}
            </tr>
          </thead>
          <tbody>
            {hasRows ? rows.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{formatValue(row.amount)}</td>
                  {showShare ? <td>
                    <div className="kpi-payment-report__share">
                      <span aria-hidden="true"><i style={{ width: `${Math.max(2, Math.min(100, row.percent))}%` }} /></span>
                      <strong>{row.percent}%</strong>
                    </div>
                  </td> : null}
                </tr>
              )) : (
                <tr>
                  <td className="kpi-payment-report__empty" colSpan={showShare ? 3 : 2}>{emptyText}</td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RevenueProductsTable({ report }) {
  const amounts = report.incomeLast
    ? [["revenue", "Выручка"], ["income", "Денежный приход"]]
    : [["income", "Денежный приход"], ["revenue", "Выручка"]];
  const money = (value) => value == null ? "Неизвестно" : `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(Number(value))} UZS`;
  const quantity = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(Number(value));
  return (
    <div className="revenue-products">
      <div className="revenue-products__scroll" tabIndex={0} role="region" aria-label="Продажи оплаченных блюд">
        <table>
          <thead><tr>
            <th scope="col">№</th><th scope="col">Блюдо / товар</th><th scope="col">Категория</th>
            <th scope="col">Продано</th>{amounts.map(([key, label]) => <th key={key} scope="col">{label}</th>)}
          </tr></thead>
          <tbody>{report.rows.length ? report.rows.map((row, index) => (
            <tr key={row.product_id}>
              <td>{index + 1}</td><td>{row.name}</td><td><span className="revenue-products__category">{row.category}</span></td>
              <td>{quantity(row.quantity)}</td>{amounts.map(([key]) => <td key={key}>{money(row[key])}</td>)}
            </tr>
          )) : <tr><td colSpan={6} className="revenue-products__empty">{report.unavailable
            ? "Не удалось загрузить продажи" : "Нет данных"}</td></tr>}</tbody>
          {!report.unavailable ? <tfoot><tr><th scope="row" colSpan={4}>Итого</th>
            {amounts.map(([key]) => <td key={key}>{money(report[key])}</td>)}</tr></tfoot> : null}
        </table>
      </div>
    </div>
  );
}

function OrdersTable({ report }) {
  const money = value => value == null ? "Неизвестно" : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value))} UZS`;
  const statuses = { completed: "Завершён", ready: "Готов", cancelled: "Отменён",
    new: "В работе", accepted: "В работе", cooking: "В работе", served: "Подан" };
  return <div className="revenue-products owner-orders-report">
    <div className="revenue-products__scroll" tabIndex={0} role="region" aria-label="Таблица заказов">
      <table><thead><tr>{["№ заказа", "Дата и время", "Место", "Сумма", "Статус"].map(label =>
        <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{report.rows.length ? report.rows.map(row => <tr key={row.id}>
          <td>#{row.number || row.id.slice(0, 6)}</td><td>{row.date_label}</td><td>{row.place}</td>
          <td>{money(row.amount)}</td><td><span className={`owner-orders-report__status owner-orders-report__status--${row.status}`}>
            {statuses[row.status] || "Неизвестно"}</span></td>
        </tr>) : <tr><td className="revenue-products__empty" colSpan={5}>
          {report.unavailable ? "Не удалось загрузить заказы" : "Нет данных"}</td></tr>}</tbody>
        {!report.unavailable ? <tfoot><tr><th scope="row" colSpan={3}>Итого</th><td>{money(report.total)}</td><td /></tr></tfoot> : null}
      </table>
    </div>
  </div>;
}

function AverageCheckTable({ report }) {
  const money = value => value == null ? "Неизвестно" : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value))} UZS`;
  const count = value => `${formatNumber(value)} шт`;
  return <div className="revenue-products owner-average-report">
    <div className="revenue-products__scroll" tabIndex={0} role="region" aria-label="Средний чек по местам">
      <table><thead><tr>{["Место", "Оплачено заказов", "Денежный приход", "Средний чек"].map(label =>
        <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{report.rows.length ? report.rows.map(row => <tr key={row.id}>
          <td>{row.place}</td><td>{count(row.orders_count)}</td><td>{money(row.income)}</td><td>{money(row.avg_check)}</td>
        </tr>) : <tr><td className="revenue-products__empty" colSpan={4}>
          {report.unavailable ? "Не удалось загрузить средний чек" : "Нет данных"}</td></tr>}</tbody>
        {!report.unavailable ? <tfoot><tr><th scope="row">Итого</th><td>{count(report.count)}</td>
          <td>{money(report.income)}</td><td>{money(report.average)}</td></tr></tfoot> : null}
      </table>
    </div>
  </div>;
}

export function KpiInfoDialog({ kpi, onClose, sourceRect, returnFocusRef }) {
  const isComingSoon = Boolean(kpi?.comingSoon);
  const hasAverageTable = Boolean(kpi?.averageReport);
  const hasOrdersTable = Boolean(kpi?.orderReport);
  const hasProductTable = Boolean(kpi?.productReport);
  const hasCustomTable = kpi?.table && Array.isArray(kpi.table.rows);
  const hasPlaceTable = !hasCustomTable && Array.isArray(kpi?.placeRows);
  const tableRows = hasPlaceTable ? kpi.placeRows : !hasCustomTable && Array.isArray(kpi?.paymentRows) ? kpi.paymentRows : null;
  const tableProps = hasCustomTable ? kpi.table : hasPlaceTable
    ? {
      rows: tableRows,
      labelColumn: "Место",
      valueColumn: "Заказы",
      formatValue: formatOrderCount,
      emptyText: "Нет заказов за выбранный день",
    }
    : {
      rows: tableRows || [],
    };
  const hasTable = isComingSoon || hasAverageTable || hasOrdersTable || hasProductTable || hasCustomTable || Array.isArray(tableRows);

  const {
    dialogRef,
    motionClassName,
    motionStyle,
    requestClose,
    handleAnimationEnd,
  } = useAnchoredDialogMotion({
    isOpen: Boolean(kpi),
    onClose,
    motionMode: "anchored",
    sourceRect,
    returnFocusRef,
  });

  if (!kpi) return null;
  const valueSuffix = kpi.dialogSuffix ?? kpi.suffix;

  // Portal to <body> so the backdrop is a top-level fixed layer above the whole
  // shell (sidebar + topbar + main); inside .dashboard-main its stacking context
  // trapped the dim below the sidebar, leaving it undimmed.
  const container = document.body;

  return createPortal(
    <div
      className={`kpi-info-backdrop owner-modal-backdrop ${motionClassName}`}
      style={motionStyle}
      role="presentation"
      onMouseDown={requestClose}
      onAnimationEnd={handleAnimationEnd}
    >
      <section
        ref={dialogRef}
        className={`kpi-info-window ${kpi.className} ${hasTable ? "kpi-info-window--payment-table" : ""} ${isComingSoon || hasProductTable || hasOrdersTable || hasAverageTable ? "kpi-info-window--revenue-products" : ""} ${isComingSoon ? "kpi-info-window--coming-soon" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kpi-info-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`kpi-info-window__head ${hasTable ? "kpi-info-window__head--payment-table" : ""}`}>
          {hasTable ? null : <div className="kpi-info-window__icon"><Icon name={kpi.icon} size={20} /></div>}
          <div>
            <span>{kpi.badge}</span>
            <h2 id="kpi-info-title">{kpi.label}</h2>
          </div>
          <button type="button" className="kpi-info-window__close" aria-label="Закрыть" onClick={requestClose}>
            <Icon name="bi-x-lg" size={20} />
          </button>
        </div>

        {!isComingSoon ? <div className="kpi-info-window__value">
          <strong>{kpi.value}</strong>
          {valueSuffix ? <small>{valueSuffix}</small> : null}
        </div> : null}
        {!isComingSoon && ((!hasProductTable && !kpi.hideDescription) || (hasProductTable && (kpi.productReport.unavailable || kpi.productReport.revenue == null)))
          ? <p>{kpi.description}</p> : null}

        {isComingSoon ? <div className="kpi-coming-soon" role="status">Скоро, эта категория в разработке</div> : hasAverageTable ? <AverageCheckTable report={kpi.averageReport} /> : hasOrdersTable ? <OrdersTable report={kpi.orderReport} /> : hasProductTable ? <RevenueProductsTable report={kpi.productReport} /> : hasTable ? (
          <KpiPaymentTable {...tableProps} />
        ) : (
          <div className="kpi-info-window__details">
            {kpi.details.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}

        {hasTable ? null : (
          <div className="kpi-info-window__insight">
            <Icon name="bi-info-circle" size={20} />
            <span>{kpi.insight}</span>
          </div>
        )}
      </section>
    </div>,
    container
  );
}

export function WarehouseReportDialog({ report, selectedDate, onClose }) {
  useEffect(() => {
    if (!report) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [report, onClose]);

  const rows = useMemo(() => report?.rows || [], [report]);

  if (!report) return null;

  const container = document.querySelector(".dashboard-main") || document.body;

  return createPortal(
    <div className="kpi-info-backdrop warehouse-report-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`warehouse-report-window warehouse-report-window--${report.tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="warehouse-report-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="warehouse-report-window__head">
          <div className="warehouse-report-window__icon"><Icon name={report.icon} size={20} /></div>
          <div>
            <span>Складской отчёт</span>
            <h2 id="warehouse-report-title">{report.label}</h2>
          </div>
          <button type="button" className="warehouse-report-window__close" aria-label="Закрыть" onClick={onClose}>
            <Icon name="bi-x-lg" size={20} />
          </button>
        </div>

        <div className="warehouse-report-window__value">
          <strong>{formatNumber(report.value)}</strong>
          <small>UZS</small>
        </div>
        <p>Табличный отчёт по выбранному показателю склада за {formatDateLabel(selectedDate)}.</p>

        <div className="warehouse-report-table-wrap">
          <table className="data-table warehouse-report-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Документ</th>
                <th>Категория / Поставщик</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={`${row.number}-${row.document}`}>
                  <td>{row.number}</td>
                  <td>{row.document}</td>
                  <td>{row.category}</td>
                  <td>{formatMoney(row.amount)}</td>
                  <td><span className={`badge ${row.statusClass}`}>{row.status}</span></td>
                  <td>{row.date}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6}>Нет данных за выбранную дату</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>,
    container
  );
}


