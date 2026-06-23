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

function SettingsPaymentMethodsPage() {
  return (
    <SettingsResourcePage
      title="Способ оплаты"
      initialRows={rows}
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
