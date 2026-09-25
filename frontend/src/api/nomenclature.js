import { api } from "./client";

// Сервис номенклатуры: сырьё (ingredients) и полуфабрикаты (semi-products).
// Все мутации идут через этот слой — страницы не дёргают api напрямую
// (тот же принцип, что и в warehouseService).
export const nomenclatureService = Object.freeze({
  // --- Сырьё (ингредиенты) ---------------------------------------------------
  listIngredients(config) {
    return config ? api.get("/inventory/ingredients", config) : api.get("/inventory/ingredients");
  },
  createIngredient(payload) {
    return api.post("/inventory/ingredients", payload);
  },
  updateIngredient(id, payload) {
    return api.patch(`/inventory/ingredients/${id}`, payload);
  },
  // Жёсткого DELETE у сырья на бэке нет — «удаление» = мягкий архив по is_active.
  archiveIngredient(id) {
    return api.patch(`/inventory/ingredients/${id}`, { is_active: false });
  },
  restoreIngredient(id) {
    return api.patch(`/inventory/ingredients/${id}`, { is_active: true });
  },

  // --- Полуфабрикаты ---------------------------------------------------------
  // Себестоимость (cost_price) считается бэком из состава — клиент её не шлёт.
  listSemiProducts(config) {
    return config ? api.get("/inventory/semi-products", config) : api.get("/inventory/semi-products");
  },
  createSemiProduct(payload) {
    return api.post("/inventory/semi-products", payload);
  },
  updateSemiProduct(id, payload) {
    return api.patch(`/inventory/semi-products/${id}`, payload);
  },
  // DELETE мягкий (бэк ставит is_active=false, строку не удаляет).
  deleteSemiProduct(id) {
    return api.delete(`/inventory/semi-products/${id}`);
  },
  // Производство: списывает состав со склада (all-or-nothing) и увеличивает остаток п/ф.
  produceSemiProduct(id, payload) {
    return api.post(`/inventory/semi-products/${id}/produce`, payload);
  },

  // --- Справочники для форм --------------------------------------------------
  listWarehouses(config) {
    return config ? api.get("/warehouse/list", config) : api.get("/warehouse/list");
  },
});
