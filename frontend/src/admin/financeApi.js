import { adminApi } from "./api";

export const HQ_FINANCE_BASE_PATH = "/hq/finance";
export const HQ_FINANCE_PATHS = Object.freeze({
  transactions: "/hq/finance/transactions",
  paymentTypes: "/hq/finance/payment-types",
  transactionCategories: "/hq/finance/transaction-categories",
  counterparties: "/hq/finance/counterparties",
  financeHistory: "/hq/finance/finance-history",
});

function requireOrganizationId(organizationId) {
  const value = String(organizationId || "").trim();
  if (!value) throw new TypeError("organization_id is required for HQ finance dictionaries");
  return value;
}

function organizationParams(organizationId, params) {
  return {
    ...params,
    organization_id: requireOrganizationId(organizationId),
  };
}

export const adminFinanceApi = {
  listTransactions(params = {}, config = {}) {
    return adminApi.get(HQ_FINANCE_PATHS.transactions, {
      params: { size: 100, ...params },
      ...config,
    });
  },

  createTransaction(payload, idempotencyKey) {
    return adminApi.post(HQ_FINANCE_PATHS.transactions, payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },

  updateTransaction(transactionId, payload, config = {}) {
    const id = String(transactionId || "").trim();
    if (!id) throw new TypeError("transactionId is required");
    return adminApi.patch(`${HQ_FINANCE_PATHS.transactions}/${encodeURIComponent(id)}`, payload, config);
  },

  listPaymentTypes(organizationId, params = {}, config = {}) {
    return adminApi.get(HQ_FINANCE_PATHS.paymentTypes, {
      params: organizationParams(organizationId, { size: 100, ...params }),
      ...config,
    });
  },

  listCategories(organizationId, kind, params = {}, config = {}) {
    return adminApi.get(HQ_FINANCE_PATHS.transactionCategories, {
      params: organizationParams(organizationId, {
        size: 200,
        ...params,
        kind,
      }),
      ...config,
    });
  },

  listCounterparties(organizationId, type, params = {}, config = {}) {
    return adminApi.get(HQ_FINANCE_PATHS.counterparties, {
      params: organizationParams(organizationId, { size: 200, ...params, type }),
      ...config,
    });
  },

  listFinanceHistory(organizationId, params = {}, config = {}) {
    return adminApi.get(HQ_FINANCE_PATHS.financeHistory, {
      params: organizationParams(organizationId, { size: 200, ...params }),
      ...config,
    });
  },
};

function createHqTransactionIdempotencyKey(payload) {
  const direction = payload?.direction || "transaction";
  return `admin-finance-${direction}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function resolveHqTransactionSubmission(previous, payload, createKey = createHqTransactionIdempotencyKey) {
  const fingerprint = JSON.stringify(payload);
  if (previous?.fingerprint === fingerprint && previous.idempotencyKey) return previous;
  return { fingerprint, idempotencyKey: createKey(payload) };
}
