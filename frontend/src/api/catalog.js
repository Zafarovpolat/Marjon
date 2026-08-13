import { api } from "./client";

export const catalogService = Object.freeze({
  listProducts() {
    return api.get("/inventory/products");
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
  listCategories() {
    return api.get("/inventory/categories");
  },
  createCategory(payload) {
    return api.post("/inventory/categories", payload);
  },
});
