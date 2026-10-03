import { useEffect, useRef } from "react";
import { Chart, Filler, LineController, LineElement, LinearScale, PointElement, CategoryScale, Tooltip } from "chart.js";
import { formatNumber } from "../../api/client";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

// График выручки OWNER-дашборда (Chart.js) с плагином постепенного раскрытия
// и внешним тултипом. Вынесено из OwnerDashboard.jsx (FE-07B) 1:1.

function formatAxisValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  const normalized = Math.abs(number) < 1 ? 0 : number;
  return normalized.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

// Display labels for the left Y-axis neutral range (V3.1 contract).
export const REVENUE_AXIS_MILLION_LABELS = {
  200: "1M",
  400: "5M",
  600: "10M",
  800: "20M",
  1000: "30M",
};

export function formatRevenueAxisTick(value, hasRevenue) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0";
  if (amount in REVENUE_AXIS_MILLION_LABELS) return REVENUE_AXIS_MILLION_LABELS[amount];
  if (amount <= 0) return "0";
  if (!hasRevenue) return formatAxisValue(amount);
  if (amount >= 1_000_000_000) return `${formatAxisValue(amount / 1_000_000_000)}B`;
  if (amount >= 1_000_000) return `${formatAxisValue(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `${formatAxisValue(amount / 1_000)}K`;
  return formatNumber(amount);
}

// Tooltip always shows the full sum ("3 000 000 UZS"), never a shortened tick.
export function formatChartTooltipValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0 UZS";
  return `${number.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} UZS`;
}

function formatSalesLabel(item) {
  if (item && typeof item.chartLabel === "string" && item.chartLabel) return item.chartLabel;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(new Date(item.date));
}

export default function RevenueChart({ sales }) {
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const ctx = canvasRef.current.getContext("2d");
    const revealState = { progress: 0, didClip: false };
    const revealDuration = 1200;
    const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
    const revealPlugin = {
      id: "revenueChartReveal",
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
    const gradient = ctx.createLinearGradient(0, 0, 0, 360);
    gradient.addColorStop(0, "rgba(29, 181, 181, 0.28)");
    gradient.addColorStop(0.55, "rgba(31, 202, 194, 0.10)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    const revenueValues = sales.map((item) => Number(item.revenue || 0));
    const maxRevenue = Math.max(0, ...revenueValues);
    const hasRevenue = maxRevenue > 0;

    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: sales.map((item) => formatSalesLabel(item)),
        datasets: [{
          data: revenueValues,
          borderColor: "#1db5b5",
          backgroundColor: gradient,
          borderWidth: 4,
          pointBackgroundColor: "#FFFFFF",
          pointBorderColor: "#1db5b5",
          pointBorderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.42,
        }],
      },
      options: {
        // Single controlled resize owner (V3.4): native responsive is OFF,
        // one ResizeObserver on .chart-wrap + one RAF drive chart.resize().
        responsive: false,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        animation: false,
        animations: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: ({ chart, tooltip }) => {
              const tooltipEl = tooltipRef.current;
              if (!tooltipEl) return;

              if (!tooltip || tooltip.opacity === 0) {
                tooltipEl.classList.remove("is-visible");
                return;
              }

              const titleEl = tooltipEl.querySelector("strong");
              const valueEl = tooltipEl.querySelector("span");
              if (titleEl) titleEl.textContent = tooltip.title?.[0] || "";
              if (valueEl) valueEl.textContent = tooltip.body?.[0]?.lines?.[0] || "";

              const tooltipHalfWidth = tooltipEl.offsetWidth / 2 || 72;
              const minX = tooltipHalfWidth + 8;
              const maxX = chart.width - tooltipHalfWidth - 8;
              const x = Math.min(Math.max(tooltip.caretX, minX), maxX);
              const y = Math.max(tooltip.caretY - 10, 16);

              tooltipEl.style.left = `${chart.canvas.offsetLeft + x}px`;
              tooltipEl.style.top = `${chart.canvas.offsetTop + y}px`;
              tooltipEl.classList.add("is-visible");
            },
            callbacks: { label: (context) => formatChartTooltipValue(context.parsed.y) },
          },
        },
        // REVENUE_CHART_SCALES
        scales: {
          x: { grid: { display: false }, ticks: { color: "#667085", font: { size: 13, weight: "600", family: "'Golos Text', Manrope, sans-serif" } }, border: { display: false } },
          y: {
            beginAtZero: true,
            suggestedMax: hasRevenue ? undefined : 1000,
            grid: { color: "rgba(16, 24, 40, 0.08)", drawTicks: false },
            ticks: {
              color: "#667085",
              font: { size: 13, weight: "600", family: "'Golos Text', Manrope, sans-serif" },
              maxTicksLimit: 6,
              precision: 0,
              callback: (value) => formatRevenueAxisTick(value, hasRevenue),
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

    // Right-endpoint lock (V3.6.1): the stage is right-anchored, so every
    // stage resize moves its LEFT edge only — rightmost point, last tick and
    // right boundary stay fixed. The observer stores the latest integer size
    // and at most one RAF applies it immediately (old natural left-side
    // motion). No timers, no snap, no data touch, no remount.
    const wrapBox = canvasRef.current.closest(".chart-wrap") || canvasRef.current.parentElement;
    const stageBox = canvasRef.current.parentElement;
    const appliedSize = { width: 0, height: 0 };
    const applyStageSize = (size) => {
      if (size.width <= 0 || size.height <= 0) return;
      if (size.width === appliedSize.width && size.height === appliedSize.height) return;
      appliedSize.width = size.width;
      appliedSize.height = size.height;
      stageBox.style.width = `${size.width}px`;
      canvasRef.current.style.width = `${size.width}px`;
      canvasRef.current.style.height = `${size.height}px`;
      chart.resize(size.width, size.height);
    };
    const wrapRect = wrapBox.getBoundingClientRect();
    applyStageSize({ width: Math.round(wrapRect.width), height: Math.round(wrapRect.height) });

    let motionRaf = 0;
    let latestSize = null;
    let sizeObserver = null;
    if (typeof window.ResizeObserver !== "undefined") {
      sizeObserver = new window.ResizeObserver((entries) => {
        const last = entries[entries.length - 1];
        latestSize = {
          width: Math.round(last.contentRect.width),
          height: Math.round(last.contentRect.height),
        };
        if (motionRaf) return;
        motionRaf = window.requestAnimationFrame(() => {
          motionRaf = 0;
          const size = latestSize;
          latestSize = null;
          if (!size) return;
          applyStageSize(size);
        });
      });
      sizeObserver.observe(wrapBox);
    }

    return () => {
      window.cancelAnimationFrame(revealFrame);
      if (motionRaf) window.cancelAnimationFrame(motionRaf);
      if (sizeObserver) sizeObserver.disconnect();
      chart.destroy();
    };

  }, [sales]);

  return (
    <div className="revenue-chart-stage">
      <canvas ref={canvasRef} id="ownerRevenueChart" />
      <div className="owner-revenue-tooltip" ref={tooltipRef} aria-hidden="true">
        <strong />
        <span />
      </div>
    </div>
  );
}
