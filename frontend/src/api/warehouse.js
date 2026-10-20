import { api } from "./client";

// Разделы склада, чьи READ-эндпоинты подтверждены бэкендом (owner-readable,
// require_company_app_user). WH-01: «stock» теперь тоже доступен веб-владельцу
// (inventory:stock:read разморожен), но остатки грузятся отдельным путём
// (listStock ниже), поэтому в READ_PATHS его нет. «outgoing» (расход) и
// «waste» (отход) добавлены под WH-01. «write-off-categories» нет — это
// клиентская агрегация /warehouse/write-offs по категории.
// Для неподдерживаемых секций list() намеренно бросает TypeError.
const READ_PATHS = Object.freeze({
  incoming: "/warehouse/purchases",
  "incoming-journal": "/warehouse/purchases",
  outgoing: "/warehouse/expenses",
  transfer: "/warehouse/transfers",
  inventory: "/warehouse/inventory-checks",
  "write-off": "/warehouse/write-offs",
  waste: "/warehouse/wastes",
});

// Пакетный состав документов: один запрос вместо N поштучных (экраны склада
// просили детали для каждого документа — до 60 параллельно). URL не резиновый,
// поэтому режем на пачки по 100 id и склеиваем ответы в один список.
function fetchDocumentDetails(path, ids, config) {
  const list = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!list.length) return Promise.resolve({ data: [] });
  const chunks = [];
  for (let i = 0; i < list.length; i += 100) chunks.push(list.slice(i, i + 100));
  return Promise.all(
    chunks.map((chunk) => api.get(path, { ...(config || {}), params: { ids: chunk.join(",") } })),
  ).then((responses) => ({
    data: responses.flatMap((res) => (Array.isArray(res?.data) ? res.data : res?.data?.items || [])),
  }));
}

export const warehouseService = Object.freeze({
  list(section, config) {
    const path = READ_PATHS[section];
    if (!path) throw new TypeError(`Unsupported warehouse read section: ${section}`);
    return config ? api.get(path, config) : api.get(path);
  },

  // --- Справочники для форм и экрана остатков --------------------------------
  listWarehouses(config) {
    return config ? api.get("/warehouse/list", config) : api.get("/warehouse/list");
  },
  // V36: склады — создание/переименование/удаление (POST/PATCH/DELETE
  // /warehouse/list). Удаление занятого склада бэк отклоняет 409.
  createWarehouse(payload) {
    return api.post("/warehouse/list", payload);
  },
  updateWarehouse(id, payload) {
    return api.patch(`/warehouse/list/${id}`, payload);
  },
  deleteWarehouse(id) {
    return api.delete(`/warehouse/list/${id}`);
  },
  listIngredients(config) {
    return config ? api.get("/inventory/ingredients", config) : api.get("/inventory/ingredients");
  },
  listStock(config) {
    if (config?.params?.as_of) return api.get("/inventory/stock", {
      ...config, params: { ...config.params, web_timezone: "Asia/Tashkent" },
    });
    return config ? api.get("/inventory/stock", config) : api.get("/inventory/stock");
  },
  listOutgoingReport(dateFrom, dateTo, config = {}) {
    return api.get("/inventory/stock/outgoing-report", { ...config, params: { ...config.params, date_from: dateFrom, date_to: dateTo, web_timezone: "Asia/Tashkent" } });
  },
  // V46 FIFO: разбивка остатка по партиям (старые первыми).
  listBatches(params, config) {
    return api.get("/inventory/stock/batches", { ...(config || {}), params });
  },

  // --- Документы прихода: создать → провести → удалить -----------------------
  // Позиции задаются только при создании (бэкенд не отдаёт/не редактирует
  // строки существующего документа). «Провести» = PATCH status:"accepted",
  // после чего остатки увеличиваются (идемпотентно, guarded by accepted_at).
  createPurchase(payload) {
    return api.post("/warehouse/purchases", payload);
  },
  getPurchase(id, config) {
    return config ? api.get(`/warehouse/purchases/${id}`, config) : api.get(`/warehouse/purchases/${id}`);
  },
  // Состав сразу для всего списка документов — см. fetchDocumentDetails.
  listPurchaseDetails(ids, config) {
    return fetchDocumentDetails("/warehouse/purchases/details", ids, config);
  },
  acceptPurchase(id) {
    return api.patch(`/warehouse/purchases/${id}`, { status: "accepted" });
  },
  deletePurchase(id) {
    return api.delete(`/warehouse/purchases/${id}`);
  },

  // --- Инвентаризация (V42): шапка + позиции + автодокументы корректировки --
  // Излишки (факт > остатка) → документ прихода, недостачи → документ расхода.
  // apply_to_stock=false — только шапка, остатки не двигаются.
  createInventory(payload) {
    return api.post("/warehouse/inventory-checks", payload);
  },
  getInventory(id, config) {
    return config ? api.get(`/warehouse/inventory-checks/${id}`, config) : api.get(`/warehouse/inventory-checks/${id}`);
  },
  updateInventory(id, payload) {
    return api.patch(`/warehouse/inventory-checks/${id}`, payload);
  },
  deleteInventory(id) {
    return api.delete(`/warehouse/inventory-checks/${id}`);
  },

  // --- Документы расхода (Расход, WH-01) -------------------------------------
  // Зеркалит приход, но проведение УМЕНЬШАЕТ остатки (StockMovement "expense").
  // Проведение при нехватке остатка → 422 (документ остаётся черновиком).
  createExpense(payload) {
    return api.post("/warehouse/expenses", payload);
  },
  getExpense(id, config) {
    return config ? api.get(`/warehouse/expenses/${id}`, config) : api.get(`/warehouse/expenses/${id}`);
  },
  // Состав сразу для всего списка расходов — см. fetchDocumentDetails.
  listExpenseDetails(ids, config) {
    return fetchDocumentDetails("/warehouse/expenses/details", ids, config);
  },
  acceptExpense(id) {
    return api.patch(`/warehouse/expenses/${id}`, { status: "accepted" });
  },
  deleteExpense(id) {
    return api.delete(`/warehouse/expenses/${id}`);
  },

  // --- Документы отхода (Отход, WH-01) ---------------------------------------
  // Построчный документ (одна позиция). Проведение уменьшает остаток
  // (StockMovement "waste"); при нехватке — 422.
  createWaste(payload) {
    return api.post("/warehouse/wastes", payload);
  },
  acceptWaste(id) {
    return api.patch(`/warehouse/wastes/${id}`, { status: "accepted" });
  },
  deleteWaste(id) {
    return api.delete(`/warehouse/wastes/${id}`);
  },
});

export { READ_PATHS };
