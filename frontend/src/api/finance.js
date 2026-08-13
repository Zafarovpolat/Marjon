import { api } from "./client";

function definedParams(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
}

export const financeService = {
  listTransactions({ dateFrom, dateTo, direction } = {}) {
    return api.get("/finance/transactions", {
      params: definedParams({ date_from: dateFrom, date_to: dateTo, direction }),
    });
  },

  createTransaction(payload, config) {
    return config
      ? api.post("/finance/transactions", payload, config)
      : api.post("/finance/transactions", payload);
  },

  updateTransaction(transactionId, payload) {
    return api.patch(`/finance/transactions/${transactionId}`, payload);
  },

  listPaymentTypes({ page = 1, size = 200, ...params } = {}) {
    return api.get("/finance/payment-types", { params: { page, size, ...params } });
  },

  listTransactionCategories(kind) {
    return kind
      ? api.get("/finance/transaction-categories", { params: { kind } })
      : api.get("/finance/transaction-categories");
  },

  createTransactionCategory(payload) {
    return api.post("/finance/transaction-categories", payload);
  },

  updateTransactionCategory(categoryId, payload) {
    return api.patch(`/finance/transaction-categories/${categoryId}`, payload);
  },

  deleteTransactionCategory(categoryId) {
    return api.delete(`/finance/transaction-categories/${categoryId}`);
  },

  listCounterparties({ page = 1, size = 200, ...params } = {}) {
    return api.get("/finance/counterparties", { params: { page, size, ...params } });
  },

  listFinanceHistory({ page = 1, size = 20, ...params } = {}) {
    return api.get("/finance/finance-history", { params: { page, size, ...params } });
  },

  listCounterpartyTransactions(counterpartyId, { page = 1, size = 20, ...params } = {}) {
    return api.get(`/finance/counterparties/${counterpartyId}/transactions`, {
      params: { page, size, ...params },
    });
  },
};
