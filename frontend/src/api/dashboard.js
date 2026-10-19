import { analyticsService } from "./reports";
import { catalogService } from "./catalog";
import { financeService } from "./finance";
import { ordersService } from "./orders";
import { settingsService } from "./settings";
import { staffService } from "./staff";

export const dashboardService = Object.freeze({
  loadOwnerOverview({ dateFrom, dateTo, signal }) {
    const config = signal ? { signal } : undefined;
    const financials = analyticsService.getOwnerFinancials(dateFrom, dateTo, config).catch((error) => {
      if (signal?.aborted || error?.code === "ERR_CANCELED" || error?.name === "AbortError") throw error;
      return { data: { metric_basis: "completed_income_minus_snapshot_cogs", financial_unavailable: true,
        today_revenue: null, income_total: null, cogs_total: null, sales: [],
        profit_unavailable_reason: "Не удалось загрузить оплаты и историческую себестоимость." } };
    });
    return Promise.all([
      // Same response drives the KPI formula and graph for the entire period.
      financials,
      financials.then((res) => ({ data: res.data.sales || [] })),
      // A new report may be unavailable on an older backend. Isolate that
      // card without replacing confirmed sales with the old unpaid ranking.
      analyticsService.listTopProducts({ limit: 5, dateFrom, dateTo, signal, confirmedOnly: true })
        .catch((error) => {
          if (signal?.aborted || error?.code === "ERR_CANCELED" || error?.name === "AbortError") throw error;
          return { data: [], unavailable: true, unavailableReason: error?.response?.status === 404
            ? "Для рейтинга оплаченных продаж требуется обновление backend."
            : "Не удалось загрузить подтверждённые продажи." };
        }),
      catalogService.listProducts(config),
      staffService.listEmployees(config),
      ordersService.list({ date: dateTo }, config),
      settingsService.listDashboardPlaces(config),
      financeService.listTransactions({ dateFrom, dateTo, signal }),
    ]);
  },
});
