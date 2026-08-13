import { analyticsService } from "./reports";
import { catalogService } from "./catalog";
import { financeService } from "./finance";
import { ordersService } from "./orders";
import { settingsService } from "./settings";
import { staffService } from "./staff";

export const dashboardService = Object.freeze({
  loadOwnerOverview({ selectedDate, dateFrom, dateTo }) {
    return Promise.all([
      analyticsService.getDashboard(selectedDate),
      analyticsService.listSales(dateFrom, dateTo),
      analyticsService.listTopProducts({ limit: 5, dateFrom: selectedDate, dateTo: selectedDate }),
      catalogService.listProducts(),
      staffService.listEmployees(),
      ordersService.list({ date: selectedDate }),
      settingsService.listDashboardPlaces(),
      financeService.listTransactions({ dateFrom: selectedDate, dateTo: selectedDate }),
    ]);
  },
});
