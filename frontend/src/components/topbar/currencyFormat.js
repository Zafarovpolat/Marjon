// Форматирование денежных значений для валютного виджета Topbar.
// Вынесено из Topbar.jsx (FE-07B) без изменения логики.

export function parseMoneyInput(value) {
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMoneyInput(value, withDecimal = false) {
  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace(/[^\d,.]/g, "")
    .replace(".", ",");
  const [integerPart = "", decimalPart = ""] = cleaned.split(",");
  const groupedInteger = integerPart.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (withDecimal && cleaned.includes(",")) {
    return `${groupedInteger || "0"},${decimalPart.slice(0, 2)}`;
  }
  return groupedInteger || "";
}
