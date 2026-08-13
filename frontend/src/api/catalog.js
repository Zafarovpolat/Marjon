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
  listCategories(config) {
    return config ? api.get("/inventory/categories", config) : api.get("/inventory/categories");
  },
  createCategory(payload) {
    return api.post("/inventory/categories", payload);
  },
});
