import { describe, expect, it } from "vitest";
import { buildRealKpis } from "./analyticsData";
import { formatRevenueAxisTick } from "./RevenueChart";

const summary = {
  metric_basis: "completed_income_minus_snapshot_cogs", date_from: "2026-10-12", date_to: "2026-10-17",
  income_total: "220.00", cogs_total: "40.00", today_revenue: "180.00", today_orders: 1,
  avg_check: "220.00", active_orders: 3, payment_methods: [{ method: "cash", amount: "220.00" }],
};
const finance = [{ direction: "income", amount: 999999, category_name: "Ручной приход" }, { direction: "expense", amount: 50 }];
const build = (data) => buildRealKpis(data, [], "2026-10-17", [], finance);

describe("OWNER agreed financial scheme", () => {
  it("shows income minus historical COGS without adding Finance again", () => {
    const kpis = build(summary);
    expect(kpis[0].value).toBe("180");
    expect(kpis[0].label).toBe("Выручка за период");
    expect(kpis[3].value).toBe("220");
    expect(kpis[3].table.rows).toEqual([{ name: "Наличные", amount: 220, percent: 100 }]);
    expect(kpis[4].value).toBe("Скоро"); // Finance is not ready for this dashboard card.
    expect(kpis[4].comingSoon).toBe(true);
    expect(kpis[0].table.showShare).toBe(false);
    expect(kpis[0].table.rows.map((r) => r.amount)).toEqual(["220.00", "40.00", "180.00"]);
  });

  it("does not invent profit when historical cost is missing, but keeps known income", () => {
    const kpis = build({ ...summary, today_revenue: null, cogs_total: null });
    expect(kpis[0].value).toBe("Недоступно");
    expect(kpis[3].value).toBe("220");
    expect(kpis[0].table.formatValue(null)).toBe("Неизвестно");
  });

  it("preserves a negative result rather than clamping it to zero", () => {
    const kpis = build({ ...summary, today_revenue: "-180.00", cogs_total: "400.00" });
    expect(kpis[0].value).toMatch(/[-−]180/);
    expect(formatRevenueAxisTick(-50000, true)).toBe("−50K");
    expect(formatRevenueAxisTick(-200, true)).toBe("−200");
    expect(formatRevenueAxisTick(200, true)).toBe("200");
  });

  it("distinguishes a failed financial report from a successful empty period", () => {
    const failed = build({ ...summary, income_total: null, cogs_total: null, today_revenue: null, financial_unavailable: true });
    expect(failed[0].value).toBe("Недоступно");
    expect(failed[3].value).toBe("Недоступно");
    const empty = build({ ...summary, income_total: "0.00", cogs_total: "0.00", today_revenue: "0.00", today_orders: 0, avg_check: 0, payment_methods: [] });
    expect(empty[0].value).toBe("0");
    expect(empty[3].value).toBe("0");
  });
});
