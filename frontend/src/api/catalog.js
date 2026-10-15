import { api } from "./client";

export const catalogService = Object.freeze({
  listProducts(config) {
    return config ? api.get("/inventory/products", config) : api.get("/inventory/products");
  },
  createProduct(payload) {
    return api.post("/inventory/products", payload);
  },
  updateProduct(id, payload) {
    return api.patch(`/inventory/products/${id}`, payload);
  },
  deleteProduct(id) {
    return api.delete(`/inventory/products/${id}`);
  },
  // Стоп-лист V3: накопительное пополнение доступного остатка (ADD, не замена).
  // POST возвращает {product, topup, duplicate}; 201 — новое, 200 — повтор
  // того же idempotency_key без доначисления. Абсолютный PATCH /limit живёт
  // в backend для совместимости (десктоп), Stop-list UI его не использует.
  topupProductLimit(id, { amount, idempotencyKey }) {
    return api.post(`/inventory/products/${id}/topups`, {
      amount,
      idempotency_key: idempotencyKey,
    });
  },
  // Полная история пополнений продукта (хронологически, для аудита).
  listProductTopups(id, config) {
    const url = `/inventory/products/${id}/topups`;
    return config ? api.get(url, config) : api.get(url);
  },
  // V3-сброс доступного количества: limit=None + sold=0. Продукт и строки
  // истории не удаляются, is_available не трогаем.
  resetProductAllowance(id) {
    return api.post(`/inventory/products/${id}/allowance-reset`);
  },
  // V3.5: остаток ровно в 0 (НЕ unlimited-NULL): daily_limit=0 + sold=0.
  // Существующий POS-гейт при лимите 0 отклоняет любую продажу; склад,
  // история и позиции заказов не трогаются. Set-семантика: повтор
  // идемпотентен. Ручной стоп переживает (доступный встаёт в системный
  // стоп, следующий топ-ап его снимает).
  zeroProductAllowance(id) {
    return api.post(`/inventory/products/${id}/allowance-zero`);
  },
  // V3.5: сбросить ВИДИМУЮ историю (checkpoint), не трогая остаток.
  // Append-only строки НЕ удаляются. Set-семантика: повтор идемпотентен.
  resetProductHistory(id) {
    return api.post(`/inventory/products/${id}/history-reset`);
  },
  // Фото блюда: multipart FormData {file}; jpg/png/webp (backend truth).
  // Возвращает полный ProductResponse с сохранённым image_url.
  uploadProductPhoto(id, file) {
    const body = new FormData();
    body.append("file", file);
    return api.post(`/inventory/products/${id}/photo`, body);
  },
  // V38: состав сета — блюда внутри блюда. GET — строки, PUT — замена
  // целиком (None=leave на PATCH нет, []=clear, list=replace).
  listSetItems(id, config) {
    const url = `/inventory/products/${id}/set-items`;
    return config ? api.get(url, config) : api.get(url);
  },
  replaceSetItems(id, lines) {
    return api.put(`/inventory/products/${id}/set-items`, lines);
  },
  listCategories(config) {
    return config ? api.get("/inventory/categories", config) : api.get("/inventory/categories");
  },
  createCategory(payload) {
    return api.post("/inventory/categories", payload);
  },
  updateCategory(id, payload) {
    return api.patch(`/inventory/categories/${id}`, payload);
  },
  deleteCategory(id) {
    return api.delete(`/inventory/categories/${id}`);
  },
  // Стоп-лист: узкие эндпоинты (кассир/повар/владелец) — правят только
  // доступность и дневной лимит порций, не трогая цену/название блюда.
  setProductAvailability(id, isAvailable) {
    return api.patch(`/inventory/products/${id}/availability`, { is_available: isAvailable });
  },
  setProductDailyLimit(id, dailyLimit) {
    return api.patch(`/inventory/products/${id}/limit`, { daily_limit: dailyLimit });
  },
  // Фото категории: тот же canonical MinIO-поток, что у товаров
  // (POST /inventory/upload-image → {url} → image_url в PATCH/POST).
  uploadCategoryImage(file) {
    const body = new FormData();
    body.append("file", file);
    return api.post("/inventory/upload-image", body);
  },
  // Добавки (модификаторы) блюда: группа принадлежит блюду, внутри — опции с наценкой.
  listModifierGroups(productId, config) {
    const url = `/inventory/products/${productId}/modifier-groups`;
    return config ? api.get(url, config) : api.get(url);
  },
  createModifierGroup(payload) {
    return api.post("/inventory/modifier-groups", payload);
  },
  updateModifierGroup(groupId, payload) {
    return api.patch(`/inventory/modifier-groups/${groupId}`, payload);
  },
  deleteModifierGroup(groupId) {
    return api.delete(`/inventory/modifier-groups/${groupId}`);
  },
});
