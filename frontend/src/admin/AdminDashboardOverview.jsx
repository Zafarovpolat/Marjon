import { useEffect, useMemo, useState } from "react";

import Icon from '../components/Icon';

import ReportDateRangePicker from "../components/ReportDateRangePicker";

import { hqService } from "./hqService";

import { isAbortError, useLatestRequest } from "../hooks/useAsyncSafety";

import { ADMIN_DASHBOARD_DATE_PRESET_LABELS, StatusBadge, buildAdminDashboardDateRange, formatAdminDashboardDateRangeButton, normalizeAdminReportRange } from "./AdminShared";

import { DashboardWarehouseCards, KpiCard, PlatformChart, kpis, orderDashboardKpis } from "./AdminDashboardCharts";

import { DashboardSalesReportPage, DashboardTransactionsReportPage, TransactionsTable } from "./AdminDashboardTransactions";

export function AdminDashboardContainer({ approvals, isActive, onApprovalClick, onInnerBackChange, onNavigate, onNotify, onOpenDetail }) {
  const [segment, setSegment] = useState("Месяц");
  const [organizations, setOrganizations] = useState([]);
  const [dashKpis, setDashKpis] = useState([]);
  const [dashboardLoadState, setDashboardLoadState] = useState("loading");
  const [dashboardView, setDashboardView] = useState(null);
  const beginOrganizationsRequest = useLatestRequest();
  const beginKpisRequest = useLatestRequest();

  useEffect(() => {
    const organizationsRequest = beginOrganizationsRequest();
    const kpisRequest = beginKpisRequest();
    hqService.listOrganizations({ size: 5 }, { signal: organizationsRequest.signal })
      .then(({ data }) => {
        if (!organizationsRequest.isCurrent()) return;
        const items = Array.isArray(data) ? data : data?.items || [];
        if (items.length) {
          setOrganizations(items.map((row) => [
            row.company_name || row.name || "", row.type || "Ресторан",
            String(row.branches_count || 0), row.admin_name || row.owner_name || "—",
            row.created_at || "—", row.status || "Активна",
          ]));
        }
      })
      .catch(() => {});
    hqService.getDashboardKpis({ signal: kpisRequest.signal })
      .then(({ data }) => {
        if (!kpisRequest.isCurrent()) return;
        if (!data || typeof data !== "object") {
          setDashKpis([]);
          setDashboardLoadState("empty");
          return;
        }
        setDashKpis(orderDashboardKpis(kpis.map((kpi) => {
          const value = data[kpi.dataKey];
          return {
            ...kpi,
            value: value == null ? "Данные недоступны" : (typeof value === "number" ? value.toLocaleString("ru-RU") : String(value)),
            delta: value == null ? "Backend не вернул показатель" : kpi.delta,
          };
        })));
        setDashboardLoadState("success");
      })
      .catch((error) => {
        if (!kpisRequest.isCurrent() || isAbortError(error)) return;
        setDashKpis([]);
        setDashboardLoadState("error");
      });
  }, [beginKpisRequest, beginOrganizationsRequest]);

  useEffect(() => {
    if (!isActive) {
      if (dashboardView) setDashboardView(null);
      return undefined;
    }
    if (!dashboardView) {
      onInnerBackChange(null);
      return undefined;
    }
    onInnerBackChange(() => setDashboardView(null));
    return () => onInnerBackChange(null);
  }, [dashboardView, isActive, onInnerBackChange]);

  const openKpiDetail = (item) => {
    if (item?.dataKey === "organizations") {
      onNavigate("org-list");
      return;
    }
    onOpenDetail({
      title: item.title,
      subtitle: "Ключевой показатель платформы",
      fields: [
        { label: "Текущее значение", value: item.value },
        { label: "Динамика", value: item.delta },
        { label: "Описание", value: item.desc },
      ],
    });
  };

  const openOrgDetail = (row) => onOpenDetail({
    title: row[0],
    subtitle: row[1],
    status: row[5],
    fields: [
      { label: "Тип", value: row[1] },
      { label: "Филиалов", value: row[2] },
      { label: "Администратор", value: row[3] },
      { label: "Дата регистрации", value: row[4] },
      { label: "Статус", value: row[5] },
    ],
    actions: [
      { label: "Сменить статус", variant: "primary", onClick: () => { onNotify("Изменение статуса недоступно: backend mutation contract не подключён."); onOpenDetail(null); } },
      { label: "Закрыть", variant: "ghost", onClick: () => onOpenDetail(null) },
    ],
  });

  const openSystemDetail = (item) => onOpenDetail({
    title: item[0],
    subtitle: "Состояние подсистемы",
    fields: [
      { label: "Компонент", value: item[0] },
      { label: "Состояние", value: item[1] },
      { label: "Аптайм за 30 дней", value: "99.98%" },
    ],
  });

  const downloadCsv = (filename, rows) => {
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isActive) return null;

  return (
    <DashboardPage
      segment={segment}
      onSegmentChange={setSegment}
      organizationRows={organizations}
      approvals={approvals}
      dashKpis={dashKpis}
      dashboardLoadState={dashboardLoadState}
      onExport={() => downloadCsv("marjon-organizations.csv", [["Организация", "Тип", "Филиалов", "Админ", "Дата регистрации", "Статус"], ...organizations])}
      onRowAction={() => onNotify("Изменение статуса недоступно: backend mutation contract не подключён.")}
      onApprovalAction={() => onNotify("Обработка заявки недоступна: backend mutation contract не подключён.")}
      onShowApprovals={() => onNotify(`Показаны все заявки: ${approvals.length}.`)}
      onKpiClick={openKpiDetail}
      onOrgClick={openOrgDetail}
      onApprovalClick={onApprovalClick}
      onSystemClick={openSystemDetail}
      dashboardView={dashboardView}
      onOpenTransactions={() => setDashboardView("transactions")}
      onOpenSales={() => setDashboardView("sales")}
      onOpenSection={onNavigate}
      onNotify={onNotify}
    />
  );
}

