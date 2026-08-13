import SettingsResourcePage from "./SettingsResourcePage";

const rows = [
  { name: "Касса", typeLabel: "Чековый", endpoint: "192.168.1.50:9100", zone: "Касса", status: "Активно", testPrint: true },
  { name: "Кухня", typeLabel: "Кухонный", endpoint: "192.168.1.51:9100", zone: "Кухня", status: "Активно", testPrint: true },
  { name: "Бар", typeLabel: "Кухонный", endpoint: "192.168.1.52:9100", zone: "Бар", status: "#не активно", testPrint: true },
].map((row, index) => ({ id: index + 1, ...row }));

export const apiMapRow = (item) => ({
  id: item.id,
  name: item.name || "",
  typeLabel: ({ receipt: "Чековый", kitchen: "Кухонный", bar: "Бар", label: "Этикетка" })[item.printer_type] || item.printer_type || "",
  printerType: item.printer_type || "",
  connectionType: item.connection_type || "",
  ip: item.ip_address || "",
  port: item.port == null ? "" : String(item.port),
  endpoint: item.ip_address && item.port != null ? `${item.ip_address}:${item.port}` : "",
  zone: item.zone || item.print_zone || "",
  status: item.is_active !== false ? "Активно" : "#не активно",
  testPrint: true,
});

export const apiMapFormToPayload = (form, { editing }) => {
  const portInput = String(form.port ?? "").trim();
  if (!/^\d+$/.test(portInput)) return null;
  const port = Number(portInput);
  if (!form.name.trim() || !form.printerType || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return {
    name: form.name.trim(),
    printer_type: form.printerType,
    connection_type: form.connectionType || "network",
    ip_address: form.ip.trim() || null,
    port,
    zone: form.zone.trim() || null,
    ...(editing ? { is_active: form.status === "Активно" } : {}),
  };
};

function SettingsPrintersPage() {
  return (
    <SettingsResourcePage
      title="Настройка принтеров"
      addLabel="Добавить принтер +"
      initialRows={rows}
      resourceKey="printers"
      apiMapRow={apiMapRow}
      apiMapFormToPayload={apiMapFormToPayload}
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
        { key: "printerType", label: "Тип принтера", type: "select", options: [{ value: "receipt", label: "Чековый" }, { value: "kitchen", label: "Кухонный" }, { value: "bar", label: "Бар" }, { value: "label", label: "Этикетка" }] },
        { key: "connectionType", label: "Тип подключения", type: "select", options: [{ value: "network", label: "Сеть" }, { value: "usb", label: "USB" }, { value: "serial", label: "Serial" }] },
        { key: "ip", label: "IP" },
        { key: "port", label: "Порт" },
        { key: "zone", label: "Зона печати" },
        { key: "status", label: "Статус", type: "select", options: ["Активно", "#не активно"] },
      ]}
    />
  );
}

export default SettingsPrintersPage;
