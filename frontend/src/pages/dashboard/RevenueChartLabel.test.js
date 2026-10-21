import { describe, expect, it } from "vitest";
import { formatSalesLabel, formatSalesTooltipLabel, revenueTooltipPosition } from "./RevenueChart";

// Метки оси графика выручки: приоритет camelCase (нулевые часовые бакеты),
// затем snake_case API (почасовые бакеты /analytics/sales), затем дата.
describe("formatSalesLabel", () => {
  it("prefers chartLabel when present", () => {
    expect(formatSalesLabel({ date: "2026-10-16", chartLabel: "09:00", revenue: 1 })).toBe("09:00");
  });

  it("reads hourly chart_label from the sales API", () => {
    expect(formatSalesLabel({ date: "2026-10-16", chart_label: "15:00", revenue: 1 })).toBe("15:00");
  });

  it("keeps the backend's already-local 17:00 bucket unchanged", () => {
    expect(formatSalesLabel({ date: "2026-10-17", chart_label: "17:00", revenue: 69440 })).toBe("17:00");
  });

  it("falls back to DD.MM for daily buckets without a label", () => {
    expect(formatSalesLabel({ date: "2026-10-16", revenue: 1 })).toBe("16.10");
  });
});

describe("revenue tooltip bounds", () => {
  const dimensions = { width: 800, height: 316, tooltipWidth: 160, tooltipHeight: 80 };

  it("keeps high-peak tooltips above instead of switching below", () => {
    expect(revenueTooltipPosition({ ...dimensions, caretX: 400, caretY: 20 })).toEqual({ x: 400, y: 8 });
  });

  it("keeps the tooltip above ordinary points", () => {
    expect(revenueTooltipPosition({ ...dimensions, caretX: 400, caretY: 200 })).toEqual({ x: 400, y: 110 });
  });

  it.each([[0, 88], [800, 712]])("clamps the horizontal position at caret %s", (caretX, x) => {
    expect(revenueTooltipPosition({ ...dimensions, caretX, caretY: 20 }).x).toBe(x);
  });

  it("contains a large tooltip even when there is insufficient room on either side vertically", () => {
    const result = revenueTooltipPosition({ ...dimensions, height: 160, tooltipHeight: 120, caretX: 400, caretY: 70 });
    expect(result.y).toBe(8);
    expect(result.y + 120).toBeLessThanOrEqual(152);
  });
});

it("shows the actual hourly interval without shifting sales into the previous hour", () => {
  expect(formatSalesTooltipLabel({ chart_label: "08:00" })).toBe("08:00 – 09:00");
  expect(formatSalesTooltipLabel({ chart_label: "09:00" })).toBe("09:00 – 10:00");
  expect(formatSalesTooltipLabel({ chart_label: "23:00" })).toBe("23:00 – 24:00");
  expect(formatSalesTooltipLabel({ date: "2026-10-21" })).toBe("21.10");
});
