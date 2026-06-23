import SettingsResourcePage, { STATUS_ACTIVE, STATUS_INACTIVE } from "./SettingsResourcePage";

const rows = [
  [1, "Граммы (г)", "г"],
  [1, "Килограммы (кг)", "кг"],
  [1, "Порция (пр)", "пр"],
  [1, "Литры (л)", "л"],
  [1, "Штуки (шт)", "шт"],
  [1, "gramm", "g"],
].map(([sort, name, shortName], index) => ({ id: index + 1, sort, name, shortName, status: STATUS_ACTIVE }));

function SettingsUnitsPage() {
  return (
    <SettingsResourcePage
      title="Единица измерения"
      initialRows={rows}
      columns={[
        { key: "sort", label: "Сорт", inlineSort: true },
        { key: "name", label: "Название" },
        { key: "shortName", label: "Короткое название" },
        { key: "status", label: "Статус" },
      ]}
      formFields={[
        { key: "sort", label: "Сорт" },
        { key: "name", label: "Название" },
        { key: "shortName", label: "Короткое название" },
        { key: "status", label: "Статус active", type: "select", options: [STATUS_ACTIVE, STATUS_INACTIVE] },
      ]}
    />
  );
}

export default SettingsUnitsPage;
