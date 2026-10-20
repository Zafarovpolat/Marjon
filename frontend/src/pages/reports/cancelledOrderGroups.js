// Group by canonical order identity, never by a potentially reused public number.
export function groupCancelledOrders(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.orderId ? `order:${row.orderId}` : `legacy:${row.id}`;
    if (!groups.has(key)) groups.set(key, { ...row, id: key, items: [] });
    groups.get(key).items.push(row);
  }
  const distinct = (items, key) => [...new Set(items.map(item => item[key] == null || item[key] === "" ? "—" : item[key]))].join(", ") || null;
  const sum = (items, key, scale) => {
    if (items.some(item => item[key] == null || !Number.isFinite(Number(item[key])))) return null;
    const total = items.reduce((value, item) => value + Math.round(Number(item[key]) * scale), 0);
    return Number.isSafeInteger(total) ? total / scale : null;
  };
  return [...groups.values()].map(group => ({ ...group,
    name: distinct(group.items, "name") || "—",
    date: [...new Set(group.items.map(item => item.date).filter(Boolean))].join("; "),
    tableNumber: distinct(group.items, "tableNumber"),
    waiterName: distinct(group.items, "waiterName"),
    authorName: distinct(group.items, "authorName"),
    quantity: sum(group.items, "quantity", 1000),
    amount: sum(group.items, "amount", 100),
  }));
}
