import { describe, expect, it } from "vitest";
import { groupCancelledOrders } from "./cancelledOrderGroups";

const line = { id: "i1", orderId: "o1", orderNumber: "20", quantity: 1, amount: "32000.00", name: "Суп", date: "20.10.2026 / 11:40", authorName: "Азиз" };
describe("cancelled order grouping", () => {
  it("aggregates quantity and saved cancellation amounts while preserving every line", () => {
    const rows = [line, { ...line, id: "i2", name: "Борщ", amount: "31000.00", quantity: 2 }];
    const result = groupCancelledOrders(rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ orderId: "o1", amount: 63000, quantity: 3, authorName: "Азиз" });
    expect(result[0].items).toEqual(rows);
    expect(rows[0].amount).toBe("32000.00");
  });
  it("does not merge different orders with the same public number", () => {
    expect(groupCancelledOrders([line, { ...line, id: "i2", orderId: "other" }])).toHaveLength(2);
  });
  it("does not fabricate a total when any historical amount is unknown", () => {
    const group = groupCancelledOrders([line, { ...line, id: "i2", amount: null, authorName: null }])[0];
    expect(group.amount).toBeNull();
    expect(group.authorName).toBe("Азиз, —");
  });
  it("keeps decimals exact to the report precision", () => {
    expect(groupCancelledOrders([{ ...line, amount: "0.10", quantity: .1 }, { ...line, id: "i2", amount: "0.20", quantity: .2 }])[0])
      .toMatchObject({ amount: .3, quantity: .3 });
  });
});
