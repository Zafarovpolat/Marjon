import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiInfoDialog } from "./DashboardDialogs";
import { buildRealKpis } from "./analyticsData";

const summary = {
  metric_basis: "completed_income_minus_snapshot_cogs", date_from: "2026-10-12", date_to: "2026-10-17",
  income_total: "220.01", cogs_total: "40.00", today_revenue: "180.01", today_orders: 1,
  product_rows: [{ product_id: "1", name: "Плов", category: "Горячее", quantity: "0.333",
    income: "220.01", cogs: "40.00", revenue: "180.01" }],
};
function show(data, index = 0) {
  const kpi = buildRealKpis(data, [], "2026-10-17", [], [])[index];
  render(<KpiInfoDialog kpi={kpi} onClose={() => {}} />);
  return screen.getByRole("table");
}
describe("Revenue product detail", () => {
  it("reverses both money columns, row values and totals only for income", () => {
    const table = show(summary, 3);
    expect(within(table).getAllByRole("columnheader").map(el => el.textContent)).toEqual([
      "№", "Блюдо / товар", "Категория", "Продано", "Выручка", "Денежный приход",
    ]);
    const cells = table.querySelectorAll("tbody tr td");
    expect(cells[4].textContent).toBe("180,01 UZS");
    expect(cells[5].textContent).toBe("220,01 UZS");
    const totals = table.querySelectorAll("tfoot td");
    expect(totals[0].textContent).toBe("180,01 UZS");
    expect(totals[1].textContent).toBe("220,01 UZS");
    expect(screen.queryByText(/Подтверждённые оплаты полностью/)).toBeNull();
  });
  it("removes the orders explanation without changing its count", () => {
    show(summary, 1);
    expect(screen.getByText("шт")).toBeTruthy();
    expect(screen.queryByText("Полностью оплаченные завершённые заказы за выбранный период.")).toBeNull();
  });
  it("keeps all five order columns, no-data row and zero footer when empty", () => {
    const table = show({ ...summary, today_orders: 0, order_rows: [], orders_total: "0" }, 1);
    expect(within(table).getAllByRole("columnheader").map(el => el.textContent)).toEqual([
      "№ заказа", "Дата и время", "Место", "Сумма", "Статус",
    ]);
    expect(within(table).getByText("Нет данных")).toBeTruthy();
    expect(within(table).getByText("Итого")).toBeTruthy();
    expect(within(table).getByText("0 UZS")).toBeTruthy();
    expect(within(table).queryByText("Доля")).toBeNull();
    expect(screen.getByRole("dialog").className).toContain("kpi-info-window--revenue-products");
  });
  it("renders genuine order fields and their total without mapping completed to ready", () => {
    const table = show({ ...summary, order_rows: [{ id: "order-1", number: "5", date_label: "17.10 19:57",
      place: "Стол 5", amount: "220.01", status: "completed" }], orders_total: "220.01" }, 1);
    for (const text of ["#5", "17.10 19:57", "Стол 5", "Завершён"]) expect(within(table).getByText(text)).toBeTruthy();
    expect(within(table).getAllByText("220,01 UZS")).toHaveLength(2);
  });
  it("does not present a failed order report as empty or show a fake total", () => {
    const table = show({ ...summary, financial_unavailable: true }, 1);
    expect(within(table).getByText("Не удалось загрузить заказы")).toBeTruthy();
    expect(within(table).queryByText("Итого")).toBeNull();
  });
  it("uses the six sales columns, real rows and reconciled totals", () => {
    const table = show(summary);
    expect(within(table).getAllByRole("columnheader").map(el => el.textContent)).toEqual([
      "№", "Блюдо / товар", "Категория", "Продано", "Денежный приход", "Выручка",
    ]);
    expect(within(table).getByText("Плов")).toBeTruthy();
    expect(within(table).getByText("Горячее")).toBeTruthy();
    expect(within(table).getByText(/0[.,]333/)).toBeTruthy();
    expect(within(table).getAllByText("220,01 UZS")).toHaveLength(2);
    expect(within(table).getByText("Итого")).toBeTruthy();
    expect(within(table).queryByText("Средняя цена")).toBeNull();
    expect(screen.getByText("12.10.2026 – 17.10.2026")).toBeTruthy();
    expect(screen.queryByText(/Денежный приход минус историческая/)).toBeNull();
    expect(screen.queryByText(/Приход распределён/)).toBeNull();
    expect(screen.queryByText(/Себестоимость оплаченных позиций:/)).toBeNull();
  });
  it("keeps unknown historical profit unknown", () => {
    const table = show({ ...summary, cogs_total: null, today_revenue: null,
      product_rows: [{ ...summary.product_rows[0], cogs: null, revenue: null }] });
    expect(within(table).getAllByText("Неизвестно")).toHaveLength(2);
  });
  it("shows a compact empty state and zero totals", () => {
    const table = show({ ...summary, income_total: "0", cogs_total: "0", today_revenue: "0", product_rows: [] });
    expect(within(table).getByText("Нет данных")).toBeTruthy();
    expect(within(table).getByText("Итого")).toBeTruthy();
  });
  it("does not show invented zero totals on request failure", () => {
    const table = show({ ...summary, financial_unavailable: true, income_total: null,
      cogs_total: null, today_revenue: null, product_rows: [] });
    expect(within(table).getByText("Не удалось загрузить продажи")).toBeTruthy();
    expect(within(table).queryByText("Итого")).toBeNull();
  });
});
