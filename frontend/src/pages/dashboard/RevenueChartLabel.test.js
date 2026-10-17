import { describe, expect, it } from "vitest";
import { formatSalesLabel } from "./RevenueChart";

// Метки оси графика выручки: приоритет camelCase (нулевые часовые бакеты),
// затем snake_case API (почасовые бакеты /analytics/sales), затем дата.
describe("formatSalesLabel", () => {
  it("prefers chartLabel when present", () => {
    expect(formatSalesLabel({ date: "2026-10-16", chartLabel: "09:00", revenue: 1 })).toBe("09:00");
  });

  it("reads hourly chart_label from the sales API", () => {
    expect(formatSalesLabel({ date: "2026-10-16", chart_label: "15:00", revenue: 1 })).toBe("15:00");
  });

  it("falls back to DD.MM for daily buckets without a label", () => {
    expect(formatSalesLabel({ date: "2026-10-16", revenue: 1 })).toBe("16.10");
  });
});
