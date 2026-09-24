import { describe, expect, it } from "vitest";
import { navItems } from "./navConfig";

const childPaths = (key) => navItems.find((item) => item.key === key)?.children.map((child) => child.to);
const childLabels = (key) => navItems.find((item) => item.key === key)?.children.map((child) => child.label);

describe("OWNER sidebar navigation order", () => {
  it("keeps the requested report, menu, and warehouse-report ordering", () => {
    expect(childPaths("reports")).toEqual([
      "/reports/z-report",
      "/reports/orders",
      "/reports/waiters",
      "/reports/dishes",
      "/reports/tables",
      "/reports/cancelled-dishes",
    ]);
    expect(childPaths("nomenclature")).toEqual([
      "/nomenclature/dishes",
      "/nomenclature/dish-categories",
      "/nomenclature/menu",
      "/nomenclature/stop-list",
    ]);
    expect(childPaths("warehouse-report")).toEqual([
      "/stock-report/incoming-journal",
      "/stock-report/incoming",
      "/stock-report/outgoing",
      "/stock-report/stock",
      "/stock-report/transfer",
      "/stock-report/inventory",
      "/stock-report/write-off",
      "/stock-report/write-off-categories",
      "/stock-report/waste",
    ]);
  });

  it("shows the approved Employees submenu without Courier and Cook", () => {
    expect(childLabels("users")).toEqual([
      "Кассир",
      "Официант",
      "Моноблок",
      "Менеджер",
      "Завсклад",
      "История входа",
      "Посещаемость",
    ]);
    expect(childPaths("users")).toEqual([
      "/users/cashier",
      "/users/waiter",
      "/users/monoblock",
      "/users/manager",
      "/users/warehouse",
      "/users/login-history",
      "/users/attendance",
    ]);
  });
});
