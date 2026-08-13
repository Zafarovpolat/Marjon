import { api } from "./client";

export const ordersService = Object.freeze({
  list(params) {
    return params ? api.get("/pos/orders", { params }) : api.get("/pos/orders");
  },
});
