import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeAdminProduct,
  normalizeHqDashboardTransaction,
  normalizeAdminOrder,
  getAdminOrderTotal,
  OrdersNomenclaturePage,
  ProductNomenclaturePage,
  TransactionsTable,
} from "./AdminApp";
import { adminApi } from "./api";
import { adminFinanceApi } from "./financeApi";

describe("FE-PRE-RBAC-04R3 truthful HQ data", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("never invents a paid status for the current HQ transaction contract", () => {
    const row = normalizeHqDashboardTransaction({
      id: "transaction-uuid",
      date: "2026-08-12T10:00:00Z",
      amount: 125000,
      direction: "income",
      status: "PAID",
    });

    expect(row).not.toHaveProperty("status");
    expect(JSON.stringify(row)).not.toMatch(/PAID|SUCCESS|Оплачено|Завершено/);
  });

  it("does not mislabel an unknown HQ transaction direction as expense", () => {
    const row = normalizeHqDashboardTransaction({
      id: "transaction-uuid",
      amount: 125000,
      direction: "unsupported",
    });

    expect(row.kind).toBe("—");
    expect(row.kind).not.toBe("Расход");
  });

  it("renders an unsupported HQ transaction status neutrally", async () => {
    vi.spyOn(adminFinanceApi, "listTransactions").mockResolvedValue({
      data: [{ id: "transaction-uuid", amount: 125000, direction: "income" }],
    });

    render(<TransactionsTable onNotify={vi.fn()} />);

    expect(await screen.findByText("125 000")).toBeInTheDocument();
    expect(screen.queryByText("PAID")).not.toBeInTheDocument();
    expect(screen.queryByText("SUCCESS")).not.toBeInTheDocument();
  });

  it("uses raw identifiers when product dictionaries cannot resolve category and unit", () => {
    const row = normalizeAdminProduct({
      id: "product-uuid",
      name: "Backend product",
      category_id: "category-uuid",
      unit_id: "unit-uuid",
      price: 500,
      status: true,
    });

    expect(row.category).toBe("ID: category-uuid");
    expect(row.unit).toBe("ID: unit-uuid");
    expect(row.category).not.toBe("Без категории");
    expect(row.unit).not.toBe("Штук (шт)");
  });

  it("resolves category and unit only from confirmed server dictionaries", async () => {
    vi.spyOn(adminApi, "get").mockImplementation((path) => {
      if (path === "/products") {
        return Promise.resolve({ data: { items: [{
          id: "product-uuid",
          name: "Backend product",
          category_id: "category-uuid",
          unit_id: "unit-uuid",
          price: 500,
          status: true,
        }] } });
      }
      if (path === "/categories") {
        return Promise.resolve({ data: { items: [{ id: "category-uuid", name: "Server category" }] } });
      }
      if (path === "/units") {
        return Promise.resolve({ data: { items: [{ id: "unit-uuid", name: "Server unit" }] } });
      }
      return Promise.reject(new Error(`Unexpected path ${path}`));
    });

    render(<ProductNomenclaturePage search="" onNotify={vi.fn()} />);

    expect(await screen.findByText("Backend product")).toBeInTheDocument();
    expect(screen.getAllByText("Server category").length).toBeGreaterThan(0);
    expect(screen.getByText("Server unit")).toBeInTheDocument();
    expect(screen.queryByText("Без категории")).not.toBeInTheDocument();
    expect(screen.queryByText("Штук (шт)")).not.toBeInTheDocument();
  });

  it("keeps unresolved product identifiers truthful when dictionary requests fail", async () => {
    vi.spyOn(adminApi, "get").mockImplementation((path) => {
      if (path === "/products") {
        return Promise.resolve({ data: { items: [{
          id: "product-uuid",
          name: "Backend product",
          category_id: "category-uuid",
          unit_id: "unit-uuid",
          price: 500,
          status: true,
        }] } });
      }
      return Promise.reject(new Error("dictionary unavailable"));
    });

    render(<ProductNomenclaturePage search="" onNotify={vi.fn()} />);

    expect(await screen.findByText("Backend product")).toBeInTheDocument();
    expect(screen.getAllByText("ID: category-uuid").length).toBeGreaterThan(0);
    expect(screen.getByText("ID: unit-uuid")).toBeInTheDocument();
  });

  it("keeps the HQ order editor unavailable without fixture options or fake success", async () => {
    const onNotify = vi.fn();
    const post = vi.spyOn(adminApi, "post");
    const patch = vi.spyOn(adminApi, "patch");
    vi.spyOn(adminApi, "get").mockResolvedValue({
      data: { items: [{
        id: "order-uuid",
        name: "Backend order",
        payment_id: "payment-1",
        items: [],
        price: 0,
        comment: null,
        status: "new",
        organization_id: "organization-uuid",
      }] },
    });

    render(<OrdersNomenclaturePage search="" onNotify={onNotify} />);

    await waitFor(() => expect(adminApi.get).toHaveBeenCalledWith("/orders", { params: { size: 100 } }));
    fireEvent.click(screen.getByRole("button", { name: "Добавление заказа недоступно" }));
    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining("недоступно"));
    expect(screen.queryByRole("dialog", { name: "Заказ" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Qadrdonlar|MERCURY SG108 C/)).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("keeps HQ order organization and total aligned with the read contract", () => {
    const row = normalizeAdminOrder({
      id: "order-uuid",
      name: "Backend order name",
      organization_id: "organization-uuid",
      payment_id: "payment-1",
      items: [{ product_id: "product-uuid", qty: 1, price: 500000 }],
      price: 725000,
      status: "new",
    });

    expect(row.organization).toBe("ID: organization-uuid");
    expect(row.organization).not.toBe("Backend order name");
    expect(row.total).toBe(725000);
    expect(getAdminOrderTotal(row)).toBe(725000);
  });
});
