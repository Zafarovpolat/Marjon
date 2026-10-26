// Навигация и языки бокового меню OWNER.
// Вынесено из Sidebar.jsx (FE-07B) как отдельная конфигурация — данные без логики.
// Порядок, ключи, метки, иконки и маршруты задаются здесь как единый источник.

// Активна ли ссылка меню для текущего пути.
// Детализации (напр. /stock-report/stock/:warehouseId) не имеют своего
// пункта меню — они остаются внутри родительской подкатегории
// (/stock-report/stock). Сравнение строго по границе сегмента, чтобы
// /reports/orders не подсвечивал /reports/orders-history.
export function isNavPathActive(pathname, to) {
  const path = String(pathname || "").split("?")[0].split("#")[0];
  const target = String(to || "");
  if (!target || target === "/") return path === "/";
  return path === target || path.startsWith(`${target}/`);
}

export const sidebarLanguages = [
  {
    code: "uz",
    labelKey: "sidebar.uzbek",
    label: "Узбекский",
    native: "O'zbekcha",
    short: "UZ",
    flagUrl: "https://upload.wikimedia.org/wikipedia/commons/8/84/Flag_of_Uzbekistan.svg",
  },
  {
    code: "ru",
    labelKey: "sidebar.russian",
    label: "Русский",
    native: "Русский",
    short: "RU",
    flagUrl: "https://upload.wikimedia.org/wikipedia/commons/f/f3/Flag_of_Russia.svg",
  },
  {
    code: "en",
    labelKey: "sidebar.english",
    label: "Английский",
    native: "English",
    short: "EN",
    flagUrl: "https://upload.wikimedia.org/wikipedia/en/a/ae/Flag_of_the_United_Kingdom.svg",
  },
];

export const navItems = [
  { key: "dashboard", label: "Дашборд", icon: "bi-bar-chart-line", to: "/" },
  {
    key: "reports",
    label: "Отчеты",
    icon: "bi-file-earmark-bar-graph",
    to: "/reports",
    children: [
      { key: "z-report", label: "Z - Отчёт", to: "/reports/z-report", icon: "bi-receipt-cutoff" },
      { key: "orders", label: "Отчёт по заказам", to: "/reports/orders", icon: "bi-receipt" },
      { key: "waiters", label: "Отчёт по официантам", to: "/reports/waiters", icon: "bi-person-lines-fill" },
      { key: "dishes", label: "Отчёт по блюдам", to: "/reports/dishes", icon: "bi-stars" },
      { key: "tables", label: "Отчёт по столам", to: "/reports/tables", icon: "bi-grid-3x3-gap" },
      { key: "cancelled-dishes", label: "Отчёт по отмененным блюдам", to: "/reports/cancelled-dishes", icon: "bi-x-octagon" },
    ],
  },
  {
    key: "users",
    label: "Сотрудники",
    icon: "bi-people",
    to: "/users",
    children: [
      { key: "cashier", label: "Кассир", to: "/users/cashier", icon: "bi-cash-coin" },
      { key: "waiter", label: "Официант", to: "/users/waiter", icon: "bi-person" },
      { key: "kitchen", label: "Повар", to: "/users/kitchen", icon: "bi-chef-hat" },
      { key: "monoblock", label: "Моноблок", to: "/users/monoblock", icon: "bi-pc-display" },
      { key: "manager", label: "Менеджер", to: "/users/manager", icon: "bi-person-gear" },
      { key: "warehouse", label: "Завсклад", to: "/users/warehouse", icon: "bi-box-seam" },
      { key: "login-history", label: "История входа", to: "/users/login-history", icon: "bi-clock-history" },
      { key: "attendance", label: "Посещаемость", to: "/users/attendance", icon: "bi-calendar-check" },
    ],
  },
  {
    key: "nomenclature",
    label: "Меню",
    icon: "bi-boxes",
    to: "/nomenclature",
    children: [
      { key: "dish-categories", label: "Категория блюд", to: "/nomenclature/dish-categories", icon: "bi-grid" },
      { key: "dishes", label: "Блюда", to: "/nomenclature/dishes", icon: "bi-cup-hot" },
      { key: "sales-categories", label: "Категория товаров", to: "/nomenclature/sales-categories", icon: "bi-tags" },
      { key: "sales", label: "Товары", to: "/nomenclature/sales", icon: "bi-basket" },
      { key: "menu", label: "Продажа", to: "/nomenclature/menu", icon: "bi-journal-bookmark" },
      { key: "stop-list", label: "Стоп-лист", to: "/nomenclature/stop-list", icon: "bi-x-octagon" },
    ],
  },
  {
    key: "warehouse",
    label: "Склад",
    icon: "bi-box-seam",
    to: "/warehouse",
    children: [
      { key: "raw-categories", label: "Категория продуктов", to: "/nomenclature/raw-categories", icon: "bi-boxes" },
      { key: "raw-materials", label: "Продукты", to: "/nomenclature/raw-materials", icon: "bi-basket" },
    ],
  },
  {
    key: "warehouse-report",
    label: "Отчёт по складам",
    icon: "bi-file-earmark-bar-graph",
    to: "/stock-report",
    children: [
      { key: "incoming-journal", label: "Добавить продуктов", to: "/stock-report/incoming-journal", icon: "bi-clock-history" },
      { key: "incoming", label: "Приход товаров", to: "/stock-report/incoming", icon: "bi-box-arrow-in-down" },
      { key: "outgoing", label: "Расход товаров", to: "/stock-report/outgoing", icon: "bi-box-arrow-up" },
      { key: "stock", label: "Остаток", to: "/stock-report/stock", icon: "bi-boxes" },
      { key: "inventory", label: "Инвентаризация", to: "/stock-report/inventory", icon: "bi-clipboard-check" },
      { key: "waste", label: "Отход товаров", to: "/stock-report/waste", icon: "bi-recycle" },
    ],
  },
  {
    key: "finance",
    label: "Финансы",
    icon: "bi-wallet2",
    to: "/finance",
    children: [
      { key: "transactions", label: "Денежные операции", to: "/finance/transactions", icon: "bi-cash-stack" },
      { key: "income-categories", label: "Категория приходов", to: "/finance/income-categories", icon: "bi-arrow-down-left-circle" },
      { key: "expense-categories", label: "Категория расходов", to: "/finance/expense-categories", icon: "bi-arrow-up-right-circle" },
      { key: "debtors-creditors", label: "Дебиторы и кредиторы", to: "/finance/debtors-creditors", icon: "bi-wallet2" },
    ],
  },
  {
    key: "settings",
    label: "Настройки",
    icon: "bi-gear",
    to: "/settings",
    children: [
      { key: "clients", label: "Клиенты", to: "/settings/clients", icon: "bi-person-fill" },
      { key: "branches", label: "Филиалы", to: "/settings/branches", icon: "bi-shop" },
      { key: "places", label: "Место", to: "/settings/places", icon: "bi-geo-alt" },
      { key: "payment-methods", label: "Способ оплаты", to: "/settings/payment-methods", icon: "bi-credit-card" },
      { key: "units", label: "Единица измерения", to: "/settings/units", icon: "bi-rulers" },
      { key: "printers", label: "Настройка принтеров", to: "/settings/printers", icon: "bi-printer" },
      { key: "receipt", label: "Настройка чека", to: "/settings/receipt", icon: "bi-receipt" },
      { key: "kitchen-receipt", label: "Настройка чека повара", to: "/settings/kitchen-receipt", icon: "bi-cup-hot" },
    ],
  },
];

