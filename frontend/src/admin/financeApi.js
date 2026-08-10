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
  listTransactions(params = {}) {
    return adminApi.get(HQ_FINANCE_PATHS.transactions, {
      params: { size: 100, ...params },
    });
  },

  createTransaction(payload, idempotencyKey) {
    return adminApi.post(HQ_FINANCE_PATHS.transactions, payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },

  listPaymentTypes(organizationId, params = {}) {
    return adminApi.get(HQ_FINANCE_PATHS.paymentTypes, {
      params: organizationParams(organizationId, { size: 100, ...params }),
    });
  },

  listCategories(organizationId, kind, params = {}) {
    return adminApi.get(HQ_FINANCE_PATHS.transactionCategories, {
      params: organizationParams(organizationId, {
        size: 200,
        ...params,
        kind,
      }),
    });
  },

  listCounterparties(organizationId, type, params = {}) {
    return adminApi.get(HQ_FINANCE_PATHS.counterparties, {
      params: organizationParams(organizationId, { size: 200, ...params, type }),
    });
  },

  listFinanceHistory(organizationId, params = {}) {
    return adminApi.get(HQ_FINANCE_PATHS.financeHistory, {
      params: organizationParams(organizationId, { size: 200, ...params }),
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
