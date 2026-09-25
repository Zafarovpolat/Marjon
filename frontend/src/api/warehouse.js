import { api } from "./client";

// Разделы склада, чьи READ-эндпоинты подтверждены бэкендом. «stock» сюда
// НЕ входит: остатки собираются из нескольких источников (см. loadStock),
// поэтому list("stock") намеренно бросает TypeError.
const READ_PATHS = Object.freeze({
  incoming: "/warehouse/purchases",
  transfer: "/warehouse/transfers",
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
});

export { READ_PATHS };
