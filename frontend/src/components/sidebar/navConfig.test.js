import { describe, expect, it } from "vitest";
import { isNavPathActive, navItems } from "./navConfig";

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
      "/nomenclature/dish-categories",
      "/nomenclature/dishes",
      "/nomenclature/sales-categories",
      "/nomenclature/sales",
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

  it("keeps Настройка профиля out of the Settings submenu (available from user menu only)", () => {
    expect(childLabels("settings")).toEqual([
      "Клиенты",
      "Филиалы",
      "Место",
      "Способ оплаты",
      "Единица измерения",
      "Настройка принтеров",
      "Настройка чека",
      "Настройка чека повара",
    ]);
    expect(childPaths("settings")).toEqual([
      "/settings/clients",
      "/settings/branches",
      "/settings/places",
      "/settings/payment-methods",
      "/settings/units",
      "/settings/printers",
      "/settings/receipt",
      "/settings/kitchen-receipt",
    ]);
    expect(childPaths("settings")).not.toContain("/settings/profile");
  });

  it("WAREHOUSE V1: shows Категория продуктов, Продукты, Полуфабрикаты, Категория полуфабрикатов", () => {
    const warehouse = navItems.find((item) => item.key === "warehouse");
    expect(warehouse).toBeDefined();
    expect(warehouse.children).toHaveLength(4);
    expect(childLabels("warehouse")).toEqual([
      "Категория продуктов",
      "Продукты",
      "Полуфабрикаты",
      "Категория полуфабрикатов",
    ]);
    expect(childPaths("warehouse")).toEqual([
      "/nomenclature/raw-categories",
      "/nomenclature/raw-materials",
      "/nomenclature/semi-finished",
      "/nomenclature/semi-finished-categories",
    ]);
    // Preserved routes + icons
    expect(warehouse.children[0]).toMatchObject({
      key: "raw-categories",
      to: "/nomenclature/raw-categories",
      icon: "bi-boxes",
    });
    expect(warehouse.children[1]).toMatchObject({
      key: "raw-materials",
      to: "/nomenclature/raw-materials",
      icon: "bi-basket",
    });
  });

  it("WAREHOUSE V1: keeps semi-finished subcategories in navigation", () => {
    expect(childLabels("warehouse")).toContain("Полуфабрикаты");
    expect(childLabels("warehouse")).toContain("Категория полуфабрикатов");
    expect(childPaths("warehouse")).toContain("/nomenclature/semi-finished");
    expect(childPaths("warehouse")).toContain("/nomenclature/semi-finished-categories");
  });

  it("WAREHOUSE V1: preserves other top-level sidebar sections", () => {
    const topKeys = navItems.map((item) => item.key);
    expect(topKeys).toEqual([
      "dashboard",
      "reports",
      "users",
      "nomenclature",
      "warehouse",
      "warehouse-report",
      "finance",
      "settings",
    ]);
  });

  it("keeps detail routes inside the parent subcategory (stock/journal)", () => {
    // Детализация остатка не выходит из подкатегории Остаток.
    expect(isNavPathActive("/stock-report/stock", "/stock-report/stock")).toBe(true);
    expect(isNavPathActive("/stock-report/stock/wh-1", "/stock-report/stock")).toBe(true);
    // Журнал: создание и карточка документа остаются в Добавить продуктов.
    expect(isNavPathActive("/stock-report/incoming-journal/create", "/stock-report/incoming-journal")).toBe(true);
    expect(isNavPathActive("/stock-report/incoming-journal/d1", "/stock-report/incoming-journal")).toBe(true);
    // Чужие ветки не подсвечиваются, граница — по сегменту.
    expect(isNavPathActive("/stock-report/stock", "/stock-report/incoming")).toBe(false);
    expect(isNavPathActive("/reports/orders-history", "/reports/orders")).toBe(false);
    expect(isNavPathActive("/", "/")).toBe(true);
  });
});
