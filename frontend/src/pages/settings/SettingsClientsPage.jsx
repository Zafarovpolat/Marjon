import SettingsResourcePage, { STATUS_ACTIVE, STATUS_PENDING } from "./SettingsResourcePage";

const tabs = [
  { key: "clients", label: "Клиенты" },
  { key: "suppliers", label: "Поставщики" },
  { key: "staff", label: "Сотрудники" },
  { key: "other", label: "Другие" },
];

const rows = [
  ["clients", "abduraxim", "998949849846", STATUS_PENDING],
  ["clients", "Sardorga", "000158893965", STATUS_PENDING],
  ["clients", "XIYNOVI", "998999977845", STATUS_PENDING],
  ["clients", "Xowim", "998776565465", STATUS_PENDING],
  ["clients", "Zafar", "998999898526", STATUS_PENDING],
  ["suppliers", "Bozor", "998901112233", STATUS_ACTIVE],
  ["suppliers", "Fresh Meat", "998902223344", STATUS_ACTIVE],
  ["suppliers", "Green Market", "998903334455", STATUS_ACTIVE],
  ["staff", "SARDORKASSA", "998770702103", STATUS_ACTIVE],
  ["staff", "САБИНА", "998770712101", STATUS_ACTIVE],
  ["other", "Контрагент 1", "998909999999", STATUS_ACTIVE],
].map(([type, name, phone, status], index) => ({ id: index + 1, type, name, phone, status, comment: "" }));

export const apiMapRow = (item) => ({
  id: item.id,
  type: ({ client: "clients", supplier: "suppliers", employee: "staff" })[item.type] || item.type || "other",
  name: item.name || item.full_name || "",
  phone: item.phone || "",
  status: "—",
});

export const apiMapFormToPayload = (form) => {
  const fullName = form.name.trim();
  if (!fullName) return null;
  return {
    full_name: fullName,
    phone: form.phone.trim() || null,
    type: ({ clients: "client", suppliers: "supplier", staff: "employee" })[form.type] || form.type,
  };
};

function SettingsClientsPage() {
  return (
    <SettingsResourcePage
      title="Клиенты"
      tabs={tabs}
      initialRows={rows}
      resourceKey="clients"
      apiMapRow={apiMapRow}
      apiMapFormToPayload={apiMapFormToPayload}
      transactionHistory
      statementHistory
      compactHeader
      pageClassName="clients-directory-page"
      actionsLabel=""
      columns={[
        { key: "name", label: "ФИО" },
        { key: "phone", label: "Номер телефона" },
        { key: "status", label: "Статус" },
        { key: "history", label: "История транзакций" },
      ]}
      formFields={[
        { key: "type", label: "Тип контрагента", type: "select", options: tabs.map((tab) => ({ value: tab.key, label: tab.label })) },
        { key: "name", label: "ФИО / название" },
        { key: "phone", label: "Номер телефона" },
      ]}
    />
  );
}

export default SettingsClientsPage;
