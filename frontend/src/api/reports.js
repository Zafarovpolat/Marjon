import { api } from "./client";

function rangeParams(dateFrom, dateTo, extra = {}) {
  return { date_from: dateFrom, date_to: dateTo, ...extra };
}

export const reportsService = {
  getZReport(date) {
    return api.get("/analytics/z-report", { params: { date } });
  },
  listOrders(dateFrom, dateTo) {
    return api.get("/reports/orders", { params: rangeParams(dateFrom, dateTo) });
  },
  listTables(dateFrom, dateTo) {
    return api.get("/reports/tables", { params: rangeParams(dateFrom, dateTo) });
  },
  listWaiters(dateFrom, dateTo) {
    return api.get("/reports/waiters", { params: rangeParams(dateFrom, dateTo) });
  },
  listDishes(dateFrom, dateTo) {
    return api.get("/reports/dishes", { params: rangeParams(dateFrom, dateTo) });
  },
  listCancelledDishes(dateFrom, dateTo) {
    return api.get("/reports/cancelled", { params: rangeParams(dateFrom, dateTo) });
  },
  listDebtCredit(dateFrom, dateTo, counterpartyId) {
    return api.get("/reports/debt-credit", {
      params: rangeParams(dateFrom, dateTo, counterpartyId ? { counterparty_id: counterpartyId } : {}),
    });
  },
};

export const analyticsService = {
  getDashboard(date) {
    return api.get("/analytics/dashboard", { params: { date } });
  },
  listSales(dateFrom, dateTo) {
    return api.get("/analytics/sales", { params: rangeParams(dateFrom, dateTo) });
  },
  listTopProducts({ limit = 20, dateFrom, dateTo } = {}) {
    return api.get("/analytics/products/top", {
      params: rangeParams(dateFrom, dateTo, { limit }),
    });
  },
};
