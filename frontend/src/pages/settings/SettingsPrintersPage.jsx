import { useEffect, useMemo, useState } from "react";
import SettingsResourcePage from "./SettingsResourcePage";
import { api } from "../../api/client";

// Контракт бэкенда (PrinterCreate, наш роутер /printers): branch_id и printer_type
// обязательны, printer_type — код (receipt|kitchen|bar|label), а не подпись.
// paper_width определяет ширину чека: 80 мм → 48 символов, 58 мм → 32.
// Поля zone в бэкенде нет — печатная зона задаётся филиалом (branch_id).
const TYPE_OPTIONS = [
  { value: "receipt", label: "Чековый" },
  { value: "kitchen", label: "Кухонный" },
  { value: "bar", label: "Бар" },
  { value: "label", label: "Этикетка" },
];

const CONNECTION_OPTIONS = [
  { value: "network", label: "Сеть" },
  { value: "usb", label: "USB" },
  { value: "serial", label: "Serial" },
];

const PAPER_OPTIONS = [
  { value: "80", label: "80 мм" },
  { value: "58", label: "58 мм" },
];

const TYPE_LABELS = TYPE_OPTIONS.reduce((acc, o) => ({ ...acc, [o.value]: o.label }), {});

// API-ответ → строка таблицы. Дополнительно кладём ключи полей формы
// (printerType/connectionType/branchId/ip/port/paperWidth): openEdit префиллит
// форму строкой как есть, поэтому имена ключей формы и строки должны совпадать.
export const apiMapRow = (item) => ({
  id: item.id,
  name: item.name || "",
  typeLabel: TYPE_LABELS[item.printer_type] || item.printer_type || "",
  printerType: item.printer_type || "",
  connectionType: item.connection_type || "",
  branchId: String(item.branch_id || ""),
  ip: item.ip_address || "",
  port: item.port == null ? "" : String(item.port),
  paperWidth: item.paper_width == null ? "80" : String(item.paper_width),
  endpoint: item.ip_address && item.port != null ? `${item.ip_address}:${item.port}` : "",
  status: item.is_active !== false ? "Активно" : "#не активно",
  testPrint: true,
});

// Форма → payload PrinterCreate/PrinterUpdate. Возврат null = невалидно
// (SettingsResourcePage покажет «Проверьте обязательные поля» и не отправит).
// is_active шлём только при редактировании: PrinterCreate его не принимает,
// PrinterUpdate — принимает.
export const apiMapFormToPayload = (form, { editing }) => {
  const portInput = String(form.port ?? "").trim();
  if (!/^\d+$/.test(portInput)) return null;
  const port = Number(portInput);
  const name = (form.name || "").trim();
  if (!name || !form.printerType || !form.branchId || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return {
    branch_id: form.branchId,
    name,
    printer_type: form.printerType,
    connection_type: form.connectionType || "network",
    ip_address: (form.ip || "").trim() || null,
    port,
    paper_width: Number(form.paperWidth) === 58 ? 58 : 80,
    ...(editing ? { is_active: form.status === "Активно" } : {}),
  };
};

function SettingsPrintersPage() {
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    api.get("/companies/me/branches")
      .then(({ data }) => setBranches(Array.isArray(data) ? data : data?.items || []))
      .catch(() => setBranches([]));
  }, []);

  const branchOptions = useMemo(
    () => branches.map((b) => ({ value: String(b.id), label: b.name })),
    [branches],
  );

  // Показ имени филиала в таблице требует состояния компонента, поэтому оборачиваем
  // чистый apiMapRow: сам маппинг остаётся экспортируемым и тестируемым.
  const mapRow = useMemo(() => {
    const nameById = new Map(branches.map((b) => [String(b.id), b.name]));
    return (item) => {
      const row = apiMapRow(item);
      return { ...row, branch: nameById.get(row.branchId) || "" };
    };
  }, [branches]);

  return (
    <SettingsResourcePage
      title="Настройка принтеров"
      addLabel="Добавить принтер +"
      resourceKey="printers"
      apiMapRow={mapRow}
      apiMapFormToPayload={apiMapFormToPayload}
      columns={[
        { key: "name", label: "Название" },
        { key: "typeLabel", label: "Тип" },
        { key: "endpoint", label: "IP / порт" },
        { key: "branch", label: "Филиал" },
        { key: "status", label: "Статус" },
        { key: "test", label: "Тест" },
      ]}
      formFields={[
        { key: "name", label: "Название" },
        { key: "printerType", label: "Тип принтера", type: "select", options: TYPE_OPTIONS, defaultValue: "receipt" },
        { key: "branchId", label: "Филиал", type: "select", options: branchOptions },
        { key: "connectionType", label: "Тип подключения", type: "select", options: CONNECTION_OPTIONS, defaultValue: "network" },
        { key: "ip", label: "IP" },
        { key: "port", label: "Порт", defaultValue: "9100" },
        { key: "paperWidth", label: "Ширина бумаги", type: "select", options: PAPER_OPTIONS, defaultValue: "80" },
        { key: "status", label: "Статус", type: "select", options: ["Активно", "#не активно"], defaultValue: "Активно" },
      ]}
    />
  );
}

export default SettingsPrintersPage;
