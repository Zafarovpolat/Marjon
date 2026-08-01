/**
 * Демо-данные, справочники и чистые хелперы админки.
 *
 * Вынесено из AdminApp.jsx механически (tools/extract-admin-data.mjs): это
 * объявления без JSX и без React-хуков, не зависящие от компонентов ни прямо,
 * ни транзитивно. Порядок объявлений сохранён — от него зависит инициализация
 * const. Поведение не менялось.
 */
import { adminApi, adminLogin, adminLogout, isAdminAuthenticated } from "./api";

const SECTION_API_MAP = {
  "org-list": { endpoint: "/organizations", mapRow: (r) => [r.company_name || r.name || "", r.type || "Ресторан", String(r.branches_count || r.branch_count || 0), r.admin_name || r.owner_name || "—", r.status || "Активна"] },
  "org-status": { endpoint: "/organization-statuses", mapRow: (r) => [r.name || "", r.status || "", r.updated_at || "—", r.manager || "—", r.state || r.status || ""] },
  "storage-income": { endpoint: "/comings", mapRow: (r) => [r.document_number || r.id || "", r.provider_name || r.supplier || "", String(r.items_count || 0), `${Number(r.total || 0).toLocaleString("ru-RU")} UZS`, r.status || "Проведен"] },
  "storage-expense": { endpoint: "/storage-movements", mapRow: (r) => [r.document_number || r.id || "", r.receiver || r.destination || "", String(r.items_count || 0), `${Number(r.total || 0).toLocaleString("ru-RU")} UZS`, r.status || "Проведен"] },
  "storage-balance": { endpoint: "/reports/storage-balances", mapRow: (r) => [r.name || "", r.category || "", String(r.quantity || r.balance || 0), r.unit || "", r.status || "В норме"] },
  "storage-income-journal": { endpoint: "/reports/incomes", mapRow: (r) => [r.date || "", r.document_number || "", r.provider_name || "", `${Number(r.total || 0).toLocaleString("ru-RU")} UZS`, r.status || "Проведен"] },
  "storage-writeoff": { endpoint: "/reports/consumption", mapRow: (r) => [r.document_number || r.id || "", r.reason || "", String(r.items_count || 0), `${Number(r.total || 0).toLocaleString("ru-RU")} UZS`, r.status || "Проведен"] },
  "storage-inventory": { endpoint: "/storages", mapRow: (r) => [r.name || r.id || "", r.warehouse || r.storage_name || "", String(r.discrepancies || 0), r.date || "—", r.status || "Завершено"] },
  "nom-product": { endpoint: "/products", mapRow: null },
  "nom-sale-category": { endpoint: "/categories", mapRow: (r) => [r.name || "", r.slug || "", String(r.products_count || 0), r.sort_order != null ? String(r.sort_order) : "—", r.status ? "Активна" : "Неактивна"] },
  "nom-orders": { endpoint: "/orders", mapRow: (r) => [r.order_number || r.id || "", r.date || r.created_at || "", r.customer || "—", `${Number(r.total || 0).toLocaleString("ru-RU")} UZS`, r.status || ""] },
  "nom-unit": { endpoint: "/units", mapRow: (r) => [r.name || "", r.short_name || r.code || "", r.type || "—", r.is_base ? "Базовая" : "—", r.status !== false ? "Активна" : "Неактивна"] },
  "hb-countries": { endpoint: "/countries", mapRow: (r) => [r.name || "", r.code || r.iso || "", r.phone_code || "", r.currency || "—", r.status !== false ? "Активна" : "Неактивна"] },
  "hb-regions": { endpoint: "/regions", mapRow: (r) => [r.name || "", r.country_name || r.country || "", r.code || "—", String(r.districts_count || 0), r.status !== false ? "Активна" : "Неактивна"] },
  "hb-districts": { endpoint: "/districts", mapRow: (r) => [r.name || "", r.region_name || r.region || "", r.code || "—", "—", r.status !== false ? "Активна" : "Неактивна"] },
  "srv-employees": { endpoint: "/departments", mapRow: (r) => [r.name || "", r.position || r.role || "—", r.department || "—", r.privileges || "—", r.status !== false ? "Активна" : "Неактивна"] },
  "srv-source": { endpoint: "/sources", mapRow: (r) => [r.name || "", r.type || "—", r.url || "—", String(r.leads_count || 0), r.status !== false ? "Активна" : "Неактивна"] },
  "bank-stats": { endpoint: "/reports/debt-credit", mapRow: null },
  "bank-transactions": { endpoint: "/finance/transactions", mapRow: null },
  "set-store": { endpoint: "/store-versions", mapRow: (r) => [r.version || r.name || "", r.platform || "—", r.release_date || "—", r.status || "Активна"] },
  "set-cashier-bg": { endpoint: "/image-backgrounds", mapRow: null },
  "set-languages": { endpoint: "/languages", mapRow: (r) => [r.name || "", r.code || "", r.is_default ? "Да" : "Нет", r.status !== false ? "Активна" : "Неактивна"] },
};

const navItems = [
  { key: "dashboard", label: "Дашборд", icon: "bi-grid-1x2-fill" },
  {
    key: "organizations", label: "Организации", icon: "bi-buildings",
    children: [
      { key: "org-list", label: "Организация", icon: "bi-building" },
      { key: "org-status", label: "Статус организации", icon: "bi-info-circle" },
    ],
  },
  {
    key: "storage", label: "Склад", icon: "bi-box-seam",
    children: [
      { key: "storage-income", label: "Приход товаров", icon: "bi-box-arrow-in-down" },
      { key: "storage-expense", label: "Расход товаров", icon: "bi-box-arrow-up" },
      { key: "storage-balance", label: "Остаток", icon: "bi-boxes" },
      { key: "storage-income-journal", label: "Журнал приходов", icon: "bi-journal-text" },
      { key: "storage-writeoff", label: "Отход товаров", icon: "bi-trash3" },
      { key: "storage-inventory", label: "Инвентаризация", icon: "bi-clipboard-check" },
    ],
  },
  {
    key: "nomenclature", label: "Номенклатура", icon: "bi-boxes",
    children: [
      { key: "nom-product", label: "Продукт", icon: "bi-box-seam" },
      { key: "nom-sale-category", label: "Категория реализации", icon: "bi-tags" },
      { key: "nom-orders", label: "Заказы", icon: "bi-receipt" },
      { key: "nom-unit", label: "Единица измерения", icon: "bi-rulers" },
    ],
  },
  {
    key: "handbook", label: "Справочник", icon: "bi-journal-bookmark",
    children: [
      { key: "hb-countries", label: "Страны", icon: "bi-geo-alt" },
      { key: "hb-regions", label: "Регионы", icon: "bi-collection" },
      { key: "hb-districts", label: "Районы", icon: "bi-grid" },
    ],
  },
  {
    key: "service", label: "Услуга", icon: "bi-headset",
    children: [
      { key: "srv-employees", label: "Сотрудники", icon: "bi-people" },
      { key: "srv-source", label: "Источник", icon: "bi-megaphone" },
    ],
  },
  {
    key: "bank", label: "Банк", icon: "bi-bank",
    children: [
      { key: "bank-stats", label: "Статистика банка", icon: "bi-bar-chart-line" },
      { key: "bank-transactions", label: "Транзакции банка", icon: "bi-currency-exchange" },
    ],
  },
  {
    key: "finance", label: "Финансы", icon: "bi-wallet2",
    children: [
      { key: "fin-operations", label: "Денежные операции", icon: "bi-cash-stack" },
      { key: "fin-income-cat", label: "Категория приходов", icon: "bi-arrow-down-left-circle" },
      { key: "fin-expense-cat", label: "Категория расходов", icon: "bi-arrow-up-right-circle" },
      { key: "fin-payment", label: "Способ оплаты", icon: "bi-credit-card" },
      { key: "fin-history", label: "История изменений", icon: "bi-clock-history" },
    ],
  },
  {
    key: "settings", label: "Настройки", icon: "bi-gear",
    children: [
      { key: "set-store", label: "Marjon store", icon: "bi-shop" },
      { key: "set-cashier-bg", label: "Фон для кассира", icon: "bi-image" },
      { key: "set-languages", label: "Языки", icon: "bi-translate" },
    ],
  },
];

const DEMO_ORGANIZATION_ROW_COUNT = 240;

const DEMO_TRANSACTION_ROW_COUNT = 96;

const kpis = [
  {
    title: "Всего организаций",
    value: "0",
    delta: "—",
    icon: "bi-buildings",
    tone: "blue",
    dataKey: "organizations",
    points: [16, 22, 18, 34, 30, 46, 42, 56],
    desc: "Всего подключённых организаций на платформе MARJON, включая активные и на модерации.",
  },
  {
    title: "Оплаченная сумма",
    value: "0",
    delta: "—",
    icon: "bi-cash-coin",
    tone: "green",
    dataKey: "branches",
    points: [18, 24, 32, 28, 42, 48, 51, 60],
    desc: "Филиалы с активной кассой и работающей синхронизацией за выбранный период.",
  },
  {
    title: "Выполненная работа",
    value: "0",
    delta: "—",
    icon: "bi-clipboard-check",
    tone: "violet",
    dataKey: "subscriptions",
    points: [58, 48, 52, 42, 39, 35, 30, 26],
    desc: "Заявки на подключение, изменение тарифа и услуги, ожидающие решения модератора.",
  },
  {
    title: "Оборот за месяц",
    value: "0 UZS",
    delta: "—",
    icon: "bi-graph-up-arrow",
    tone: "orange",
    dataKey: "revenue",
    points: [20, 26, 31, 44, 40, 55, 63, 72],
    desc: "Суммарный оборот всех организаций платформы за текущий месяц в узбекских сумах.",
  },
  {
    title: "Не оплачено",
    value: "0",
    delta: "—",
    icon: "bi-receipt",
    tone: "cyan",
    dataKey: "cashboxes",
    points: [18, 22, 28, 27, 35, 42, 47, 55],
    desc: "Подключённые кассовые рабочие места с активной синхронизацией.",
  },
];

const ADMIN_DASHBOARD_DEMO_MODE = true;

const demoKpiOverrides = {
  organizations: {
    value: DEMO_ORGANIZATION_ROW_COUNT.toLocaleString("ru-RU"),
    delta: "Демо-база клиентов",
    points: [1, 1, 1, 1, 1, 1, 1, 1],
    desc: "Демо-база организаций для проверки админского дашборда без записи данных в backend.",
  },
  branches: {
    value: "2",
    delta: "+2 активных филиала",
    points: [1, 1, 1, 2, 2, 2, 2, 2],
    desc: "Два активных филиала Marjon Cafe с рабочими кассами и синхронизацией.",
  },
  subscriptions: {
    value: "1",
    delta: "1 заявка на одобрение",
    points: [0, 1, 1, 0, 1, 1, 1, 1],
    desc: "Одна демо-заявка Marjon Cafe ожидает решения администратора.",
  },
  revenue: {
    value: "187 450 000 UZS",
    delta: "+24% к прошлому месяцу",
    points: [18, 42, 76, 119, 156, 187],
    desc: "Демо-оборот Marjon Cafe за текущий месяц.",
  },
  cashboxes: {
    value: "4",
    delta: "3 онлайн, 1 резерв",
    points: [2, 2, 3, 3, 4, 4, 4, 4],
    desc: "Кассовые рабочие места Marjon Cafe: три активные кассы и одна резервная.",
  },
};

const dashboardKpiOrder = ["revenue", "organizations", "subscriptions", "branches", "cashboxes"];

function orderDashboardKpis(items) {
  return [...items].sort((a, b) => {
    const firstIndex = dashboardKpiOrder.indexOf(a.dataKey);
    const secondIndex = dashboardKpiOrder.indexOf(b.dataKey);
    return (firstIndex === -1 ? dashboardKpiOrder.length : firstIndex) - (secondIndex === -1 ? dashboardKpiOrder.length : secondIndex);
  });
}

const demoKpis = orderDashboardKpis(kpis.map((kpi) => ({
  ...kpi,
  ...(demoKpiOverrides[kpi.dataKey] || {}),
})));

const dashboardWarehouseCards = [
  { title: "Приход товаров", value: "11 575 000 UZS", subtitle: "За всё время", icon: "bi-box-arrow-in-down", tone: "income", route: "storage-income" },
  { title: "Расход товаров", value: "0 UZS", subtitle: "За всё время", icon: "bi-box-arrow-up", tone: "expense", route: "storage-expense" },
  { title: "Остаток склада", value: "958 892 000 UZS", subtitle: "Текущий остаток", icon: "bi-boxes", tone: "stock", route: "storage-balance" },
  { title: "Общие затраты", value: "0 UZS", subtitle: "За всё время", icon: "bi-receipt", tone: "cost" },
  { title: "Кредиторка", value: "994 000 UZS", subtitle: "Текущая задолженность", icon: "bi-credit-card", tone: "payable" },
  { title: "Дебиторка", value: "0 UZS", subtitle: "Текущая задолженность", icon: "bi-wallet2", tone: "receivable" },
];

const organizationRows = [];

const organizationDirectoryRows = [
  {
    id: "1002945",
    message: true,
    service: "Yangi",
    paymentType: "Без оплаты",
    name: "MUSTAFO CAFE",
    clientId: "1002945",
    terminals: "0",
    cashboxes: "2",
    deposit: "0",
    debt: "2 000 000",
    overdue: "0",
    contract: "0",
    tariff: "300 000",
    currency: "UZS",
    contact: "998 88 752 11 10",
    region: "Andijon",
    manager: "SAITOV SARVAR",
    date: "02.07.2026",
    source: "Diler",
    version: "15.04",
    orgStatus: "ISHLA TURGAN",
    identification: "Проверено",
    paymentKind: "Тариф платежи",
    status: "Доступен",
    onlineMenu: "Активно",
    warehouse: "Активно",
    cashboxOnline: "Активно",
  },
  {
    id: "1002944",
    message: true,
    service: "Xizmat",
    paymentType: "Без оплаты",
    name: "BAYKAL RESTAURANT",
    clientId: "1002944",
    terminals: "0",
    cashboxes: "0",
    deposit: "0",
    debt: "0",
    overdue: "0",
    contract: "0",
    tariff: "300 000",
    currency: "UZS",
    contact: "998 20 004 62 42",
    region: "Andijon",
    manager: "SAITOV SARVAR",
    date: "02.07.2026",
    source: "Diler",
    version: "15.04",
    orgStatus: "ISHLA TURGAN",
    identification: "Проверено",
    paymentKind: "Тариф платежи",
    status: "Доступен",
    onlineMenu: "Активно",
    warehouse: "Активно",
    cashboxOnline: "Активно",
  },
  {
    id: "1002939",
    message: true,
    service: "Xizmat",
    paymentType: "Без оплаты",
    name: "Burger",
    clientId: "1002939",
    terminals: "0",
    cashboxes: "0",
    deposit: "0",
    debt: "0",
    overdue: "0",
    contract: "1 500 000",
    tariff: "300 000",
    currency: "UZS",
    contact: "998 77 103 20 80",
    region: "Namangan",
    manager: "HAMZAYEV SARDOR",
    date: "01.07.2026",
    source: "Instagram",
    version: "",
    orgStatus: "USTANOVKA JARAYONIDA",
    identification: "Ожидает",
    paymentKind: "Тариф платежи",
    status: "Активно",
    onlineMenu: "Активно",
    warehouse: "Не активно",
    cashboxOnline: "Активно",
  },
  {
    id: "1002938",
    message: true,
    service: "Xizmat",
    paymentType: "Без оплаты",
    name: "Сушихона Мукаммал",
    clientId: "1002938",
    terminals: "0",
    cashboxes: "0",
    deposit: "0",
    debt: "0",
    overdue: "0",
    contract: "7 880 000",
    tariff: "300 000",
    currency: "UZS",
    contact: "998 90 577 50 20",
    region: "Andijon",
    manager: "MIRYEVANOV BOTUV",
    date: "30.06.2026",
    source: "Telegram",
    version: "",
    orgStatus: "USTANOVKA JARAYONIDA",
    identification: "Ожидает",
    paymentKind: "Тариф платежи",
    status: "Не активно",
    onlineMenu: "Активно",
    warehouse: "Активно",
    cashboxOnline: "Не активно",
  },
  {
    id: "1002937",
    message: true,
    service: "Xizmat",
    paymentType: "Без оплаты",
    name: "Zarafshon baliqlari",
    clientId: "1002937",
    terminals: "1",
    cashboxes: "0",
    deposit: "-320 000",
    debt: "-2 400 000",
    overdue: "0",
    contract: "0",
    tariff: "300 000",
    currency: "UZS",
    contact: "998 94 047 37 77",
    region: "Samarqand",
    manager: "ALAMAT SOTUV",
    date: "30.06.2026",
    source: "Facebook",
    version: "",
    orgStatus: "HALI ULANMAGAN",
    identification: "Ожидает",
    paymentKind: "Тариф платежи",
    status: "Не активно",
    onlineMenu: "Активно",
    warehouse: "Не активно",
    cashboxOnline: "Не активно",
  },
  {
    id: "1002936",
    message: true,
    service: "Xizmat",
    paymentType: "Без оплаты",
    name: "Bek Food 2",
    clientId: "1002936",
    terminals: "0",
    cashboxes: "1",
    deposit: "0",
    debt: "-7 514 000",
    overdue: "0",
    contract: "0",
    tariff: "300 000",
    currency: "UZS",
    contact: "998 99 176 09 55",
    region: "JIZZAX",
    manager: "BOBOMURODOV",
    date: "29.06.2026",
    source: "Sarlavha",
    version: "15.04",
    orgStatus: "HALI ULANMAGAN",
    identification: "Проверено",
    paymentKind: "Тариф платежи",
    status: "Активно",
    onlineMenu: "Активно",
    warehouse: "Активно",
    cashboxOnline: "Активно",
  },
  {
    id: "1002935",
    message: true,
    service: "Xizmat",
    paymentType: "Без оплаты",
    name: "AROUVSOT OTA OSHXONASI",
    clientId: "1002935",
    terminals: "0",
    cashboxes: "0",
    deposit: "0",
    debt: "0",
    overdue: "0",
    contract: "4 480 000",
    tariff: "300 000",
    currency: "UZS",
    contact: "998 90 105 56 28",
    region: "Fargona",
    manager: "HAMZAYEV SARDOR",
    date: "28.06.2026",
    source: "Facebook",
    version: "",
    orgStatus: "HALI ULANMAGAN",
    identification: "Ожидает",
    paymentKind: "Тариф платежи",
    status: "Не активно",
    onlineMenu: "Активно",
    warehouse: "Активно",
    cashboxOnline: "Активно",
  },
  {
    id: "1002934",
    message: true,
    service: "Xizmat",
    paymentType: "Без оплаты",
    name: "Chickenlar",
    clientId: "1002934",
    terminals: "0",
    cashboxes: "0",
    deposit: "0",
    debt: "0",
    overdue: "0",
    contract: "3 530 000",
    tariff: "300 000",
    currency: "UZS",
    contact: "998 90 704 67 44",
    region: "Samarqand",
    manager: "HAMZAYEV SARDOR",
    date: "28.06.2026",
    source: "Facebook",
    version: "",
    orgStatus: "HALI ULANMAGAN",
    identification: "Ожидает",
    paymentKind: "Тариф платежи",
    status: "Не активно",
    onlineMenu: "Активно",
    warehouse: "Не активно",
    cashboxOnline: "Не активно",
  },
  {
    id: "1002933",
    message: true,
    service: "Xizmat",
    paymentType: "Без оплаты",
    name: "Negora",
    clientId: "1002933",
    terminals: "0",
    cashboxes: "0",
    deposit: "-390 000",
    debt: "0",
    overdue: "0",
    contract: "3 850 000",
    tariff: "300 000",
    currency: "UZS",
    contact: "998 77 103 15 96",
    region: "Surxondaryo",
    manager: "HAMZAYEV SARDOR",
    date: "28.06.2026",
    source: "Facebook",
    version: "15.04",
    orgStatus: "HALI ULANMAGAN",
    identification: "Ожидает",
    paymentKind: "Тариф платежи",
    status: "Не активно",
    onlineMenu: "Активно",
    warehouse: "Не активно",
    cashboxOnline: "Не активно",
  },
  {
    id: "1002932",
    message: false,
    service: "Yangi",
    paymentType: "Тест",
    name: "Ака-ука Restaurant",
    clientId: "1002932",
    terminals: "0",
    cashboxes: "0",
    deposit: "-320 000",
    debt: "-15 000",
    overdue: "0",
    contract: "0",
    tariff: "300 000",
    currency: "UZS",
    contact: "998 91 238 90 62",
    region: "Surxondaryo",
    manager: "HAMZAYEV SARDOR",
    date: "27.06.2026",
    source: "Ko'cha",
    version: "",
    orgStatus: "ISHLA TURGAN",
    identification: "Проверено",
    paymentKind: "Тест платежи",
    status: "Доступен",
    onlineMenu: "Активно",
    warehouse: "Активно",
    cashboxOnline: "Активно",
  },
  {
    id: "1002931",
    message: true,
    service: "Xizmat",
    paymentType: "Без оплаты",
    name: "GOLDEN UZBECHIM",
    clientId: "1002931",
    terminals: "0",
    cashboxes: "0",
    deposit: "-4 000 000",
    debt: "-1 440 000",
    overdue: "0",
    contract: "0",
    tariff: "300 000",
    currency: "UZS",
    contact: "998 99 056 38 97",
    region: "Samarqand",
    manager: "ZARIPOV JASUR",
    date: "27.06.2026",
    source: "Sarlavha",
    version: "15.04",
    orgStatus: "ISHLA TURGAN",
    identification: "Проверено",
    paymentKind: "Тариф платежи",
    status: "Доступен",
    onlineMenu: "Активно",
    warehouse: "Активно",
    cashboxOnline: "Активно",
  },
];

