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
  listIngredients(config) {
    return config ? api.get("/inventory/ingredients", config) : api.get("/inventory/ingredients");
  },
  listStock(config) {
    return config ? api.get("/inventory/stock", config) : api.get("/inventory/stock");
  },

  // --- Документы прихода: создать → провести → удалить -----------------------
  // Позиции задаются только при создании (бэкенд не отдаёт/не редактирует
  // строки существующего документа). «Провести» = PATCH status:"accepted",
  // после чего остатки увеличиваются (идемпотентно, guarded by accepted_at).
  createPurchase(payload) {
    return api.post("/warehouse/purchases", payload);
  },
  acceptPurchase(id) {
    return api.patch(`/warehouse/purchases/${id}`, { status: "accepted" });
  },
  deletePurchase(id) {
    return api.delete(`/warehouse/purchases/${id}`);
  },

  // --- Документы расхода (Расход, WH-01) -------------------------------------
  // Зеркалит приход, но проведение УМЕНЬШАЕТ остатки (StockMovement "expense").
  // Проведение при нехватке остатка → 422 (документ остаётся черновиком).
  createExpense(payload) {
    return api.post("/warehouse/expenses", payload);
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
