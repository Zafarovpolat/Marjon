import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildRealKpis } from "./analyticsData";
import { TopSalesCard, RecentOrdersCard } from "./DashboardCards";

// OWNER dashboard EMPTY-content stage: a healthy new company (success + empty)
// must render an intentional empty state — never a fake product/order row and
// never a fabricated day-over-day comparison. FULL rendering stays intact.

vi.mock("../../api/client", () => ({
  formatMoney: (value) => `${Number(value).toLocaleString("ru-RU")} UZS`,
  formatNumber: (value) => Number(value).toLocaleString("ru-RU"),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
}));

describe("OWNER dashboard empty content", () => {
  it("renders Top-5 sales empty state without a fake product row", () => {
    render(<TopSalesCard dishes={[]} />);

    expect(screen.getByText("Продаж пока нет")).toBeInTheDocument();
    expect(screen.getByText("После первых заказов здесь появятся самые продаваемые позиции.")).toBeInTheDocument();
    expect(screen.queryByText("Нет продаж за выбранную дату")).not.toBeInTheDocument();
    expect(screen.queryByText("0 шт")).not.toBeInTheDocument();
    expect(screen.queryByText("0 UZS")).not.toBeInTheDocument();
  });

  it("keeps real Top-5 rows when sales exist (FULL preserved)", () => {
    render(<TopSalesCard dishes={[{ product_id: "p1", name: "Backend dish", quantity: 3, revenue: 180000 }]} />);

    expect(screen.getByText("Backend dish")).toBeInTheDocument();
    expect(screen.getByText("3 шт")).toBeInTheDocument();
    expect(screen.queryByText("Продаж пока нет")).not.toBeInTheDocument();
  });

  it("renders Last Orders empty state without a fake order row", () => {
    render(<RecentOrdersCard orders={[]} />);

    expect(screen.getByText("Заказов пока нет")).toBeInTheDocument();
    expect(screen.getByText("Новые заказы будут отображаться здесь.")).toBeInTheDocument();
    expect(screen.queryByText("Нет заказов за выбранную дату")).not.toBeInTheDocument();
    expect(screen.queryByText("0 UZS")).not.toBeInTheDocument();
  });

  it("keeps real order rows when orders exist (FULL preserved)", () => {
    render(<RecentOrdersCard orders={[{ id: "#42", date: "12.08 10:00", place: "Стол 7", amount: "900 UZS", status: "Готов", ready: true }]} />);

    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("900 UZS")).toBeInTheDocument();
    expect(screen.queryByText("Заказов пока нет")).not.toBeInTheDocument();
  });

  it("does not fabricate a day-over-day comparison without sales history", () => {
    const kpis = buildRealKpis({ today_revenue: 0, today_orders: 0, avg_check: 0 }, [], "2026-08-12");
    const notes = Object.fromEntries(kpis.map((kpi) => [kpi.label, kpi.note]));

    expect(notes["Выручка за день"]).toBe("Нет данных для сравнения");
    expect(notes["Заказов"]).toBe("Заказов пока нет");
    expect(notes["Средний чек"]).toBe("Появится после первых заказов");
    expect(notes["Выручка за день"]).not.toMatch(/к вчерашнему дню/);

    const revenueInsight = kpis.find((kpi) => kpi.label === "Выручка за день").insight;
    expect(revenueInsight).toBe("Пока нет данных за предыдущий день для сравнения.");
    expect(revenueInsight).not.toMatch(/Темп/);
  });

  it("keeps the real comparison when sales history exists", () => {
    const sales = [
      { revenue: 800, orders_count: 2, avg_check: 400 },
      { revenue: 1000, orders_count: 3, avg_check: 500 },
    ];
    const kpis = buildRealKpis({ today_revenue: 1000, today_orders: 3, avg_check: 500 }, sales, "2026-08-12");
    const revenueNote = kpis.find((kpi) => kpi.label === "Выручка за день").note;

    expect(revenueNote).toMatch(/к вчерашнему дню/);
  });
});