const demoOrganizationNames = [
  "MARJON CAFE", "MUSTAFO CAFE", "BAYKAL RESTAURANT", "SAMARKAND PLOV", "CHILONZOR GRILL",
  "YUNUSABAD COFFEE", "BESH QOZON", "TASHKENT FOOD HALL", "NAVOI STEAK HOUSE", "BUKHARA LAGMAN",
  "ANDIJON OSH MARKAZI", "FARGONA FAMILY CAFE", "NAMANGAN BURGER", "QARSHI DONER", "NUKUS BBQ",
  "URGENCH TERRACE", "JIZZAX SOMSA", "DENOV TEA HOUSE", "KOKAND BISTRO", "TERMIZ GARDEN",
  "SIRDARYO FAST FOOD", "ZARAFSHON BALIQ", "RISHTON CHOYXONA", "SHAHRISABZ CAFE",
];

const demoOrganizationRegions = [
  "Toshkent", "Andijon", "Samarqand", "Fargona", "Namangan", "Buxoro", "JIZZAX", "Navoiy",
  "Qashqadaryo", "Surxondaryo", "Xorazm", "Qoraqalpogiston", "Sirdaryo",
];

const demoOrganizationManagers = [
  "SAITOV SARVAR", "HAMZAYEV SARDOR", "MIRYEVANOV BOTUV", "ALAMAT SOTUV", "BOBOMURODOV",
  "ZARIPOV JASUR", "ABDULLAYEV AKMAL", "RAHIMOV AZIZ", "KARIMOVA DILNOZA", "USMONOV BEKZOD",
  "TURSUNOV JAMSHID", "IBRAGIMOV RUSTAM",
];

const demoOrganizationSources = ["Diler", "Instagram", "Telegram", "Facebook", "Sarlavha", "Referral", "Call center"];

const demoOrganizationStatuses = ["Доступен", "Активно", "Не активно"];

const demoOrganizationOrgStatuses = ["ISHLA TURGAN", "USTANOVKA JARAYONIDA", "HALI ULANMAGAN", "VAQTICHALI ISHLAMAYOTGAN", "TEST"];

const demoOrganizationPaymentKinds = ["Тариф платежи", "Тест платежи", "Абонентская оплата", "Разовая оплата"];

function formatDemoMoney(value) {
  return Math.round(value).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}

function buildDemoOrganizationRows() {
  return Array.from({ length: DEMO_ORGANIZATION_ROW_COUNT }, (_, index) => {
    const id = 1003001 + index;
    const name = `${demoOrganizationNames[index % demoOrganizationNames.length]} ${index % 4 === 0 ? "MAIN" : `FILIAL ${index % 9 + 1}`}`;
    const debt = index % 5 === 0 ? 0 : (index % 7 + 1) * 180000;
    const deposit = index % 6 === 0 ? -(index % 8 + 1) * 250000 : (index % 9) * 150000;
    const contract = index % 3 === 0 ? (index % 12 + 2) * 500000 : 0;
    const day = String(1 + (index % 28)).padStart(2, "0");
    const month = String(6 + (index % 2)).padStart(2, "0");
    const phoneTail = String(1000000 + ((index * 3791) % 8999999)).padStart(7, "0");

    return {
      id: String(id),
      message: index % 3 === 0,
      service: index % 4 === 0 ? "Yangi" : "Xizmat",
      paymentType: index % 6 === 0 ? "Тест" : index % 2 === 0 ? "Тариф" : "Без оплаты",
      name,
      clientId: String(id),
      terminals: String(index % 5),
      cashboxes: String((index % 4) + (index % 10 === 0 ? 2 : 0)),
      deposit: formatDemoMoney(deposit),
      debt: formatDemoMoney(debt),
      overdue: index % 8 === 0 ? formatDemoMoney((index % 6 + 1) * 90000) : "0",
      contract: formatDemoMoney(contract),
      tariff: formatDemoMoney(250000 + (index % 5) * 50000),
      currency: "UZS",
      contact: `998 ${90 + (index % 9)} ${phoneTail.slice(0, 3)} ${phoneTail.slice(3, 5)} ${phoneTail.slice(5)}`,
      region: demoOrganizationRegions[index % demoOrganizationRegions.length],
      manager: demoOrganizationManagers[index % demoOrganizationManagers.length],
      date: `${day}.${month}.2026`,
      source: demoOrganizationSources[index % demoOrganizationSources.length],
      version: index % 7 === 0 ? "" : `15.${String(index % 6).padStart(2, "0")}`,
      orgStatus: demoOrganizationOrgStatuses[index % demoOrganizationOrgStatuses.length],
      identification: index % 4 === 0 ? "Ожидает" : "Проверено",
      paymentKind: demoOrganizationPaymentKinds[index % demoOrganizationPaymentKinds.length],
      status: demoOrganizationStatuses[index % demoOrganizationStatuses.length],
      onlineMenu: index % 5 === 0 ? "Не активно" : "Активно",
      warehouse: index % 4 === 0 ? "Не активно" : "Активно",
      cashboxOnline: index % 6 === 0 ? "Не активно" : "Активно",
    };
  });
}

const demoOrganizationDirectoryRows = buildDemoOrganizationRows();

const approvalItems = [];

const systemItems = [];

const organizationStatusRows = [
  { id: "closed-bankrupt", name: "JOY YOPILGAN BONKROT", sort: 4, active: true },
  { id: "installing", name: "USTANOVKA JARAYONIDA", sort: 2, active: true },
  { id: "install-canceled", name: "USTANOVKA OTMEN BO'LGANI", sort: 8, active: true },
  { id: "returning", name: "QAYTARISHGA HARAKAT", sort: 7, active: true },
  { id: "test", name: "TEST", sort: 6, active: true },
  { id: "duplicate", name: "DUBLIKAT", sort: 5, active: true },
  { id: "moved-pr", name: "Y-N YOKI B-QA PR-GA O'TGAN", sort: 4, active: true },
  { id: "unknown", name: "SABABI NOMALUM", sort: 3, active: true },
  { id: "temporary-paused", name: "VAQTICHALI ISHLAMAYOTGAN", sort: 2, active: true },
  { id: "not-connected", name: "HALI ULANMAGAN", sort: 3, active: true },
  { id: "working", name: "ISHLAB TURGAN", sort: 1, active: true },
];

const productBranchRows = [
  { branch: "Хоразм филиал", income: 0, inventory: 0 },
  { branch: "Anqara", income: 0, inventory: 0 },
  { branch: "Тошкент филиал", income: 0, inventory: 0 },
  { branch: "Денов филиал", income: 0, inventory: 0 },
  { branch: "Фарғона филиал", income: 5160000, inventory: 0 },
  { branch: "Нурафшон филиал", income: 2283000, inventory: 0 },
  { branch: "Test Fillial", income: 0, inventory: 0 },
  { branch: "Андижон филиал", income: 0, inventory: 0 },
  { branch: "Нукус филиал", income: 0, inventory: 0 },
  { branch: "Сирдарё филиал", income: 0, inventory: 0 },
  { branch: "Самарканд филиал", income: 8063000, inventory: 0 },
  { branch: "Бухоро филиал", income: 0, inventory: 0 },
  { branch: "Жиззах филиал", income: 0, inventory: 0 },
  { branch: "Навоий филиал", income: 7320000, inventory: 0 },
  { branch: "Термиз филиал", income: 9020000, inventory: 0 },
  { branch: "Қарши филиал", income: 0, inventory: 0 },
  { branch: "Наманган филиал", income: 0, inventory: 0 },
  { branch: "Бош филиал", income: 34600000, inventory: 0 },
];

const ADMIN_PRODUCTS_STORAGE_KEY = "marjon-admin-products-v1";

const adminProductCategories = [
  "Хап",
  "Ускуналар (оборудование)",
  "Компьютер",
  "Моноблок",
  "Wi-Fi",
  "Принтер",
  "Кабель",
  "Сканер",
  "Хизматлар (услуги)",
];

const adminProductUnits = [
  "Метр (м)",
  "Килограмм (кг)",
  "Литр (л)",
  "Штук (шт)",
  "Порция (пр)",
  "Грамм (г)",
];

const adminProductWarehouses = [
  "Главный склад",
  "Склад Тошкент",
  "Склад расхода",
];

const adminProductRows = [
  { id: "tenda-sg108", name: "Tenda SG 108 8 Gigabit Power", category: "Хап", price: 240000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "menyu-xolder", name: "MENYU XOLDER", category: "Ускуналар (оборудование)", price: 15000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "headset-h320", name: "Наушник - hp Gaming Headset H320", category: "Компьютер", price: 400000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "monoblock-touch", name: "МОНОБЛОК (Иккита экранли) - 15 INCN DUAL SCREEN 41X25,5X41,5 см (WINDOWS) model : TS-15D09 TOUCH Pos machine", category: "Моноблок", price: 5808000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "wifi-alfa", name: "USB Wi-Fi Adapter - ALFA ALFANEXT", category: "Wi-Fi", price: 100, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "xprinter-xp365", name: "Xprinter mini printer, model : XP - 365 B (баркод)", category: "Принтер", price: 726000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "cuby-gs108d", name: "CUBY 8-Port Gigabit Desktop Switch (Хап) model : GS108D", category: "Хап", price: 240000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "xprinter-q80as", name: "Xprinter mini printer, model : XP - Q80AS", category: "Принтер", price: 720000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "network-cable", name: "Коврик (каттаси - клавиатура ва мышка учун)", category: "Компьютер", price: 35000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "sunkit-cable", name: "Обжимник - кабель учун икки функционали (Read Star SUNKIT SK-868G)", category: "Кабель", price: 100000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "menuholder-set", name: "Менюхолдер (Реклама учун подставка, (стол устидаги) комплект)", category: "Сканер", price: 25000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "abonent-service", name: "ойлик абонент тўлов", category: "Хизматлар (услуги)", price: 390000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "bank-acquiring", name: "Хамкор Банк эквайринг", category: "Хизматлар (услуги)", price: 4000000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "telegram-bot", name: "Телеграмм бот", category: "Хизматлар (услуги)", price: 4000000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "soliq-integration", name: "Солиқ интеграция", category: "Хизматлар (услуги)", price: 3000000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "user-manual-scale", name: "Электрон тарози User Manual", category: "Сканер", price: 4800000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "cash-drawer", name: "Касса аппарати CACH DRAWER", category: "Сканер", price: 960000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "meetion-c100", name: "Meetion USB CORDED COMBO C100 (клавиатура и мышь без проводная)", category: "Компьютер", price: 126000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "computer-set", name: "Компьютер комплект (монитор, процессор, клавиатура, мышка)", category: "Компьютер", price: 3300000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
  { id: "mercury-sg108", name: "MERCURY SG108 C (ХАП)", category: "Хап", price: 240000, unit: "Штук (шт)", status: "active", warehouse: "Главный склад", photo: "" },
];

function readStoredAdminProducts() {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(ADMIN_PRODUCTS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveStoredAdminProducts(rows) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ADMIN_PRODUCTS_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Local changes are still kept in memory when storage is unavailable.
  }
}

function normalizeAdminProduct(row, index = 0) {
  const rawStatus = String(row.status ?? "").toLowerCase();
  const isInactive = row.status === false || rawStatus.includes("inactive") || rawStatus.includes("неак");
  const isArchived = Boolean(row.archived) || rawStatus.includes("archiv") || rawStatus.includes("архив");

  return {
    id: String(row.id ?? row.product_id ?? `product-${index + 1}`),
    name: row.name || row.product_name || row.title || "",
    category: row.category_name || row.category?.name || row.category || "Без категории",
    price: Number(row.price ?? row.sale_price ?? row.cost_price ?? 0),
    unit: row.unit_name || row.unit?.name || row.unit || row.measure || "Штук (шт)",
    status: isInactive ? "inactive" : "active",
    warehouse: row.warehouse || row.storage_name || "Главный склад",
    photo: row.photo || row.image || row.image_url || "",
    archived: isArchived,
  };
}

function createAdminProductDraft(row = null) {
  return {
    id: row?.id || "",
    name: row?.name || "",
    category: row?.category || adminProductCategories[0],
    price: row?.price != null ? String(row.price) : "",
    unit: row?.unit || "Штук (шт)",
    status: row?.status || "active",
    warehouse: row?.warehouse || "Главный склад",
    photo: row?.photo || "",
    archived: Boolean(row?.archived),
  };
}

const ADMIN_SALE_CATEGORIES_STORAGE_KEY = "marjon-admin-sale-categories-v1";

const adminSaleCategoryRows = [
  { id: "equipment", name: "Ускуналар (оборудование)", status: "active" },
  { id: "services", name: "Хизматлар (услуги)", status: "active" },
  { id: "printer", name: "Принтер", status: "active" },
  { id: "computer", name: "Компьютер", status: "active" },
  { id: "cable", name: "Кабель", status: "active" },
  { id: "defect", name: "Яроксизлари (брак)", status: "active" },
  { id: "used", name: "Ишлатилганлари (б/у)", status: "active" },
  { id: "wi-fi", name: "Wi-Fi", status: "active" },
  { id: "check-paper", name: "Чек Когоз (Check Qog'oz)", status: "active" },
  { id: "monoblock-sale", name: "Моноблок", status: "active" },
  { id: "hub-sale", name: "Хап", status: "active" },
  { id: "scanner-sale", name: "Сканер", status: "active" },
  { id: "water-sale", name: "Сув", status: "active" },
];

function readStoredAdminSaleCategories() {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(ADMIN_SALE_CATEGORIES_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveStoredAdminSaleCategories(rows) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ADMIN_SALE_CATEGORIES_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // The current session still works if localStorage is unavailable.
  }
}

function normalizeAdminSaleCategory(row, index = 0) {
  const rawStatus = String(row.status ?? "").toLowerCase();
  const isInactive = row.status === false || rawStatus.includes("inactive") || rawStatus.includes("неак");

  return {
    id: String(row.id ?? row.category_id ?? `sale-category-${index + 1}`),
    name: row.name || row.title || row.category_name || "",
    status: isInactive ? "inactive" : "active",
  };
}

function createAdminSaleCategoryDraft(row = null) {
  return {
    id: row?.id || "",
    name: row?.name || "",
    status: row?.status || "active",
  };
}

const ADMIN_SOURCES_STORAGE_KEY = "marjon-admin-sources-v1";

const adminSourceRows = [
  { id: "16", name: "Trade" },
  { id: "15", name: "Kiruvchi qo'g'iroqlar" },
  { id: "14", name: "Sayt registratsiya" },
  { id: "13", name: "Telegram" },
  { id: "12", name: "Facebook" },
  { id: "8", name: "zimzim" },
  { id: "7", name: "Baza" },
  { id: "6", name: "ko'cha" },
  { id: "5", name: "Instagram eski" },
  { id: "4", name: "Diller" },
  { id: "3", name: "Sarafan" },
  { id: "2", name: "Instagram" },
];

function readStoredAdminSources() {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(ADMIN_SOURCES_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : null;
    return Array.isArray(parsed) ? parsed.map(normalizeAdminSource).filter((row) => row.name) : null;
  } catch {
    return null;
  }
}

function saveStoredAdminSources(rows) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ADMIN_SOURCES_STORAGE_KEY, JSON.stringify(rows.map(normalizeAdminSource)));
  } catch {
    // The current session still works if localStorage is unavailable.
  }
}

function normalizeAdminSource(row, index = 0) {
  return {
    id: String(row?.id ?? row?.source_id ?? index + 1),
    name: row?.name || row?.title || row?.source || "",
  };
}

function createAdminSourceDraft(row = null) {
  return {
    id: row?.id || "",
    name: row?.name || "",
  };
}

const ADMIN_ORDERS_STORAGE_KEY = "marjon-admin-orders-v1";

const adminOrderOrganizations = [
  "Qadrdonlar\" kafe",
  "Nomi hali tanlanmagan",
  "Simfoniya milliy taomlari",
  "Amirlik restorani",
  "Street food",
  "test Asliddin",
  "Cocacola cafe",
  "Milliy taomlar",
  "Xamro Milliy Taomlar",
  "Anxor kafe",
  "BAYKAL RESTAURANT",
  "KARVON OSHXONA",
];

const adminOrderProducts = [
  "MERCURY SG108 C (ХАП)",
  "Xprinter mini printer, model : XP - 80 TS",
  "Урнатиб бериш (Ustanovka)",
  "Tenda SG 108 8 Gigabit Power",
  "Компьютер комплект (монитор, процессор, клавиатура, мышка)",
  "Солиқ интеграция",
  "MERCUSYS 8-Port 10/100/1000 Mbps Deskor Switch, model : MS108G (ХАП)",
  "Xprinter mini printer, model : XP-T80 A",
];

const adminOrderRows = [
  { id: "45084949", organization: "Qadrdonlar\" kafe", paymentId: "1003024", items: [{ product: "MERCURY SG108 C (ХАП)", quantity: 1, price: 240000, comment: "-" }], status: "new" },
  { id: "45084881", organization: "Qadrdonlar\" kafe", paymentId: "1003024", items: [{ product: "Xprinter mini printer, model : XP - 80 TS", quantity: 2, price: 720000, comment: "-" }], status: "new" },
  { id: "45084826", organization: "Qadrdonlar\" kafe", paymentId: "1003024", items: [{ product: "Урнатиб бериш (Ustanovka)", quantity: 3, price: 1000000, comment: "-" }], status: "new" },
  { id: "45080376", organization: "Nomi hali tanlanmagan", paymentId: "1003023", items: [{ product: "Tenda SG 108 8 Gigabit Power", quantity: 1, price: 240000, comment: "-" }], status: "new" },
  { id: "45080306", organization: "Nomi hali tanlanmagan", paymentId: "1003023", items: [{ product: "Компьютер комплект (монитор, процессор, клавиатура, мышка)", quantity: 1, price: 3180000, comment: "-" }], status: "new" },
  { id: "45080199", organization: "Nomi hali tanlanmagan", paymentId: "1003023", items: [{ product: "Xprinter mini printer, model : XP - 80 TS", quantity: 3, price: 720000, comment: "-" }], status: "new" },
  { id: "45078782", organization: "Nomi hali tanlanmagan", paymentId: "1003023", items: [{ product: "Урнатиб бериш (Ustanovka)", quantity: 3, price: 1000000, comment: "-" }], status: "new" },
  { id: "45066810", organization: "Simfoniya milliy taomlari", paymentId: "1003022", items: [{ product: "MERCURY SG108 C (ХАП)", quantity: 1, price: 240000, comment: "-" }], status: "new" },
  { id: "45066702", organization: "Simfoniya milliy taomlari", paymentId: "1003022", items: [{ product: "Xprinter mini printer, model : XP - 80 TS", quantity: 2, price: 720000, comment: "-" }], status: "new" },
  { id: "45066589", organization: "Simfoniya milliy taomlari", paymentId: "1003022", items: [{ product: "Урнатиб бериш (Ustanovka)", quantity: 3, price: 1000000, comment: "-" }], status: "new" },
  { id: "45062063", organization: "Amirlik restorani", paymentId: "1003021", items: [{ product: "Урнатиб бериш (Ustanovka)", quantity: 3, price: 1000000, comment: "-" }], status: "new" },
  { id: "44996156", organization: "Street food", paymentId: "1002792", items: [], total: 390000, comment: "-", status: "cancelled" },
  { id: "44996117", organization: "Street food", paymentId: "1002792", items: [], total: 390000, comment: "-", status: "cancelled" },
  { id: "44953425", organization: "test Asliddin", paymentId: "1000104", items: [], total: 390000, comment: "-", status: "cancelled" },
  {
    id: "44949330",
    organization: "Cocacola cafe",
    paymentId: "1003020",
    items: [
      { product: "Урнатиб бериш (Ustanovka)", quantity: 2, price: 1000000, comment: "-" },
      { product: "Xprinter mini printer, model : XP - 80 TS", quantity: 2, price: 720000, comment: "-" },
      { product: "MERCUSYS 8-Port 10/100/1000 Mbps Deskor Switch, model : MS108G (ХАП)", quantity: 1, price: 240000, comment: "-" },
    ],
    status: "new",
  },
  { id: "44948636", organization: "Milliy taomlar", paymentId: "1003019", items: [{ product: "Урнатиб бериш (Ustanovka)", quantity: 2.5, price: 1000000, comment: "-" }], status: "new" },
  { id: "44947554", organization: "Xamro Milliy Taomlar", paymentId: "1002058", items: [{ product: "Солиқ интеграция", quantity: 1, price: 1000000, comment: "-" }], status: "accepted" },
  { id: "44941986", organization: "Anxor kafe", paymentId: "1003018", items: [{ product: "Урнатиб бериш (Ustanovka)", quantity: 2.5, price: 1000000, comment: "-" }], status: "new" },
  { id: "44886258", organization: "BAYKAL RESTAURANT", paymentId: "1002944", items: [{ product: "Урнатиб бериш (Ustanovka)", quantity: 1, price: 2500000, comment: "-" }], status: "new" },
  { id: "44886034", organization: "KARVON OSHXONA", paymentId: "1002113", items: [{ product: "Xprinter mini printer, model : XP-T80 A", quantity: 1, price: 600000, comment: "-" }], status: "new" },
];

