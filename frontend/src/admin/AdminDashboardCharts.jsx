import { useEffect, useMemo, useRef, useState } from "react";

import { Chart, CategoryScale, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip } from "chart.js";

import Icon from '../components/Icon';

import ReportDateRangePicker from "../components/ReportDateRangePicker";

import { adminDateToInputValue, adminInputDateToReportDate, adminReportDateToInputDate, adminTodayInputValue, formatAdminDaysLabel, formatDate, normalizeAdminReportRange, padDate, parseDate } from "./AdminShared";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

export const kpis = [
  {
    title: "Всего организаций",
    value: "0",
    delta: "—",
    icon: "bi-buildings",
    tone: "blue",
    dataKey: "organizations",
    points: [16, 22, 18, 34, 30, 46, 42, 56],
    desc: "Всего подключённых организаций на платформе MARJON, включая активные и на модерации.",
  },
  {
    title: "Оплаченная сумма",
    value: "0",
    delta: "—",
    icon: "bi-cash-coin",
    tone: "green",
    dataKey: "branches",
    points: [18, 24, 32, 28, 42, 48, 51, 60],
    desc: "Филиалы с активной кассой и работающей синхронизацией за выбранный период.",
  },
  {
    title: "Выполненная работа",
    value: "0",
    delta: "—",
    icon: "bi-clipboard-check",
    tone: "violet",
    dataKey: "subscriptions",
    points: [58, 48, 52, 42, 39, 35, 30, 26],
    desc: "Заявки на подключение, изменение тарифа и услуги, ожидающие решения модератора.",
  },
  {
    title: "Оборот за месяц",
    value: "0 UZS",
    delta: "—",
    icon: "bi-graph-up-arrow",
    tone: "orange",
    dataKey: "revenue",
    points: [20, 26, 31, 44, 40, 55, 63, 72],
    desc: "Суммарный оборот всех организаций платформы за текущий месяц в узбекских сумах.",
  },
  {
    title: "Не оплачено",
    value: "0",
    delta: "—",
    icon: "bi-receipt",
    tone: "cyan",
    dataKey: "cashboxes",
    points: [18, 22, 28, 27, 35, 42, 47, 55],
    desc: "Подключённые кассовые рабочие места с активной синхронизацией.",
  },
];

const dashboardKpiOrder = ["revenue", "organizations", "subscriptions", "branches", "cashboxes"];

export function orderDashboardKpis(items) {
  return [...items].sort((a, b) => {
    const firstIndex = dashboardKpiOrder.indexOf(a.dataKey);
    const secondIndex = dashboardKpiOrder.indexOf(b.dataKey);
    return (firstIndex === -1 ? dashboardKpiOrder.length : firstIndex) - (secondIndex === -1 ? dashboardKpiOrder.length : secondIndex);
  });
}

const dashboardWarehouseCards = [
  { title: "Приход товаров", value: "Данные недоступны", subtitle: "Inventory Core отложен", icon: "bi-box-arrow-in-down", tone: "income" },
  { title: "Расход товаров", value: "Данные недоступны", subtitle: "Inventory Core отложен", icon: "bi-box-arrow-up", tone: "expense" },
  { title: "Остаток склада", value: "Данные недоступны", subtitle: "Inventory Core отложен", icon: "bi-boxes", tone: "stock" },
  { title: "Общие затраты", value: "Данные недоступны", subtitle: "Backend источник не подключён", icon: "bi-receipt", tone: "cost" },
  { title: "Кредиторка", value: "Данные недоступны", subtitle: "Backend источник не подключён", icon: "bi-credit-card", tone: "payable" },
  { title: "Дебиторка", value: "Данные недоступны", subtitle: "Backend источник не подключён", icon: "bi-wallet2", tone: "receivable" },
];

const ADMIN_CHART_COLOR = "#1a916f";

const ADMIN_CHART_COLOR_RGB = "26, 145, 111";

const ADMIN_CHART_PRESET_DAYS = [7, 30];

function adminChartPointToMoney(value) {
  return Math.round(Number(value || 0) * 1000000);
}

