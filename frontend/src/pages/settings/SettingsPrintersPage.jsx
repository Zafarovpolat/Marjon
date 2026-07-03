import SettingsResourcePage from "./SettingsResourcePage";

const rows = [
  { name: "Касса", typeLabel: "Чековый", endpoint: "192.168.1.50:9100", zone: "Касса", status: "Активно", testPrint: true },
  { name: "Кухня", typeLabel: "Кухонный", endpoint: "192.168.1.51:9100", zone: "Кухня", status: "Активно", testPrint: true },
  { name: "Бар", typeLabel: "Кухонный", endpoint: "192.168.1.52:9100", zone: "Бар", status: "#не активно", testPrint: true },
].map((row, index) => ({ id: index + 1, ...row }));

function SettingsPrintersPage() {
  return (
    <SettingsResourcePage
      title="Настройка принтеров"
      addLabel="Добавить принтер +"
      initialRows={rows}
      columns={[
        { key: "name", label: "Название" },
        { key: "typeLabel", label: "Тип" },
        { key: "endpoint", label: "IP / порт" },
        { key: "zone", label: "Зона печати" },
        { key: "status", label: "Статус" },
        { key: "test", label: "Тест" },
      ]}
      formFields={[
        { key: "name", label: "Название" },
        { key: "typeLabel", label: "Тип принтера", type: "select", options: ["Чековый", "Кухонный"] },
        { key: "ip", label: "IP" },
        { key: "port", label: "Порт" },
        { key: "zone", label: "Зона печати" },
        { key: "status", label: "Статус", type: "select", options: ["Активно", "#не активно"] },
      ]}
    />
  );
}

export default SettingsPrintersPage;
