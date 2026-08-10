import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  adminApi: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { adminApi } from "./api";
import { adminFinanceApi, resolveHqTransactionSubmission } from "./financeApi";

describe("HQ finance API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists transactions through the HQ path and preserves filters", async () => {
    const response = { data: { items: [], total: 0, page: 2, size: 25, pages: 1 } };
    adminApi.get.mockResolvedValueOnce(response);

    await expect(adminFinanceApi.listTransactions({
      page: 2,
      size: 25,
      date_from: "2026-08-01",
      date_to: "2026-08-10",
      direction: "income",
    })).resolves.toBe(response);

    expect(adminApi.get).toHaveBeenCalledWith("/hq/finance/transactions", {
      params: {
        page: 2,
        size: 25,
        date_from: "2026-08-01",
        date_to: "2026-08-10",
        direction: "income",
      },
    });
    expect(adminApi.get).not.toHaveBeenCalledWith("/finance/transactions", expect.anything());
  });

  it("creates transactions through the HQ path with the caller's Idempotency-Key", async () => {
    const payload = { direction: "expense", amount: 125000, organization_id: "org-1" };
    const response = { data: { id: "tx-1", ...payload }, status: 201 };
    adminApi.post.mockResolvedValueOnce(response);

    await expect(adminFinanceApi.createTransaction(payload, "hq-finance-key-1")).resolves.toBe(response);

    expect(adminApi.post).toHaveBeenCalledWith("/hq/finance/transactions", payload, {
      headers: { "Idempotency-Key": "hq-finance-key-1" },
    });
  });

  it("reuses one idempotency key for a retry of the same transaction payload", () => {
    const payload = { direction: "income", amount: 1000, organization_id: "org-1" };
    const createKey = vi.fn(() => "stable-key");
    const first = resolveHqTransactionSubmission(null, payload, createKey);
    const retry = resolveHqTransactionSubmission(first, { ...payload }, createKey);
    const changed = resolveHqTransactionSubmission(first, { ...payload, amount: 2000 }, createKey);

    expect(retry).toBe(first);
    expect(changed).not.toBe(first);
    expect(createKey).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["payment types", () => adminFinanceApi.listPaymentTypes("org-1"), "/hq/finance/payment-types", { size: 100, organization_id: "org-1" }],
    ["income categories", () => adminFinanceApi.listCategories("org-1", "income"), "/hq/finance/transaction-categories", { size: 200, kind: "income", organization_id: "org-1" }],
    ["counterparties", () => adminFinanceApi.listCounterparties("org-1", "client"), "/hq/finance/counterparties", { size: 200, type: "client", organization_id: "org-1" }],
    ["finance history", () => adminFinanceApi.listFinanceHistory("org-1", { page: 3 }), "/hq/finance/finance-history", { size: 200, page: 3, organization_id: "org-1" }],
  ])("uses the verified HQ route for %s", async (_label, request, path, params) => {
    const response = { data: { items: [], total: 0, page: 1, size: 20, pages: 1 } };
    adminApi.get.mockResolvedValueOnce(response);

    await expect(request()).resolves.toBe(response);
    expect(adminApi.get).toHaveBeenCalledWith(path, { params });
  });

  it("does not send an invalid organization-scoped request", () => {
    expect(() => adminFinanceApi.listPaymentTypes("")).toThrow("organization_id is required");
    expect(adminApi.get).not.toHaveBeenCalled();
  });

  it.each([403, 404, 500])("propagates HTTP %s without falling back to APP finance", async (status) => {
    const error = { response: { status, data: { detail: "HQ finance unavailable" } } };
    adminApi.get.mockRejectedValueOnce(error);

    await expect(adminFinanceApi.listTransactions()).rejects.toBe(error);
    expect(adminApi.get).toHaveBeenCalledTimes(1);
    expect(adminApi.get).toHaveBeenCalledWith("/hq/finance/transactions", { params: { size: 100 } });
  });

  it("keeps a transaction idempotency conflict visible to the caller", async () => {
    const error = { response: { status: 409, data: { detail: "Idempotency-Key conflict" } } };
    adminApi.post.mockRejectedValueOnce(error);

    await expect(adminFinanceApi.createTransaction(
      { direction: "income", amount: 1000, organization_id: "org-1" },
      "conflict-key",
    )).rejects.toBe(error);
    expect(adminApi.post).toHaveBeenCalledTimes(1);
  });

  it("propagates network failures without a second APP request", async () => {
    const error = { code: "ERR_NETWORK", message: "Network Error" };
    adminApi.get.mockRejectedValueOnce(error);

    await expect(adminFinanceApi.listPaymentTypes("org-1")).rejects.toBe(error);
    expect(adminApi.get).toHaveBeenCalledTimes(1);
    expect(adminApi.get).toHaveBeenCalledWith("/hq/finance/payment-types", {
      params: { size: 100, organization_id: "org-1" },
    });
  });

  it("guards AdminApp against direct APP-finance API paths", () => {
    const adminApp = readFileSync(resolve(process.cwd(), "src/admin/AdminApp.jsx"), "utf8");

    expect(adminApp).not.toMatch(/["'`]\/finance\/(transactions|payment-types|transaction-categories|counterparties|finance-history)/);
  });

  it("keeps known APP finance consumers on /finance paths", () => {
    const transactions = readFileSync(resolve(process.cwd(), "src/pages/FinanceTransactionsPage.jsx"), "utf8");
    const categories = readFileSync(resolve(process.cwd(), "src/pages/FinanceCategoriesPage.jsx"), "utf8");
    const paymentTypes = readFileSync(resolve(process.cwd(), "src/pages/settings/SettingsPaymentMethodsPage.jsx"), "utf8");

    expect(transactions).toContain('api.get("/finance/transactions"');
    expect(transactions).toContain('api.post("/finance/transactions"');
    expect(categories).toContain('api.get("/finance/transaction-categories"');
    expect(paymentTypes).toContain('apiEndpoint="/finance/payment-types"');
    expect([transactions, categories, paymentTypes].join("\n")).not.toContain("/hq/finance/");
  });
});