function formatAdminRawMoney(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("ru-RU").replace(/\u00a0/g, " ")} UZS`;
}

function formatAdminAxisTick(value) {
  if (Number(value) === 0) return "0";
  const millions = Number(value) / 1000000;
  if (millions < 1) return `${Math.round(Number(value) / 1000)}K`;
  return `${Number(millions).toLocaleString("ru-RU", { maximumFractionDigits: 1 }).replace(/\u00a0/g, " ")}M`;
}

function adminChartRangeEndingAt(days, endValue = adminTodayInputValue()) {
  const end = new Date(`${endValue}T00:00:00`);
  const start = new Date(end);
  start.setDate(end.getDate() - Math.max(1, Number(days) || 1) + 1);
  return {
    preset: "",
    start: adminInputDateToReportDate(adminDateToInputValue(start)),
    end: adminInputDateToReportDate(adminDateToInputValue(end)),
    startTime: "00:00",
    endTime: "00:00",
  };
}

function adminChartRangeDays(range) {
  const normalized = normalizeAdminReportRange(range);
  const start = new Date(`${adminReportDateToInputDate(normalized.start)}T00:00:00`);
  const end = new Date(`${adminReportDateToInputDate(normalized.end)}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function getAdminChartDaysBetween(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function buildAdminRangeLabels(range) {
  const start = parseDate(range.start);
  const days = getAdminChartDaysBetween(range.start, range.end);

  return Array.from({ length: days }, (_, day) => {
    const date = new Date(start);
    date.setDate(start.getDate() + day);
    return `${padDate(date.getDate())}.${padDate(date.getMonth() + 1)}`;
  });
}

function buildAdminChartTickLabels(labels) {
  if (labels.length <= 12) {
    return labels.map((label, index) => [index, label]);
  }

  if (labels.length > 31) {
    return labels.reduce((ticks, label, index) => {
      if (index % 5 === 0 || index === labels.length - 1) ticks.push([index, label]);
      return ticks;
    }, []);
  }

  const visibleTickCount = labels.length <= 31 ? 8 : 10;
  const step = (labels.length - 1) / Math.max(1, visibleTickCount - 1);
  const visibleIndexes = new Set();

  for (let index = 0; index < visibleTickCount; index += 1) {
    visibleIndexes.add(Math.round(index * step));
  }

  visibleIndexes.add(0);
  visibleIndexes.add(labels.length - 1);

  return labels.reduce((ticks, label, index) => {
    if (visibleIndexes.has(index)) ticks.push([index, label]);
    return ticks;
  }, []);
}

function emptyAdminChartRangeData(range) {
  const labels = buildAdminRangeLabels(range);
  return {
    value: "Данные недоступны",
    delta: `Backend источник графика не подключён (${range.start} - ${range.end})`,
    points: labels.map(() => 0),
    labels,
    tickLabels: buildAdminChartTickLabels(labels),
    tooltip: { label: range.end, value: "Данные недоступны" },
    tooltipIndex: Math.max(0, labels.length - 1),
    yMax: 1,
    yStep: 0.25,
  };
}

function AdminRevenueChart({ data, segment }) {
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const ctx = canvasRef.current.getContext("2d");
    const tooltipIndex = Math.min(Math.max(data.tooltipIndex ?? data.points.length - 1, 0), data.points.length - 1);
    const labels = data.labels || data.xLabels || [];
    const chartPoints = data.points.map(adminChartPointToMoney);
    const tickLabels = new Map(data.tickLabels || labels.map((label, index) => [index, label]));
    const yMax = data.yMax ? adminChartPointToMoney(data.yMax) : undefined;
    const yStep = data.yStep ? adminChartPointToMoney(data.yStep) : undefined;
    const revealState = { progress: 0, didClip: false };
    const revealDuration = 1200;
    const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);

    const fill = ctx.createLinearGradient(0, 0, 0, 360);
    fill.addColorStop(0, `rgba(${ADMIN_CHART_COLOR_RGB}, 0.28)`);
    fill.addColorStop(0.55, `rgba(${ADMIN_CHART_COLOR_RGB}, 0.10)`);
    fill.addColorStop(1, `rgba(${ADMIN_CHART_COLOR_RGB}, 0)`);

    const revealPlugin = {
      id: "adminRevenueChartReveal",
      beforeDatasetsDraw(chart) {
        const { chartArea } = chart;
        revealState.didClip = false;
        if (!chartArea) return;
        const width = chartArea.width * revealState.progress;
        chart.ctx.save();
        chart.ctx.beginPath();
        chart.ctx.rect(chartArea.left, chartArea.top, width, chartArea.height);
        chart.ctx.clip();
        revealState.didClip = true;
      },
      afterDatasetsDraw(chart) {
        if (revealState.didClip) chart.ctx.restore();
      },
    };
    let revealFrame = 0;

    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: chartPoints,
          borderColor: ADMIN_CHART_COLOR,
          backgroundColor: fill,
          borderWidth: 4,
          pointBorderColor: ADMIN_CHART_COLOR,
          pointBorderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: "#ffffff",
          pointHoverRadius: 7,
          fill: true,
          cubicInterpolationMode: "monotone",
          tension: 0.5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        animation: false,
        animations: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: ({ chart: activeChart, tooltip }) => {
              const tooltipEl = tooltipRef.current;
              if (!tooltipEl) return;

              if (!tooltip || tooltip.opacity === 0) {
                tooltipEl.classList.remove("is-visible");
                return;
              }

              const amountEl = tooltipEl.querySelector(".admin-chart-tooltip__amount");
              const currencyEl = tooltipEl.querySelector(".admin-chart-tooltip__currency");
              const titleEl = tooltipEl.querySelector(".admin-chart-tooltip__date");
              const tooltipValue = tooltip.body?.[0]?.lines?.[0] || "";
              const valueParts = tooltipValue.match(/^(.+?)\s+([A-Z]{3})$/);
              if (amountEl) amountEl.textContent = valueParts?.[1] || tooltipValue;
              if (currencyEl) currencyEl.textContent = valueParts?.[2] || "";
              if (titleEl) titleEl.textContent = tooltip.title?.[0] || "";

              const tooltipHalfWidth = tooltipEl.offsetWidth / 2 || 72;
              const minX = tooltipHalfWidth + 8;
              const maxX = activeChart.width - tooltipHalfWidth - 8;
              const x = Math.min(Math.max(tooltip.caretX, minX), maxX);
              const y = Math.max(tooltip.caretY - 10, 16);

              tooltipEl.style.left = `${activeChart.canvas.offsetLeft + x}px`;
              tooltipEl.style.top = `${activeChart.canvas.offsetTop + y}px`;
              tooltipEl.classList.add("is-visible");
            },
            callbacks: {
              title: (items) => {
                const index = items[0]?.dataIndex ?? tooltipIndex;
                return index === tooltipIndex ? data.tooltip.label : labels[index] || "";
              },
              label: (context) => (
                context.dataIndex === tooltipIndex ? data.tooltip.value : formatAdminRawMoney(context.parsed.y)
              ),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: "#667085",
              font: { size: 12, weight: "600", family: "'Golos Text', Manrope, sans-serif" },
              maxRotation: 0,
              autoSkip: false,
              padding: 10,
              callback: (_value, index) => tickLabels.get(index) || "",
            },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            ...(yMax ? { max: yMax } : {}),
            grid: { color: "rgba(15, 23, 42, 0.09)", drawTicks: false },
            ticks: {
              ...(yStep ? { stepSize: yStep } : {}),
              color: "#667085",
              padding: 8,
              font: { size: 12, weight: "600", family: "'Golos Text', Manrope, sans-serif" },
              callback: (value) => formatAdminAxisTick(value),
            },
            border: { display: false },
          },
        },
      },
      plugins: [revealPlugin],
    });

    const revealStart = performance.now();
    const runReveal = (timestamp) => {
      const elapsed = timestamp - revealStart;
      const progress = Math.min(1, elapsed / revealDuration);
      revealState.progress = easeOutCubic(progress);
      chart.draw();
      if (progress < 1) revealFrame = window.requestAnimationFrame(runReveal);
    };
    revealFrame = window.requestAnimationFrame(runReveal);

    return () => {
      window.cancelAnimationFrame(revealFrame);
      chart.destroy();
    };
  }, [data, segment]);

  return (
    <>
      <canvas ref={canvasRef} />
      <div className="admin-tooltip admin-chart-tooltip" ref={tooltipRef} aria-hidden="true">
        <strong>
          <span className="admin-chart-tooltip__amount" />
          <small className="admin-chart-tooltip__currency" />
        </strong>
        <span className="admin-chart-tooltip__date" />
      </div>
    </>
  );
}

