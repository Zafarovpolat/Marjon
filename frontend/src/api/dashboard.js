import { analyticsService } from "./reports";
import { catalogService } from "./catalog";
import { financeService } from "./finance";
import { ordersService } from "./orders";
import { settingsService } from "./settings";
import { staffService } from "./staff";

export const dashboardService = Object.freeze({
  loadOwnerOverview({ dateFrom, dateTo, signal }) {
    const config = signal ? { signal } : undefined;
    return Promise.all([
      // The dashboard summary and POS orders currently accept a single `date`,
      // so they truthfully use the applied period's end date. Range-capable
      // sources receive the complete applied Dashboard period below.
      analyticsService.getDashboard(dateTo, config),
      analyticsService.listSales(dateFrom, dateTo, config),
      analyticsService.listTopProducts({ limit: 5, dateFrom, dateTo, signal }),
      catalogService.listProducts(config),
      staffService.listEmployees(config),
      ordersService.list({ date: dateTo }, config),
      settingsService.listDashboardPlaces(config),
      financeService.listTransactions({ dateFrom, dateTo, signal }),
    ]);
  },
});
