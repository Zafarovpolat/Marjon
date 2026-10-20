import { webDateTime } from "../../utils/webTime";

// Both dashboard and warehouse table consume this exact persisted-movement report.
export function readOutgoingReport(data) {
  if (!data || !Array.isArray(data.rows) || !Array.isArray(data.lines)) throw new Error("Некорректный отчёт расхода");
  const amount = (value) => {
    if (value == null || value === "" || !Number.isFinite(Number(value))) throw new Error("Неизвестная сумма расхода");
    return Number(value);
  };
  const rows = data.rows.map((row) => ({ ...row, product: amount(row.product), tovar: amount(row.tovar), raw: amount(row.raw) }));
  const lines = data.lines.map((line) => ({ ...line, sum: amount(line.sum), qty: amount(line.qty),
    registeredAt: webDateTime(line.registeredAt) || "—" }));
  const total = rows.reduce((sum, row) => sum + row.raw, 0);
  if (rows.some((row) => Math.abs(row.raw - row.product - row.tovar) > 0.01)
    || Math.abs(lines.reduce((sum, line) => sum + line.sum, 0) - total) > 0.01) throw new Error("Строки расхода не совпадают с итогом");
  if (Math.abs(total - amount(data.total)) > 0.01) throw new Error("Итог расхода не совпадает с таблицей");
  return { rows, lines, total };
}