function splitKpiValue(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(.*?)(?:\s+(UZS|USD|RUB))$/i);
  return match
    ? { amount: match[1].trim(), suffix: match[2].toUpperCase() }
    : { amount: text, suffix: "" };
}

export function KpiCard({ item, onClick }) {
  const value = splitKpiValue(item.value);
  const today = new Date();
  const deltaIconName = {
    revenue: "bi-graph-up-arrow",
    organizations: "bi-buildings",
    subscriptions: "bi-clipboard-check",
    branches: "bi-cash-coin",
    cashboxes: "bi-receipt",
  }[item.dataKey] || "bi-check2";

  return (
    <article
      className={`admin-kpi admin-kpi--${item.tone}`}
      role="button"
      tabIndex={0}
      onClick={() => onClick(item)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(item); } }}
    >
      <div className="admin-kpi__top">
        <span><Icon name={item.icon} size={20} /></span>
        <time dateTime={adminDateToInputValue(today)}>{formatDate(today)}</time>
      </div>
      <small className="admin-kpi__title">{item.title}</small>
      <strong>
        <span>{value.amount}</span>
        {value.suffix ? <small>{value.suffix}</small> : null}
      </strong>
      <p>
        <span className="admin-kpi__delta-icon" aria-hidden="true">
          <Icon name={deltaIconName} size={11} />
        </span>
        <span className="admin-kpi__delta-text">{item.delta}</span>
      </p>
    </article>
  );
}