// Ключи переводов для пунктов меню — по МАРШРУТУ, а не по `key`.
// Маршрут уникален, а `key` повторяется: `warehouse` — это и раздел «Склад»,
// и роль «Завсклад» в «Сотрудниках». Пока в интерфейсе был только русский,
// подписи жили прямо в массиве; теперь при смене языка меню переводится
// целиком, а label остаётся фолбэком, если ключа в словаре нет.
export const NAV_LABEL_KEYS = {
  "/": "nav.dashboard",
  "/reports": "nav.reports",
  "/reports/z-report": "nav.z_report",
  "/reports/orders": "nav.orders_report",
  "/reports/waiters": "nav.waiters_report",
  "/reports/dishes": "nav.dishes_report",
  "/reports/tables": "nav.tables_report",
  "/reports/cancelled-dishes": "nav.cancelled_dishes_report",
  "/users": "nav.staff",
  "/users/cashier": "nav.cashier",
  "/users/waiter": "nav.waiter",
  "/users/kitchen": "nav.cook",
  "/users/monoblock": "nav.monoblock",
  "/users/manager": "nav.manager",
  "/users/warehouse": "nav.warehouse_keeper",
  "/users/login-history": "nav.login_history",
  "/users/attendance": "nav.attendance",
  "/nomenclature": "nav.menu",
  "/nomenclature/dish-categories": "nav.dish_categories",
  "/nomenclature/dishes": "nav.dishes",
  "/nomenclature/sales-categories": "nav.sale_categories",
  "/nomenclature/sales": "nav.goods",
  "/nomenclature/menu": "nav.sale",
  "/nomenclature/stop-list": "nav.stop_list",
  "/warehouse": "nav.warehouse",
  "/nomenclature/raw-categories": "nav.raw_categories",
  "/nomenclature/raw-materials": "nav.raw_materials",
  "/stock-report": "nav.stock_report",
  "/stock-report/incoming-journal": "nav.incoming_journal",
  "/stock-report/incoming": "nav.incoming",
  "/stock-report/outgoing": "nav.outgoing",
  "/stock-report/stock": "nav.stock",
  "/stock-report/inventory": "nav.inventory",
  "/stock-report/waste": "nav.waste",
  "/finance": "nav.finance",
  "/finance/transactions": "nav.transactions",
  "/finance/income-categories": "nav.income_categories",
  "/finance/expense-categories": "nav.expense_categories",
  "/finance/debtors-creditors": "nav.debtors_creditors",
  "/settings": "nav.settings",
  "/settings/clients": "nav.clients",
  "/settings/branches": "nav.branches",
  "/settings/places": "nav.places",
  "/settings/payment-methods": "nav.payment_methods",
  "/settings/units": "nav.units",
  "/settings/printers": "nav.printer_settings",
  "/settings/receipt": "nav.receipt_settings",
  "/settings/kitchen-receipt": "nav.kitchen_receipt_settings",
};

export function navLabelKey(to) {
  return NAV_LABEL_KEYS[String(to || "")] || "";
}
