import { api } from "./client";

export const CUSTOMER_TEMPLATE_KEY = "marjon_receipt_template";
export const KITCHEN_TEMPLATE_KEY = "marjon_kitchen_receipt_template";

export const CUSTOMER_BLOCKS = [
  "logo",
  "restaurantName",
  "address",
  "phone",
  "orderNumber",
  "table",
  "waiter",
  "dateTime",
  "items",
  "discount",
  "serviceFee",
  "vat",
  "total",
  "paymentMethod",
  "qr",
  "thankYouText",
  "footerText",
];

export const KITCHEN_BLOCKS = [
  "orderNumber",
  "table",
  "waiter",
  "createdAt",
  "items",
  "modifiers",
  "itemComments",
  "orderNote",
  "priority",
];

export const CUSTOMER_BLOCK_LABELS = {
  logo: "Логотип",
  restaurantName: "Название ресторана",
  address: "Адрес",
  phone: "Телефон",
  orderNumber: "Номер заказа",
  table: "Стол",
  waiter: "Официант",
  dateTime: "Дата и время",
  items: "Позиции",
  discount: "Скидка",
  serviceFee: "Сервисный сбор",
  vat: "НДС",
  total: "Итого",
  paymentMethod: "Способ оплаты",
  qr: "QR",
  thankYouText: "Текст благодарности",
  footerText: "Нижний текст",
};

export const CUSTOMER_STYLE_BLOCKS = [
  "restaurantName",
  "orderNumber",
  "table",
  "waiter",
  "dateTime",
  "items",
  "total",
  "paymentMethod",
  "thankYouText",
  "footerText",
];

export const KITCHEN_BLOCK_LABELS = {
  orderNumber: "Номер заказа",
  table: "Стол",
  waiter: "Официант",
  createdAt: "Время создания",
  station: "Станция",
  items: "Позиции",
  modifiers: "Модификаторы",
  itemComments: "Комментарии к позициям",
  orderNote: "Комментарий заказа",
  priority: "Приоритет",
};

export function buildCustomerTemplate(org = {}) {
  const organization = org || {};
  const enabled = CUSTOMER_BLOCKS.reduce((acc, key) => ({ ...acc, [key]: true }), {});
  const blockStyles = CUSTOMER_BLOCKS.reduce((acc, key) => ({
    ...acc,
    [key]: { size: "standard", align: "left", weight: "standard" },
  }), {});
  enabled.logo = true;
  enabled.address = false;
  enabled.phone = false;
  enabled.qr = false;
  enabled.vat = false;

  return {
    paperSize: "80mm",
    blocks: [...CUSTOMER_BLOCKS],
    enabled,
    thankYouText: "XARIDINGIZ\nUCHUN RAXMAT!",
    footerText: organization.phone || "+998770702101",
    blockStyles: {
      ...blockStyles,
      restaurantName: { size: "large", align: "center", weight: "bold" },
      orderNumber: { size: "standard", align: "center", weight: "bold" },
      dateTime: { size: "standard", align: "center", weight: "bold" },
      total: { size: "xlarge", align: "left", weight: "standard" },
      thankYouText: { size: "large", align: "center", weight: "bold" },
      footerText: { size: "large", align: "center", weight: "bold" },
    },
    positions: {
      logo: { x: 0, y: 0 },
      restaurantName: { x: 0, y: 0 },
      qr: { x: 0, y: 0 },
      thankYouText: { x: 0, y: 0 },
      footerText: { x: 0, y: 0 },
    },
    restaurantName: organization.name || "MARJON",
    address: organization.address || "",
    phone: organization.phone || "",
    // Ссылка для QR-кода: вводится в веб-конструкторе, печатается нативным
    // QR принтера (ESC/POS GS ( k). Пустая строка → блок QR ничего не печатает.
    qrUrl: "",
    currency: organization.currency || "UZS",
    vatRate: Number(organization.vat_rate || 0),
    serviceFee: Number(organization.service_fee || 0),
  };
}

export function buildKitchenTemplate() {
  return {
    paperSize: "80mm",
    autoPrint: false,
    blocks: [...KITCHEN_BLOCKS],
    enabled: KITCHEN_BLOCKS.reduce((acc, key) => ({ ...acc, [key]: true }), {}),
  };
}

async function getTemplate(url, key, fallback, { signal } = {}) {
  const { data } = await (signal ? api.get(url, { signal }) : api.get(url));
  return { template: { ...fallback, ...data }, source: "api", cacheKey: key };
}

async function saveTemplate(url, key, template) {
  const { data } = await api.patch(url, template);
  return { template: { ...template, ...data }, source: "api", cacheKey: key };
}

async function postPrint(url, payload) {
  const { data } = await api.post(url, payload || {});
  return { ok: true, data, source: "api" };
}

function localTestPrint() {
  if (typeof window !== "undefined" && typeof window.print === "function") {
    window.print();
  }
  return Promise.resolve({ ok: true, source: "local" });
}

export function getCustomerTemplate(org, options) {
  return getTemplate("/settings/receipt-template", CUSTOMER_TEMPLATE_KEY, buildCustomerTemplate(org), options);
}

export function saveCustomerTemplate(template) {
  return saveTemplate("/settings/receipt-template", CUSTOMER_TEMPLATE_KEY, template);
}

export function getKitchenTemplate(options) {
  return getTemplate("/settings/kitchen-receipt-template", KITCHEN_TEMPLATE_KEY, buildKitchenTemplate(), options);
}

export function saveKitchenTemplate(template) {
  return saveTemplate("/settings/kitchen-receipt-template", KITCHEN_TEMPLATE_KEY, template);
}

export function testPrintReceipt(template) {
  return localTestPrint(template);
}

export function testPrintKitchen(template) {
  return localTestPrint(template);
}

// Бэкенд ждёт printer_id: подбираем активный принтер нужного типа (receipt | kitchen)
async function resolvePrinterId(printerType, printerId) {
  if (printerId) return printerId;
  const { data } = await api.get("/printers");
  const printers = Array.isArray(data) ? data : data?.items || [];
  const active = printers.filter((printer) => printer.is_active !== false);
  const match = active.find((printer) => printer.printer_type === printerType) || active[0];
  if (!match?.id) {
    const error = new Error("Принтер не настроен");
    error.response = { data: { detail: "Принтер не настроен. Добавьте принтер в настройках." } };
    throw error;
  }
  return match.id;
}

export async function printOrderReceipt(orderId, { printerId, copies = 1 } = {}) {
  const printer = await resolvePrinterId("receipt", printerId);
  return postPrint("/printers/print/receipt", { order_id: orderId, printer_id: printer, copies });
}

export async function printKitchenReceipt(orderId, { printerId, copies = 1 } = {}) {
  const printer = await resolvePrinterId("kitchen", printerId);
  return postPrint("/printers/print/kitchen", { order_id: orderId, printer_id: printer, copies });
}