export function PlatformChart({ segment, onSegmentChange }) {
  const [range, setRange] = useState(() => adminChartRangeEndingAt(7));
  const normalizedRange = useMemo(() => normalizeAdminReportRange(range), [range]);
  const data = emptyAdminChartRangeData(normalizedRange);
  const presetOptions = useMemo(() => (
    ADMIN_CHART_PRESET_DAYS.map((days) => ({
      label: `${days} дней`,
      getRange: () => ({ ...adminChartRangeEndingAt(days), preset: `${days} дней` }),
    }))
  ), []);

  function handleRangeChange(nextRange) {
    const next = normalizeAdminReportRange(nextRange);
    const days = adminChartRangeDays(next);
    setRange(next);
    if (days === 7) onSegmentChange("Неделя");
    if (days === 30) onSegmentChange("Месяц");
  }

  return (
    <section className="admin-chart-card">
      <div className="admin-chart-card__head">
        <div>
          <span>Динамика оборота платформы</span>
          <strong>{data.value}</strong>
          <em>{data.delta}</em>
        </div>
        <div className="admin-chart-controls period-switcher owner-revenue-switcher admin-revenue-switcher" aria-label="Период оборота платформы">
          <div className="owner-revenue-range report-actions admin-revenue-range">
            <ReportDateRangePicker
              value={normalizedRange}
              onChange={handleRangeChange}
              buttonClassName="period-dropdown__button owner-revenue-range__button admin-revenue-range__button"
              presets={presetOptions}
              formatButtonLabel={(currentRange) => formatAdminDaysLabel(adminChartRangeDays(currentRange))}
              showDropdownIcon
              showTime={false}
              blockPageScrollOnWheel
            />
          </div>
        </div>
      </div>
      <div className="admin-chart">
        <AdminRevenueChart data={data} segment={segment} />
      </div>
    </section>
  );
}

export function DashboardWarehouseCards({ onOpenSection }) {
  return (
    <aside className="admin-chart-side-cards" aria-label="Сводка склада и затрат">
      {dashboardWarehouseCards.map((item) => {
        const className = `admin-chart-side-card admin-chart-side-card--${item.tone}`;
        const value = splitKpiValue(item.value);
        const content = (
          <>
            <span className="admin-chart-side-card__icon">
              <Icon name={item.icon} size={30} />
            </span>
            <span className="admin-chart-side-card__body">
              <strong>{item.title}</strong>
              <span className="admin-chart-side-card__value">
                <span>{value.amount}</span>
                {value.suffix ? <small>{value.suffix}</small> : null}
              </span>
            </span>
            <span className="admin-chart-side-card__chevron" aria-hidden="true">
              <Icon name="bi-chevron-right" size={21} />
            </span>
          </>
        );

        return item.route ? (
          <button className={className} type="button" onClick={() => onOpenSection?.(item.route)} key={item.title}>
            {content}
          </button>
        ) : (
          <article className={className} key={item.title}>
            {content}
          </article>
        );
      })}
    </aside>
  );
}
