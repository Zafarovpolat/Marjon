export function normalizeSeparator(value) {
  return {
    pattern: ["dashed", "solid", "stars"].includes(value?.pattern) ? value.pattern : "dashed",
    weight: ["thin", "medium", "bold"].includes(value?.weight) ? value.weight : "thin",
  };
}

export function receiptStaffLabel(order) {
  if (["Кассир", "Официант"].includes(order.staff_label)) return order.staff_label;
  const role = order.waiter_role || order.staff_role || order.creator_role;
  return role === "cashier" ? "Кассир" : "Официант";
}

export function groupReceiptItems(items = []) {
  const result = [], indices = new Map();
  for (const item of items) {
    const qty = Number(item.quantity ?? item.qty ?? 1);
    const total = item.total ?? item.amount ?? (item.price != null ? Number(item.price) * qty : null);
    const key = JSON.stringify([
      item.product_id ?? item.dish_id ?? null, item.name || item.title || item.product_name || item.dish_name || "Позиция",
      item.price ?? null, total != null && qty > 0 ? Number(total) / qty : null, total == null,
      item.modifiers || [], item.note || item.comment || "", item.course ?? 1, Boolean(item.takeaway), item.status ?? null,
    ]);
    if (!(qty > 0) || !indices.has(key)) {
      if (qty > 0) indices.set(key, result.length);
      result.push({ ...item, quantity: qty, ...(total != null ? { total: Number(total) } : {}) });
    } else {
      const previous = result[indices.get(key)];
      previous.quantity += qty;
      if (total != null) previous.total += Number(total);
    }
  }
  return result;
}
