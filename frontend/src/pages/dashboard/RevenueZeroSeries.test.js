import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildZeroRevenueBuckets } from "./analyticsData";
import {
  REVENUE_AXIS_MILLION_LABELS,
  formatChartTooltipValue,
  formatRevenueAxisTick,
} from "./RevenueChart";

vi.mock("../../api/client", () => ({
  formatMoney: (value) => `${Number(value || 0)} UZS`,
  formatNumber: (value) => String(Number(value || 0)),
}));

// Display-only zero buckets for the Revenue Analytics no-data state.
// Every value must be exactly 0 — this is "no sales in these buckets",
// never fabricated revenue.

describe("buildZeroRevenueBuckets", () => {
  it("builds 8 intraday buckets with time labels for a single day", () => {
    const buckets = buildZeroRevenueBuckets("2026-10-03", "2026-10-03");

    expect(buckets).toHaveLength(8);
    expect(buckets.map((b) => b.chartLabel)).toEqual([
      "00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00",
    ]);
    for (const bucket of buckets) {
      expect(bucket.revenue).toBe(0);
      expect(bucket.orders_count).toBe(0);
      expect(bucket.avg_check).toBe(0);
      expect(bucket.isDisplayOnly).toBe(true);
      expect(bucket.date.startsWith("2026-10-03T")).toBe(true);
    }
  });

  it("builds one zero bucket per date for a multi-day range", () => {
    const buckets = buildZeroRevenueBuckets("2026-09-26", "2026-10-02");

    expect(buckets).toHaveLength(7);
    expect(buckets.map((b) => b.date)).toEqual([
      "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29",
      "2026-09-30", "2026-10-01", "2026-10-02",
    ]);
    for (const bucket of buckets) {
      expect(bucket.revenue).toBe(0);
      expect(bucket.isDisplayOnly).toBe(true);
    }
    // Multi-day buckets use the real chart date formatting (no override).
    expect(buckets.every((b) => b.chartLabel === undefined)).toBe(true);
  });

  it("never fabricates revenue and falls back safely on invalid input", () => {
    for (const buckets of [
      buildZeroRevenueBuckets("bad", "2026-10-02"),
      buildZeroRevenueBuckets(undefined, undefined),
      buildZeroRevenueBuckets("2026-10-03", "2026-10-02"),
    ]) {
      expect(buckets.length).toBeGreaterThan(0);
      expect(buckets.every((b) => Number(b.revenue) === 0)).toBe(true);
    }
  });
});

describe("V3.1 chart formatting (line design untouched)", () => {
  it("maps the neutral Y-axis range to million labels", () => {
    expect(REVENUE_AXIS_MILLION_LABELS).toEqual({
      200: "1M",
      400: "5M",
      600: "10M",
      800: "20M",
      1000: "30M",
    });
    expect(formatRevenueAxisTick(200, false)).toBe("1M");
    expect(formatRevenueAxisTick(400, false)).toBe("5M");
    expect(formatRevenueAxisTick(600, false)).toBe("10M");
    expect(formatRevenueAxisTick(800, false)).toBe("20M");
    expect(formatRevenueAxisTick(1000, false)).toBe("30M");
    expect(formatRevenueAxisTick(0, false)).toBe("0");
    // Real-data formatting stays intact outside the mapped range.
    expect(formatRevenueAxisTick(3_000_000, true)).toBe("3M");
  });

  it("shows full UZS sums in the tooltip, never shortened ticks", () => {
    // NBSP-tolerant: ru-RU grouping may use non-breaking spaces.
    expect(formatChartTooltipValue(3_000_000)).toMatch(/3\D000\D000\DUZS/);
    expect(formatChartTooltipValue(3_000_000)).not.toContain("3M");
    expect(formatChartTooltipValue(0)).toMatch(/0\DUZS/);
    expect(formatChartTooltipValue("bad")).toMatch(/0\DUZS/);
  });

  it("renders axis labels slightly larger without changing weight or family", () => {
    const source = readFileSync(`${process.cwd()}/src/pages/dashboard/RevenueChart.jsx`, "utf8");
    const largeFonts = source.match(/font:\s*\{\s*size:\s*13,/g) || [];
    expect(largeFonts).toHaveLength(2);
    expect(source).toContain("weight: \"600\"");
    expect(source).toContain("'Golos Text', Manrope, sans-serif");
  });

  it("keeps the chart line design with a right-anchored single resize owner", () => {
    const source = readFileSync(`${process.cwd()}/src/pages/dashboard/RevenueChart.jsx`, "utf8");
    // Line visual design frozen.
    expect(source).toContain('borderColor: "#1db5b5"');
    expect(source).toContain("borderWidth: 4");
    expect(source).toContain("tension: 0.42");
    // V3.6.1: native responsive OFF, one controlled path.
    expect(source).toMatch(/responsive:\s*false/);
    expect(source).not.toMatch(/responsive:\s*true/);
    expect(source).toMatch(/maintainAspectRatio:\s*false/);
    expect(source).toContain("animation: false");
    // Right-anchored stage: canvas wrapped, stage sized explicitly.
    expect(source).toContain('className="revenue-chart-stage"');
    expect(source).toContain('closest(".chart-wrap")');
    expect(source).toContain("new window.ResizeObserver");
    // Left-side live motion: at most one RAF applies the latest integer size.
    expect(source).toContain("motionRaf");
    expect(source).toContain("if (motionRaf) return;");
    expect(source).toContain("latestSize");
    expect(source).toContain("Math.round(last.contentRect.width)");
    expect(source).toContain("if (size.width === appliedSize.width && size.height === appliedSize.height) return;");
    // Stage grows leftward; right edge never moves.
    expect(source).toContain("stageBox.style.width");
    // Only layout resize: explicit dimensions, no data touch.
    expect(source).toContain("chart.resize(size.width, size.height)");
    // Banned: stability gate, terminal resize, delays, debounce, native responsive.
    expect(source).not.toContain("STABLE_FRAMES");
    expect(source).not.toContain("stabilityTick");
    expect(source).not.toContain("transitionend");
    expect(source).not.toMatch(/resizeDelay/);
    expect(source).not.toMatch(/setTimeout/);
    // One mounted instance: stable effect deps, canvas never keyed.
    expect(source).toMatch(/\}, \[sales\]\);/);
    expect(source).not.toMatch(/<canvas[^>]*key=/);
  });

  it("anchors the chart stage right with wrapper clipping (scoped CSS only)", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    const stageRule = css.match(/premium-chart \.revenue-chart-stage\s*\{[^}]*\}/s)?.[0] || "";
    expect(stageRule).toMatch(/position:\s*absolute/);
    expect(stageRule).toMatch(/right:\s*0/);
    const wrapClip = css.match(/premium-chart \.chart-wrap\s*\{[^}]*overflow:\s*hidden[^}]*\}/s);
    expect(wrapClip).not.toBeNull();
    expect(css).not.toContain("!important");
  });

  it("keeps the inner chart field square while the outer card stays rounded", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    const innerRule = css.match(/premium-chart \.chart-wrap\s*\{[^}]*border-radius:\s*0[^}]*\}/s);
    expect(innerRule).not.toBeNull();
  });
});