function readStoredAdminOrders() {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(ADMIN_ORDERS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveStoredAdminOrders(rows) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ADMIN_ORDERS_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // The table remains usable for the current session if storage is unavailable.
  }
}

function normalizeAdminOrderStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("cancel") || value.includes("отмен")) return "cancelled";
  if (value.includes("accept") || value.includes("прин") || value.includes("done") || value.includes("заверш")) return "accepted";
  return "new";
}

function normalizeAdminOrder(row, index = 0) {
  const rawItems = Array.isArray(row.items)
    ? row.items
    : Array.isArray(row.products)
      ? row.products
      : Array.isArray(row.order_items)
        ? row.order_items
        : [];

  const items = rawItems.map((item, itemIndex) => ({
    id: String(item.id || `${row.id || index}-item-${itemIndex}`),
    product: item.product_name || item.name || item.product?.name || item.title || "—",
    quantity: Number(item.quantity || item.qty || 1),
    price: Number(item.price || item.amount || item.total || 0),
    comment: item.comment || "-",
  }));

  return {
    id: String(row.id || row.order_number || `order-${index + 1}`),
    organization: row.organization_name || row.branch_name || row.customer_name || row.customer || row.name || "—",
    paymentId: String(row.payment_id || row.paymentId || row.transaction_id || row.pay_id || "—"),
    items,
    total: Number(row.total || row.amount || items.reduce((sum, item) => sum + item.price * item.quantity, 0)),
    comment: row.comment || "-",
    status: normalizeAdminOrderStatus(row.status),
  };
}

function createAdminOrderDraft(row = null) {
  const items = row?.items?.length
    ? row.items
    : [{ id: `order-item-${Date.now()}`, product: adminOrderProducts[0], quantity: 1, price: 0, comment: "" }];

  return {
    id: row?.id || "",
    organization: row?.organization || adminOrderOrganizations[0],
    paymentId: row?.paymentId || "",
    status: row?.status || "new",
    items: items.map((item, index) => ({
      id: item.id || `order-item-${Date.now()}-${index}`,
      product: item.product || adminOrderProducts[0],
      quantity: String(item.quantity ?? 1),
      price: String(item.price ?? 0),
      comment: item.comment === "-" ? "" : item.comment || "",
    })),
  };
}

function getAdminOrderTotal(row) {
  if (row.items?.length) {
    return row.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  }

  return Number(row.total || 0);
}

function getAdminOrderProductsLabel(row) {
  if (!row.items?.length) return "—";

  return row.items
    .map((item) => `${item.product} — ${item.quantity}`)
    .join("\n");
}

const ADMIN_UNITS_STORAGE_KEY = "marjon-admin-units-v1";

const adminUnitRows = [
  { id: "meter", sort: 1, name: "Метр (м)", shortName: "м", status: "active" },
  { id: "kilogram", sort: 1, name: "Килограмм (кг)", shortName: "кг", status: "active" },
  { id: "liter", sort: 1, name: "Литр (л)", shortName: "л", status: "active" },
  { id: "piece", sort: 1, name: "Штук (шт)", shortName: "шт", status: "active" },
  { id: "portion", sort: 1, name: "Порция (пр)", shortName: "пр", status: "active" },
  { id: "gram", sort: 1, name: "Грамм (г)", shortName: "г", status: "active" },
];

function readStoredAdminUnits() {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(ADMIN_UNITS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveStoredAdminUnits(rows) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ADMIN_UNITS_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Keep the in-memory table working if localStorage is unavailable.
  }
}

function normalizeAdminUnit(row, index = 0) {
  const rawStatus = String(row.status ?? "").toLowerCase();
  const isInactive = row.status === false || rawStatus.includes("inactive") || rawStatus.includes("неак");

  return {
    id: String(row.id ?? row.unit_id ?? `unit-${index + 1}`),
    sort: Number(row.sort_order ?? row.sort ?? row.order ?? 1) || 1,
    name: row.name || row.title || "",
    shortName: row.short_name || row.shortName || row.code || row.abbreviation || "",
    status: isInactive ? "inactive" : "active",
  };
}

function createAdminUnitDraft(row = null) {
  return {
    id: row?.id || "",
    sort: row?.sort != null ? String(row.sort) : "1",
    name: row?.name || "",
    shortName: row?.shortName || "",
    status: row?.status || "active",
  };
}

const ADMIN_HANDBOOK_LOCATIONS_STORAGE_KEY = "marjon-admin-handbook-locations-v1";

const adminHandbookDefaultRows = {
  countries: [
    { id: "uzbekistan", name: "Узбекистан", code: "998", iso: "UZ", mask: "(##) ### ## ##", status: "active" },
  ],
  regions: [
    { id: "tashkent", name: "Ташкент", country: "Узбекистан", status: "active" },
  ],
  districts: [
    { id: "bektemir", name: "Бектемирский район", region: "Ташкент", status: "active" },
    { id: "mirabad", name: "Мирабадский район", region: "Ташкент", status: "active" },
    { id: "mirzo-ulugbek", name: "Мирзо-Улугбекский район", region: "Ташкент", status: "active" },
    { id: "sergeli", name: "Сергелийский район", region: "Ташкент", status: "active" },
    { id: "almazar", name: "Алмазарский район", region: "Ташкент", status: "active" },
    { id: "uchtepa", name: "Учтепинский район", region: "Ташкент", status: "active" },
    { id: "shaykhantakhur", name: "Шайхантахурский район", region: "Ташкент", status: "active" },
    { id: "yunusabad", name: "Юнусабадский район", region: "Ташкент", status: "active" },
    { id: "yakkasaray", name: "Яккасарайский район", region: "Ташкент", status: "active" },
    { id: "yashnabad", name: "Яшнабадский район", region: "Ташкент", status: "active" },
    { id: "chilanzar", name: "Чиланзарский район", region: "Ташкент", status: "active" },
    { id: "yangihayot", name: "Янгихаётский район", region: "Ташкент", status: "active" },
  ],
};

const adminHandbookActiveKind = {
  "hb-countries": "countries",
  "hb-regions": "regions",
  "hb-districts": "districts",
};

const adminHandbookConfig = {
  countries: {
    title: "Страны",
    singleTitle: "страну",
    editTitle: "страну",
    columns: ["№", "Название", "Статус"],
  },
  regions: {
    title: "Регионы",
    singleTitle: "регион",
    editTitle: "регион",
    columns: ["№", "Название", "Страна", "Статус"],
  },
  districts: {
    title: "Районы",
    singleTitle: "район",
    editTitle: "район",
    columns: ["№", "Название", "Регион", "Статус"],
  },
};

function normalizeAdminHandbookStatus(status) {
  const value = String(status ?? "").toLowerCase();
  return status === false || value.includes("inactive") || value.includes("неак") ? "inactive" : "active";
}

function normalizeAdminHandbookRow(kind, row = {}, index = 0) {
  const baseId = `${kind}-${index + 1}`;

  if (kind === "countries") {
    return {
      id: String(row.id || row.country_id || baseId),
      name: row.name || row.country || "Узбекистан",
      code: String(row.code || row.phone_code || "998"),
      iso: String(row.iso || row.alpha2 || row.short_code || "UZ").toUpperCase(),
      mask: row.mask || row.phone_mask || "(##) ### ## ##",
      status: normalizeAdminHandbookStatus(row.status),
    };
  }

  if (kind === "regions") {
    return {
      id: String(row.id || row.region_id || baseId),
      name: row.name || row.region || "Ташкент",
      country: row.country || row.country_name || "Узбекистан",
      status: normalizeAdminHandbookStatus(row.status),
    };
  }

  return {
    id: String(row.id || row.district_id || baseId),
    name: row.name || row.district || "",
    region: row.region || row.region_name || "Ташкент",
    status: normalizeAdminHandbookStatus(row.status),
  };
}

function normalizeAdminHandbookState(value = {}) {
  const countriesSource = Array.isArray(value.countries) && value.countries.length
    ? value.countries
    : adminHandbookDefaultRows.countries;
  const regionsSource = Array.isArray(value.regions) && value.regions.length
    ? value.regions
    : adminHandbookDefaultRows.regions;
  const districtsSource = Array.isArray(value.districts) && value.districts.length
    ? value.districts
    : adminHandbookDefaultRows.districts;

  return {
    countries: countriesSource.map((row, index) => normalizeAdminHandbookRow("countries", row, index)).slice(0, 1),
    regions: regionsSource.map((row, index) => normalizeAdminHandbookRow("regions", row, index)).slice(0, 1),
    districts: districtsSource.map((row, index) => normalizeAdminHandbookRow("districts", row, index)),
  };
}

function readStoredAdminHandbookLocations() {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(ADMIN_HANDBOOK_LOCATIONS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : null;
    return parsed && typeof parsed === "object" ? normalizeAdminHandbookState(parsed) : null;
  } catch {
    return null;
  }
}

function saveStoredAdminHandbookLocations(rows) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ADMIN_HANDBOOK_LOCATIONS_STORAGE_KEY, JSON.stringify(normalizeAdminHandbookState(rows)));
  } catch {
    // The current session remains usable if localStorage is unavailable.
  }
}

function createAdminHandbookDraft(kind, row = null, state = null) {
  const countryName = state?.countries?.[0]?.name || "Узбекистан";
  const regionName = state?.regions?.[0]?.name || "Ташкент";

  if (kind === "countries") {
    return {
      id: row?.id || "",
      name: row?.name || "Узбекистан",
      code: row?.code || "998",
      iso: row?.iso || "UZ",
      mask: row?.mask || "(##) ### ## ##",
      status: row?.status || "active",
    };
  }

  if (kind === "regions") {
    return {
      id: row?.id || "",
      name: row?.name || "Ташкент",
      country: row?.country || countryName,
      status: row?.status || "active",
    };
  }

  return {
    id: row?.id || "",
    name: row?.name || "",
    region: row?.region || regionName,
    status: row?.status || "active",
  };
}

const ADMIN_EMPLOYEES_STORAGE_KEY = "marjon-admin-employees-v1";

const adminEmployeeRoles = [
  "sales",
  "installer",
  "operator",
  "admin",
  "marketing",
  "tech_support",
  "product_manager",
  "moderator",
  "media",
];

const adminEmployeeDepartments = [
  "Продажи",
  "Установка",
  "Операторская",
  "Администрация",
  "Маркетинг",
  "Техподдержка",
  "Продукты",
  "Медиа",
];

