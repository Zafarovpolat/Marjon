import { api } from "../../api/client";
import { ordersService } from "../../api/orders";
import { parseWebInstant } from "../../utils/webTime";

export const loadOrder = (id, signal) => ordersService.get(id, { signal });
export const loadOrderPayments = (id, signal) => api.get(`/payments/order/${encodeURIComponent(id)}`, { signal });

export function paymentSummary(payments, total) {
  const completed = payments.filter(payment => payment.status === "completed");
  const cents = completed.reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0);
  const amount = cents / 100;
  const paid = Number.isFinite(amount) && Number(total) > 0 && cents >= Math.round(Number(total) * 100);
  const latest = completed.map(payment => payment.updated_at).map(parseWebInstant).filter(Boolean).sort((a, b) => b - a)[0];
  return { amount, paid, latest, methods: [...new Set(completed.map(payment => payment.method).filter(Boolean))] };
}
