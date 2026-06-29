import { useEffect, useMemo, useState } from "react";
import logo from "../assets/marjon-logo.svg";
import { adminApi, adminLogin, adminLogout, isAdminAuthenticated } from "./api";
import Icon from '../components/Icon';

const navItems = [
  { key: "dashboard", label: "Дашборд", icon: "bi-grid-1x2-fill" },
  {
    key: "organizations", label: "Организации", icon: "bi-buildings",
    children: [
      { key: "org-list", label: "Организация", icon: "bi-building" },
      { key: "org-status", label: "Статус организации", icon: "bi-info-circle" },
    ],
  },
  { key: "departments", label: "Отделы", icon: "bi-collection" },
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

const kpis = [
  {
    title: "Всего организаций",
    value: "1 248",
    delta: "+12 / +2.1% за месяц",
    icon: "bi-buildings",
    tone: "blue",
    points: [16, 22, 18, 34, 30, 46, 42, 56],
    desc: "Всего подключённых организаций на платформе MARJON, включая активные и на модерации.",
  },
  {
    title: "Активных филиалов",
    value: "2 987",
    delta: "+84 / +2.9% за месяц",
    icon: "bi-diagram-3",
    tone: "green",
    points: [18, 24, 32, 28, 42, 48, 51, 60],
    desc: "Филиалы с активной кассой и работающей синхронизацией за выбранный период.",
  },
  {
    title: "Ожидают одобрения",
    value: "37",
    delta: "-6 / -13.9% за месяц",
    icon: "bi-inbox",
    tone: "violet",
    points: [58, 48, 52, 42, 39, 35, 30, 26],
    desc: "Заявки на подключение, изменение тарифа и услуги, ожидающие решения модератора.",
  },
  {
    title: "Оборот за месяц",
    value: "78 452 340 UZS",
    delta: "+18.6% к прошлому месяцу",
    icon: "bi-graph-up-arrow",
    tone: "orange",
    points: [20, 26, 31, 44, 40, 55, 63, 72],
    desc: "Суммарный оборот всех организаций платформы за текущий месяц в узбекских сумах.",
  },
  {
    title: "Платежи и банк",
    value: "Все системы работают",
    delta: "Uptime 99.98%",
    icon: "bi-shield-check",
    tone: "cyan",
    radar: true,
    desc: "Состояние платёжного шлюза и интеграции с Хамкорбанком. Аптайм за 30 дней — 99.98%.",
  },
];

const organizationRows = [
  ["Bella Italia Group", "Ресторанный холдинг", "12", "И. Каримов", "11.06.2026 11:42", "Активна"],
  ["Coffee House", "Ресторан", "3", "О. Ташматов", "11.06.2026 10:35", "Активна"],
  ["Sushi Master", "Кафе", "7", "Д. Юнусов", "11.06.2026 09:18", "На модерации"],
  ["Family Kitchen", "Общепит", "2", "С. Абдуллаев", "11.06.2026 08:05", "Активна"],
  ["Burger Station", "Фастфуд", "5", "А. Рахимов", "10.06.2026 23:47", "Новый"],
];

const approvalItems = [
  ["Bella Italia Group", "Новая организация", "10 мин назад", "Одобрить"],
  ["Coffee House", "Новый филиал", "32 мин назад", "Одобрить"],
  ["Sushi Master", "Изменение тарифного плана", "1 ч назад", "Рассмотреть"],
  ["Family Kitchen", "Подключение услуги", "2 ч назад", "Одобрить"],
  ["Burger Station", "Запрос на скидку", "3 ч назад", "Рассмотреть"],
];

const alertItems = [
  ["warning", "Высокая нагрузка на сервер API"],
  ["warning", "Истекает лицензия у 3 организаций"],
  ["success", "Резервное копирование завершено"],
  ["info", "Обновление платформы доступно"],
  ["info", "Новые фичи в модуле “Маркетинг”"],
];

const systemItems = [
  ["API Gateway", "Работает"],
  ["База данных", "Работает"],
  ["Платежи", "Работают"],
  ["Хамкорбанк", "Работает"],
  ["Очереди", "Работают"],
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

// Static turnover datasets per period — wired to the chart toggle so switching
// День/Неделя/Месяц/Год actually redraws the line, value, axes and tooltip.
const chartData = {
  "День": {
    value: "3 184 000 UZS",
    delta: "+4.2% к прошлому дню",
    points: [28, 34, 31, 44, 39, 52, 47, 58],
    xLabels: ["09:00", "12:00", "15:00", "18:00", "21:00", "00:00"],
    tooltip: { label: "18:00", value: "612 000 UZS" },
  },
  "Неделя": {
    value: "21 940 000 UZS",
    delta: "+7.8% к прошлой неделе",
    points: [34, 40, 36, 48, 52, 60, 66],
    xLabels: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    tooltip: { label: "Сб", value: "4 280 000 UZS" },
  },
  "Месяц": {
    value: "78 452 340 UZS",
    delta: "+18.6% к прошлому месяцу",
    points: [16, 22, 18, 34, 30, 46, 42, 56, 60, 68, 74, 88],
    xLabels: ["12.05", "19.05", "26.05", "02.06", "09.06", "11.06"],
    tooltip: { label: "09.06", value: "83 120 000 UZS" },
  },
  "Год": {
    value: "842 600 000 UZS",
    delta: "+24.3% к прошлому году",
    points: [22, 28, 30, 38, 44, 50, 58, 55, 64, 72, 80, 92],
    xLabels: ["Янв", "Мар", "Май", "Июл", "Сен", "Ноя"],
    tooltip: { label: "Ноя", value: "92 400 000 UZS" },
  },
};

// Smooth (Catmull-Rom → cubic bezier) line + area path for the platform chart.
function chartGeometry(values, width = 650, top = 30, bottom = 220, maxValue = 100) {
  const n = values.length;
  const pts = values.map((value, index) => ({
    x: n > 1 ? (index / (n - 1)) * width : 0,
    y: bottom - (Math.max(0, Math.min(maxValue, value)) / maxValue) * (bottom - top),
  }));
  const line = pts.map((point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const prev = pts[index - 1];
    const beforePrev = pts[index - 2] || prev;
    const next = pts[index + 1] || point;
    const cp1x = prev.x + (point.x - beforePrev.x) / 6;
    const cp1y = prev.y + (point.y - beforePrev.y) / 6;
    const cp2x = point.x - (next.x - prev.x) / 6;
    const cp2y = point.y - (next.y - prev.y) / 6;
    return `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join(" ");
  return { line, area: `${line} L ${width} ${bottom} L 0 ${bottom} Z`, last: pts[pts.length - 1] };
}

function LoginView({ onLogin }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await adminLogin(phone, password);
      onLogin();
    } catch {
      setError("Не удалось войти в Marjon Admin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login">
      <form className="admin-login__panel" onSubmit={submit}>
        <div className="admin-login__brand">
          <img src={logo} alt="MARJON" />
          <span>SUPER ADMIN</span>
        </div>
        <h1>Добро пожаловать</h1>
        <p className="admin-login__subtitle">Войдите в рабочее место суперадминки.</p>
        <label className="admin-login__field admin-login__field--phone">
          <span>НОМЕР ТЕЛЕФОНА</span>
          <div className="admin-login__input">
            <Icon name="bi-telephone" size={18} />
            <strong>+998</strong>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="numeric" autoComplete="tel" required />
          </div>
        </label>
        <label className="admin-login__field admin-login__field--password">
          <span>ПАРОЛЬ</span>
          <div className="admin-login__input">
            <Icon name="bi-lock" size={18} />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" required />
            <button className="admin-login__eye" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>
              <Icon name={showPassword ? "bi-eye-slash" : "bi-eye"} size={18} />
            </button>
          </div>
        </label>
        <div className="admin-login__options">
          <label>
            <input type="checkbox" defaultChecked />
            <span>Запомнить меня</span>
          </label>
          <button type="button">Забыли пароль?</button>
        </div>
        {error ? <div className="admin-login__error">{error}</div> : null}
        <button className="admin-login__submit" type="submit" disabled={loading}>{loading ? "Входим..." : "Войти"}</button>
      </form>
    </main>
  );
}

function Sidebar({ active, onSelect, collapsed, onToggle, user, onProfile }) {
  const activeParent = useMemo(
    () => navItems.find((item) => item.children?.some((child) => child.key === active))?.key || null,
    [active],
  );
  const [openGroups, setOpenGroups] = useState(() => (activeParent ? [activeParent] : []));

  useEffect(() => {
    if (activeParent) {
      setOpenGroups((groups) => (groups.includes(activeParent) ? groups : [...groups, activeParent]));
    }
  }, [activeParent]);

  function toggleGroup(key) {
    setOpenGroups((groups) => (groups.includes(key) ? groups.filter((item) => item !== key) : [...groups, key]));
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <img src={logo} alt="MARJON" />
        <div>
          <strong>MARJON</strong>
          <span>ADMIN</span>
        </div>
        <button className="admin-sidebar-collapse" type="button" onClick={onToggle} aria-pressed={collapsed} aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}>
          <Icon name={collapsed ? "bi-chevron-right" : "bi-chevron-left"} size={18} />
        </button>
      </div>
      <nav className="admin-nav" aria-label="Admin navigation">
        {navItems.map((item) => {
          if (!item.children) {
            return (
              <button
                key={item.key}
                type="button"
                className={active === item.key ? "is-active" : ""}
                onClick={() => onSelect(item.key)}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
                {item.badge ? <em>{item.badge}</em> : null}
              </button>
            );
          }
          const open = openGroups.includes(item.key);
          const hasActiveChild = item.children.some((child) => child.key === active);
          return (
            <div className={`admin-nav-group ${open ? "is-open" : ""} ${hasActiveChild ? "has-active" : ""}`} key={item.key}>
              <button
                type="button"
                className={`admin-nav-group__toggle ${hasActiveChild ? "is-active" : ""}`}
                onClick={() => toggleGroup(item.key)}
                aria-expanded={open}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
                <Icon name="bi-chevron-right" size={15} className="admin-nav-group__chevron" />
              </button>
              <div className="admin-nav-sub" role="group">
                {item.children.map((child) => (
                  <button
                    key={child.key}
                    type="button"
                    className={`admin-nav-sub__item ${active === child.key ? "is-active" : ""}`}
                    onClick={() => onSelect(child.key)}
                  >
                    <Icon name={child.icon || "bi-circle"} size={17} className="admin-nav-sub__icon" />
                    <span>{child.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <button className="admin-profile-card" type="button" onClick={onProfile}>
        <span className="admin-profile-card__avatar">{(user?.name || "Александр П.").trim().slice(0, 1)}</span>
        <span className="admin-profile-card__info">
          <strong>{user?.name || "Александр П."}</strong>
          <small>{user?.is_superadmin ? "Суперадмин" : "Администратор"}</small>
        </span>
        <Icon name="bi-chevron-right" size={16} className="admin-profile-card__chevron" />
      </button>
    </aside>
  );
}

function Header({ user, onLogout, search, onSearchChange, dateRange, onDateRangeChange, onBellClick, notificationCount }) {
  const [dateOpen, setDateOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(dateRange);

  function applyDraft() {
    onDateRangeChange({ ...draftRange, label: draftRange.preset || rangeLabel(draftRange) });
    setDateOpen(false);
  }

  function choosePreset(label) {
    setDraftRange(presetRange(label));
  }

  function shiftMonth(diff) {
    const next = addMonthsToRange(dateRange, diff);
    onDateRangeChange(next);
    setDraftRange(next);
  }

  return (
    <header className="admin-header">
      <div>
        <h1>Панель администратора</h1>
        <p>Централизованное управление платформой MARJON</p>
      </div>
      <div className="admin-header__actions">
        <label className="admin-search">
          <Icon name="bi-search" size={18} />
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Поиск по платформе..." />
        </label>
        <div className="admin-date-picker">
          <button className="admin-date-step" type="button" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
            <Icon name="bi-chevron-left" size={16} />
          </button>
          <button className="admin-date" type="button" onClick={() => { setDraftRange(dateRange); setDateOpen((value) => !value); }} aria-expanded={dateOpen}>
            <Icon name="bi-calendar3" size={18} />
            <span>{dateRange.label}</span>
          </button>
          <button className="admin-date-step" type="button" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
            <Icon name="bi-chevron-right" size={16} />
          </button>
          {dateOpen ? (
            <div className="admin-date-menu">
              <div className="admin-date-menu__title">
                <Icon name="bi-calendar-week" size={18} />
                <span>Выберите дату</span>
              </div>
              <div className="admin-date-presets">
                {datePresets.map((preset) => (
                  <button className={draftRange.preset === preset ? "is-active" : ""} type="button" key={preset} onClick={() => choosePreset(preset)}>{preset}</button>
                ))}
              </div>
              <div className="admin-date-range">
                <input value={draftRange.start} onChange={(event) => setDraftRange((current) => ({ ...current, start: event.target.value, preset: "" }))} aria-label="Дата начала" />
                <span>-</span>
                <input value={draftRange.end} onChange={(event) => setDraftRange((current) => ({ ...current, end: event.target.value, preset: "" }))} aria-label="Дата окончания" />
                <button type="button" onClick={applyDraft}>OK</button>
              </div>
            </div>
          ) : null}
        </div>
        <button className="admin-bell" type="button" aria-label="Уведомления" onClick={onBellClick}>
          <Icon name="bi-bell" size={18} />
          <span>{notificationCount}</span>
        </button>
        <div className="admin-profile">
          <div className="admin-profile__avatar">А</div>
          <div>
            <strong>Александр П.</strong>
            <span>{user?.is_superadmin ? "Суперадмин" : "Суперадмин"}</span>
          </div>
        </div>
        <button className="admin-logout" type="button" onClick={onLogout}>
          <Icon name="bi-box-arrow-right" size={18} />
        </button>
      </div>
    </header>
  );
}

function KpiCard({ item, onClick }) {
  return (
    <article
      className={`admin-kpi admin-kpi--${item.tone}`}
      role="button"
      tabIndex={0}
      onClick={() => onClick(item)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(item); } }}
    >
      <div className="admin-kpi__top">
        <span><Icon name={item.icon} size={20} /></span>
        <small>{item.title}</small>
      </div>
      <strong>{item.value}</strong>
      <p>{item.delta}</p>
      {item.radar ? (
        <div className="admin-radar" aria-hidden="true">
          <i />
          <i />
          <b />
        </div>
      ) : (
        <svg className="admin-spark" viewBox="0 0 120 46" preserveAspectRatio="none" aria-hidden="true">
          <path className="admin-spark__fill" d={`${sparklinePath(item.points, 120, 36)} L 120 46 L 0 46 Z`} />
          <path className="admin-spark__line" d={sparklinePath(item.points, 120, 36)} />
        </svg>
      )}
    </article>
  );
}

function PlatformChart({ segment, onSegmentChange }) {
  const data = chartData[segment] || chartData["Месяц"];
  const geo = chartGeometry(data.points);
  const tooltipLeft = Math.min(74, Math.max(2, (geo.last.x / 700) * 100 - 8));
  const tooltipTop = Math.max(4, (geo.last.y / 250) * 100 - 16);
  return (
    <section className="admin-chart-card">
      <div className="admin-chart-card__head">
        <div>
          <span>Динамика оборота платформы</span>
          <strong>{data.value}</strong>
          <em>{data.delta}</em>
        </div>
        <div className="admin-segments">
          {["День", "Неделя", "Месяц", "Год"].map((item) => (
            <button className={item === segment ? "is-active" : ""} type="button" key={item} onClick={() => onSegmentChange(item)}>{item}</button>
          ))}
        </div>
      </div>
      <div className="admin-chart">
        <div className="admin-y-axis">
          {["100M", "80M", "60M", "40M", "20M", "0"].map((label) => <span key={label}>{label}</span>)}
        </div>
        <svg viewBox="0 0 700 250" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="platformArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#43d3a6" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#d6a84f" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="platformLine" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#d6a84f" />
              <stop offset="48%" stopColor="#43d3a6" />
              <stop offset="100%" stopColor="#f2c76e" />
            </linearGradient>
            <filter id="lineGlow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {[30, 68, 106, 144, 182, 220].map((y) => <line x1="0" x2="700" y1={y} y2={y} key={y} />)}
          <path className="admin-chart__area" d={geo.area} />
          <path className="admin-chart__line" d={geo.line} filter="url(#lineGlow)" />
          <circle cx={geo.last.x} cy={geo.last.y} r="6" className="admin-chart__dot" />
        </svg>
        <div className="admin-tooltip" style={{ left: `${tooltipLeft}%`, top: `${tooltipTop}%` }}>
          <strong>{data.tooltip.label}</strong>
          <span>{data.tooltip.value}</span>
        </div>
        <div className="admin-x-axis">
          {data.xLabels.map((label) => <span key={label}>{label}</span>)}
        </div>
      </div>
    </section>
  );
}

const STATUS_GREEN = ["Активна", "Активен", "Проведен", "Завершено", "В норме", "Включено", "ОК"];
const STATUS_VIOLET = ["Новый", "Новая", "Черновик"];

function StatusBadge({ status }) {
  const key = STATUS_GREEN.includes(status) ? "green" : STATUS_VIOLET.includes(status) ? "violet" : "orange";
  return <span className={`admin-status admin-status--${key}`}>{status}</span>;
}

function OrganizationsTable({ rows, onExport, onRowAction, onRowClick }) {
  return (
    <section className="admin-table-card">
      <div className="admin-panel-head">
        <div>
          <h2>Недавние организации и филиалы</h2>
          <p>Последние подключения, заявки и изменения по клиентам.</p>
        </div>
        <button type="button" onClick={onExport}>Экспорт</button>
      </div>
      <div className="admin-org-table">
        <div className="admin-org-table__row admin-org-table__head">
          <span>Организация</span>
          <span>Тип</span>
          <span>Филиалов</span>
          <span>Админ</span>
          <span>Дата регистрации</span>
          <span>Статус</span>
          <span>Действия</span>
        </div>
        {rows.map((row) => (
          <div className="admin-org-table__row" key={row[0]} role="button" tabIndex={0} onClick={() => onRowClick(row)} onKeyDown={(event) => { if (event.key === "Enter") onRowClick(row); }}>
            <strong>{row[0]}</strong>
            <span>{row[1]}</span>
            <span>{row[2]}</span>
            <span>{row[3]}</span>
            <span>{row[4]}</span>
            <StatusBadge status={row[5]} />
            <button type="button" onClick={(event) => { event.stopPropagation(); onRowAction(row[0]); }} aria-label={`Сменить статус: ${row[0]}`}><Icon name="bi-three-dots" size={18} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function RightColumn({ approvals, alerts, onApprovalAction, onShowApprovals, onShowAlerts, onApprovalClick, onAlertClick, onSystemClick }) {
  return (
    <aside className="admin-right">
      <section className="admin-side-card">
        <div className="admin-side-card__head">
          <h3>Одобрения и заявки</h3>
          <span>{approvals.length}</span>
        </div>
        <div className="admin-approval-list">
          {approvals.length ? approvals.map((item) => (
            <div className="admin-approval" key={item[0] + item[1]} role="button" tabIndex={0} onClick={() => onApprovalClick(item)} onKeyDown={(event) => { if (event.key === "Enter") onApprovalClick(item); }}>
              <div>
                <strong>{item[0]}</strong>
                <p>{item[1]}</p>
                <small>{item[2]}</small>
              </div>
              <button type="button" onClick={(event) => { event.stopPropagation(); onApprovalAction(item); }}>{item[3]}</button>
            </div>
          )) : (
            <div className="admin-empty">Нет активных заявок — всё обработано.</div>
          )}
        </div>
        {approvals.length ? (
          <button className="admin-side-link" type="button" onClick={onShowApprovals}>Показать все заявки</button>
        ) : null}
      </section>

      <section className="admin-side-card">
        <div className="admin-side-card__head">
          <h3>Системные оповещения</h3>
          <span>{alerts.length}</span>
        </div>
        <div className="admin-alert-list">
          {alerts.length ? alerts.map((item) => (
            <div className={`admin-system-alert admin-system-alert--${item[0]}`} key={item[1]} role="button" tabIndex={0} onClick={() => onAlertClick(item)} onKeyDown={(event) => { if (event.key === "Enter") onAlertClick(item); }}>
              <Icon name={item[0] === "success" ? "bi-check-circle" : item[0] === "warning" ? "bi-exclamation-triangle" : "bi-info-circle"} size={18} />
              <span>{item[1]}</span>
            </div>
          )) : (
            <div className="admin-empty">Новых оповещений нет.</div>
          )}
        </div>
        {alerts.length ? (
          <button className="admin-side-link" type="button" onClick={onShowAlerts}>Показать все оповещения</button>
        ) : null}
      </section>

      <section className="admin-side-card">
        <div className="admin-side-card__head">
          <h3>Статус систем</h3>
          <span className="is-live">live</span>
        </div>
        <div className="admin-system-grid">
          {systemItems.map((item) => (
            <div key={item[0]} role="button" tabIndex={0} onClick={() => onSystemClick(item)} onKeyDown={(event) => { if (event.key === "Enter") onSystemClick(item); }}>
              <strong>{item[0]}</strong>
              <span><i />{item[1]}</span>
            </div>
          ))}
        </div>
        <div className="admin-uptime">Аптайм платформы <strong>99.98%</strong></div>
      </section>
    </aside>
  );
}

function CategoryPage({ active, rowsOverride, search, onCreate, onRowDetail }) {
  const content = categoryContent[active] || categoryContent["org-list"];
  const rows = (rowsOverride || content.rows).filter((row) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return row.some((cell) => String(cell).toLowerCase().includes(query));
  });
  return (
    <section className="admin-category-page">
      <div className="admin-panel-head">
        <div>
          <h2>{content.title}</h2>
          <p>{content.text}</p>
        </div>
        <button type="button" onClick={() => onCreate(active)}>Создать</button>
      </div>
      <div className="admin-category-table">
        <div className="admin-category-table__row admin-category-table__head" style={{ gridTemplateColumns: `repeat(${content.columns.length}, minmax(0, 1fr))` }}>
          {content.columns.map((column) => <span key={column}>{column}</span>)}
        </div>
        {rows.map((row, rowIndex) => (
          <div className="admin-category-table__row" style={{ gridTemplateColumns: `repeat(${content.columns.length}, minmax(0, 1fr))` }} key={rowIndex} role="button" tabIndex={0} onClick={() => onRowDetail(content.title, content.columns, row)} onKeyDown={(event) => { if (event.key === "Enter") onRowDetail(content.title, content.columns, row); }}>
            {row.map((cell, index) => index === row.length - 1 ? <StatusBadge status={cell} key={index} /> : <span key={index}>{cell}</span>)}
          </div>
        ))}
      </div>
    </section>
  );
}

function DashboardPage({ segment, onSegmentChange, organizationRows, approvals, alerts, onExport, onRowAction, onApprovalAction, onShowApprovals, onShowAlerts, onKpiClick, onOrgClick, onApprovalClick, onAlertClick, onSystemClick }) {
  return (
    <>
      <section className="admin-kpi-grid">
        {kpis.map((item) => <KpiCard item={item} key={item.title} onClick={onKpiClick} />)}
      </section>
      <div className="admin-dashboard-grid">
        <main className="admin-center">
          <PlatformChart segment={segment} onSegmentChange={onSegmentChange} />
          <OrganizationsTable rows={organizationRows} onExport={onExport} onRowAction={onRowAction} onRowClick={onOrgClick} />
        </main>
        <RightColumn
          approvals={approvals}
          alerts={alerts}
          onApprovalAction={onApprovalAction}
          onShowApprovals={onShowApprovals}
          onShowAlerts={onShowAlerts}
          onApprovalClick={onApprovalClick}
          onAlertClick={onAlertClick}
          onSystemClick={onSystemClick}
        />
      </div>
    </>
  );
}

function Footer() {
  return (
    <footer className="admin-footer">
      <span>© 2026 MARJON. Все права защищены.</span>
      <span>Версия 2.4.7</span>
      <span><i />Все системы работают</span>
      <a href="#support">Центр поддержки</a>
    </footer>
  );
}

function DetailModal({ data, onClose }) {
  useEffect(() => {
    function onKey(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!data) return null;
  const actions = data.actions && data.actions.length
    ? data.actions
    : [{ label: "Закрыть", variant: "ghost", onClick: onClose }];

  return (
    <div className="admin-modal" role="dialog" aria-modal="true" aria-label={data.title} onClick={onClose}>
      <div className="admin-modal__panel" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal__head">
          <div>
            <h3>{data.title}</h3>
            {data.subtitle ? <p>{data.subtitle}</p> : null}
          </div>
          {data.status ? <StatusBadge status={data.status} /> : null}
          <button className="admin-modal__close" type="button" onClick={onClose} aria-label="Закрыть">
            <Icon name="bi-x-lg" size={18} />
          </button>
        </div>
        <dl className="admin-modal__fields">
          {data.fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
        <div className="admin-modal__actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`admin-modal__btn ${action.variant === "ghost" ? "is-ghost" : "is-primary"}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminShell({ onLogout }) {
  const [active, setActive] = useState("dashboard");
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("Месяц");
  const [dateRange, setDateRange] = useState(() => presetRange("Сегодня"));
  const [organizations, setOrganizations] = useState(organizationRows);
  const [approvals, setApprovals] = useState(approvalItems);
  const [alerts, setAlerts] = useState(alertItems);
  const [categoryRows, setCategoryRows] = useState({});
  const [detail, setDetail] = useState(null);

  const closeDetail = () => setDetail(null);

  useEffect(() => {
    let mounted = true;
    if (localStorage.getItem("admin_local_login") === "true") {
      setUser({ email: "900000777", phone: "900000777", name: "Super Admin", is_superadmin: true });
      adminApi.get("/organizations", { params: { size: 5 } }).catch(() => {});
      return () => { mounted = false; };
    }
    adminApi.get("/auth/me")
      .then(({ data }) => mounted && setUser(data))
      .catch(() => mounted && setMessage("Профиль не загружен. Проверьте права доступа."));
    adminApi.get("/organizations", { params: { size: 5 } }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(""), 3200);
    return () => clearTimeout(timer);
  }, [message]);

  const filteredOrganizations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return organizations;
    return organizations.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(query)));
  }, [organizations, search]);

  function downloadCsv(filename, rows) {
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleCreate(section) {
    const content = categoryContent[section] || categoryContent["org-list"];
    const nextRow = content.columns.map((column, index) => {
      if (index === 0) return `Новая запись ${Date.now().toString().slice(-4)}`;
      if (index === content.columns.length - 1) return "Новый";
      return "—";
    });
    setCategoryRows((current) => ({
      ...current,
      [section]: [nextRow, ...(current[section] || content.rows)],
    }));
    setMessage("Запись создана локально.");
  }

  function handleRowAction(name) {
    setOrganizations((current) => current.map((row) => (
      row[0] === name
        ? row.map((cell, index) => (index === row.length - 1 ? (cell === "Активна" ? "На модерации" : "Активна") : cell))
        : row
    )));
    setMessage(`Статус обновлен: ${name}`);
  }

  function handleApprovalAction(item) {
    setApprovals((current) => current.filter((entry) => entry !== item));
    setMessage(`${item[0]}: заявка обработана.`);
  }

  function openKpiDetail(item) {
    setDetail({
      title: item.title,
      subtitle: "Ключевой показатель платформы",
      fields: [
        { label: "Текущее значение", value: item.value },
        { label: "Динамика", value: item.delta },
        { label: "Описание", value: item.desc },
      ],
    });
  }

  function openOrgDetail(row) {
    setDetail({
      title: row[0],
      subtitle: row[1],
      status: row[5],
      fields: [
        { label: "Тип", value: row[1] },
        { label: "Филиалов", value: row[2] },
        { label: "Администратор", value: row[3] },
        { label: "Дата регистрации", value: row[4] },
        { label: "Статус", value: row[5] },
      ],
      actions: [
        { label: "Сменить статус", variant: "primary", onClick: () => { handleRowAction(row[0]); closeDetail(); } },
        { label: "Закрыть", variant: "ghost", onClick: closeDetail },
      ],
    });
  }

  function openApprovalDetail(item) {
    setDetail({
      title: item[0],
      subtitle: item[1],
      fields: [
        { label: "Тип заявки", value: item[1] },
        { label: "Получено", value: item[2] },
        { label: "Рекомендуемое действие", value: item[3] },
      ],
      actions: [
        { label: item[3], variant: "primary", onClick: () => { handleApprovalAction(item); closeDetail(); } },
        { label: "Закрыть", variant: "ghost", onClick: closeDetail },
      ],
    });
  }

  function openAlertDetail(item) {
    const levelLabel = item[0] === "success" ? "Успешно" : item[0] === "warning" ? "Предупреждение" : "Информация";
    setDetail({
      title: levelLabel,
      subtitle: "Системное оповещение",
      fields: [
        { label: "Уровень", value: levelLabel },
        { label: "Сообщение", value: item[1] },
      ],
    });
  }

  function openSystemDetail(item) {
    setDetail({
      title: item[0],
      subtitle: "Состояние подсистемы",
      fields: [
        { label: "Компонент", value: item[0] },
        { label: "Состояние", value: item[1] },
        { label: "Аптайм за 30 дней", value: "99.98%" },
      ],
    });
  }

  function openCategoryRowDetail(title, columns, row) {
    setDetail({
      title: row[0],
      subtitle: title,
      status: row[row.length - 1],
      fields: columns.map((column, index) => ({ label: column, value: row[index] })),
    });
  }

  function openProfileDetail() {
    setDetail({
      title: user?.name || "Александр П.",
      subtitle: "Профиль администратора",
      status: "Активна",
      fields: [
        { label: "Роль", value: user?.is_superadmin ? "Суперадмин" : "Администратор" },
        { label: "Телефон", value: user?.phone || "900000777" },
        { label: "Доступ", value: "Полный доступ" },
      ],
      actions: [
        { label: "Выйти", variant: "primary", onClick: () => { closeDetail(); logout(); } },
        { label: "Закрыть", variant: "ghost", onClick: closeDetail },
      ],
    });
  }

  const page = useMemo(() => (
    active === "dashboard" ? (
      <DashboardPage
        segment={segment}
        onSegmentChange={setSegment}
        organizationRows={filteredOrganizations}
        approvals={approvals}
        alerts={alerts}
        onExport={() => downloadCsv("marjon-organizations.csv", [["Организация", "Тип", "Филиалов", "Админ", "Дата регистрации", "Статус"], ...filteredOrganizations])}
        onRowAction={handleRowAction}
        onApprovalAction={handleApprovalAction}
        onShowApprovals={() => setMessage(`Показаны все заявки: ${approvals.length}.`)}
        onShowAlerts={() => setMessage(`Показаны все оповещения: ${alerts.length}.`)}
        onKpiClick={openKpiDetail}
        onOrgClick={openOrgDetail}
        onApprovalClick={openApprovalDetail}
        onAlertClick={openAlertDetail}
        onSystemClick={openSystemDetail}
      />
    ) : (
      <CategoryPage active={active} rowsOverride={categoryRows[active]} search={search} onCreate={handleCreate} onRowDetail={openCategoryRowDetail} />
    )
  ), [active, alerts, approvals, categoryRows, filteredOrganizations, search, segment]);

  function logout() {
    adminLogout();
    onLogout();
  }

  return (
    <div className={`admin-shell ${collapsed ? "is-sidebar-collapsed" : ""}`}>
      <Sidebar active={active} onSelect={setActive} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} user={user} onProfile={openProfileDetail} />
      <section className="admin-main">
        <Header
          user={user}
          onLogout={logout}
          search={search}
          onSearchChange={setSearch}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onBellClick={() => setMessage(`Непрочитанных уведомлений: ${approvals.length + alerts.length}.`)}
          notificationCount={approvals.length + alerts.length}
        />
        {message ? (
          <div className="admin-auth-alert" role="status" onClick={() => setMessage("")}>{message}</div>
        ) : null}
        <div className="admin-content">
          {page}
        </div>
        <Footer />
      </section>
      <DetailModal data={detail} onClose={closeDetail} />
    </div>
  );
}

export default function AdminApp() {
  const [authenticated, setAuthenticated] = useState(() => isAdminAuthenticated());
  return authenticated ? (
    <AdminShell onLogout={() => setAuthenticated(false)} />
  ) : (
    <LoginView onLogin={() => setAuthenticated(true)} />
  );
}
