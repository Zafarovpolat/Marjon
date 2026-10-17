import { api } from "./client";

export const ordersService = Object.freeze({
  list(params, config = {}) {
    return params
      ? api.get("/pos/orders", { params, ...config })
      : Object.keys(config).length ? api.get("/pos/orders", config) : api.get("/pos/orders");
  },
  get(orderId, config = {}) {
    return api.get(`/pos/orders/${orderId}`, config);
  },
  // Массовая очистка отчётов (Настройки → Основные данные): удаляет ВСЕ
  // заказы компании вместе с позициями, платежами, чеками и доставками.
  // Только владелец (require_web_owner), действие необратимо.
  purge(config = {}) {
    return Object.keys(config).length
      ? api.delete("/pos/orders/purge", config)
      : api.delete("/pos/orders/purge");
  },
});
