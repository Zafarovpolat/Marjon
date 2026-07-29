import { useEffect, useMemo, useState } from "react";
import SettingsResourcePage from "./SettingsResourcePage";
import { api } from "../../api/client";

// Контракт бэкенда (PrinterCreate): branch_id и printer_type обязательны,
// printer_type — код (receipt | kitchen | bar), а не подпись на русском.
// paper_width определяет ширину чека: 80 мм → 48 символов, 58 мм → 32.
const TYPE_OPTIONS = [
  { value: "receipt", label: "Чековый" },
  { value: "kitchen", label: "Кухонный" },
  { value: "bar", label: "Барный" },
];

const PAPER_OPTIONS = [
  { value: "80", label: "80 мм" },
  { value: "58", label: "58 мм" },
];

const TYPE_LABELS = TYPE_OPTIONS.reduce((acc, o) => ({ ...acc, [o.value]: o.label }), {});

const STATUS_ACTIVE = "Активно";
const STATUS_INACTIVE = "#не активно";

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

  const branchName = (id) =>
    branches.find((b) => String(b.id) === String(id))?.name || "";

  // Ответ API → строка таблицы. Плюс поля формы: openEdit префиллит форму строкой.
  const apiMapRow = (item) => ({
    id: item.id,
    name: item.name || "",
    typeLabel: TYPE_LABELS[item.printer_type] || item.printer_type || "",
    endpoint: item.ip_address ? `${item.ip_address}:${item.port || 9100}` : "",
    zone: branchName(item.branch_id),
    status: item.is_active !== false ? STATUS_ACTIVE : STATUS_INACTIVE,
    testPrint: true,
    // ↓ ключи полей формы редактирования
    printer_type: item.printer_type || "receipt",
    branch_id: String(item.branch_id || ""),
    ip: item.ip_address || "",
    port: String(item.port ?? 9100),
    paper_width: String(item.paper_width ?? 80),
  });

  const apiMapFormToPayload = (form) => ({
    branch_id: form.branch_id || branchOptions[0]?.value,
    name: form.name,
    printer_type: form.printer_type || "receipt",
    connection_type: "network",
    ip_address: form.ip ? String(form.ip).trim() : null,
    port: parseInt(form.port, 10) || 9100,
    paper_width: parseInt(form.paper_width, 10) || 80,
    is_active: form.status !== STATUS_INACTIVE,
  });

  return (
    <SettingsResourcePage
      title="Настройка принтеров"
      addLabel="Добавить принтер +"
      initialRows={[]}
      apiEndpoint="/printers"
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
        { key: "printer_type", label: "Тип принтера", type: "select", options: TYPE_OPTIONS, defaultValue: "receipt" },
        { key: "branch_id", label: "Филиал", type: "select", options: branchOptions },
        { key: "ip", label: "IP" },
        { key: "port", label: "Порт", defaultValue: "9100" },
        { key: "paper_width", label: "Ширина бумаги", type: "select", options: PAPER_OPTIONS, defaultValue: "80" },
        { key: "status", label: "Статус", type: "select", options: [STATUS_ACTIVE, STATUS_INACTIVE], defaultValue: STATUS_ACTIVE },
      ]}
    />
  );
}

export default SettingsPrintersPage;
