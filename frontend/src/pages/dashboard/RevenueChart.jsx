import { useEffect, useRef } from "react";
import { Chart, Filler, LineController, LineElement, LinearScale, PointElement, CategoryScale, Tooltip } from "chart.js";
import { formatMoney, formatNumber } from "../../api/client";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

// График выручки OWNER-дашборда (Chart.js) с плагином постепенного раскрытия
// и внешним тултипом. Вынесено из OwnerDashboard.jsx (FE-07B) 1:1.

function formatAxisValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  const normalized = Math.abs(number) < 1 ? 0 : number;
  return normalized.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function formatRevenueAxisTick(value, hasRevenue) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  if (!hasRevenue) return "";
  if (amount >= 1_000_000_000) return `${formatAxisValue(amount / 1_000_000_000)}B`;
  if (amount >= 1_000_000) return `${formatAxisValue(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `${formatAxisValue(amount / 1_000)}K`;
  return formatNumber(amount);
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
        labels: sales.map((item) => new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(new Date(item.date))),
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
        responsive: true,
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
            callbacks: { label: (context) => formatMoney(context.parsed.y) },
          },
        },
        // REVENUE_CHART_SCALES
        scales: {
          x: { grid: { display: false }, ticks: { color: "#667085", font: { size: 12, weight: "600", family: "'Golos Text', Manrope, sans-serif" } }, border: { display: false } },
          y: {
            beginAtZero: true,
            suggestedMax: hasRevenue ? undefined : 1,
            grid: { color: "rgba(16, 24, 40, 0.08)", drawTicks: false },
            ticks: {
              color: "#667085",
              font: { size: 12, weight: "600", family: "'Golos Text', Manrope, sans-serif" },
              maxTicksLimit: hasRevenue ? 6 : 2,
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

    return () => {
      window.cancelAnimationFrame(revealFrame);
      chart.destroy();
    };

  }, [sales]);

  return (
    <>
      <canvas ref={canvasRef} id="ownerRevenueChart" />
      <div className="owner-revenue-tooltip" ref={tooltipRef} aria-hidden="true">
        <strong />
        <span />
      </div>
    </>
  );
}
