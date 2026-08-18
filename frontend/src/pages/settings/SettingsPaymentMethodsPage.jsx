import SettingsResourcePage, { STATUS_ACTIVE, STATUS_INACTIVE } from "./SettingsResourcePage";

const rows = [
  [1, "NAXT", "Наличные", STATUS_ACTIVE],
  [2, "CLICK", "Карта", STATUS_ACTIVE],
  [3, "Terminal", "Карта", STATUS_ACTIVE],
  [4, "Humo", "Карта", STATUS_INACTIVE],
  [5, "Payme", "Карта", STATUS_INACTIVE],
  [6, "Vip", "Карта", STATUS_ACTIVE],
  [7, "UzumBank", "Карта", STATUS_INACTIVE],
].map(([sort, name, typeLabel, status], index) => ({ id: index + 1, sort, name, typeLabel, status }));

export const apiMapRow = (item) => ({
  id: item.id,
  sort: item.sort_order ?? item.sort ?? "—",
  name: item.name || "",
  typeLabel: item.type || item.typeLabel || "",
  status: (item.status ?? item.is_active) !== false ? STATUS_ACTIVE : STATUS_INACTIVE,
});

export const apiMapFormToPayload = (form) => {
  const sortInput = String(form.sort ?? "").trim();
  if (!/^\d+$/.test(sortInput)) return null;
  const sort = Number(sortInput);
  if (!form.name.trim() || !Number.isSafeInteger(sort)) return null;
  return {
    name: form.name.trim(),
    sort,
    type: form.typeLabel || null,
    status: form.status === STATUS_ACTIVE,
  };
};

function SettingsPaymentMethodsPage() {
  return (
    <SettingsResourcePage
      title="Способ оплаты"
      initialRows={rows}
      resourceKey="paymentMethods"
      apiMapRow={apiMapRow}
      apiMapFormToPayload={apiMapFormToPayload}
      filterOptions={["Наличные", "Карта", "Онлайн", "VIP"]}
      columns={[
        { key: "sort", label: "Сорт", inlineSort: true },
        { key: "name", label: "Название" },
        { key: "typeLabel", label: "Тип" },
        { key: "status", label: "Статус" },
      ]}
      formFields={[
        { key: "sort", label: "Сорт" },
        { key: "name", label: "Название" },
        { key: "typeLabel", label: "Тип", type: "select", options: ["Наличные", "Карта", "Онлайн", "VIP"] },
        { key: "status", label: "Статус active", type: "select", options: [STATUS_ACTIVE, STATUS_INACTIVE] },
      ]}
    />
  );
}

export default SettingsPaymentMethodsPage;
