import { analyticsService } from "./reports";
import { catalogService } from "./catalog";
import { financeService } from "./finance";
import { ordersService } from "./orders";
import { settingsService } from "./settings";
import { staffService } from "./staff";

export const dashboardService = Object.freeze({
  loadOwnerOverview({ selectedDate, dateFrom, dateTo, signal }) {
    const config = signal ? { signal } : undefined;
    // Запасное значение для необязательных блоков: пустой ответ вместо reject.
    const empty = () => ({ data: [] });
    return Promise.all([
      // Ядро дашборда: без запаски. Если ключевые показатели не пришли —
      // рисовать нечего, и экран честно показывает ошибку.
      analyticsService.getDashboard(selectedDate, config),
      // Остальные блоки деградируют поодиночке: падение одного (например,
      // /analytics/sales → 500 на Postgres) больше не роняет весь дашборд.
      analyticsService.listSales(dateFrom, dateTo, config).catch(empty),
      analyticsService.listTopProducts({ limit: 5, dateFrom: selectedDate, dateTo: selectedDate, signal }).catch(empty),
      catalogService.listProducts(config).catch(empty),
      staffService.listEmployees(config).catch(empty),
      ordersService.list({ date: selectedDate }, config).catch(empty),
      settingsService.listDashboardPlaces(config).catch(empty),
      financeService.listTransactions({ dateFrom: selectedDate, dateTo: selectedDate, signal }).catch(empty),
    ]);
  },
});
