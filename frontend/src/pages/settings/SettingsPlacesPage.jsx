import SettingsResourcePage, { STATUS_ACTIVE } from "./SettingsResourcePage";

const rows = [
  { name: "ЗАЛЛ", condition: "10%", percent: "10%", status: STATUS_ACTIVE },
  { name: "КАБИНА", condition: "20%", percent: "20%", status: STATUS_ACTIVE },
  { name: "Billiard", condition: "Цена за час: 100 000 UZS", percent: "0%", status: STATUS_ACTIVE },
  { name: "БРОН", condition: "Дополнительная цена: 300 000 UZS | Цена по времени", percent: "10%", status: STATUS_ACTIVE },
  { name: "Бар", condition: "Цена за час: 20 000 UZS", percent: "10%", status: STATUS_ACTIVE },
].map((row, index) => ({ id: index + 1, ...row }));

export const apiMapRow = (item) => ({
  id: item.id,
  name: item.name || "",
  condition: item.condition || item.price_description || "",
  percent: item.percent ? `${item.percent}%` : "0%",
  pricingType: item.pricing_type || "",
  status: item.is_active !== false ? STATUS_ACTIVE : "#не активно",
});

export const apiMapFormToPayload = (form, { editing }) => {
  const percentInput = String(form.percent ?? "").trim().replace(",", ".");
  if (percentInput && !/^\d+(?:\.\d+)?$/.test(percentInput)) return null;
  const percent = percentInput === "" ? null : Number(percentInput);
  if (!form.name.trim() || (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100))) return null;
  return {
    name: form.name.trim(),
    condition: form.condition.trim() || null,
    percent,
    pricing_type: form.pricingType || null,
    ...(editing ? { is_active: form.status === STATUS_ACTIVE } : {}),
  };
};

function SettingsPlacesPage() {
  return (
    <SettingsResourcePage
      title="Место"
      initialRows={rows}
      resourceKey="places"
      apiMapRow={apiMapRow}
      apiMapFormToPayload={apiMapFormToPayload}
      columns={[
        { key: "name", label: "Название", link: true },
        { key: "condition", label: "Цена / условие" },
        { key: "percent", label: "Процент" },
        { key: "status", label: "Статус" },
      ]}
      formFields={[
        { key: "name", label: "Название" },
        { key: "pricingType", label: "Тип оплаты места", type: "select", options: [{ value: "percent", label: "процент" }, { value: "hourly", label: "цена за час" }, { value: "fixed", label: "фиксированная цена" }, { value: "time_based", label: "цена по времени" }] },
        { key: "percent", label: "Процент" },
        { key: "condition", label: "Цена" },
        { key: "status", label: "Статус active", type: "select", options: [STATUS_ACTIVE, "#не активно"] },
      ]}
    />
  );
}

export default SettingsPlacesPage;