export function DashboardPage({ segment, onSegmentChange, organizationRows, approvals, dashKpis, dashboardLoadState, onExport, onRowAction, onApprovalAction, onShowApprovals, onKpiClick, onOrgClick, onApprovalClick, onSystemClick, dashboardView, onOpenTransactions, onOpenSales, onOpenSection, onNotify }) {
  if (dashboardView === "transactions") {
    return <DashboardTransactionsReportPage />;
  }
  if (dashboardView === "sales") {
    return <DashboardSalesReportPage />;
  }

  const displayKpis = dashKpis || [];
  return (
    <>
      {dashboardLoadState === "loading" ? <div className="org-directory-empty" role="status">Загрузка показателей...</div> : null}
      {dashboardLoadState === "error" ? <div className="org-directory-empty" role="alert">Не удалось загрузить показатели платформы.</div> : null}
      {dashboardLoadState === "success" ? (
        <section className="admin-kpi-grid">
          {displayKpis.map((item) => <KpiCard item={item} key={item.title} onClick={onKpiClick} />)}
        </section>
      ) : null}
      <div className="admin-dashboard-grid admin-dashboard-grid--chart-summary">
        <main className="admin-center">
          <DashboardChartFilterBar onOpenTransactions={onOpenTransactions} onOpenSales={onOpenSales} />
          <PlatformChart segment={segment} onSegmentChange={onSegmentChange} />
        </main>
        <DashboardWarehouseCards onOpenSection={onOpenSection} />
      </div>
      <TransactionsTable onNotify={onNotify} />
    </>
  );
}

function DashboardChartFilterBar({ onOpenTransactions, onOpenSales }) {
  const [dateRange, setDateRange] = useState(() => buildAdminDashboardDateRange("Этот месяц"));
  const datePresets = useMemo(() => (
    ADMIN_DASHBOARD_DATE_PRESET_LABELS.map((label) => ({
      label,
      getRange: () => buildAdminDashboardDateRange(label),
    }))
  ), []);

  return (
    <div className="admin-chart-filter-bar" aria-label="Фильтры графика">
      <div className="admin-chart-filter-date-picker admin-revenue-range">
        <ReportDateRangePicker
          value={dateRange}
          onChange={(nextRange) => setDateRange(normalizeAdminReportRange(nextRange))}
          buttonClassName="admin-chart-filter admin-chart-filter--date"
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
      <button className="admin-chart-filter admin-chart-filter--with-icon" type="button" onClick={onOpenSales}>
        <Icon name="bi-tags" size={16} />
        <span>Продажи</span>
      </button>
      <button className="admin-chart-filter admin-chart-filter--with-icon" type="button" onClick={onOpenTransactions}>
        <Icon name="bi-receipt" size={16} />
        <span>Транзакции</span>
      </button>
      <button className="admin-chart-filter admin-chart-filter--install admin-chart-filter--with-icon" type="button" disabled>
        <Icon name="bi-pc-display" size={16} />
        <span>Дата установки недоступна</span>
      </button>
      <button className="admin-chart-filter admin-chart-filter--with-icon" type="button">
        <Icon name="bi-graph-up" size={16} />
        <span>Аналитика</span>
      </button>
    </div>
  );
}

export function DetailModal({ data, onClose }) {
  useEffect(() => {
    function onKey(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!data) return null;
  const actions = data.actions && data.actions.length
    ? data.actions
    : [{ label: "Закрыть", variant: "ghost", onClick: onClose }];

  return (
    <div className="admin-modal" role="dialog" aria-modal="true" aria-label={data.title} onClick={onClose}>
      <div className="admin-modal__panel" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal__head">
          <div>
            <h3>{data.title}</h3>
            {data.subtitle ? <p>{data.subtitle}</p> : null}
          </div>
          {data.status ? <StatusBadge status={data.status} /> : null}
          <button className="admin-modal__close" type="button" onClick={onClose} aria-label="Закрыть">
            <Icon name="bi-x-lg" size={18} />
          </button>
        </div>
        <dl className="admin-modal__fields">
          {data.fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
        <div className="admin-modal__actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`admin-modal__btn ${action.variant === "ghost" ? "is-ghost" : "is-primary"}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
