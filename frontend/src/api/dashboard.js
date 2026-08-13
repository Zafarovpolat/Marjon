import { analyticsService } from "./reports";
import { catalogService } from "./catalog";
import { financeService } from "./finance";
import { ordersService } from "./orders";
import { settingsService } from "./settings";
import { staffService } from "./staff";

export const dashboardService = Object.freeze({
  loadOwnerOverview({ selectedDate, dateFrom, dateTo, signal }) {
    const config = signal ? { signal } : undefined;
    return Promise.all([
      analyticsService.getDashboard(selectedDate, config),
      analyticsService.listSales(dateFrom, dateTo, config),
      analyticsService.listTopProducts({ limit: 5, dateFrom: selectedDate, dateTo: selectedDate, signal }),
      catalogService.listProducts(config),
      staffService.listEmployees(config),
      ordersService.list({ date: selectedDate }, config),
      settingsService.listDashboardPlaces(config),
      financeService.listTransactions({ dateFrom: selectedDate, dateTo: selectedDate, signal }),
    ]);
  },
});