const adminEmployeeRows = [
  { id: "88489", name: "OG'ABEK AXATOV", phone: "99893 810 70 70", roles: ["sales", "installer", "operator"], balance: 0, inRating: true, login: "938107070", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продажи", status: "active" },
  { id: "86840", name: "Sardor Hamzayev Admin", phone: "99800 000 00 02", roles: ["admin"], balance: 0, inRating: false, login: "000000002", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Администрация", status: "active" },
  { id: "86756", name: "Yo'ldashev Xurshid", phone: "99893 437 13 77", roles: ["sales", "operator", "installer"], balance: 0, inRating: true, login: "934371377", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продажи", status: "active" },
  { id: "86755", name: "Safayev Aziz", phone: "99888 140 60 68", roles: ["sales"], balance: 0, inRating: true, login: "881406068", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продажи", status: "active" },
  { id: "86071", name: "JAVOHIR SOTUV", phone: "99877 728 55 08", roles: ["sales", "installer"], balance: 0, inRating: true, login: "777285508", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Установка", status: "active" },
  { id: "85559", name: "DILSHOD XABIBULLAYEV SOTUV", phone: "99894 480 76 05", roles: ["sales", "installer", "operator"], balance: 0, inRating: true, login: "944807605", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продажи", status: "active" },
  { id: "83632", name: "Azamat turkiya", phone: "99800 000 55 55", roles: ["operator", "installer", "sales"], balance: 0, inRating: false, login: "000005555", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Операторская", status: "active" },
  { id: "83407", name: "RUSTAM UZOQOV SOTUV", phone: "99893 931 22 66", roles: ["sales", "installer"], balance: 0, inRating: true, login: "939312266", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продажи", status: "active" },
  { id: "83233", name: "OLIMJONOV AZAMAT SOTUV", phone: "99870 036 98 03", roles: ["sales", "installer"], balance: 0, inRating: true, login: "700369803", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Установка", status: "active" },
  { id: "78694", name: "Asadbek", phone: "99891 775 62 42", roles: ["operator", "tech_support"], balance: -3000000, inRating: true, login: "917756242", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Техподдержка", status: "active" },
  { id: "75275", name: "KAMOLIDDIN TARGETOLOG", phone: "99894 077 16 01", roles: ["marketing"], balance: 0, inRating: false, login: "940771601", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Маркетинг", status: "active" },
  { id: "74395", name: "MAVLONOV SHOHIRUH SOLIQ", phone: "99897 111 30 09", roles: ["installer", "operator", "sales", "tech_support"], balance: 0, inRating: true, login: "971113009", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Техподдержка", status: "active" },
  { id: "73122", name: "Kunlik Premya", phone: "99821 545 87 87", roles: ["media"], balance: 0, inRating: false, login: "215458787", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Медиа", status: "active" },
  { id: "72045", name: "TURAYEV ALISHER", phone: "99893 109 66 36", roles: ["sales", "operator", "tech_support"], balance: 0, inRating: true, login: "931096636", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продажи", status: "active" },
  { id: "69903", name: "SHOHABBOS DONYOROV SOTUV", phone: "99894 777 57 52", roles: ["sales"], balance: 0, inRating: true, login: "947775752", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продажи", status: "active" },
  { id: "69565", name: "AZIM O'KTAMOV SOTUV", phone: "99895 737 37 07", roles: ["sales"], balance: 0, inRating: true, login: "957373707", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продажи", status: "active" },
  { id: "62529", name: "811", phone: "99823 145 66 51", roles: ["product_manager"], balance: 0, inRating: false, login: "231456651", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продукты", status: "active" },
  { id: "62528", name: "812", phone: "99832 168 43 21", roles: ["product_manager"], balance: -30000000, inRating: false, login: "321684321", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продукты", status: "active" },
  { id: "62527", name: "813", phone: "99856 416 55 15", roles: ["product_manager"], balance: -60000000, inRating: false, login: "564165515", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продукты", status: "active" },
  { id: "62526", name: "814", phone: "99823 165 43 51", roles: ["product_manager"], balance: -51000000, inRating: false, login: "231654351", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продукты", status: "active" },
  { id: "62524", name: "815", phone: "99853 165 14 35", roles: ["product_manager"], balance: -95000000, inRating: false, login: "531651435", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продукты", status: "active" },
  { id: "62522", name: "816", phone: "99821 561 45 64", roles: ["product_manager"], balance: -73000000, inRating: false, login: "215614564", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продукты", status: "active" },
  { id: "62521", name: "817", phone: "99821 358 54 34", roles: ["product_manager"], balance: -80000000, inRating: false, login: "213585434", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продукты", status: "active" },
  { id: "60834", name: "Eldor Sotuv", phone: "99890 614 29 69", roles: ["sales", "installer"], balance: 0, inRating: false, login: "906142969", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продажи", status: "active" },
  { id: "60805", name: "Humoyun Targetolog", phone: "99899 300 48 28", roles: ["marketing"], balance: 0, inRating: false, login: "993004828", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Маркетинг", status: "active" },
  { id: "60437", name: "Шахзод Эркинбоев", phone: "99893 733 32 23", roles: ["product_manager", "moderator", "sales"], balance: -3000000, inRating: true, login: "937333223", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продукты", status: "active" },
  { id: "57297", name: "Хуршид Термиз филиал", phone: "99897 697 66 88", roles: ["installer", "sales"], balance: 0, inRating: false, login: "976976688", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Установка", status: "active" },
  { id: "57296", name: "Зохиджон Термиз", phone: "99893 234 65 65", roles: ["sales", "installer"], balance: 0, inRating: false, login: "932346565", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Установка", status: "active" },
  { id: "56337", name: "Akbar aka", phone: "99897 708 22 02", roles: ["product_manager", "sales", "installer"], balance: -24000000, inRating: true, login: "977082202", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продукты", status: "active" },
  { id: "56167", name: "Boltaboyev Jahongir Farg'ona Filial", phone: "99895 964 11 00", roles: ["installer", "sales", "moderator"], balance: -20000000, inRating: true, login: "959641100", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Установка", status: "active" },
  { id: "56018", name: "Samandar Akmalov Sotuv", phone: "99899 000 45 14", roles: ["sales"], balance: 0, inRating: false, login: "990004514", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Продажи", status: "active" },
  { id: "54448", name: "Asilbek Targetolog", phone: "99897 432 30 03", roles: ["marketing"], balance: -6000000, inRating: false, login: "974323003", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Маркетинг", status: "active" },
  { id: "54089", name: "Jonibek", phone: "99890 919 04 84", roles: ["media", "operator"], balance: 0, inRating: false, login: "909190484", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Медиа", status: "active" },
  { id: "51455", name: "Sardor aka M", phone: "99899 200 62 67", roles: ["marketing", "product_manager", "sales"], balance: 0, inRating: false, login: "992006267", telegram: "", workingDays: "6", workingTime: "9", salary: "", email: "", department: "Маркетинг", status: "active" },
];

function readStoredAdminEmployees() {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(ADMIN_EMPLOYEES_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : null;
    return Array.isArray(parsed) ? parsed.map(normalizeAdminEmployee).filter((row) => row.name) : null;
  } catch {
    return null;
  }
}

function saveStoredAdminEmployees(rows) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ADMIN_EMPLOYEES_STORAGE_KEY, JSON.stringify(rows.map(normalizeAdminEmployee)));
  } catch {
    // Keep the in-memory table working if localStorage is unavailable.
  }
}

function normalizeAdminEmployee(row = {}, index = 0) {
  const roleSource = Array.isArray(row.roles)
    ? row.roles
    : String(row.role || row.roles || "sales").split(/[,\s]+/);
  const roles = roleSource.map((role) => String(role).trim()).filter(Boolean);

  return {
    id: String(row.id || row.employee_id || `employee-${index + 1}`),
    name: row.name || row.full_name || row.fio || "",
    phone: row.phone || row.phone_number || row.mobile || "",
    roles: roles.length ? roles : ["sales"],
    balance: Number(row.balance || 0),
    inRating: row.inRating ?? row.in_rating ?? row.rating_enabled ?? true,
    login: row.login || row.username || "",
    password: row.password || "",
    telegram: row.telegram || row.telegram_id || "",
    workingDays: String(row.workingDays ?? row.working_days ?? "6"),
    workingTime: String(row.workingTime ?? row.working_time ?? "9"),
    salary: row.salary != null ? String(row.salary) : "",
    email: row.email || "",
    department: row.department || row.department_name || adminEmployeeDepartments[0],
    status: normalizeAdminHandbookStatus(row.status),
  };
}

function createAdminEmployeeDraft(row = null) {
  return {
    id: row?.id || "",
    name: row?.name || "",
    phone: row?.phone || "+998 ",
    roles: row?.roles?.length ? [...row.roles] : ["sales"],
    balance: row?.balance != null ? String(row.balance) : "0",
    inRating: row?.inRating ?? true,
    login: row?.login || "",
    password: row?.password || "",
    telegram: row?.telegram || "",
    workingDays: row?.workingDays || "6",
    workingTime: row?.workingTime || "9",
    salary: row?.salary || "",
    email: row?.email || "",
    department: row?.department || adminEmployeeDepartments[0],
    status: row?.status || "active",
  };
}

const storageIncomeBranchRows = [
  { branch: "Тошкент филиал", income: 32864000, inventory: 0 },
];

const storageIncomeDetailRows = [
  { id: "total", name: "Всего", quantity: 395, amount: 32864000, tone: "total" },
  { id: "realization", name: "Реализация", quantity: 395, amount: 32864000, tone: "green" },
  {
    id: "computer",
    name: "Компьютер",
    quantity: 18,
    amount: 814000,
    tone: "category",
    children: [
      { id: "mish-depo-v82", name: "Mish DEPO V82 (mishka)", quantity: "8 шт", amount: 464000 },
      { id: "keyboard-mat", name: "Коврик (каттаси - клавиатура ва мышка учун)", quantity: "10 шт", amount: 350000 },
    ],
  },
  {
    id: "cable",
    name: "Кабель",
    quantity: 351,
    amount: 1570000,
    tone: "category",
    children: [
      { id: "connector-cat-6", name: "Коннектор CAT 6", quantity: "350 шт", amount: 350000 },
      { id: "network-cable-cat6", name: "NET WORK CABLE (OUTDOOR CAT6 UTP 23 AWG CABLE) (korobkada buxta kabel)", quantity: "1 шт", amount: 1220000 },
    ],
  },
  {
    id: "printer",
    name: "Принтер",
    quantity: 10,
    amount: 7200000,
    tone: "category",
    children: [
      { id: "xprinter-xp-80-ts", name: "Xprinter mini printer, model : XP - 80 TS", quantity: "10 шт", amount: 7200000 },
    ],
  },
  {
    id: "monoblock",
    name: "Моноблок",
    quantity: 5,
    amount: 21000000,
    tone: "category",
    children: [
      { id: "monoblock-tsm-1514", name: "Моноблок - 15 Inch Monitor model : TSM-1514 (8-128 GB (Windows Cach Register)", quantity: "5 шт", amount: 21000000 },
    ],
  },
  {
    id: "scanner",
    name: "Сканер",
    quantity: 2,
    amount: 400000,
    tone: "category",
    children: [
      { id: "rfid-reader", name: "RFID READER (сканер, карта, браслетники)", quantity: "2 шт", amount: 400000 },
    ],
  },
  {
    id: "wifi",
    name: "Wi-Fi",
    quantity: 2,
    amount: 200000,
    tone: "category",
    children: [
      { id: "usb-wifi-alfa", name: "USB Wi-Fi Adapter - ALFA ALFANEXT", quantity: "2 шт", amount: 200000 },
    ],
  },
  {
    id: "hub",
    name: "Хап",
    quantity: 7,
    amount: 1680000,
    tone: "category",
    children: [
      { id: "tenda-sg-108", name: "Tenda SG 108 8 Gigabit Power", quantity: "7 шт", amount: 1680000 },
    ],
  },
  { id: "used-product", name: "Продукт Б/У", quantity: 0, amount: 0, tone: "green" },
];

const storageIncomeJournalRows = [
  {
    id: "income-88377",
    number: "88377",
    supplier: "Nanotech",
    warehouse: "Главный склад",
    incomingDate: "22.07.2026",
    registeredAt: "22.07.2026 / 18:22",
    registeredBy: "Ergashev Bahodir Bahriddinovich",
    acceptedAt: "22.07.2026 / 18:23",
    acceptedBy: "Ergashev Bahodir Bahriddinovich",
    itemCount: 1,
    total: 2400000,
    status: "принято",
    contractNumber: "—",
    comment: "Янги техника сотиб олинди.",
    items: [
      { id: "tenda-sg-108", name: "Tenda SG 108 8 Gigabit Power", price: 240000, quantity: 10, waste: "—", balance: 10, total: 2400000 },
    ],
  },
  {
    id: "income-88488",
    number: "88488",
    supplier: "ZARINLIGHT",
    warehouse: "Главный склад",
    incomingDate: "22.07.2026",
    registeredAt: "23.07.2026 / 10:31",
    registeredBy: "Ergashev Bahodir Bahriddinovich",
    acceptedAt: "23.07.2026 / 10:33",
    acceptedBy: "Ergashev Bahodir Bahriddinovich",
    itemCount: 1,
    total: 8400000,
    status: "принято",
    contractNumber: "—",
    comment: "Поступление оборудования на склад.",
    items: [
      { id: "xprinter-xp-80-ts-journal", name: "Xprinter mini printer, model : XP - 80 TS", price: 700000, quantity: 12, waste: "—", balance: 12, total: 8400000 },
    ],
  },
  {
    id: "income-87346",
    number: "87346",
    supplier: "Главный организация",
    warehouse: "Главный склад",
    incomingDate: "18.07.2026",
    registeredAt: "-",
    registeredBy: "",
    acceptedAt: "-",
    acceptedBy: "",
    itemCount: 1,
    total: 1000000,
    status: "принято",
    contractNumber: "—",
    comment: "Корректировка остатка по главному складу.",
    items: [
      { id: "keyboard-mat-journal", name: "Коврик для клавиатуры и мышки", price: 100000, quantity: 10, waste: "—", balance: 10, total: 1000000 },
    ],
  },
  {
    id: "income-87343",
    number: "87343",
    supplier: "ZARINLIGHT",
    warehouse: "Главный склад",
    incomingDate: "17.07.2026",
    registeredAt: "18.07.2026 / 15:03",
    registeredBy: "Ergashev Bahodir Bahriddinovich",
    acceptedAt: "18.07.2026 / 15:05",
    acceptedBy: "Ergashev Bahodir Bahriddinovich",
    itemCount: 4,
    total: 45760000,
    status: "принято",
    contractNumber: "—",
    comment: "Крупное поступление техники.",
    items: [
      { id: "monoblock-tsm-journal", name: "Моноблок - 15 Inch Monitor model : TSM-1514", price: 4200000, quantity: 5, waste: "—", balance: 5, total: 21000000 },
      { id: "printer-journal", name: "Xprinter mini printer, model : XP - 80 TS", price: 720000, quantity: 10, waste: "—", balance: 10, total: 7200000 },
      { id: "network-cable-journal", name: "NET WORK CABLE OUTDOOR CAT6 UTP", price: 1220000, quantity: 10, waste: "—", balance: 10, total: 12200000 },
      { id: "scanner-journal", name: "RFID READER", price: 680000, quantity: 7, waste: "—", balance: 7, total: 4760000 },
    ],
  },
  {
    id: "income-86630",
    number: "86630",
    supplier: "ZARINLIGHT",
    warehouse: "Главный склад",
    incomingDate: "15.07.2026",
    registeredAt: "15.07.2026 / 13:56",
    registeredBy: "Ergashev Bahodir Bahriddinovich",
    acceptedAt: "15.07.2026 / 14:03",
    acceptedBy: "Ergashev Bahodir Bahriddinovich",
    itemCount: 5,
    total: 11575000,
    status: "принято",
    contractNumber: "—",
    comment: "Приход расходных материалов.",
    items: [
      { id: "chek-paper-56-journal", name: "Chek qogoz 56/12 m Termolenta", price: 1500, quantity: 5000, waste: "—", balance: 5000, total: 7500000 },
      { id: "connector-cat6-journal", name: "Коннектор CAT 6", price: 1000, quantity: 350, waste: "—", balance: 350, total: 350000 },
      { id: "usb-wifi-journal", name: "USB Wi-Fi Adapter - ALFA ALFANEXT", price: 100000, quantity: 2, waste: "—", balance: 2, total: 200000 },
      { id: "hub-journal", name: "MERCURY SG108 C", price: 240000, quantity: 10, waste: "—", balance: 10, total: 2400000 },
      { id: "scanner-card-journal", name: "RFID карта", price: 37500, quantity: 30, waste: "—", balance: 30, total: 1125000 },
    ],
  },
  {
    id: "income-86397",
    number: "86397",
    supplier: "Nanotech",
    warehouse: "Главный склад",
    incomingDate: "14.07.2026",
    registeredAt: "14.07.2026 / 16:15",
    registeredBy: "Ergashev Bahodir Bahriddinovich",
    acceptedAt: "14.07.2026 / 16:21",
    acceptedBy: "Ergashev Bahodir Bahriddinovich",
    itemCount: 1,
    total: 3600000,
    status: "принято",
    contractNumber: "—",
    comment: "Поставка периферии.",
    items: [
      { id: "wireless-keyboard-journal", name: "WIRED KEYBOARD E-KB721 MEGA jet", price: 120000, quantity: 30, waste: "—", balance: 30, total: 3600000 },
    ],
  },
  {
    id: "income-86015",
    number: "86015",
    supplier: "Главный организация",
    warehouse: "Главный склад",
    incomingDate: "13.07.2026",
    registeredAt: "-",
    registeredBy: "",
    acceptedAt: "-",
    acceptedBy: "",
    itemCount: 1,
    total: 1000000,
    status: "принято",
    contractNumber: "—",
    comment: "Ручное поступление.",
    items: [
      { id: "manual-product-journal", name: "Продукт Б/У", price: 1000000, quantity: 1, waste: "—", balance: 1, total: 1000000 },
    ],
  },
  {
    id: "income-86222",
    number: "86222",
    supplier: "ZARINLIGHT",
    warehouse: "Главный склад",
    incomingDate: "13.07.2026",
    registeredAt: "14.07.2026 / 09:38",
    registeredBy: "Ergashev Bahodir Bahriddinovich",
    acceptedAt: "14.07.2026 / 10:03",
    acceptedBy: "Ergashev Bahodir Bahriddinovich",
    itemCount: 8,
    total: 21423000,
    status: "принято",
    contractNumber: "—",
    comment: "Поступление товаров для филиала Тошкент.",
    items: [
      { id: "paper-80-journal", name: "Chek qogoz 80/50 m Termolenta", price: 9000, quantity: 37, waste: "—", balance: 37, total: 333000 },
      { id: "xprinter-t837-journal", name: "Xprinter mini printer model : XP-T837L", price: 720000, quantity: 12, waste: "—", balance: 12, total: 8640000 },
      { id: "monoblock-extra-journal", name: "Моноблок TSM-1514", price: 4200000, quantity: 2, waste: "—", balance: 2, total: 8400000 },
      { id: "network-cable-extra-journal", name: "NET WORK CABLE CAT6", price: 1220000, quantity: 3, waste: "—", balance: 3, total: 3660000 },
      { id: "connector-extra-journal", name: "Коннектор CAT 6", price: 1000, quantity: 350, waste: "—", balance: 350, total: 350000 },
      { id: "wifi-extra-journal", name: "USB Wi-Fi Adapter", price: 200000, quantity: 2, waste: "—", balance: 2, total: 400000 },
      { id: "mouse-extra-journal", name: "Mish DEPO V82", price: 58000, quantity: 8, waste: "—", balance: 8, total: 464000 },
      { id: "mat-extra-journal", name: "Коврик для клавиатуры и мышки", price: 22000, quantity: 8, waste: "—", balance: 8, total: 176000 },
    ],
  },
  {
    id: "income-85484",
    number: "85484",
    supplier: "Главный организация",
    warehouse: "Главный склад",
    incomingDate: "11.07.2026",
    registeredAt: "-",
    registeredBy: "",
    acceptedAt: "-",
    acceptedBy: "",
    itemCount: 2,
    total: 1125000,
    status: "принято",
    contractNumber: "—",
    comment: "Дополнительное поступление.",
    items: [
      { id: "rfid-card-journal", name: "RFID карта", price: 37500, quantity: 20, waste: "—", balance: 20, total: 750000 },
      { id: "menuholder-journal", name: "Менюхолдер", price: 37500, quantity: 10, waste: "—", balance: 10, total: 375000 },
    ],
  },
];

const storageWriteoffRows = [];

const storageInventoryRows = [
  {
    id: "8350",
    registeredAt: "07.07.2026 / 10:31",
    registeredBy: "Ergashev Bahodir Bahriddinovich",
    warehouse: "Главный склад",
    comment: "-",
    type: "Приход и расход учтены",
    status: "принято",
    items: [
      { id: "mercusys-ms108g-inv", name: "MERCUSYS 8-Port 10/100/1000 Mbps Deskor Switch, model : MS108G (ХАП)", quantity: "+ 1", unit: "Штук (шт)" },
      { id: "computer-set-inv", name: "Компьютер комплект (монитор, процессор, клавиатура, мышка)", quantity: "+ 1", unit: "Штук (шт)" },
    ],
  },
];

const storageExpenseBranchRows = [
  { branch: "Тошкент филиал", expense: 13860000, inventory: 0 },
];

const storageExpenseDetailRows = [
  { id: "total", name: "Всего", quantity: 79, amount: 13860000, tone: "total" },
  { id: "realization", name: "Реализация", quantity: 79, amount: 13860000, tone: "green" },
  {
    id: "printer",
    name: "Принтер",
    quantity: 12,
    amount: 7680000,
    tone: "category",
    children: [
      { id: "xprinter-xp-t837l", name: "Xprinter mini printer model : XP-T837L", quantity: "1 шт", amount: 0 },
      { id: "xprinter-xp-80-ts-expense", name: "Xprinter mini printer, model : XP - 80 TS", quantity: "11 шт", amount: 7680000 },
    ],
  },
  {
    id: "monoblock",
    name: "Моноблок",
    quantity: 1,
    amount: 4200000,
    tone: "category",
    children: [
      { id: "monoblock-tsm-1514-expense", name: "Моноблок - 15 Inch Monitor model : TSM-1514 (8-128 GB (Windows Cach Register)", quantity: "1 шт", amount: 4200000 },
    ],
  },
  {
    id: "hub",
    name: "Хап",
    quantity: 5,
    amount: 480000,
    tone: "category",
    children: [
      { id: "mercury-sg108c", name: "MERCURY SG108 C (ХАП)", quantity: "2 шт", amount: 480000 },
      { id: "mercusys-ms108g", name: "MERCUSYS 8-Port 10/100/1000 Mbps Deskor Switch, model : MS108G (ХАП)", quantity: "3 шт", amount: 0 },
    ],
  },
  {
    id: "computer",
    name: "Компьютер",
    quantity: 1,
    amount: 0,
    tone: "category",
    children: [
      { id: "computer-set", name: "Компьютер комплект (монитор, процессор, клавиатура, мышка)", quantity: "1 шт", amount: 0 },
    ],
  },
  {
    id: "scanner",
    name: "Сканер",
    quantity: 60,
    amount: 1500000,
    tone: "category",
    children: [
      { id: "menuholder", name: "Менюхолдер (Реклама учун подставка, (стол устидаги) комплект)", quantity: "60 шт", amount: 1500000 },
    ],
  },
  { id: "used-product", name: "Продукт Б/У", quantity: 0, amount: 0, tone: "green" },
];

const storageBalanceBranchRows = [
  { branch: "Тошкент филиал", balance: "7 462", amount: 384273000 },
];

const storageBalanceDetailRows = [
  { id: "total", name: "Всего", quantity: "7 462", amount: 384273000, tone: "total" },
  { id: "realization", name: "Реализация", quantity: "7 462", amount: 384273000, tone: "green" },
  {
    id: "cable",
    name: "Кабель",
    quantity: "1 947",
    amount: 15604000,
    tone: "category",
    children: [
      { id: "connector-cat-5-balance", name: "Коннектор CAT 5", quantity: "-50 шт", amount: 0 },
      { id: "connector-cat-6-balance", name: "Коннектор CAT 6", quantity: "1 984 шт", amount: 1984000 },
      { id: "network-cable-cat6-balance", name: "NET WORK CABLE (OUTDOOR CAT6 UTP 23 AWG CABLE) (korobkada buxta kabel)", quantity: "11 шт", amount: 13420000 },
      { id: "sunkit-sk-868g-balance", name: "Обжимник - кабель учун икки функцияли (Read Star SUNKIT SK-868G)", quantity: "2 шт", amount: 200000 },
    ],
  },
  {
    id: "check-paper",
    name: "Chek Qog'oz",
    quantity: "5 223",
    amount: 8112000,
    tone: "category",
    children: [
      { id: "chek-qogoz-56", name: "Chek qogoz 56/12 m Termolenta", quantity: "5 186 шт", amount: 7779000 },
      { id: "chek-qogoz-80", name: "Chek qogoz 80/50 m Termolenta", quantity: "37 шт", amount: 333000 },
    ],
  },
  {
    id: "computer",
    name: "Компьютер",
    quantity: "60",
    amount: 14977000,
    tone: "category",
    children: [
      { id: "mish-depo-v82-balance", name: "Mish DEPO V82 (mishka)", quantity: "19 шт", amount: 1102000 },
      { id: "wired-keyboard-balance", name: "WIRED KEYBOARD E-KB721 MEGA jet (klaviatura provodnaya)", quantity: "8 шт", amount: 1000000 },
      { id: "ziffler-monitor-balance", name: "ZIFFLER GURVED MONITOR 24ZC100", quantity: "2 шт", amount: 2000000 },
      { id: "zttech-computer-balance", name: "ZTTECH COMPUTER (Case R 10) (Prosser)", quantity: "4 шт", amount: 4000000 },
      { id: "immer-monitor-balance", name: "IMMER FLAT MONITOR IJ24LT120", quantity: "1 шт", amount: 2000000 },
      { id: "everel-monitor-balance", name: "EVEREL 23,8 FLAT MONITOR 24EV1 100", quantity: "4 шт", amount: 4000000 },
      { id: "computer-set-balance", name: "Компьютер комплект (монитор, процессор, клавиатура, мышка)", quantity: "-3 шт", amount: 0 },
      { id: "keyboard-mat-balance", name: "Коврик (каттаси - клавиатура ва мышка учун)", quantity: "25 шт", amount: 875000 },
    ],
  },
  {
    id: "monoblock",
    name: "Моноблок",
    quantity: "69",
    amount: 247200000,
    tone: "category",
    children: [
      { id: "monoblock-tsm-1514-balance", name: "Моноблок - 15 Inch Monitor model : TSM-1514 (8-128 GB (Windows Cach Register)", quantity: "52 шт", amount: 231000000 },
      { id: "user-manual-scale-balance", name: "Электрон тарози User Manual", quantity: "1 шт", amount: 4800000 },
      { id: "cash-drawer-balance", name: "Касса аппарати CACH DRAWER", quantity: "2 шт", amount: 1320000 },
      { id: "xprinter-q80as-balance", name: "Xprinter mini printer, model : XP - Q80AS", quantity: "14 шт", amount: 10080000 },
    ],
  },
  {
    id: "printer",
    name: "Принтер",
    quantity: "102",
    amount: 77900000,
    tone: "category",
    children: [
      { id: "xprinter-t837l-balance", name: "Xprinter mini printer model : XP-T837L", quantity: "-6 шт", amount: -3904000 },
      { id: "xprinter-q838l-bluetooth-balance", name: "Xprinter mini printer model : XP-Q838L (bluetooth)", quantity: "1 шт", amount: 720000 },
      { id: "xprinter-xp80t-usb-balance", name: "Xprinter mini printer, model : XP - 80 T (USB+LAN kabel)", quantity: "2 шт", amount: 1700000 },
      { id: "xprinter-xp80ts-balance", name: "Xprinter mini printer, model : XP - 80 TS", quantity: "93 шт", amount: 66960000 },
      { id: "xprinter-q838l-balance", name: "Xpinter mini printer XP-Q838L", quantity: "9 шт", amount: 6480000 },
      { id: "xprinter-xp80q-balance", name: "Xprinter mini printer, model : XP - T 80 Q", quantity: "1 шт", amount: 600000 },
      { id: "xprinter-q80as-printer-balance", name: "Xprinter mini printer, model : XP - Q80AS", quantity: "2 шт", amount: 1440000 },
    ],
  },
  {
    id: "scanner",
    name: "Сканер",
    quantity: "4",
    amount: 1840000,
    tone: "category",
    children: [
      { id: "d-netum-a5-balance", name: "2 D NETUM (2D Omnidi Rectional Barcode Scanner) model : A5 (YUmologi) штрих-код сканери", quantity: "2 шт", amount: 1440000 },
      { id: "rfid-reader-balance", name: "RFID READER (сканер, карта, браслетники)", quantity: "2 шт", amount: 400000 },
      { id: "menuholder-balance", name: "Менюхолдер (Реклама учун подставка, (стол устидаги) комплект)", quantity: "0 шт", amount: 0 },
    ],
  },
  {
    id: "hub",
    name: "Хап",
    quantity: "53",
    amount: 18240000,
    tone: "category",
    children: [
      { id: "mercury-sg108c-balance", name: "MERCURY SG108 C (ХАП)", quantity: "45 шт", amount: 10800000 },
      { id: "mercusys-ms108g-balance", name: "MERCUSYS 8-Port 10/100/1000 Mbps Deskor Switch, model : MS108G (ХАП)", quantity: "-23 шт", amount: 0 },
      { id: "cuby-gs108d-balance", name: "CUBY 8-Port Gigabit Desktop Switch (Xan) model : GS108D", quantity: "24 шт", amount: 5760000 },
      { id: "tenda-sg108-balance", name: "Tenda SG 108 8 Gigabit Power", quantity: "7 шт", amount: 1680000 },
    ],
  },
  {
    id: "services",
    name: "Хизматлар (услуги)",
    quantity: "0",
    amount: 0,
    tone: "category",
    children: [
      { id: "soliq-integration-balance", name: "Солик интеграция", quantity: "0 шт", amount: 0 },
      { id: "telegram-bot-balance", name: "Телеграмм бот", quantity: "0 шт", amount: 0 },
      { id: "monthly-payment-balance", name: "ойлик абонент тўлов", quantity: "0 шт", amount: 0 },
    ],
  },
  {
    id: "wifi",
    name: "Wi-Fi",
    quantity: "4",
    amount: 400000,
    tone: "category",
    children: [
      { id: "usb-wifi-alfa-balance", name: "USB Wi-Fi Adapter - ALFA ALFANEXT", quantity: "4 шт", amount: 400000 },
    ],
  },
  { id: "used-product", name: "Продукт Б/У", quantity: "0", amount: 0, tone: "green" },
];

const categoryContent = {
  // 1) Организации
  "org-list": {
    title: "Организации",
    text: "Все организации платформы MARJON: типы, филиалы и администраторы.",
    columns: ["Организация", "Тип", "Филиалов", "Админ", "Статус"],
    rows: organizationRows.map(([name, type, branches, admin, , status]) => [name, type, branches, admin, status]),
  },
  "org-status": {
    title: "Статус организаций",
    text: "Текущие статусы подключения, модерации и блокировки клиентов.",
    columns: ["Организация", "Статус", "Изменён", "Ответственный", "Состояние"],
    rows: [
      ["Bella Italia Group", "Активна", "11.06.2026", "Александр П.", "Активна"],
      ["Coffee House", "Активна", "11.06.2026", "О. Ташматов", "Активна"],
      ["Sushi Master", "На модерации", "11.06.2026", "Д. Юнусов", "На модерации"],
      ["Burger Station", "Новый", "10.06.2026", "М. Саидов", "Новый"],
    ],
  },

  // 2) Отделы — управление сотрудниками и привилегиями
  departments: {
    title: "Отделы — управление сотрудниками",
    text: "Сотрудники платформы, роли, отделы и настройка привилегий доступа.",
    columns: ["Сотрудник", "Должность", "Отдел", "Привилегии", "Статус"],
    rows: [
      ["Александр П.", "Суперадмин", "Управление", "Полный доступ", "Активна"],
      ["М. Саидов", "Менеджер продаж", "Продажи", "Продажи, Отчеты", "Активна"],
      ["Д. Юнусов", "Внедренец", "Внедрение", "Организации, Склад", "Активна"],
      ["С. Абдуллаев", "Поддержка", "Поддержка", "Заявки, Чаты", "Активна"],
      ["О. Ташматов", "Финансист", "Финансы", "Финансы, Банк", "На модерации"],
    ],
  },

  // 3) Склад
  "storage-income": {
    title: "Приход товаров",
    text: "Документы прихода товаров от поставщиков на склады организаций.",
    columns: ["Документ", "Поставщик", "Позиций", "Сумма", "Статус"],
    rows: [
      ["PR-10241", "Bella Foods", "32", "18 420 000 UZS", "Проведен"],
      ["PR-10238", "Coffee Trade", "12", "4 120 000 UZS", "Проведен"],
      ["PR-10235", "Fresh Market", "48", "27 800 000 UZS", "Черновик"],
    ],
  },
  "storage-expense": {
    title: "Расход товаров",
    text: "Списание товаров со склада на кухни, бары и точки продаж.",
    columns: ["Документ", "Получатель", "Позиций", "Сумма", "Статус"],
    rows: [
      ["RS-8841", "Кухня — Ташкент", "18", "6 240 000 UZS", "Проведен"],
      ["RS-8836", "Бар — Ургенч", "9", "1 820 000 UZS", "Проведен"],
      ["RS-8830", "Кухня — Денов", "14", "3 460 000 UZS", "Ожидает"],
    ],
  },
  "storage-balance": {
    title: "Остаток",
    text: "Текущие остатки товаров и сырья по складам организаций.",
    columns: ["Товар", "Категория", "Остаток", "Ед.", "Статус"],
    rows: [
      ["Мука в/с", "Сырьё", "1 240", "кг", "В норме"],
      ["Оливковое масло", "Сырьё", "86", "л", "Низкий"],
      ["Кофе зерно", "Сырьё", "410", "кг", "В норме"],
    ],
  },
  "storage-income-journal": {
    title: "Журнал приходов",
    text: "История всех приходных документов с датами и суммами.",
    columns: ["Дата", "Документ", "Поставщик", "Сумма", "Статус"],
    rows: [
      ["11.06.2026 09:12", "PR-10241", "Bella Foods", "18 420 000 UZS", "Проведен"],
      ["10.06.2026 17:40", "PR-10238", "Coffee Trade", "4 120 000 UZS", "Проведен"],
      ["10.06.2026 11:05", "PR-10235", "Fresh Market", "27 800 000 UZS", "Черновик"],
    ],
  },
  "storage-writeoff": {
    title: "Отход товаров",
    text: "Списание товаров по причинам брака, порчи и истечения срока.",
    columns: ["Документ", "Причина", "Позиций", "Сумма", "Статус"],
    rows: [
      ["WO-321", "Истёк срок", "6", "420 000 UZS", "Проведен"],
      ["WO-318", "Брак", "3", "180 000 UZS", "Проведен"],
      ["WO-314", "Порча", "8", "640 000 UZS", "Ожидает"],
    ],
  },
  "storage-inventory": {
    title: "Инвентаризация",
    text: "Сверка фактических остатков со складским учётом и расхождения.",
    columns: ["Документ", "Склад", "Расхождений", "Дата", "Статус"],
    rows: [
      ["INV-077", "Главный склад", "4", "11.06.2026", "Завершено"],
      ["INV-076", "Бар", "0", "08.06.2026", "Завершено"],
      ["INV-075", "Кухня", "2", "01.06.2026", "Черновик"],
    ],
  },

  // 4) Номенклатура
  "nom-product": {
    title: "Продукт",
    text: "Карточки продуктов: категории, цены и единицы измерения.",
    columns: ["Продукт", "Категория", "Цена", "Ед.", "Статус"],
    rows: [
      ["Маргарита 30см", "Пицца", "48 000 UZS", "шт", "Активна"],
      ["Цезарь с курицей", "Салаты", "36 000 UZS", "шт", "Активна"],
      ["Латте 0.3", "Напитки", "22 000 UZS", "шт", "Новый"],
    ],
  },
  "nom-sale-category": {
    title: "Категория реализации",
    text: "Категории меню для реализации и их доля в продажах.",
    columns: ["Категория", "Позиций", "Доля продаж", "Обновлено", "Статус"],
    rows: [
      ["Пицца", "42", "28.4%", "11.06.2026", "Активна"],
      ["Напитки", "36", "19.1%", "11.06.2026", "Активна"],
      ["Десерты", "18", "7.6%", "10.06.2026", "Новый"],
    ],
  },
  "nom-orders": {
    title: "Заказы",
    text: "Заказы по филиалам с суммами, временем и статусом выполнения.",
    columns: ["Заказ", "Филиал", "Сумма", "Время", "Статус"],
    rows: [
      ["№ 39957057", "Ташкент", "240 600 UZS", "20:57", "Завершено"],
      ["№ 39661785", "Ургенч", "177 100 UZS", "20:56", "Завершено"],
      ["№ 39382298", "Денов", "110 000 UZS", "17:59", "Ожидает"],
    ],
  },
  "nom-unit": {
    title: "Единица измерения",
    text: "Единицы измерения номенклатуры и их точность.",
    columns: ["Единица", "Сокращение", "Тип", "Точность", "Статус"],
    rows: [
      ["Килограмм", "кг", "Вес", "0.001", "Активна"],
      ["Литр", "л", "Объём", "0.01", "Активна"],
      ["Штука", "шт", "Количество", "1", "Активна"],
    ],
  },

  // 5) Справочник
  "hb-countries": {
    title: "Страны",
    text: "Справочник стран: коды, валюты и количество регионов.",
    columns: ["Страна", "Код", "Валюта", "Регионов", "Статус"],
    rows: [
      ["Узбекистан", "UZ", "UZS", "14", "Активна"],
      ["Казахстан", "KZ", "KZT", "17", "Активна"],
      ["Таджикистан", "TJ", "TJS", "4", "Новый"],
    ],
  },
  "hb-regions": {
    title: "Регионы",
    text: "Регионы стран с количеством районов и кодами.",
    columns: ["Регион", "Страна", "Районов", "Код", "Статус"],
    rows: [
      ["Ташкент", "Узбекистан", "11", "TAS", "Активна"],
      ["Хорезм", "Узбекистан", "10", "XOR", "Активна"],
      ["Сурхандарья", "Узбекистан", "14", "SUR", "Активна"],
    ],
  },
  "hb-districts": {
    title: "Районы",
    text: "Районы регионов с кодами и датой последнего изменения.",
    columns: ["Район", "Регион", "Код", "Обновлён", "Статус"],
    rows: [
      ["Юнусабадский", "Ташкент", "TAS-01", "11.06.2026", "Активна"],
      ["Ургенчский", "Хорезм", "XOR-03", "10.06.2026", "Активна"],
      ["Денауский", "Сурхандарья", "SUR-05", "09.06.2026", "Новый"],
    ],
  },

  // 6) Услуга
  "srv-employees": {
    title: "Сотрудники",
    text: "Сотрудники клиентов: роли, филиалы и контактные данные.",
    columns: ["Сотрудник", "Роль", "Филиал", "Телефон", "Статус"],
    rows: [
      ["И. Каримов", "Менеджер", "Ташкент", "+998 90 123-45-67", "Активна"],
      ["О. Ташматов", "Кассир", "Ургенч", "+998 91 234-56-78", "Активна"],
      ["А. Рахимов", "Официант", "Денов", "+998 93 345-67-89", "Новый"],
    ],
  },
  "srv-source": {
    title: "Источник",
    text: "Источники привлечения клиентов и их конверсия.",
    columns: ["Источник", "Тип", "Лидов", "Конверсия", "Статус"],
    rows: [
      ["Instagram", "Соцсети", "184", "18.4%", "Активна"],
      ["Telegram", "Мессенджер", "96", "21.8%", "Активна"],
      ["Рекомендации", "Партнёры", "43", "32.2%", "Новый"],
    ],
  },

  // 7) Банк
  "bank-stats": {
    title: "Статистика банка",
    text: "Сводная статистика банковских операций за период.",
    columns: ["Показатель", "Значение", "Динамика", "Период", "Статус"],
    rows: [
      ["Эквайринг", "4 820 000 000 UZS", "+12.4%", "Месяц", "В норме"],
      ["Комиссия", "48 200 000 UZS", "+0.8%", "Месяц", "В норме"],
      ["Возвраты", "2 140 000 UZS", "-3.1%", "Месяц", "В норме"],
    ],
  },
  "bank-transactions": {
    title: "Транзакции банка",
    text: "Банковские транзакции по платежам и возвратам.",
    columns: ["ID", "Тип", "Сумма", "Время", "Статус"],
    rows: [
      ["TXN-88421", "Поступление", "240 600 UZS", "20:57", "Завершено"],
      ["TXN-88417", "Поступление", "177 100 UZS", "20:56", "Завершено"],
      ["TXN-88410", "Возврат", "110 000 UZS", "17:59", "Ожидает"],
    ],
  },

  // 8) Финансы
  "fin-operations": {
    title: "Денежные операции",
    text: "Приходные и расходные денежные операции платформы.",
    columns: ["Документ", "Тип", "Сумма", "Способ", "Статус"],
    rows: [
      ["OP-2241", "Приход", "240 600 UZS", "CLICK", "Проведен"],
      ["OP-2238", "Расход", "110 000 UZS", "Наличные", "Проведен"],
      ["OP-2235", "Приход", "177 100 UZS", "Terminal", "Ожидает"],
    ],
  },
  "fin-income-cat": {
    title: "Категория приходов",
    text: "Категории приходов с долей в общем обороте.",
    columns: ["Категория", "Операций", "Сумма", "Доля", "Статус"],
    rows: [
      ["Приход от продаж", "1 284", "742 000 000 UZS", "82.4%", "Активна"],
      ["Прочие поступления", "96", "41 200 000 UZS", "12.1%", "Активна"],
      ["Возвраты", "18", "4 800 000 UZS", "5.5%", "Новый"],
    ],
  },
  "fin-expense-cat": {
    title: "Категория расходов",
    text: "Категории расходов с долей в общих затратах.",
    columns: ["Категория", "Операций", "Сумма", "Доля", "Статус"],
    rows: [
      ["Закупка сырья", "412", "318 000 000 UZS", "61.2%", "Активна"],
      ["Зарплата", "58", "142 000 000 UZS", "27.4%", "Активна"],
      ["Аренда", "12", "38 000 000 UZS", "7.3%", "Активна"],
    ],
  },
  "fin-payment": {
    title: "Способ оплаты",
    text: "Способы оплаты, объёмы операций и комиссии.",
    columns: ["Способ", "Операций", "Сумма", "Комиссия", "Статус"],
    rows: [
      ["Наличные", "642", "284 000 000 UZS", "0%", "Активна"],
      ["CLICK", "418", "196 000 000 UZS", "0.8%", "Активна"],
      ["Terminal", "224", "162 000 000 UZS", "1.2%", "Активна"],
    ],
  },
  "fin-history": {
    title: "История изменений",
    text: "Журнал изменений финансовых настроек и объектов.",
    columns: ["Дата", "Объект", "Действие", "Автор", "Статус"],
    rows: [
      ["11.06.2026 11:42", "Тариф Bella Italia", "Изменён", "Александр П.", "Завершено"],
      ["10.06.2026 17:40", "Категория расходов", "Создана", "О. Ташматов", "Завершено"],
      ["09.06.2026 09:18", "Способ оплаты", "Удалён", "Д. Юнусов", "Ожидает"],
    ],
  },

  // 9) Настройки
  "set-store": {
    title: "Marjon store",
    text: "Подключённые модули магазина MARJON и их подписки.",
    columns: ["Модуль", "Версия", "Подписка", "Обновлён", "Статус"],
    rows: [
      ["POS Касса", "2.4.7", "Pro", "11.06.2026", "Активна"],
      ["QR-меню", "1.8.2", "Pro", "10.06.2026", "Активна"],
      ["Аналитика", "3.1.0", "Trial", "09.06.2026", "Новый"],
    ],
  },
  "set-cashier-bg": {
    title: "Фон для кассира",
    text: "Темы и фоны интерфейса кассира по точкам продаж.",
    columns: ["Тема", "Тип", "Применена к", "Обновлён", "Статус"],
    rows: [
      ["Тёмная графитовая", "Системная", "Все кассы", "11.06.2026", "Активна"],
      ["Светлая", "Системная", "Ургенч", "10.06.2026", "Активна"],
      ["Брендовая Marjon", "Кастом", "Ташкент", "09.06.2026", "Новый"],
    ],
  },
  "set-languages": {
    title: "Языки",
    text: "Языки интерфейса платформы и их покрытие переводами.",
    columns: ["Язык", "Код", "Покрытие", "Обновлён", "Статус"],
    rows: [
      ["Русский", "RU", "100%", "11.06.2026", "Активна"],
      ["Узбекский", "UZ", "98%", "11.06.2026", "Активна"],
      ["Английский", "EN", "72%", "10.06.2026", "Новый"],
    ],
  },
};

function sparklinePath(points, width = 120, height = 38) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  return points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((point - min) / range) * height;
    return `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

const datePresets = [
  "Сегодня",
  "Вчера",
  "Эта неделя",
  "Этот месяц",
  "Прошлый месяц",
  "Этот квартал",
  "Прошлый квартал",
  "Этот год",
  "Прошлый год",
];

function padDate(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${padDate(date.getDate())}.${padDate(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function parseDate(value) {
  const [day, month, year] = value.split(".").map(Number);
  return new Date(year || 2026, (month || 1) - 1, day || 1);
}

function rangeLabel(range) {
  return range.start === range.end ? range.start : `${range.start} - ${range.end}`;
}

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} UZS`;
}

const financeOperationTotals = {
  income: 3778653810,
  expense: 2671477891,
};

const financeOperationRows = [
  {
    id: "money-42142689",
    date: "04 Jul 2026",
    time: "21:25",
    amount: -720000,
    paymentType: "—",
    counterparty: "—",
    category: "Продажа в долг",
    organization: "Бош филиал",
    comment: "Заказ № 42142689: Xprinter mini printer, model: XP - 80 TS x 1",
  },
  {
    id: "money-42142750",
    date: "04 Jul 2026",
    time: "21:25",
    amount: -240000,
    paymentType: "—",
    counterparty: "—",
    category: "Продажа в долг",
    organization: "Бош филиал",
    comment: "Заказ № 42142750: MERCURY SG108 C (ХАП) x 1",
  },
  {
    id: "money-42143611",
    date: "04 Jul 2026",
    time: "21:25",
    amount: -4200000,
    paymentType: "—",
    counterparty: "—",
    category: "Продажа в долг",
    organization: "Бош филиал",
    comment: "Заказ № 42143611: Моноблок - 15 Inch Monitor model: TSM-1514 (8-128 GB, Windows Cash Register) x 1",
  },
  {
    id: "money-42422642",
    date: "04 Jul 2026",
    time: "11:48",
    amount: -240000,
    paymentType: "—",
    counterparty: "—",
    category: "Продажа в долг",
    organization: "Бош филиал",
    comment: "Заказ № 42422642: Tenda SG 108 8 Gigabit Power x 1",
  },
  {
    id: "money-20260703-2100",
    date: "03 Jul 2026",
    time: "21:00",
    amount: 1700000,
    paymentType: "Наличные",
    counterparty: "Admin 01",
    category: "Пополнение кассы",
    organization: "Нурафшон филиал",
    comment: "02.07.2026",
  },
  {
    id: "money-20260703-2052",
    date: "03 Jul 2026",
    time: "20:52",
    amount: 580000,
    paymentType: "Наличные",
    counterparty: "Admin 01",
    category: "Пополнение кассы",
    organization: "Наманган филиал",
    comment: "02.07.2026",
  },
  {
    id: "money-20260703-2043-income",
    date: "03 Jul 2026",
    time: "20:43",
    amount: 5600000,
    paymentType: "Наличные",
    counterparty: "Admin 01",
    category: "Инкассация",
    organization: "Наманган филиал",
    comment: "Эркин олган",
  },
  {
    id: "money-20260703-2043-expense",
    date: "03 Jul 2026",
    time: "20:43",
    amount: -4200000,
    paymentType: "—",
    counterparty: "—",
    category: "Продажа в долг",
    organization: "Бош филиал",
    comment: "Заказ № 42143611: Моноблок - 15 Inch Monitor model: TSM-1514 (8-128 GB, Windows Cash Register) x 1",
  },
  {
    id: "money-20260703-2042",
    date: "03 Jul 2026",
    time: "20:42",
    amount: 1000000,
    paymentType: "Наличные",
    counterparty: "Admin 01",
    category: "Инкассация",
    organization: "Фарғона филиал",
    comment: "Эркин олган",
  },
  {
    id: "money-20260703-2040",
    date: "03 Jul 2026",
    time: "20:40",
    amount: 760000,
    paymentType: "Наличные",
    counterparty: "Admin 01",
    category: "Инкассация",
    organization: "Наманган филиал",
    comment: "Эркин олган",
  },
  {
    id: "money-20260703-1846",
    date: "03 Jul 2026",
    time: "18:46",
    amount: 7820000,
    paymentType: "Перечисление",
    counterparty: "Поставщик",
    category: "Закупка товара",
    organization: "Наманган филиал",
    comment: "Закупку товара. Товарный лист №83618",
  },
  {
    id: "money-20260703-1737",
    date: "03 Jul 2026",
    time: "17:37",
    amount: 10000,
    paymentType: "Наличные",
    counterparty: "—",
    category: "Прочее поступление",
    organization: "Сирдарё филиал",
    comment: "—",
  },
];

const incomeCategoryRows = [
  { id: "income-sales", name: "Приход от продаж", status: "#активно", locked: true },
  { id: "income-opening", name: "Стартовый баланс", status: "#активно", locked: true },
  { id: "income-debt-sale", name: "Продажа в долг", status: "#активно", locked: true },
  { id: "income-vip-sale", name: "Продажа в VIP", status: "#активно", locked: true },
  { id: "income-oylik-tolov", name: "Oylik to'lov", status: "#активно", locked: false },
  { id: "income-pochta", name: "Pochta", status: "#активно", locked: false },
  { id: "income-taksi", name: "Taksi", status: "#активно", locked: false },
  { id: "income-pochta-upper", name: "POCHTA", status: "#активно", locked: false },
  { id: "income-obed", name: "Obed", status: "#активно", locked: false },
  { id: "income-oylik-ish", name: "OYLIK ISH HAQI", status: "#активно", locked: false },
  { id: "income-arenda", name: "Arenda", status: "#активно", locked: false },
  { id: "income-qarz", name: "Qarz yopish", status: "#активно", locked: false },
  { id: "income-pochta-branch", name: "POCHTA filial", status: "#активно", locked: false },
  { id: "income-filial-open", name: "FILIAL OCHISHI", status: "#активно", locked: false },
];

const expenseCategoryRows = [
  { id: "expense-purchase", name: "Закупка товара", status: "#активно", locked: false },
  { id: "expense-salary", name: "Зарплата", status: "#активно", locked: false },
  { id: "expense-rent", name: "Аренда", status: "#активно", locked: false },
  { id: "expense-utilities", name: "Коммунальные услуги", status: "#активно", locked: false },
  { id: "expense-delivery", name: "Доставка", status: "#активно", locked: false },
  { id: "expense-marketing", name: "Маркетинг", status: "#активно", locked: false },
  { id: "expense-taksi", name: "Taksi", status: "#активно", locked: false },
  { id: "expense-repair", name: "Ремонт оборудования", status: "#активно", locked: false },
  { id: "expense-refund", name: "Возврат клиенту", status: "#активно", locked: false },
  { id: "expense-tax", name: "Налоги", status: "#активно", locked: false },
  { id: "expense-bank", name: "Комиссия банка", status: "#активно", locked: false },
  { id: "expense-other", name: "Прочие расходы", status: "#активно", locked: false },
  { id: "expense-qarz", name: "Qarz yopish", status: "#активно", locked: false },
];

const paymentMethodRows = [
  { id: "payment-transfer", sort: 1, name: "Pul O'tkazish", type: "Карта", status: "#активно", vip: false },
  { id: "payment-cash", sort: 2, name: "Наличные", type: "Наличные", status: "#активно", vip: false },
  { id: "payment-click", sort: 3, name: "CLICK", type: "Онлайн", status: "#активно", vip: true },
  { id: "payment-terminal", sort: 4, name: "Terminal", type: "Карта", status: "#активно", vip: false },
];

const financeHistoryRows = [
  { id: "hist-6162", number: 1, recordId: "6162", date: "04.07.2026 / 15:26", companyId: "1002708", organization: "Danok 3", newAmount: "1 700 000 UZS", oldAmount: "1 288 000 UZS", type: "Изменено", user: "Sardor Hamzayev Admin", comment: "xato kiritilgan" },
  { id: "hist-6153", number: 2, recordId: "6153", date: "03.07.2026 / 19:24", companyId: "1002628", organization: "Luck 6", newAmount: "300 000 UZS", oldAmount: "390 000 UZS", type: "Изменено", user: "Sardor Hamzayev Admin", comment: "JASUR AXMEDOV 300MING QILIB BERGAN EKAN OYLIK TULOVINI" },
  { id: "hist-6132", number: 3, recordId: "6132", date: "02.07.2026 / 22:15", companyId: "1002048", organization: "Bambino", newAmount: "3 140 000 UZS", oldAmount: "7 961 000 UZS", type: "Изменено", user: "Sardor Hamzayev Admin", comment: "KLIENTDAN TEXNIKALAR YECHIB OLINGAN ANCHA VAQT TULAMAGANLIGI UCHUN" },
  { id: "hist-6131", number: 4, recordId: "6131", date: "02.07.2026 / 22:14", companyId: "1002048", organization: "Bambino", newAmount: "7 961 000 UZS", oldAmount: "7 961 000 UZS", type: "Изменено", user: "Sardor Hamzayev Admin", comment: "texnikalar qaytarib yechib olingan sababi klient tulov qilish imkoni yuq ekan programmani ishlatmas ekan Fargona Filiali!" },
  { id: "hist-6118", number: 5, recordId: "6118", date: "02.07.2026 / 20:09", companyId: "1002482", organization: "Sharq Milliy Taomlari", newAmount: "2 500 000 UZS", oldAmount: "3 000 000 UZS", type: "Изменено", user: "Admin 01", comment: "2.5 MLN SOTIB 3 MLN KIRITILGAN SKRENSHOT TASHLADI" },
  { id: "hist-6098", number: 6, recordId: "6098", date: "02.07.2026 / 12:14", companyId: "1002678", organization: "DINOZAVR HOT-DOG 5", newAmount: "1 288 000 UZS", oldAmount: "2 000 000 UZS", type: "Изменено", user: "Sardor Hamzayev Admin", comment: "соник 1700 дан сотилган" },
  { id: "hist-6080", number: 7, recordId: "6080", date: "01.07.2026 / 20:18", companyId: "1002545", organization: "Tandora", newAmount: "700 000 UZS", oldAmount: "960 000 UZS", type: "Изменено", user: "Sardor Hamzayev Admin", comment: "printer 50$ sotilgan" },
  { id: "hist-1019", number: 8, recordId: "1019", date: "01.07.2026 / 17:18", companyId: "1001530", organization: "Bunyod shashlik", newAmount: "390 000 UZS", oldAmount: "390 000 UZS", type: "Изменено", user: "Admin 01", comment: "" },
  { id: "hist-1017", number: 9, recordId: "1017", date: "29.06.2026 / 13:43", companyId: "1002682", organization: "Rohat choyxonasi -2", newAmount: "1 500 000 UZS", oldAmount: "1 500 000 UZS", type: "Изменено", user: "Sardor Hamzayev Admin", comment: "" },
  { id: "hist-1016", number: 10, recordId: "1016", date: "27.06.2026 / 18:36", companyId: "1002887", organization: "Qarmoq", newAmount: "1 000 UZS", oldAmount: "1 000 UZS", type: "Изменено", user: "Sardor Hamzayev Admin", comment: "" },
  { id: "hist-5926", number: 11, recordId: "5926", date: "27.06.2026 / 18:36", companyId: "1002887", organization: "Qarmoq", newAmount: "3 000 000 UZS", oldAmount: "3 000 000 UZS", type: "Изменено", user: "Sardor Hamzayev Admin", comment: "1" },
  { id: "hist-1015", number: 12, recordId: "1015", date: "27.06.2026 / 18:35", companyId: "1002887", organization: "Qarmoq", newAmount: "1 000 UZS", oldAmount: "1 000 UZS", type: "Изменено", user: "Sardor Hamzayev Admin", comment: "" },
  { id: "hist-1014", number: 13, recordId: "1014", date: "27.06.2026 / 18:35", companyId: "1002887", organization: "Qarmoq", newAmount: "1 000 UZS", oldAmount: "1 000 UZS", type: "Изменено", user: "Sardor Hamzayev Admin", comment: "" },
  { id: "hist-1013", number: 14, recordId: "1013", date: "24.06.2026 / 14:03", companyId: "1001573", organization: "Buxoro Kafe", newAmount: "10 000 000 UZS", oldAmount: "10 000 000 UZS", type: "Изменено", user: "Admin 01", comment: "" },
  { id: "hist-5852", number: 15, recordId: "5852", date: "18.06.2026 / 11:18", companyId: "1002682", organization: "Rohat choyxonasi -2", newAmount: "6 376 000 UZS", oldAmount: "6 616 685 UZS", type: "Изменено", user: "Admin 01", comment: "HAB QO'YILMAGAN EKAN SARDOR AYTDI" },
];

const cashierBackgroundRows = [
  { id: "cashier-bg-canyon", name: "Antelope Canyon", photo: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=220&q=72" },
  { id: "cashier-bg-leaves", name: "Green Leaves", photo: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=220&q=72" },
  { id: "cashier-bg-lavender", name: "Photo Lavender Flower Field Under Pink Sky", photo: "https://images.unsplash.com/photo-1499002238440-d264edd596ec?auto=format&fit=crop&w=220&q=72" },
  { id: "cashier-bg-city", name: "Bird's Eye View Of City", photo: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=220&q=72" },
  { id: "cashier-bg-sports-car", name: "Photography of Gray Sports Car", photo: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=220&q=72" },
  { id: "cashier-bg-expressway", name: "Photo of Car on Expressway", photo: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=220&q=72" },
  { id: "cashier-bg-snow", name: "Landscape Photography of Mountains Covered in Snow", photo: "https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?auto=format&fit=crop&w=220&q=72" },
  { id: "cashier-bg-water", name: "Aerial Photography of Water Beside Forest during Golden Hour", photo: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=220&q=72" },
  { id: "cashier-bg-lake", name: "Lake and Mountain Under White Sky", photo: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=220&q=72" },
];

function formatSignedFinanceAmount(value) {
  return `${value < 0 ? "- " : "+ "}${formatCurrency(Math.abs(value))}`;
}

function addMonthsToRange(range, diff) {
  const start = parseDate(range.start);
  const end = parseDate(range.end);
  start.setMonth(start.getMonth() + diff);
  end.setMonth(end.getMonth() + diff);
  const next = { start: formatDate(start), end: formatDate(end), preset: "" };
  return { ...next, label: rangeLabel(next) };
}

function presetRange(label) {
  const today = new Date(2026, 5, 11);
  const start = new Date(today);
  const end = new Date(today);

  if (label === "Вчера") {
    start.setDate(today.getDate() - 1);
    end.setDate(today.getDate() - 1);
  } else if (label === "Эта неделя") {
    start.setDate(today.getDate() - 6);
  } else if (label === "Этот месяц") {
    start.setDate(1);
  } else if (label === "Прошлый месяц") {
    start.setMonth(today.getMonth() - 1, 1);
    end.setMonth(today.getMonth(), 0);
  } else if (label === "Этот квартал") {
    start.setMonth(Math.floor(today.getMonth() / 3) * 3, 1);
  } else if (label === "Прошлый квартал") {
    const quarterStart = Math.floor(today.getMonth() / 3) * 3;
    start.setMonth(quarterStart - 3, 1);
    end.setMonth(quarterStart, 0);
  } else if (label === "Этот год") {
    start.setMonth(0, 1);
  } else if (label === "Прошлый год") {
    start.setFullYear(today.getFullYear() - 1, 0, 1);
    end.setFullYear(today.getFullYear() - 1, 11, 31);
  }

  const range = { start: formatDate(start), end: formatDate(end), preset: label };
  return { ...range, label: label === "Сегодня" || label === "Вчера" ? label : rangeLabel(range) };
}

const ADMIN_CHART_COLOR = "#1a916f";

const ADMIN_CHART_COLOR_RGB = "26, 145, 111";

const ADMIN_CHART_TODAY = new Date(2026, 6, 15);

const ADMIN_CHART_MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

const ADMIN_CHART_PRESET_DAYS = [7, 30];

function adminChartPointToMoney(value) {
  return Math.round(Number(value || 0) * 1000000);
}

function formatAdminRawMoney(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("ru-RU").replace(/\u00a0/g, " ")} UZS`;
}

function formatAdminAxisTick(value) {
  if (Number(value) === 0) return "0";
  const millions = Number(value) / 1000000;
  if (millions < 1) return `${Math.round(Number(value) / 1000)}K`;
  return `${Number(millions).toLocaleString("ru-RU", { maximumFractionDigits: 1 }).replace(/\u00a0/g, " ")}M`;
}

function adminDateToInputValue(date) {
  const value = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${value.getFullYear()}-${padDate(value.getMonth() + 1)}-${padDate(value.getDate())}`;
}

function adminTodayInputValue() {
  return adminDateToInputValue(new Date());
}

function adminReportDateToInputDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return adminTodayInputValue();
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function adminInputDateToReportDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return formatDate(new Date());
  }
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function adminChartRangeEndingAt(days, endValue = adminTodayInputValue()) {
  const end = new Date(`${endValue}T00:00:00`);
  const start = new Date(end);
  start.setDate(end.getDate() - Math.max(1, Number(days) || 1) + 1);
  return {
    preset: "",
    start: adminInputDateToReportDate(adminDateToInputValue(start)),
    end: adminInputDateToReportDate(adminDateToInputValue(end)),
    startTime: "00:00",
    endTime: "00:00",
  };
}

function normalizeAdminReportRange(range = {}) {
  const startInput = adminReportDateToInputDate(range.start);
  const endInput = adminReportDateToInputDate(range.end);
  const [dateFrom, dateTo] = startInput <= endInput ? [startInput, endInput] : [endInput, startInput];
  return {
    preset: range.preset || "",
    start: adminInputDateToReportDate(dateFrom),
    end: adminInputDateToReportDate(dateTo),
    startTime: "00:00",
    endTime: "00:00",
  };
}

function adminChartRangeDays(range) {
  const normalized = normalizeAdminReportRange(range);
  const start = new Date(`${adminReportDateToInputDate(normalized.start)}T00:00:00`);
  const end = new Date(`${adminReportDateToInputDate(normalized.end)}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function adminChartRangeLabel(range) {
  const normalized = normalizeAdminReportRange(range);
  return normalized.start === normalized.end ? normalized.start : `${normalized.start} - ${normalized.end}`;
}

function formatAdminDaysLabel(days) {
  const value = Math.max(1, Number(days) || 1);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} дня`;
  return `${value} дней`;
}

function buildAdminChartRange(days) {
  const end = new Date(ADMIN_CHART_TODAY);
  const start = new Date(ADMIN_CHART_TODAY);
  start.setDate(end.getDate() - days + 1);
  return {
    mode: String(days),
    label: `${days} дней`,
    start: formatDate(start),
    end: formatDate(end),
  };
}

function getAdminChartDaysBetween(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function normalizeAdminChartRange(startValue, endValue, mode = "custom") {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  const first = start <= end ? start : end;
  const last = start <= end ? end : start;
  const range = {
    mode,
    start: formatDate(first),
    end: formatDate(last),
  };
  return { ...range, label: mode === "7" || mode === "30" ? `${mode} дней` : rangeLabel(range) };
}

function buildAdminRangeLabels(range) {
  const start = parseDate(range.start);
  const days = getAdminChartDaysBetween(range.start, range.end);

  return Array.from({ length: days }, (_, day) => {
    const date = new Date(start);
    date.setDate(start.getDate() + day);
    return `${padDate(date.getDate())}.${padDate(date.getMonth() + 1)}`;
  });
}

function buildAdminChartTickLabels(labels) {
  if (labels.length <= 12) {
    return labels.map((label, index) => [index, label]);
  }

  if (labels.length > 31) {
    return labels.reduce((ticks, label, index) => {
      if (index % 5 === 0 || index === labels.length - 1) ticks.push([index, label]);
      return ticks;
    }, []);
  }

  const visibleTickCount = labels.length <= 31 ? 8 : 10;
  const step = (labels.length - 1) / Math.max(1, visibleTickCount - 1);
  const visibleIndexes = new Set();

  for (let index = 0; index < visibleTickCount; index += 1) {
    visibleIndexes.add(Math.round(index * step));
  }

  visibleIndexes.add(0);
  visibleIndexes.add(labels.length - 1);

  return labels.reduce((ticks, label, index) => {
    if (visibleIndexes.has(index)) ticks.push([index, label]);
    return ticks;
  }, []);
}

function buildAdminDemoCurvePoints(count, target) {
  if (count <= 0) return [];
  if (count === 1) return [Number(target.toFixed(2))];

  const startValue = target * 0.12;
  const availableValue = Math.max(0, target - startValue);
  const increments = Array.from({ length: count - 1 }, (_, index) => {
    const progress = (index + 1) / Math.max(1, count - 1);
    const weeklyWave = Math.sin(progress * Math.PI * 4.2 - 0.45) * 0.34;
    const shortWave = Math.sin((index + 1) * 1.45) * 0.14;
    const lunchPulse = Math.exp(-Math.pow((progress - 0.38) / 0.13, 2)) * 0.42;
    const weekendPulse = Math.exp(-Math.pow((progress - 0.78) / 0.11, 2)) * 0.34;
    const quietWindow = Math.exp(-Math.pow((progress - 0.58) / 0.09, 2)) * 0.28;

    return Math.max(0.32, 1 + weeklyWave + shortWave + lunchPulse + weekendPulse - quietWindow);
  });
  const totalWeight = increments.reduce((sum, value) => sum + value, 0) || 1;
  let runningValue = startValue;
  const points = [Number(runningValue.toFixed(2))];

  increments.forEach((weight) => {
    runningValue += availableValue * (weight / totalWeight);
    points.push(Number(runningValue.toFixed(2)));
  });

  points[points.length - 1] = Number(target.toFixed(2));
  return points;
}

function demoAdminChartRangeData(range) {
  const labels = buildAdminRangeLabels(range);
  const days = getAdminChartDaysBetween(range.start, range.end);
  const target = Math.max(12, days * 6.25);
  const points = buildAdminDemoCurvePoints(labels.length, target);
  const yMax = Math.ceil(Math.max(...points) / 10) * 10;
  const value = formatAdminRawMoney(adminChartPointToMoney(points.at(-1)));

  return {
    value,
    delta: `Период: ${range.start} - ${range.end}`,
    points,
    labels,
    tickLabels: buildAdminChartTickLabels(labels),
    tooltip: { label: range.end, value },
    tooltipIndex: Math.max(0, labels.length - 1),
    yMax,
    yStep: Math.max(5, yMax / 4),
  };
}

function emptyAdminChartRangeData(range) {
  const labels = buildAdminRangeLabels(range);
  return {
    value: "0 UZS",
    delta: `Нет данных backend за ${range.start} - ${range.end}`,
    points: labels.map(() => 0),
    labels,
    tickLabels: buildAdminChartTickLabels(labels),
    tooltip: { label: range.end, value: "0 UZS" },
    tooltipIndex: Math.max(0, labels.length - 1),
    yMax: 1,
    yStep: 0.25,
  };
}

function emptyAdminChartData(segment) {
  const configs = {
    "День": ["09:00", "12:00", "15:00", "18:00", "21:00", "00:00"],
    "Неделя": ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    "Месяц": ["01", "07", "14", "21", "28", "31"],
    "Год": ["Янв", "Мар", "Май", "Июл", "Сен", "Ноя"],
  };
  const labels = configs[segment] || configs["Месяц"];

  return {
    value: "0 UZS",
    delta: "Нет данных backend",
    points: labels.map(() => 0),
    labels,
    tickLabels: labels.map((label, index) => [index, label]),
    tooltip: { label: labels.at(-1) || "", value: "0 UZS" },
    tooltipIndex: Math.max(0, labels.length - 1),
    yMax: 1,
    yStep: 0.25,
  };
}

const adminDemoChartBySegment = {
  "День": {
    value: "24 850 000 UZS",
    delta: "Демо-оборот Marjon Cafe за сегодня",
    labels: ["09:00", "12:00", "15:00", "18:00", "21:00", "00:00"],
    points: [1.8, 4.2, 8.9, 13.4, 20.1, 24.85],
    tooltip: { label: "00:00", value: "24 850 000 UZS" },
    yMax: 30,
    yStep: 7.5,
  },
  "Неделя": {
    value: "187 450 000 UZS",
    delta: "+16% к прошлой неделе",
    labels: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    points: [18.5, 22.4, 19.8, 26.1, 31.6, 38.4, 30.65],
    tooltip: { label: "Вс", value: "30 650 000 UZS" },
    yMax: 45,
    yStep: 15,
  },
  "Месяц": {
    value: "187 450 000 UZS",
    delta: "+24% к прошлому месяцу",
    labels: ["01", "07", "14", "21", "28", "31"],
    points: [18.4, 42.8, 76.3, 118.9, 155.6, 187.45],
    tooltip: { label: "31 июля", value: "187 450 000 UZS" },
    yMax: 220,
    yStep: 55,
  },
  "Год": {
    value: "1 048 000 000 UZS",
    delta: "Демо-оборот за 2026 год",
    labels: ["Янв", "Мар", "Май", "Июл", "Сен", "Ноя"],
    points: [62, 211, 389, 604, 832, 1048],
    tooltip: { label: "Ноябрь", value: "1 048 000 000 UZS" },
    yMax: 1200,
    yStep: 300,
  },
};

function demoAdminChartData(segment, range) {
  if (range) return demoAdminChartRangeData(range);
  const data = adminDemoChartBySegment[segment] || adminDemoChartBySegment["Месяц"];
  return {
    ...data,
    tickLabels: data.labels.map((label, index) => [index, label]),
    tooltipIndex: Math.max(0, data.points.length - 1),
  };
}

const ADMIN_PHONE_MAX_DIGITS = 9;

function getAdminPhoneDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.length > ADMIN_PHONE_MAX_DIGITS && digits.startsWith("998")) {
    digits = digits.slice(3);
  }

  return digits.slice(0, ADMIN_PHONE_MAX_DIGITS);
}

function formatAdminPhone(value) {
  const digits = getAdminPhoneDigits(value);

  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  if (digits.length <= 7) return `${digits.slice(0, 2)} ${digits.slice(2, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)}-${digits.slice(5, 7)}-${digits.slice(7)}`;
}

function formatAdminHeaderDate(value) {
  return `${String(value.getDate()).padStart(2, "0")}.${String(value.getMonth() + 1).padStart(2, "0")}.${value.getFullYear()}`;
}

function formatAdminHeaderTime(value) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function splitKpiValue(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(.*?)(?:\s+(UZS|USD|RUB))$/i);
  return match
    ? { amount: match[1].trim(), suffix: match[2].toUpperCase() }
    : { amount: text, suffix: "" };
}

function adminChartRangeForSegment(segment) {
  if (segment === "День") {
    return {
      mode: "today",
      label: "Сегодня",
      start: formatDate(ADMIN_CHART_TODAY),
      end: formatDate(ADMIN_CHART_TODAY),
    };
  }
  if (segment === "Неделя") return buildAdminChartRange(7);
  if (segment === "Год") {
    return {
      mode: "year",
      label: "2026",
      start: "01.01.2026",
      end: "31.12.2026",
    };
  }
  return buildAdminChartRange(30);
}

function getAdminChartCalendarCells(year, month) {
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: formatDate(date),
      date,
      label: String(date.getDate()),
      muted: date.getMonth() !== month,
    };
  });
}

const STATUS_GREEN = ["Активна", "Активен", "Проведен", "Завершено", "В норме", "Включено", "ОК"];

const STATUS_VIOLET = ["Новый", "Новая", "Черновик"];

const orgDirectoryColumnKeys = [
  "number", "message", "service", "paymentType", "name", "clientId", "terminals", "cashboxes",
  "deposit", "debt", "overdue", "contract", "tariff", "currency", "contact", "region",
  "manager", "date", "source", "version", "orgStatus", "identification", "paymentKind",
  "status", "onlineMenu", "warehouse", "cashboxOnline", "actions",
];

const ORG_DIRECTORY_COLUMN_SETTINGS_STORAGE_KEY = "marjon.admin.organizations.columns.v1";

const ORG_DIRECTORY_COLUMN_SETTINGS_LAYOUT_VERSION = 1;

const defaultOrgDirectoryColumnOrder = [...orgDirectoryColumnKeys];

function normalizeOrgDirectoryColumnKeys(keys) {
  const seen = new Set();
  return (Array.isArray(keys) ? keys : []).filter((key) => {
    if (!orgDirectoryColumnKeys.includes(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeOrgDirectoryColumnSettings(settings) {
  const savedOrder = settings?.layoutVersion === ORG_DIRECTORY_COLUMN_SETTINGS_LAYOUT_VERSION
    ? normalizeOrgDirectoryColumnKeys(settings?.order)
    : [];
  const order = [
    ...savedOrder,
    ...defaultOrgDirectoryColumnOrder.filter((key) => !savedOrder.includes(key)),
  ];
  const visibleSource = Array.isArray(settings) ? settings : settings?.visible;
  const visible = normalizeOrgDirectoryColumnKeys(visibleSource || orgDirectoryColumnKeys)
    .filter((key) => order.includes(key));

  return {
    layoutVersion: ORG_DIRECTORY_COLUMN_SETTINGS_LAYOUT_VERSION,
    order,
    visible: visible.length ? visible : [order[0]],
  };
}

function loadOrgDirectoryColumnSettings() {
  if (typeof window === "undefined") {
    return normalizeOrgDirectoryColumnSettings();
  }

  try {
    return normalizeOrgDirectoryColumnSettings(JSON.parse(window.localStorage.getItem(ORG_DIRECTORY_COLUMN_SETTINGS_STORAGE_KEY)));
  } catch {
    return normalizeOrgDirectoryColumnSettings();
  }
}

function saveOrgDirectoryColumnSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      ORG_DIRECTORY_COLUMN_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizeOrgDirectoryColumnSettings(settings)),
    );
  } catch {
    // localStorage can be unavailable in private mode; current UI state still works.
  }
}

const ORG_STATUS_STORAGE_KEY = "marjon.admin.organization-statuses.v1";

function normalizeOrganizationStatusRow(row, index = 0) {
  const name = String(row?.name || "").trim();
  return {
    id: String(row?.id || `status-${Date.now()}-${index}`),
    name: name.toUpperCase(),
    sort: Number(row?.sort ?? row?.sort_order ?? index + 1) || index + 1,
    active: row?.active ?? row?.status !== false,
  };
}

function loadOrganizationStatusRows() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORG_STATUS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.map(normalizeOrganizationStatusRow).filter((row) => row.name)
      : [];
  } catch {
    return [];
  }
}

function saveOrganizationStatusRows(rows) {
  try {
    localStorage.setItem(ORG_STATUS_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // localStorage can be unavailable in private mode; keep the in-memory state working.
  }
}

function mergeOrganizationStatusRows(localRows, remoteRows) {
  const byKey = new Map();

  [...remoteRows, ...localRows].forEach((row, index) => {
    const normalized = normalizeOrganizationStatusRow(row, index);
    if (!normalized.name) return;
    byKey.set(normalized.id || normalized.name, normalized);
  });

  return [...byKey.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

const ADMIN_FINANCE_FALLBACK_PAYMENT_TYPES = [
  { id: "fallback-cash", label: "Наличные", apiId: null },
  { id: "fallback-card", label: "Карта", apiId: null },
  { id: "fallback-transfer", label: "Перечисление", apiId: null },
];

const ADMIN_FINANCE_FALLBACK_INCOME_CATEGORIES = [
  { id: "fallback-income-cash", label: "Пополнение кассы", apiId: null, kind: "income" },
  { id: "fallback-income-order", label: "Оплата заказа", apiId: null, kind: "income" },
  { id: "fallback-income-other", label: "Прочее поступление", apiId: null, kind: "income" },
];

const ADMIN_FINANCE_COUNTERPARTY_TYPES = [
  { value: "provider", label: "Поставщики" },
  { value: "client", label: "Клиенты" },
  { value: "employee", label: "Сотрудники" },
  { value: "other", label: "Другие" },
];

const ADMIN_FINANCE_CALENDAR_MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

const ADMIN_FINANCE_CALENDAR_WEEK_DAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

const ADMIN_FINANCE_CALENDAR_YEARS = Array.from({ length: 15 }, (_, index) => 2020 + index);

const ADMIN_FINANCE_MODAL_ANIMATION_MS = 180;

const ADMIN_FINANCE_COMMENT_LIMIT = 500;

const ADMIN_FINANCE_REQUIRED_FIELDS = ["amount", "paymentTypeId", "organizationId", "date", "categoryId"];

const adminFinanceApi = {
  listTransactions(params = {}) {
    return adminApi.get("/finance/transactions", { params: { size: 100, ...params } });
  },
  createTransaction(payload, idempotencyKey) {
    return adminApi.post("/finance/transactions", payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },
  listPaymentTypes() {
    return adminApi.get("/finance/payment-types", { params: { size: 100, status: true } });
  },
  listOrganizations() {
    return adminApi.get("/organizations", { params: { size: 100, status: "active" } });
  },
  listCategories(kind) {
    return adminApi.get("/finance/transaction-categories", { params: { size: 200, kind, status: true } });
  },
  listCounterparties(type) {
    return adminApi.get("/finance/counterparties", { params: { size: 200, type } });
  },
};

function extractAdminFinanceItems(data) {
  return Array.isArray(data) ? data : data?.items || data?.results || [];
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function normalizeAdminFinanceOption(item, index, labelFields = ["name"]) {
  const rawId = item?.id || item?.uuid || item?.value || "";
  const label = labelFields.map((field) => item?.[field]).find(Boolean) || item?.label || rawId || `option-${index + 1}`;
  return {
    id: String(rawId || `${label}-${index}`),
    apiId: isUuidLike(rawId) ? String(rawId) : null,
    label: String(label),
    raw: item,
  };
}

function normalizeAdminFinanceTransaction(row, index = 0) {
  const operationType = row.direction || row.operation_type || (Number(row.amount || 0) < 0 ? "expense" : "income");
  const amount = Math.abs(Number(row.amount || 0));
  const dateValue = row.date || row.created_at || "";
  const parsedDate = dateValue ? new Date(dateValue) : null;
  const hasValidDate = parsedDate && !Number.isNaN(parsedDate.getTime());
  return {
    id: row.id || row.uuid || row.document_number || `finance-operation-${index}`,
    date: hasValidDate ? parsedDate.toLocaleDateString("ru-RU") : (row.date || "—"),
    time: hasValidDate ? parsedDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : (row.time || ""),
    number: row.document_number || row.id || "",
    organization: row.organization_name || row.organization || "—",
    type: operationType === "expense" ? "Расход" : "Приход",
    operationType,
    amount: operationType === "expense" ? -amount : amount,
    paymentType: row.payment_type_name || row.payment_type || "—",
    counterparty: row.counterparty_name || row.counterparty || "—",
    category: row.category_name || row.category || "—",
    status: row.status || "Проведен",
    comment: row.comment || "—",
  };
}

function createAdminFinanceTransactionDraft(operationType = "income", defaults = {}) {
  return {
    operationType,
    amount: "",
    paymentTypeId: defaults.paymentTypeId || "",
    organizationId: defaults.organizationId || "",
    counterpartyType: "provider",
    counterpartyId: "",
    date: adminTodayInputValue(),
    categoryId: defaults.categoryId || "",
    comment: "",
  };
}

function formatAdminFinanceAmountDraft(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const normalized = digits.replace(/^0+(?=\d)/, "");
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function parseAdminFinanceAmount(value) {
  return Number(String(value || "").replace(/\s/g, "")) || 0;
}

function adminFinanceDateForApi(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? `${value}T00:00:00` : null;
}

function adminFinanceInputToDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function adminFinanceCalendarDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function getAdminFinanceBackendMessage(error) {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || String(item)).join("; ");
  }
  if (detail && typeof detail === "object") {
    return detail.message || JSON.stringify(detail);
  }
  return detail || "Не удалось добавить операцию. Проверьте данные и попробуйте ещё раз.";
}

function validateAdminFinanceDraft(draft) {
  const errors = {};
  const amount = parseAdminFinanceAmount(draft.amount);
  if (!String(draft.amount || "").trim()) {
    errors.amount = "Введите сумму";
  } else if (amount <= 0) {
    errors.amount = "Сумма должна быть больше нуля";
  }
  if (!draft.paymentTypeId) errors.paymentTypeId = "Выберите способ оплаты";
  if (!draft.organizationId) errors.organizationId = "Выберите филиал";
  if (!draft.date || !adminFinanceDateForApi(draft.date)) errors.date = "Выберите дату";
  if (!draft.categoryId) errors.categoryId = "Выберите категорию";
  return errors;
}

function getPageList(current, total) {
  // Номера страниц с многоточиями: 1 … c-1 c c+1 … total
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];
  let prev = 0;
  for (const p of list) {
    if (p - prev > 1) result.push("…");
    result.push(p);
    prev = p;
  }
  return result;
}

function keepWheelInsideScroller(event) {
  const scroller = event.currentTarget;
  const horizontalDelta = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
  const verticalDelta = event.shiftKey ? 0 : event.deltaY;

  if (!horizontalDelta && !verticalDelta) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  scroller.scrollLeft += horizontalDelta;
  scroller.scrollTop += verticalDelta;
}

const transactionColumnKeys = [
  "id", "uuid", "date", "orgId", "name", "payType",
  "amount", "kind", "status", "paymentFor", "comment", "actions",
];

const TRANSACTION_COLUMN_SETTINGS_STORAGE_KEY = "marjon.admin.transactions.columns.v1";

const TRANSACTION_COLUMN_SETTINGS_LAYOUT_VERSION = 2;

const defaultTransactionColumnOrder = [
  "id", "uuid", "name", "date", "orgId", "payType",
  "amount", "kind", "status", "paymentFor", "comment", "actions",
];

function normalizeTransactionColumnKeys(keys) {
  const seen = new Set();
  return (Array.isArray(keys) ? keys : []).filter((key) => {
    if (!transactionColumnKeys.includes(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeTransactionColumnSettings(settings) {
  const savedOrder = settings?.layoutVersion === TRANSACTION_COLUMN_SETTINGS_LAYOUT_VERSION
    ? normalizeTransactionColumnKeys(settings?.order)
    : [];
  const order = [
    ...savedOrder,
    ...defaultTransactionColumnOrder.filter((key) => !savedOrder.includes(key)),
    ...transactionColumnKeys.filter((key) => !savedOrder.includes(key) && !defaultTransactionColumnOrder.includes(key)),
  ];
  const visibleSource = Array.isArray(settings) ? settings : settings?.visible;
  const visible = normalizeTransactionColumnKeys(visibleSource || transactionColumnKeys)
    .filter((key) => order.includes(key));

  return {
    layoutVersion: TRANSACTION_COLUMN_SETTINGS_LAYOUT_VERSION,
    order,
    visible: visible.length ? visible : [order[0]],
  };
}

function loadTransactionColumnSettings() {
  if (typeof window === "undefined") {
    return normalizeTransactionColumnSettings();
  }

  try {
    return normalizeTransactionColumnSettings(JSON.parse(window.localStorage.getItem(TRANSACTION_COLUMN_SETTINGS_STORAGE_KEY)));
  } catch {
    return normalizeTransactionColumnSettings();
  }
}

function saveTransactionColumnSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      TRANSACTION_COLUMN_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizeTransactionColumnSettings(settings)),
    );
  } catch {
    // localStorage can be unavailable in private mode; the current session still keeps the setting.
  }
}

function formatTransactionAmountParts(value) {
  const source = String(value ?? "").replace(/\u00a0/g, " ").trim();
  const currencyMatch = source.match(/\s+([A-Za-zА-Яа-я]{3,})$/);
  const currency = currencyMatch?.[1] || "UZS";
  const numberSource = currencyMatch ? source.slice(0, currencyMatch.index).trim() : source;
  const numericValue = Number(numberSource.replace(/[^\d-]/g, ""));

  if (!Number.isFinite(numericValue)) {
    return { value: numberSource || "0", currency };
  }

  return {
    value: formatDemoMoney(numericValue),
    currency,
  };
}

function transactionDateToInputValue(value) {
  const match = String(value || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (!match) {
    return "";
  }

  const [, day, month, year, hour = "00", minute = "00"] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function transactionInputDateToDisplay(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    return value || "";
  }

  const [, year, month, day, hour, minute] = match;
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

function transactionAmountToDraftValue(value) {
  const amount = formatTransactionAmountParts(value);
  return amount.value;
}

function formatTransactionAmountDraft(value) {
  const numericValue = Number(String(value ?? "").replace(/[^\d-]/g, ""));
  return Number.isFinite(numericValue) ? formatDemoMoney(Math.abs(numericValue)) : "0";
}

const demoTransactionSeeds = [
  {
    id: 1,
    uuid: "demo-marjon-0001",
    date: "15.07.2026 16:42",
    orgId: "1003001",
    name: "Marjon Cafe - Yunusabad",
    payType: "Payme",
    amount: "2 450 000 UZS",
    kind: "Приход",
    status: "PAID",
    paymentFor: "Обеденный зал",
    comment: "Демо: столы 4-7",
  },
  {
    id: 2,
    uuid: "demo-marjon-0002",
    date: "15.07.2026 15:18",
    orgId: "1003001",
    name: "Marjon Cafe - Chilonzor",
    payType: "Uzcard",
    amount: "1 860 000 UZS",
    kind: "Приход",
    status: "PAID",
    paymentFor: "Банкет",
    comment: "Демо: предоплата",
  },
  {
    id: 3,
    uuid: "demo-marjon-0003",
    date: "15.07.2026 14:05",
    orgId: "1003001",
    name: "Marjon Cafe - Yunusabad",
    payType: "Наличные",
    amount: "740 000 UZS",
    kind: "Приход",
    status: "PAID",
    paymentFor: "Доставка",
    comment: "Демо: курьерская смена",
  },
  {
    id: 4,
    uuid: "demo-marjon-0004",
    date: "15.07.2026 12:34",
    orgId: "1003001",
    name: "Marjon Cafe - Chilonzor",
    payType: "Humo",
    amount: "3 210 000 UZS",
    kind: "Приход",
    status: "PAID",
    paymentFor: "Зал и летняя терраса",
    comment: "Демо: обеденный пик",
  },
  {
    id: 5,
    uuid: "demo-marjon-0005",
    date: "15.07.2026 11:20",
    orgId: "1003001",
    name: "Marjon Cafe - Yunusabad",
    payType: "Click",
    amount: "580 000 UZS",
    kind: "Приход",
    status: "PAID",
    paymentFor: "Кофе-бар",
    comment: "Демо: утренние продажи",
  },
  {
    id: 6,
    uuid: "demo-marjon-0006",
    date: "14.07.2026 22:10",
    orgId: "1003001",
    name: "Marjon Cafe - Chilonzor",
    payType: "Payme",
    amount: "4 980 000 UZS",
    kind: "Приход",
    status: "PAID",
    paymentFor: "Вечерняя смена",
    comment: "Демо: закрытие смены",
  },
  {
    id: 7,
    uuid: "demo-marjon-0007",
    date: "14.07.2026 19:46",
    orgId: "1003001",
    name: "Marjon Cafe - Yunusabad",
    payType: "Uzcard",
    amount: "2 125 000 UZS",
    kind: "Приход",
    status: "PAID",
    paymentFor: "Семейный зал",
    comment: "Демо: бронирование",
  },
  {
    id: 8,
    uuid: "demo-marjon-0008",
    date: "14.07.2026 17:02",
    orgId: "1003001",
    name: "Marjon Cafe - Chilonzor",
    payType: "Наличные",
    amount: "690 000 UZS",
    kind: "Расход",
    status: "PAID",
    paymentFor: "Хозяйственные расходы",
    comment: "Демо: расходные материалы",
  },
  {
    id: 9,
    uuid: "demo-marjon-0009",
    date: "14.07.2026 13:30",
    orgId: "1003001",
    name: "Marjon Cafe - Yunusabad",
    payType: "Humo",
    amount: "1 340 000 UZS",
    kind: "Приход",
    status: "PAID",
    paymentFor: "Бизнес-ланч",
    comment: "Демо: корпоративный заказ",
  },
  {
    id: 10,
    uuid: "demo-marjon-0010",
    date: "13.07.2026 21:15",
    orgId: "1003001",
    name: "Marjon Cafe - Chilonzor",
    payType: "Click",
    amount: "3 780 000 UZS",
    kind: "Приход",
    status: "PAID",
    paymentFor: "Вечерний зал",
    comment: "Демо: пятничная загрузка",
  },
  {
    id: 11,
    uuid: "demo-marjon-0011",
    date: "13.07.2026 18:06",
    orgId: "1003001",
    name: "Marjon Cafe - Yunusabad",
    payType: "Payme",
    amount: "920 000 UZS",
    kind: "Приход",
    status: "PAID",
    paymentFor: "Доставка",
    comment: "Демо: онлайн-меню",
  },
  {
    id: 12,
    uuid: "demo-marjon-0012",
    date: "13.07.2026 10:44",
    orgId: "1003001",
    name: "Marjon Cafe - Chilonzor",
    payType: "Наличные",
    amount: "450 000 UZS",
    kind: "Расход",
    status: "PAID",
    paymentFor: "Склад",
    comment: "Демо: закупка зелени",
  },
];

const demoTransactionBranches = [
  "Marjon Cafe - Yunusabad",
  "Marjon Cafe - Chilonzor",
  "Marjon Cafe - Mirabad",
  "Marjon Cafe - Sergeli",
];

const demoTransactionPayTypes = ["Payme", "Uzcard", "Humo", "Click", "Наличные"];

const demoTransactionTargets = [
  "Обеденный зал",
  "Банкет",
  "Доставка",
  "Кофе-бар",
  "Вечерняя смена",
  "Семейный зал",
  "Склад",
  "Летняя терраса",
];

const demoTransactionComments = [
  "Демо: столы 4-7",
  "Демо: предоплата",
  "Демо: курьерская смена",
  "Демо: обеденный пик",
  "Демо: закрытие смены",
  "Демо: закупка",
  "Демо: онлайн-меню",
  "Демо: корпоративный заказ",
];

function formatDemoTransactionDate(value) {
  return `${padDate(value.getDate())}.${padDate(value.getMonth() + 1)}.${value.getFullYear()} ${padDate(value.getHours())}:${padDate(value.getMinutes())}`;
}

function buildDemoTransactions() {
  const baseDate = new Date(2026, 6, 15, 16, 42);
  return Array.from({ length: DEMO_TRANSACTION_ROW_COUNT }, (_, index) => {
    const seed = demoTransactionSeeds[index % demoTransactionSeeds.length];
    const date = new Date(baseDate);
    date.setMinutes(baseDate.getMinutes() - index * 127);
    const isExpense = index % 11 === 7 || seed.kind === "Расход";
    const amount = isExpense
      ? 320000 + (index % 9) * 85000
      : 520000 + ((index * 337000) % 4300000);

    return {
      ...seed,
      id: index + 1,
      uuid: `demo-marjon-${String(index + 1).padStart(4, "0")}`,
      date: formatDemoTransactionDate(date),
      orgId: String(1003001 + (index % 4)),
      name: demoTransactionBranches[index % demoTransactionBranches.length],
      payType: demoTransactionPayTypes[index % demoTransactionPayTypes.length],
      amount: `${formatDemoMoney(amount)} UZS`,
      kind: isExpense ? "Расход" : "Приход",
      status: "PAID",
      paymentFor: demoTransactionTargets[index % demoTransactionTargets.length],
      comment: `${demoTransactionComments[index % demoTransactionComments.length]} #${String(index + 1).padStart(3, "0")}`,
    };
  });
}

const demoTransactions = buildDemoTransactions();

const dashboardTransactionReportRows = [
  {
    id: "marjon",
    module: "Marjon",
    contract: "754 995 216",
    completed: "651 371 000",
    paid: "536 599 424",
    unpaid: "114 771 576",
    activeOrders: "103 624 216",
    rejected: "96 845 240",
    overdue: "23 797 727",
    children: [
      {
        id: "monthly-payment",
        module: "Ойлик тулов",
        contract: "333 569 000",
        completed: "333 569 000",
        paid: "306 409 424",
        unpaid: "27 159 576",
        activeOrders: "0",
        rejected: "32 371 000",
        overdue: "21 802 165",
      },
      {
        id: "installation",
        module: "Установка",
        contract: "252 568 000",
        completed: "216 898 000",
        paid: "141 450 000",
        unpaid: "75 448 000",
        activeOrders: "35 670 000",
        rejected: "12 033 000",
        overdue: "1 995 562",
      },
      {
        id: "goods-tech",
        module: "Товар + Техника",
        contract: "168 858 216",
        completed: "100 904 000",
        paid: "88 740 000",
        unpaid: "12 164 000",
        activeOrders: "67 954 216",
        rejected: "52 441 240",
        overdue: "0",
      },
    ],
  },
];

const dashboardSalesReportRows = [
  {
    id: "admin-01",
    employee: "Admin 01",
    contract: "3 610 000",
    completed: "3 610 000",
    paid: "3 610 000",
    unpaid: "0",
    activeOrders: "0",
    rejected: "390 000",
    overdue: "0",
    children: [
      {
        id: "admin-01-marjon",
        employee: "Marjon",
        contract: "3 610 000",
        completed: "3 610 000",
        paid: "3 610 000",
        unpaid: "0",
        activeOrders: "0",
        rejected: "390 000",
        overdue: "0",
      },
    ],
  },
  {
    id: "alikulov-jahongir",
    employee: "ALIKULOV JAHONGIR",
    contract: "40 620 000",
    completed: "40 620 000",
    paid: "38 920 390",
    unpaid: "1 699 610",
    activeOrders: "0",
    rejected: "2 850 240",
    overdue: "1 156 000",
    children: [
      {
        id: "alikulov-marjon",
        employee: "Marjon",
        contract: "38 430 000",
        completed: "38 430 000",
        paid: "36 730 390",
        unpaid: "1 699 610",
        activeOrders: "0",
        rejected: "2 850 240",
        overdue: "1 156 000",
      },
    ],
  },
  {
    id: "fayruz",
    employee: "Fayruz",
    contract: "2 730 000",
    completed: "2 730 000",
    paid: "2 730 000",
    unpaid: "0",
    activeOrders: "0",
    rejected: "0",
    overdue: "0",
    children: [
      { id: "fayruz-marjon", employee: "Marjon", contract: "2 730 000", completed: "2 730 000", paid: "2 730 000", unpaid: "0", activeOrders: "0", rejected: "0", overdue: "0" },
    ],
  },
  {
    id: "test-user",
    employee: "Test user",
    contract: "0",
    completed: "0",
    paid: "0",
    unpaid: "0",
    activeOrders: "0",
    rejected: "0",
    overdue: "0",
    children: [
      { id: "test-user-marjon", employee: "Marjon", contract: "0", completed: "0", paid: "0", unpaid: "0", activeOrders: "0", rejected: "0", overdue: "0" },
    ],
  },
  {
    id: "alisher-abdusattorov",
    employee: "ALISHER ABDUSATTOROV",
    contract: "11 790 000",
    completed: "11 790 000",
    paid: "11 400 000",
    unpaid: "390 000",
    activeOrders: "0",
    rejected: "390 000",
    overdue: "0",
    children: [
      { id: "alisher-abdusattorov-marjon", employee: "Marjon", contract: "11 790 000", completed: "11 790 000", paid: "11 400 000", unpaid: "390 000", activeOrders: "0", rejected: "390 000", overdue: "0" },
    ],
  },
  {
    id: "hamzayev-sardor",
    employee: "HAMZAYEV SARDOR",
    contract: "119 065 000",
    completed: "118 685 000",
    paid: "56 025 000",
    unpaid: "62 660 000",
    activeOrders: "380 000",
    rejected: "780 000",
    overdue: "0",
    children: [
      { id: "hamzayev-sardor-marjon", employee: "Marjon", contract: "119 065 000", completed: "118 685 000", paid: "56 025 000", unpaid: "62 660 000", activeOrders: "380 000", rejected: "780 000", overdue: "0" },
    ],
  },
];

const ADMIN_DASHBOARD_DATE_PRESET_LABELS = ["Сегодня", "Вчера", "Эта неделя", "Этот месяц", "Этот год"];

const ADMIN_DASHBOARD_DATE_SHORT_MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const ADMIN_DASHBOARD_DATE_FULL_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const adminInstallStatusOptions = [
  { key: "all", label: "Все", count: 160 },
  { key: "waiting", label: "Ожидающий", count: 79 },
  { key: "installed", label: "Установлен", count: 12 },
  { key: "cancelled", label: "Отменено", count: 4 },
  { key: "extended", label: "Продлен", count: 0 },
  { key: "unset", label: "Не указано", count: 65 },
];

const adminInstallDateRows = [
  { id: "install-001", date: "02.07.2026", branch: "Тошкент филиал", status: "waiting", client: "AKBAR TEST", manager: "AKBAR MAMAYUSUPOV", address: "Toshkent sh, Sergeli t", amount: "0 UZS" },
  { id: "install-002", date: "04.07.2026", branch: "Тошкент филиал", status: "waiting", client: "MARJON CAFE", manager: "SARDOR HAMZAYEV", address: "Toshkent sh, Yunusobod t", amount: "390 000 UZS" },
  { id: "install-003", date: "06.07.2026", branch: "Тошкент филиал", status: "installed", client: "QADRDONLAR KAFE", manager: "OG'ABEK AXATOV", address: "Toshkent sh, Chilonzor t", amount: "1 200 000 UZS" },
  { id: "install-004", date: "08.07.2026", branch: "Тошкент филиал", status: "waiting", client: "MUSTAFO CAFE", manager: "JAVOHIR SOTUV", address: "Toshkent sh, Yakkasaroy t", amount: "0 UZS" },
  { id: "install-005", date: "11.07.2026", branch: "Тошкент филиал", status: "installed", client: "Yimizmi", manager: "Izzatbek Muzaffarov", address: "Toshkent sh, Шайхонтохур т", amount: "0 UZS", clientId: "1002975", ownerPhone: "+998 90 044 21 20" },
  { id: "install-006", date: "11.07.2026", branch: "Тошкент филиал", status: "installed", client: "OSIYO GARDEN", manager: "Marjon", address: "Samarqand, Жомбой т", amount: "0 UZS", clientId: "1002976", ownerPhone: "+998 90 044 21 21" },
  { id: "install-007", date: "15.07.2026", branch: "Тошкент филиал", status: "waiting", client: "BURGER HOUSE", manager: "YO'LDASHEV XURSHID", address: "Toshkent sh, Mirzo Ulug'bek t", amount: "0 UZS" },
  { id: "install-008", date: "17.07.2026", branch: "Тошкент филиал", status: "cancelled", client: "STREET FOOD", manager: "SAFAYEV AZIZ", address: "Toshkent sh, Uchtepa t", amount: "0 UZS" },
  { id: "install-009", date: "18.07.2026", branch: "Тошкент филиал", status: "waiting", client: "ANXOR KAFE", manager: "DILSHOD XABIBULLAYEV", address: "Toshkent sh, Yashnobod t", amount: "390 000 UZS" },
  { id: "install-010", date: "20.07.2026", branch: "Тошкент филиал", status: "waiting", client: "KARVON OSHXONA", manager: "TURAYEV ALISHER", address: "Toshkent sh, Olmazor t", amount: "0 UZS" },
  { id: "install-011", date: "21.07.2026", branch: "Тошкент филиал", status: "extended", client: "GOLDEN UZBECHIM", manager: "SHOHABBOS DONYOROV", address: "Toshkent sh, Shayxontohur t", amount: "390 000 UZS" },
  { id: "install-012", date: "24.07.2026", branch: "Тошкент филиал", status: "waiting", client: "SIMFONIYA MILLIY TAOMLARI", manager: "AZIM O'KTAMOV", address: "Toshkent sh, Bektemir t", amount: "0 UZS" },
  { id: "install-013", date: "24.07.2026", branch: "Тошкент филиал", status: "installed", client: "AMIRLIK RESTORANI", manager: "ELDOR SOTUV", address: "Toshkent sh, Mirobod t", amount: "1 000 000 UZS" },
  { id: "install-014", date: "", branch: "Тошкент филиал", status: "unset", client: "NOMI HALI TANLANMAGAN", manager: "SARDOR HAMZAYEV", address: "Toshkent sh", amount: "0 UZS" },
];

function buildAdminDashboardDateRange(preset) {
  const end = new Date(`${adminTodayInputValue()}T00:00:00`);
  const start = new Date(end);

  if (preset === "Вчера") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (preset === "Эта неделя") {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (preset === "Этот месяц") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  } else if (preset === "Этот год") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }

  return normalizeAdminReportRange({
    preset,
    start: adminInputDateToReportDate(adminDateToInputValue(start)),
    end: adminInputDateToReportDate(adminDateToInputValue(end)),
    startTime: "00:00",
    endTime: "00:00",
  });
}

function formatAdminDashboardDateRangeButton(range) {
  const normalized = normalizeAdminReportRange(range);
  const start = new Date(`${adminReportDateToInputDate(normalized.start)}T00:00:00`);
  const end = new Date(`${adminReportDateToInputDate(normalized.end)}T00:00:00`);
  const startLabel = `${start.getDate()} ${ADMIN_DASHBOARD_DATE_SHORT_MONTHS[start.getMonth()]}`;
  const endLabel = `${end.getDate()} ${ADMIN_DASHBOARD_DATE_SHORT_MONTHS[end.getMonth()]}\u00a0${end.getFullYear()}`;

  if (normalized.start === normalized.end) {
    return `${end.getDate()} ${ADMIN_DASHBOARD_DATE_FULL_MONTHS[end.getMonth()]}\u00a0${end.getFullYear()}`;
  }

  return `${startLabel} - ${endLabel}`;
}

function formatAdminInstallDateHeading(value) {
  const date = parseDate(value);
  return `${date.getDate()} ${ADMIN_DASHBOARD_DATE_FULL_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export {
  SECTION_API_MAP,
  navItems,
  DEMO_ORGANIZATION_ROW_COUNT,
  DEMO_TRANSACTION_ROW_COUNT,
  kpis,
  ADMIN_DASHBOARD_DEMO_MODE,
  demoKpiOverrides,
  dashboardKpiOrder,
  orderDashboardKpis,
  demoKpis,
  dashboardWarehouseCards,
  organizationRows,
  organizationDirectoryRows,
  demoOrganizationNames,
  demoOrganizationRegions,
  demoOrganizationManagers,
  demoOrganizationSources,
  demoOrganizationStatuses,
  demoOrganizationOrgStatuses,
  demoOrganizationPaymentKinds,
  formatDemoMoney,
  buildDemoOrganizationRows,
  demoOrganizationDirectoryRows,
  approvalItems,
  systemItems,
  organizationStatusRows,
  productBranchRows,
  ADMIN_PRODUCTS_STORAGE_KEY,
  adminProductCategories,
  adminProductUnits,
  adminProductWarehouses,
  adminProductRows,
  readStoredAdminProducts,
  saveStoredAdminProducts,
  normalizeAdminProduct,
  createAdminProductDraft,
  ADMIN_SALE_CATEGORIES_STORAGE_KEY,
  adminSaleCategoryRows,
  readStoredAdminSaleCategories,
  saveStoredAdminSaleCategories,
  normalizeAdminSaleCategory,
  createAdminSaleCategoryDraft,
  ADMIN_SOURCES_STORAGE_KEY,
  adminSourceRows,
  readStoredAdminSources,
  saveStoredAdminSources,
  normalizeAdminSource,
  createAdminSourceDraft,
  ADMIN_ORDERS_STORAGE_KEY,
  adminOrderOrganizations,
  adminOrderProducts,
  adminOrderRows,
  readStoredAdminOrders,
  saveStoredAdminOrders,
  normalizeAdminOrderStatus,
  normalizeAdminOrder,
  createAdminOrderDraft,
  getAdminOrderTotal,
  getAdminOrderProductsLabel,
  ADMIN_UNITS_STORAGE_KEY,
  adminUnitRows,
  readStoredAdminUnits,
  saveStoredAdminUnits,
  normalizeAdminUnit,
  createAdminUnitDraft,
  ADMIN_HANDBOOK_LOCATIONS_STORAGE_KEY,
  adminHandbookDefaultRows,
  adminHandbookActiveKind,
  adminHandbookConfig,
  normalizeAdminHandbookStatus,
  normalizeAdminHandbookRow,
  normalizeAdminHandbookState,
  readStoredAdminHandbookLocations,
  saveStoredAdminHandbookLocations,
  createAdminHandbookDraft,
  ADMIN_EMPLOYEES_STORAGE_KEY,
  adminEmployeeRoles,
  adminEmployeeDepartments,
  adminEmployeeRows,
  readStoredAdminEmployees,
  saveStoredAdminEmployees,
  normalizeAdminEmployee,
  createAdminEmployeeDraft,
  storageIncomeBranchRows,
  storageIncomeDetailRows,
  storageIncomeJournalRows,
  storageWriteoffRows,
  storageInventoryRows,
  storageExpenseBranchRows,
  storageExpenseDetailRows,
  storageBalanceBranchRows,
  storageBalanceDetailRows,
  categoryContent,
  sparklinePath,
  datePresets,
  padDate,
  formatDate,
  parseDate,
  rangeLabel,
  formatCurrency,
  financeOperationTotals,
  financeOperationRows,
  incomeCategoryRows,
  expenseCategoryRows,
  paymentMethodRows,
  financeHistoryRows,
  cashierBackgroundRows,
  formatSignedFinanceAmount,
  addMonthsToRange,
  presetRange,
  ADMIN_CHART_COLOR,
  ADMIN_CHART_COLOR_RGB,
  ADMIN_CHART_TODAY,
  ADMIN_CHART_MONTHS,
  ADMIN_CHART_PRESET_DAYS,
  adminChartPointToMoney,
  formatAdminRawMoney,
  formatAdminAxisTick,
  adminDateToInputValue,
  adminTodayInputValue,
  adminReportDateToInputDate,
  adminInputDateToReportDate,
  adminChartRangeEndingAt,
  normalizeAdminReportRange,
  adminChartRangeDays,
  adminChartRangeLabel,
  formatAdminDaysLabel,
  buildAdminChartRange,
  getAdminChartDaysBetween,
  normalizeAdminChartRange,
  buildAdminRangeLabels,
  buildAdminChartTickLabels,
  buildAdminDemoCurvePoints,
  demoAdminChartRangeData,
  emptyAdminChartRangeData,
  emptyAdminChartData,
  adminDemoChartBySegment,
  demoAdminChartData,
  ADMIN_PHONE_MAX_DIGITS,
  getAdminPhoneDigits,
  formatAdminPhone,
  formatAdminHeaderDate,
  formatAdminHeaderTime,
  splitKpiValue,
  adminChartRangeForSegment,
  getAdminChartCalendarCells,
  STATUS_GREEN,
  STATUS_VIOLET,
  orgDirectoryColumnKeys,
  ORG_DIRECTORY_COLUMN_SETTINGS_STORAGE_KEY,
  ORG_DIRECTORY_COLUMN_SETTINGS_LAYOUT_VERSION,
  defaultOrgDirectoryColumnOrder,
  normalizeOrgDirectoryColumnKeys,
  normalizeOrgDirectoryColumnSettings,
  loadOrgDirectoryColumnSettings,
  saveOrgDirectoryColumnSettings,
  ORG_STATUS_STORAGE_KEY,
  normalizeOrganizationStatusRow,
  loadOrganizationStatusRows,
  saveOrganizationStatusRows,
  mergeOrganizationStatusRows,
  ADMIN_FINANCE_FALLBACK_PAYMENT_TYPES,
  ADMIN_FINANCE_FALLBACK_INCOME_CATEGORIES,
  ADMIN_FINANCE_COUNTERPARTY_TYPES,
  ADMIN_FINANCE_CALENDAR_MONTHS,
  ADMIN_FINANCE_CALENDAR_WEEK_DAYS,
  ADMIN_FINANCE_CALENDAR_YEARS,
  ADMIN_FINANCE_MODAL_ANIMATION_MS,
  ADMIN_FINANCE_COMMENT_LIMIT,
  ADMIN_FINANCE_REQUIRED_FIELDS,
  adminFinanceApi,
  extractAdminFinanceItems,
  isUuidLike,
  normalizeAdminFinanceOption,
  normalizeAdminFinanceTransaction,
  createAdminFinanceTransactionDraft,
  formatAdminFinanceAmountDraft,
  parseAdminFinanceAmount,
  adminFinanceDateForApi,
  adminFinanceInputToDate,
  adminFinanceCalendarDays,
  getAdminFinanceBackendMessage,
  validateAdminFinanceDraft,
  getPageList,
  keepWheelInsideScroller,
  transactionColumnKeys,
  TRANSACTION_COLUMN_SETTINGS_STORAGE_KEY,
  TRANSACTION_COLUMN_SETTINGS_LAYOUT_VERSION,
  defaultTransactionColumnOrder,
  normalizeTransactionColumnKeys,
  normalizeTransactionColumnSettings,
  loadTransactionColumnSettings,
  saveTransactionColumnSettings,
  formatTransactionAmountParts,
  transactionDateToInputValue,
  transactionInputDateToDisplay,
  transactionAmountToDraftValue,
  formatTransactionAmountDraft,
  demoTransactionSeeds,
  demoTransactionBranches,
  demoTransactionPayTypes,
  demoTransactionTargets,
  demoTransactionComments,
  formatDemoTransactionDate,
  buildDemoTransactions,
  demoTransactions,
  dashboardTransactionReportRows,
  dashboardSalesReportRows,
  ADMIN_DASHBOARD_DATE_PRESET_LABELS,
  ADMIN_DASHBOARD_DATE_SHORT_MONTHS,
  ADMIN_DASHBOARD_DATE_FULL_MONTHS,
  adminInstallStatusOptions,
  adminInstallDateRows,
  buildAdminDashboardDateRange,
  formatAdminDashboardDateRangeButton,
  formatAdminInstallDateHeading,
};
