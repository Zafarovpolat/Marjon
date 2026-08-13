import { useEffect, useMemo, useState } from "react";

import { hqService } from "./hqService";

import Icon from '../components/Icon';

import { AdminPageSizeDropdown, getPageList, keepWheelInsideScroller } from "./AdminShared";

export const organizationRows = [];

const orgDirectoryColumnKeys = [
  "number", "message", "service", "paymentType", "name", "clientId", "terminals", "cashboxes",
  "deposit", "debt", "overdue", "contract", "tariff", "currency", "contact", "region",
  "manager", "date", "source", "version", "orgStatus", "identification", "paymentKind",
  "status", "onlineMenu", "warehouse", "cashboxOnline", "actions",
];

const ORG_DIRECTORY_COLUMN_SETTINGS_STORAGE_KEY = "marjon.admin.organizations.columns.v1";

const ORG_DIRECTORY_COLUMN_SETTINGS_LAYOUT_VERSION = 1;

const defaultOrgDirectoryColumnOrder = [...orgDirectoryColumnKeys];

function normalizeOrgDirectoryColumnKeys(keys) {
  const seen = new Set();
  return (Array.isArray(keys) ? keys : []).filter((key) => {
    if (!orgDirectoryColumnKeys.includes(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeOrgDirectoryColumnSettings(settings) {
  const savedOrder = settings?.layoutVersion === ORG_DIRECTORY_COLUMN_SETTINGS_LAYOUT_VERSION
    ? normalizeOrgDirectoryColumnKeys(settings?.order)
    : [];
  const order = [
    ...savedOrder,
    ...defaultOrgDirectoryColumnOrder.filter((key) => !savedOrder.includes(key)),
  ];
  const visibleSource = Array.isArray(settings) ? settings : settings?.visible;
  const visible = normalizeOrgDirectoryColumnKeys(visibleSource || orgDirectoryColumnKeys)
    .filter((key) => order.includes(key));

  return {
    layoutVersion: ORG_DIRECTORY_COLUMN_SETTINGS_LAYOUT_VERSION,
    order,
    visible: visible.length ? visible : [order[0]],
  };
}

function loadOrgDirectoryColumnSettings() {
  if (typeof window === "undefined") {
    return normalizeOrgDirectoryColumnSettings();
  }

  try {
    return normalizeOrgDirectoryColumnSettings(JSON.parse(window.localStorage.getItem(ORG_DIRECTORY_COLUMN_SETTINGS_STORAGE_KEY)));
  } catch {
    return normalizeOrgDirectoryColumnSettings();
  }
}

function saveOrgDirectoryColumnSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      ORG_DIRECTORY_COLUMN_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizeOrgDirectoryColumnSettings(settings)),
    );
  } catch {
    // localStorage can be unavailable in private mode; current UI state still works.
  }
}

function OrgDirectoryFlag({ value, onClick }) {
  const normalized = String(value).toLowerCase();
  const tone = normalized.includes("не ") || normalized.includes("hali") ? "danger"
    : normalized.includes("ожидает") || normalized.includes("jarayon") ? "warning"
      : "success";
  const content = <span className={`org-directory-flag org-directory-flag--${tone}`}>{value}</span>;
  if (!onClick) return content;
  return (
    <button type="button" className="org-directory-flag-button" onClick={onClick}>
      {content}
    </button>
  );
}

function OrganizationMessageScreen({ row, onBack, onSave, onNotify }) {
  const [form, setForm] = useState({
    name: row.name,
    tariff: row.tariff,
    deposit: row.deposit,
    country: "Узбекистан",
    region: row.region,
    paymentType: row.paymentType,
    contractDate: row.date,
    status: row.status,
    inn: "",
    phone: row.contact,
    login: row.contact,
    currency: row.currency,
    responsible: row.manager,
    branch: "Xamidim admin filial",
    source: row.source,
    organizationStatus: row.orgStatus,
    comment: "",
  });
  const [settings, setSettings] = useState({
    warehouse: row.warehouse === "Активно",
    onlineMenu: row.onlineMenu === "Активно",
    cashboxOnline: row.cashboxOnline === "Активно",
    fiscal: false,
    detailedMenu: true,
    androidCashier: true,
  });
  const [chatText, setChatText] = useState("");
  const [messages, setMessages] = useState([
    {
      id: 1,
      author: "Система",
      text: `Открыта карточка сообщений для ${row.name}.`,
      time: "сейчас",
      system: true,
    },
  ]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleSetting(field) {
    setSettings((current) => ({ ...current, [field]: !current[field] }));
  }

  function handleSave() {
    onSave(row.id, {
      name: form.name,
      tariff: form.tariff,
      deposit: form.deposit,
      region: form.region,
      paymentType: form.paymentType,
      date: form.contractDate,
      status: form.status,
      contact: form.phone,
      currency: form.currency,
      manager: form.responsible,
      source: form.source,
      orgStatus: form.organizationStatus,
      warehouse: settings.warehouse ? "Активно" : "Не активно",
      onlineMenu: settings.onlineMenu ? "Активно" : "Не активно",
      cashboxOnline: settings.cashboxOnline ? "Активно" : "Не активно",
      message: true,
    });
  }

  function sendMessage() {
    onNotify?.("Отправка сообщения недоступна: backend mutation contract не подключён.");
  }

  const formGroups = [
    [
      { key: "name", label: "Название", required: true },
      { key: "tariff", label: "Цена тарифа", required: true },
      { key: "deposit", label: "Рабочий счет" },
    ],
    [
      { key: "country", label: "Страна", type: "select", options: ["Узбекистан", "Казахстан", "Кыргызстан"] },
      { key: "region", label: "Регион", type: "select", options: ["Andijon", "Toshkent", "Samarqand", "Fargona", "Namangan", "Surxondaryo", "JIZZAX"] },
      { key: "paymentType", label: "Тип оплаты", type: "select", options: ["Без оплаты", "Тариф", "Тест"] },
      { key: "contractDate", label: "Дата договора", required: true },
      { key: "status", label: "Выберите статус", type: "select", options: ["Активно", "Доступен", "Не активно"] },
      { key: "inn", label: "ИНН организации" },
    ],
    [
      { key: "phone", label: "Номер владельца" },
      { key: "login", label: "Логин владельца" },
      { key: "currency", label: "Основная валюта", type: "select", options: ["UZS", "USD"] },
      { key: "responsible", label: "Ответственный" },
      { key: "branch", label: "Филиал" },
      { key: "source", label: "Источник" },
      { key: "organizationStatus", label: "Статус организации" },
      { key: "comment", label: "Описание" },
    ],
  ];

  const settingLabels = [
    ["warehouse", "Управление складом"],
    ["fiscal", "Подключение ИНН"],
    ["onlineMenu", "Онлайн-меню"],
    ["detailedMenu", "Деталь меню"],
    ["cashboxOnline", "Касса онлайн"],
    ["androidCashier", "Android кассир"],
  ];

  return (
    <section className="org-message-page">
      <div className="org-message-header">
        <button type="button" className="org-message-back" onClick={onBack}>
          <Icon name="bi-arrow-left" size={16} />
        </button>
        <div>
          <h2>Сообщение: {form.branch}</h2>
          <p>{form.name} · ID {row.clientId}</p>
        </div>
        <button type="button" className="org-message-save-top" onClick={handleSave}>Сохранить</button>
      </div>

      <div className="org-message-layout">
        <form className="org-message-form" onSubmit={(event) => { event.preventDefault(); handleSave(); }}>
          <div className="org-message-form__status">
            <span>Статус</span>
            <button
              type="button"
              className={`org-message-toggle ${form.status !== "Не активно" ? "is-on" : ""}`}
              onClick={() => updateField("status", form.status === "Не активно" ? "Активно" : "Не активно")}
            >
              <span />
            </button>
          </div>

          {formGroups.map((group, groupIndex) => (
            <div className="org-message-field-grid" key={groupIndex}>
              {group.map((field) => (
                <label key={field.key} className={field.key === "comment" ? "is-wide" : ""}>
                  <span>{field.label}{field.required ? " *" : ""}</span>
                  {field.type === "select" ? (
                    <select value={form[field.key]} onChange={(event) => updateField(field.key, event.target.value)}>
                      {field.options.map((option) => <option value={option} key={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input value={form[field.key]} onChange={(event) => updateField(field.key, event.target.value)} placeholder="Введите значение" />
                  )}
                </label>
              ))}
            </div>
          ))}

          <div className="org-message-settings">
            <h3>Настройки</h3>
            <div>
              {settingLabels.map(([key, label]) => (
                <button
                  type="button"
                  className={`org-message-setting ${settings[key] ? "is-on" : ""}`}
                  key={key}
                  onClick={() => toggleSetting(key)}
                >
                  <span>{label}</span>
                  <i />
                </button>
              ))}
            </div>
          </div>

          <button className="org-message-save" type="submit">Сохранить</button>
        </form>

        <section className="org-message-chat">
          <div className="org-message-chat__head">
            <div className="org-message-chat__avatar">
              <Icon name="bi-building" size={18} />
            </div>
            <div>
              <strong>Компания {form.name}</strong>
              <span>ID: {row.clientId}</span>
            </div>
            <button type="button" onClick={onBack}>Закрыть</button>
          </div>

          <div className="org-message-chat__body">
            {messages.map((message) => (
              <div className={`org-message-bubble ${message.system ? "is-system" : ""}`} key={message.id}>
                <small>{message.author} · {message.time}</small>
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          <div className="org-message-chat__composer">
            <input
              value={chatText}
              onChange={(event) => setChatText(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") sendMessage(); }}
              placeholder="Написать сообщение..."
            />
            <button type="button" onClick={sendMessage}>
              <Icon name="bi-send" size={16} /> Send
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function OrganizationEditScreen({ row, onBack, onSave }) {
  const [form, setForm] = useState(() => ({
    name: row.name || "",
    tariff: row.tariff || "",
    workingDays: "0",
    branchType: "Обычный",
    virtualCashbox: "",
    virtualCashboxIp: "",
    country: "Узбекистан",
    region: row.region || "Surxondaryo",
    district: "Денов т",
    installDate: row.date || "20.07.2026",
    inn: "",
    solvency: "Платежеспособный",
  }));
  const [settings, setSettings] = useState(() => ({
    warehouse: row.warehouse === "Активно",
    onlineMenu: row.onlineMenu === "Активно",
    socialLink: false,
    autoBlock: true,
    status: row.status !== "Не активно",
    myId: false,
  }));
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraForm, setExtraForm] = useState(() => ({
    managerName: row.manager || "ISKANDAROV ABDURAIM",
    managerPhone: row.contact || "+998 88-805-1441",
    companyPhone: row.contact || "+998 88-805-1441",
    ownerPhone: row.contact || "+998 88-805-1441",
    operator: "Sirojiddin Nuritdinov",
    seller: "Sirojiddin Nuritdinov",
    installer: row.manager || "JAMOLDINOV BOTIR",
    source: row.source || "Instagram",
    organizationStatus: row.orgStatus || "USTANOVKA JARAYONIDA",
    telegramGroupId: "1",
    description: "1",
    mainCurrency: row.currency || "UZS",
    availableCurrency: row.currency || "UZS",
  }));
  const [extraNumbers, setExtraNumbers] = useState([]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleSetting(key) {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }

  function updateExtraField(key, value) {
    setExtraForm((current) => ({ ...current, [key]: value }));
  }

  function addExtraNumber() {
    setExtraNumbers((current) => [...current, { id: Date.now(), value: "" }]);
  }

  function updateExtraNumber(id, value) {
    setExtraNumbers((current) => current.map((phone) => (
      phone.id === id ? { ...phone, value } : phone
    )));
  }

  function removeExtraNumber(id) {
    setExtraNumbers((current) => current.filter((phone) => phone.id !== id));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave(row.id, {
      name: form.name.trim() || row.name,
      tariff: form.tariff.trim() || row.tariff,
      region: form.region,
      date: form.installDate,
      contact: extraForm.ownerPhone.trim() || extraForm.companyPhone.trim() || row.contact,
      manager: extraForm.managerName.trim() || row.manager,
      source: extraForm.source,
      orgStatus: extraForm.organizationStatus,
      currency: extraForm.mainCurrency,
      extraPhones: extraNumbers.map((phone) => phone.value.trim()).filter(Boolean),
      warehouse: settings.warehouse ? "Активно" : "Не активно",
      onlineMenu: settings.onlineMenu ? "Активно" : "Не активно",
      status: settings.status ? (row.status === "Активно" ? "Активно" : "Доступен") : "Не активно",
    });
  }

  function renderTextField(label, key, options = {}) {
    return (
      <label className="org-edit-field">
        <span>
          {label}
          {options.required ? <b>*</b> : null}
        </span>
        <input
          type="text"
          value={form[key]}
          placeholder={options.placeholder}
          readOnly={options.readOnly}
          onChange={(event) => updateField(key, event.target.value)}
        />
      </label>
    );
  }

  function renderSelectField(label, key, values) {
    return (
      <label className="org-edit-field org-edit-field--select">
        <span>{label}</span>
        <select value={form[key]} onChange={(event) => updateField(key, event.target.value)}>
          {values.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderExtraTextField(label, key, options = {}) {
    return (
      <label className="org-edit-extra-field">
        <span>{label}</span>
        <input
          type="text"
          value={extraForm[key]}
          placeholder={options.placeholder}
          readOnly={options.readOnly}
          onChange={(event) => updateExtraField(key, event.target.value)}
        />
      </label>
    );
  }

  function renderExtraSelectField(label, key, values, options = {}) {
    return (
      <label className="org-edit-extra-field">
        <span>{label}</span>
        <select
          value={extraForm[key]}
          disabled={options.disabled}
          onChange={(event) => updateExtraField(key, event.target.value)}
        >
          {values.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const settingRows = [
    ["warehouse", "Управление складом"],
    ["onlineMenu", "Онлайн Меню"],
    ["status", "Статус"],
    ["socialLink", "Ссылка соц сетей"],
    ["autoBlock", "Автоблокировка"],
    ["myId", "Подтверждение MYID"],
  ];
  const regionOptions = Array.from(new Set([row.region || "Surxondaryo", "Surxondaryo", "Toshkent", "Samarqand", "Farg'ona", "Buxoro"].filter(Boolean)));

  return (
    <section className="org-edit-page">
      <header className="org-edit-header">
        <button type="button" className="org-edit-back" onClick={onBack} aria-label="Назад">
          <Icon name="bi-chevron-left" size={18} />
        </button>
        <h2>Изменить организацию</h2>
      </header>

      <form className="org-edit-form" onSubmit={handleSubmit}>
        <h3>Основные данные</h3>
        <div className="org-edit-grid">
          {renderTextField("Название", "name")}
          {renderTextField("Цена тарифа", "tariff", { readOnly: true })}
          {renderTextField("Рабочие дни", "workingDays")}
          {renderSelectField("Тип филиала", "branchType", ["Обычный", "Филиал", "Главный"])}
          {renderTextField("Виртуал касса номер", "virtualCashbox", { placeholder: "Введите номер" })}
          {renderTextField("IP адрес виртуальной кассы", "virtualCashboxIp", { placeholder: "Введите номер" })}
          {renderSelectField("Страна", "country", ["Узбекистан"])}
          {renderSelectField("Регион", "region", regionOptions)}
          {renderSelectField("Район", "district", ["Денов т", "Термез", "Шурчи", "Ангор"])}
          {renderTextField("Дата установки ", "installDate", { required: true })}
          {renderTextField("ИНН организации", "inn", { placeholder: "Введите номер" })}
          {renderSelectField("Платежеспособный", "solvency", ["Платежеспособный", "Неплатежеспособный"])}
        </div>

        <div className="org-edit-settings">
          <h3>Настройки</h3>
          <div className="org-edit-toggle-grid">
            {settingRows.map(([key, label]) => (
              <div key={key} className="org-edit-setting">
                <span>{label}</span>
                <button
                  type="button"
                  className={`org-edit-toggle ${settings[key] ? "is-on" : ""}`}
                  onClick={() => toggleSetting(key)}
                  aria-pressed={settings[key]}
                  aria-label={label}
                >
                  <span />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button type="button" className="org-edit-extra" onClick={() => setExtraOpen((current) => !current)}>
          {extraOpen ? "Закрыть доп. опции" : "Показать доп. опции"}
        </button>

        {extraOpen ? (
          <section className="org-edit-extra-panel">
            <div className="org-edit-extra-section">
              <h4>Контактные лица</h4>
              <div className="org-edit-extra-grid org-edit-extra-grid--contacts">
                {renderExtraTextField("Имя менеджера", "managerName")}
                {renderExtraTextField("Номер менеджера", "managerPhone")}
                {renderExtraTextField("Номер компании", "companyPhone")}
                {renderExtraTextField("Номер владельца", "ownerPhone")}
              </div>

              {extraNumbers.length > 0 ? (
                <div className="org-edit-extra-numbers">
                  {extraNumbers.map((phone, index) => (
                    <div className="org-edit-extra-field" key={phone.id}>
                      <span>Доп. номер {index + 1}</span>
                      <div className="org-edit-phone-row">
                        <input
                          type="text"
                          value={phone.value}
                          placeholder="+998"
                          onChange={(event) => updateExtraNumber(phone.id, event.target.value)}
                        />
                        <button type="button" onClick={() => removeExtraNumber(phone.id)} aria-label="Удалить номер">
                          <Icon name="bi-x-lg" size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <button type="button" className="org-edit-add-phone" onClick={addExtraNumber}>
                + Добавить номер
              </button>
            </div>

            <div className="org-edit-extra-section">
              <h4>География и персонал</h4>
              <div className="org-edit-extra-grid org-edit-extra-grid--staff">
                {renderExtraSelectField("Оператор", "operator", ["Sirojiddin Nuritdinov", "ISKANDAROV ABDURAIM", "JAMOLDINOV BOTIR"])}
                {renderExtraSelectField("Продавец", "seller", ["Sirojiddin Nuritdinov", "ISKANDAROV ABDURAIM", "JAMOLDINOV BOTIR"], { disabled: true })}
                {renderExtraSelectField("Установщик", "installer", ["JAMOLDINOV BOTIR", "Sirojiddin Nuritdinov", "ISKANDAROV ABDURAIM"])}
              </div>
            </div>

            <div className="org-edit-extra-section">
              <h4>Дополнительно</h4>
              <div className="org-edit-extra-grid org-edit-extra-grid--additional">
                {renderExtraSelectField("Источник", "source", ["Instagram", "Telegram", "Facebook", "Diler", "Referral"])}
                {renderExtraSelectField("Статус Организации", "organizationStatus", ["USTANOVKA JARAYONIDA", "ISHLA TURGAN", "HALI ULANMAGAN", "TEST"])}
                {renderExtraTextField("ID телеграм группы (support)", "telegramGroupId")}
                {renderExtraTextField("Описание", "description")}
                {renderExtraSelectField("Основная валюта", "mainCurrency", ["UZS", "USD", "RUB"], { disabled: true })}
                <div className="org-edit-extra-field">
                  <span>Доступные валюты</span>
                  <div className="org-edit-currency-tags">
                    <button
                      type="button"
                      className="org-edit-currency-chip"
                      onClick={() => updateExtraField("availableCurrency", "")}
                      aria-label="Убрать валюту"
                    >
                      {extraForm.availableCurrency || "UZS"} <i>×</i>
                    </button>
                    <Icon name="bi-chevron-down" size={14} />
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <div className="org-edit-actions">
          <button type="submit" className="org-edit-save">
            Сохранить
          </button>
        </div>
      </form>
    </section>
  );
}

export function OrganizationDirectoryPage({ search, onNotify, onInnerBackChange }) {
  const [rows, setRows] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [messageRow, setMessageRow] = useState(null);
  const [editorRow, setEditorRow] = useState(null);
  const [query, setQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [messageOnly, setMessageOnly] = useState(false);
  const [yangiOnly, setYangiOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnSettings, setColumnSettings] = useState(loadOrgDirectoryColumnSettings);
  const [dragColumnKey, setDragColumnKey] = useState("");
  const [dragColumnTarget, setDragColumnTarget] = useState(null);
  const [page, setPage] = useState(1);
  const pageSizeOptions = [10, 20, 50];
  const [pageSize, setPageSize] = useState(20);
  const visibleColumns = columnSettings.visible;

  useEffect(() => {
    if (!onInnerBackChange) return undefined;

    if (!editorRow && !messageRow) {
      onInnerBackChange(null);
      return undefined;
    }

    onInnerBackChange(() => {
      setEditorRow(null);
      setMessageRow(null);
    });

    return () => onInnerBackChange(null);
  }, [editorRow, messageRow, onInnerBackChange]);

  useEffect(() => {
    let activeRequest = true;
    setLoadState("loading");
    hqService.listOrganizations()
      .then(({ data }) => {
        if (!activeRequest) return;
        const items = Array.isArray(data) ? data : data?.items || [];
        setRows(items.map((r) => ({
            id: String(r.id || ""),
            message: Boolean(r.has_message),
            service: r.service_type || "—",
            paymentType: r.payment_type || "—",
            name: r.company_name || r.name || "",
            clientId: String(r.client_id || r.virtual_cash_register_number || r.id || ""),
            terminals: String(r.terminals_count ?? "—"),
            cashboxes: String(r.cashboxes_count ?? "—"),
            deposit: String(r.deposit ?? "—"),
            debt: String(r.debt ?? "—"),
            overdue: String(r.overdue ?? "—"),
            contract: String(r.contract_amount ?? "—"),
            tariff: String(r.tariff_amount ?? r.tariff ?? r.tariff_price ?? "—"),
            currency: r.currency || "UZS",
            contact: r.phone || r.contact || "",
            region: r.region || "",
            manager: r.manager_name || r.manager || "",
            date: r.installation_date || r.created_at || "",
            source: r.source || "—",
            version: r.app_version || "—",
            orgStatus: r.org_status || (r.status === "active" ? "ISHLA TURGAN" : "HALI ULANMAGAN"),
            identification: r.identification || "—",
            paymentKind: r.payment_kind || "—",
            status: r.access_status || "Доступен",
            onlineMenu: r.online_menu ? "Активно" : "—",
            warehouse: (r.warehouse_enabled ?? r.enabled_storage_integration) ? "Активно" : "—",
            cashboxOnline: (r.cashbox_online ?? Boolean(r.virtual_cash_register_number)) ? "Активно" : "—",
          })));
        setLoadState(items.length ? "success" : "empty");
      })
      .catch(() => {
        if (!activeRequest) return;
        setRows([]);
        setLoadState("error");
      });
    return () => { activeRequest = false; };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, search, serviceFilter, paymentFilter, statusFilter, messageOnly, yangiOnly, pageSize]);

  useEffect(() => {
    saveOrgDirectoryColumnSettings(columnSettings);
  }, [columnSettings]);

  const filteredRows = useMemo(() => {
    const globalQuery = search.trim().toLowerCase();
    const localQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      const haystack = Object.values(row).join(" ").toLowerCase();
      if (globalQuery && !haystack.includes(globalQuery)) return false;
      if (localQuery && !haystack.includes(localQuery)) return false;
      if (serviceFilter !== "all" && row.service !== serviceFilter) return false;
      if (paymentFilter !== "all" && row.paymentType !== paymentFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (messageOnly && !row.message) return false;
      if (yangiOnly && row.service !== "Yangi") return false;
      return true;
    });
  }, [messageOnly, paymentFilter, query, rows, search, serviceFilter, statusFilter, yangiOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageRows = filteredRows.slice(startIndex, startIndex + pageSize);
  const pageList = getPageList(currentPage, totalPages);

  const totals = useMemo(() => {
    const active = rows.filter((row) => row.status === "Активно" || row.status === "Доступен").length;
    const debt = rows.reduce((sum, row) => sum + Number(String(row.debt).replace(/[^\d-]/g, "") || 0), 0);
    const online = rows.filter((row) => row.onlineMenu === "Активно").length;
    const debtKnown = rows.every((row) => row.debt !== "—");
    return { active, debt: debtKnown ? debt.toLocaleString("ru-RU") : "Недоступно", online };
  }, [rows]);

  function updateRow(id, patch) {
    void id;
    void patch;
    onNotify?.("Изменение недоступно: backend mutation contract не подключён.");
  }

  function saveMessageRow(id, patch) {
    void id;
    void patch;
    onNotify?.("Сохранение недоступно: backend mutation contract не подключён.");
  }

  function saveEditorRow(id, patch) {
    void id;
    void patch;
    onNotify?.("Сохранение недоступно: backend mutation contract не подключён.");
  }

  function toggleAvailability(row, key) {
    void row;
    void key;
    onNotify?.("Изменение статуса недоступно: backend mutation contract не подключён.");
  }

  function copyClientIdFallback(value) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  }

  async function copyClientId(clientId) {
    const value = String(clientId);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else if (!copyClientIdFallback(value)) {
        throw new Error("copy failed");
      }
      onNotify?.(`ID клиента ${value} скопирован.`);
    } catch {
      if (copyClientIdFallback(value)) {
        onNotify?.(`ID клиента ${value} скопирован.`);
      } else {
        onNotify?.("Не удалось скопировать ID клиента.");
      }
    }
  }

  function addOrganization() {
    onNotify?.("Создание организации должно идти через backend endpoint.");
  }

  function openDetail(row) {
    const detailColumns = [
      "Название", "ID клиента", "Услуга", "Тип оплаты", "Контакт", "Регион", "Сотрудник",
      "Дата", "Источник", "Версия", "Статус организации", "Статус", "Онлайн меню",
      "Управление складом", "Касса онлайн",
    ];
    const detailRow = [
      row.name, row.clientId, row.service, row.paymentType, row.contact, row.region, row.manager,
      row.date, row.source, row.version || "—", row.orgStatus, row.status, row.onlineMenu,
      row.warehouse, row.cashboxOnline,
    ];
    onRowDetail("Организация", detailColumns, detailRow);
  }

  function toggleColumn(key) {
    setColumnSettings((current) => {
      const normalized = normalizeOrgDirectoryColumnSettings(current);

      if (normalized.visible.includes(key)) {
        return {
          ...normalized,
          visible: normalized.visible.length > 1
            ? normalized.visible.filter((item) => item !== key)
            : normalized.visible,
        };
      }

      return {
        ...normalized,
        visible: normalized.order.filter((item) => item === key || normalized.visible.includes(item)),
      };
    });
  }

  function moveColumn(key, direction) {
    setColumnSettings((current) => {
      const normalized = normalizeOrgDirectoryColumnSettings(current);
      const currentIndex = normalized.order.indexOf(key);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= normalized.order.length) {
        return normalized;
      }

      const nextOrder = [...normalized.order];
      [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];

      return {
        ...normalized,
        order: nextOrder,
      };
    });
  }

  function moveColumnToDrop(sourceKey, targetKey, placement = "before") {
    if (!sourceKey || !targetKey || sourceKey === targetKey) {
      return;
    }

    setColumnSettings((current) => {
      const normalized = normalizeOrgDirectoryColumnSettings(current);
      const nextOrder = normalized.order.filter((key) => key !== sourceKey);
      const targetIndex = nextOrder.indexOf(targetKey);

      if (targetIndex < 0 || !normalized.order.includes(sourceKey)) {
        return normalized;
      }

      nextOrder.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, sourceKey);

      return {
        ...normalized,
        order: nextOrder,
      };
    });
  }

  function resetColumnSettings() {
    setColumnSettings(normalizeOrgDirectoryColumnSettings());
  }

  function goToPage(nextPage) {
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
  }

  const allColumns = [
    { key: "number", label: "№", width: 54, render: (_, rowIndex) => startIndex + rowIndex + 1 },
    {
      key: "message",
      label: "Msg",
      width: 62,
      render: (row) => (
        <button
          type="button"
          className={`org-directory-icon ${row.message ? "is-on" : ""}`}
          onClick={() => {
            updateRow(row.id, { message: true });
            setMessageRow({ ...row, message: true });
          }}
          aria-label="Сообщение"
        >
          <Icon name={row.message ? "bi-chat-square-text-fill" : "bi-chat-square"} size={15} />
        </button>
      ),
    },
    {
      key: "service",
      label: "Услуга",
      width: 98,
      render: (row) => (
        <select className="org-directory-cell-select" value={row.service} onChange={(event) => updateRow(row.id, { service: event.target.value })}>
          <option value="Yangi">Yangi</option>
          <option value="Xizmat">Xizmat</option>
        </select>
      ),
    },
    {
      key: "paymentType",
      label: "Тип оплаты",
      width: 124,
      render: (row) => (
        <select className="org-directory-cell-select" value={row.paymentType} onChange={(event) => updateRow(row.id, { paymentType: event.target.value })}>
          <option value="Без оплаты">Без оплаты</option>
          <option value="Тариф">Тариф</option>
          <option value="Тест">Тест</option>
        </select>
      ),
    },
    { key: "name", label: "Название", width: 190, render: (row) => <strong className="org-directory-name">{row.name}</strong> },
    {
      key: "clientId",
      label: "ID клиента",
      width: 110,
      render: (row) => (
        <button
          type="button"
          className="org-directory-copy"
          onClick={(event) => {
            event.stopPropagation();
            copyClientId(row.clientId);
          }}
          aria-label={`Скопировать ID клиента ${row.clientId}`}
        >
          <span>{row.clientId}</span>
          <Icon name="bi-copy" size={13} />
        </button>
      ),
    },
    { key: "terminals", label: "Э/с", width: 66, render: (row) => row.terminals },
    { key: "cashboxes", label: "Н/касс", width: 76, render: (row) => row.cashboxes },
    { key: "deposit", label: "Депозит", width: 112, render: (row) => <span className={String(row.deposit).includes("-") ? "is-negative" : ""}>{row.deposit}</span> },
    { key: "debt", label: "Долг", width: 112, render: (row) => <span className={String(row.debt).includes("-") ? "is-negative" : ""}>{row.debt}</span> },
    { key: "overdue", label: "Просроченный долг", width: 150, render: (row) => row.overdue },
    { key: "contract", label: "Контракт", width: 114, render: (row) => row.contract },
    { key: "tariff", label: "Цена тарифа", width: 118, render: (row) => row.tariff },
    { key: "currency", label: "Валюта", width: 82, render: (row) => row.currency },
    { key: "contact", label: "Контакты", width: 148, render: (row) => <b>{row.contact}</b> },
    { key: "region", label: "Регион", width: 122, render: (row) => row.region },
    { key: "manager", label: "Сотрудник", width: 154, render: (row) => <b>{row.manager}</b> },
    { key: "date", label: "Дата", width: 112, render: (row) => row.date },
    { key: "source", label: "Источник", width: 116, render: (row) => row.source },
    { key: "version", label: "Версия", width: 82, render: (row) => row.version ? <span className="org-directory-version">{row.version}</span> : "—" },
    { key: "orgStatus", label: "Статус организации", width: 162, render: (row) => <span>{row.orgStatus}</span> },
    { key: "identification", label: "Статус идентификации", width: 158, render: (row) => <Icon name={row.identification === "Проверено" ? "bi-eye" : "bi-hourglass-split"} size={16} /> },
    { key: "paymentKind", label: "Тип платежей", width: 132, render: (row) => <span className="org-directory-payment-kind">{row.paymentKind}</span> },
    { key: "status", label: "Статус", width: 116, render: (row) => <OrgDirectoryFlag value={row.status} onClick={() => toggleAvailability(row, "status")} /> },
    { key: "onlineMenu", label: "Онлайн меню", width: 128, render: (row) => <OrgDirectoryFlag value={row.onlineMenu} onClick={() => toggleAvailability(row, "onlineMenu")} /> },
    { key: "warehouse", label: "Управление складом", width: 152, render: (row) => <OrgDirectoryFlag value={row.warehouse} onClick={() => toggleAvailability(row, "warehouse")} /> },
    { key: "cashboxOnline", label: "Касса онлайн", width: 126, render: (row) => <OrgDirectoryFlag value={row.cashboxOnline} onClick={() => toggleAvailability(row, "cashboxOnline")} /> },
    {
      key: "actions",
      label: "",
      width: 58,
      render: (row) => (
        <button type="button" className="org-directory-edit" onClick={() => setEditorRow(row)} aria-label={`Редактировать ${row.name}`}>
          <Icon name="bi-pencil" size={15} />
        </button>
      ),
    },
  ];
  const orderedColumns = columnSettings.order
    .map((key) => allColumns.find((column) => column.key === key))
    .filter(Boolean);
  const columns = orderedColumns.filter((column) => visibleColumns.includes(column.key));
  const actionsColumnIsLast = columns.at(-1)?.key === "actions";

  if (editorRow) {
    return (
      <OrganizationEditScreen
        row={editorRow}
        onBack={() => setEditorRow(null)}
        onSave={saveEditorRow}
      />
    );
  }

  if (messageRow) {
    return (
      <OrganizationMessageScreen
        row={messageRow}
        onBack={() => setMessageRow(null)}
        onSave={saveMessageRow}
        onNotify={onNotify}
      />
    );
  }

  return (
    <section className="org-directory-page">
      <div className="org-directory-topbar">
        <div>
          <h2>Организация</h2>
          <p>Клиенты, тарифы, подключения и доступность сервисов.</p>
        </div>
        <button className="org-directory-add" type="button" onClick={addOrganization}>
          Добавить <Icon name="bi-plus-lg" size={16} />
        </button>
      </div>

      {loadState === "loading" ? <div className="org-directory-empty" role="status">Загрузка организаций...</div> : null}
      {loadState === "error" ? <div className="org-directory-empty" role="alert">Не удалось загрузить организации.</div> : null}

      {loadState === "success" || loadState === "empty" ? <div className="org-directory-metrics">
        <span><b>{rows.length}</b> всего</span>
        <span><b>{totals.active}</b> активных</span>
        <span><b>{totals.online}</b> онлайн меню</span>
        <span><b>{totals.debt}</b> долг</span>
      </div> : null}

      <div className="org-directory-toolbar">
        <label className="org-directory-search">
          <Icon name="bi-search" size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск" />
        </label>
        <select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>
          <option value="all">Все услуги</option>
          <option value="Yangi">Yangi</option>
          <option value="Xizmat">Xizmat</option>
        </select>
        <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
          <option value="all">Все типы оплаты</option>
          <option value="Без оплаты">Без оплаты</option>
          <option value="Тариф">Тариф</option>
          <option value="Тест">Тест</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Все статусы</option>
          <option value="Активно">Активно</option>
          <option value="Доступен">Доступен</option>
          <option value="Не активно">Не активно</option>
        </select>
        <button type="button" className="org-directory-soft" onClick={() => onNotify?.("Фильтр сохранен.")}>Сохранить</button>
        <button type="button" className={`org-directory-switch ${messageOnly ? "is-on" : ""}`} onClick={() => setMessageOnly((value) => !value)}>
          <span /> Сообщения
        </button>
        <button type="button" className={`org-directory-switch ${yangiOnly ? "is-on" : ""}`} onClick={() => setYangiOnly((value) => !value)}>
          <span /> Yangi
        </button>
        <button
          type="button"
          className={`org-directory-settings ${settingsOpen ? "is-open" : ""}`}
          onClick={() => setSettingsOpen((value) => !value)}
          aria-expanded={settingsOpen}
        >
          <Icon name="bi-sliders" size={15} /> Настройка таблицы
        </button>
      </div>

      {settingsOpen ? (
        <div className="org-directory-column-panel org-directory-column-panel--configurable admin-transactions__column-panel">
          <div className="admin-transactions__column-panel-head">
            <span>Столбцы</span>
            <button type="button" onClick={resetColumnSettings}>Сброс</button>
          </div>
          <div className="admin-transactions__column-list">
            {orderedColumns.map((column, index) => {
              const checked = visibleColumns.includes(column.key);
              const disabled = checked && visibleColumns.length === 1;
              const label = column.label || "Действия";
              const dropPosition = dragColumnTarget?.key === column.key ? dragColumnTarget.position : "";

              return (
                <div
                  className={`admin-transactions__column-item ${disabled ? "is-disabled" : ""} ${dragColumnKey === column.key ? "is-dragging" : ""} ${dropPosition ? `is-drop-${dropPosition}` : ""}`}
                  key={column.key}
                  draggable
                  onDragStart={(event) => {
                    setDragColumnKey(column.key);
                    setDragColumnTarget(null);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", column.key);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const sourceKey = event.dataTransfer.getData("text/plain") || dragColumnKey;

                    if (!sourceKey || sourceKey === column.key) {
                      setDragColumnTarget(null);
                      return;
                    }

                    const rect = event.currentTarget.getBoundingClientRect();
                    const position = event.clientX - rect.left > rect.width / 2 ? "after" : "before";
                    setDragColumnTarget((current) => (
                      current?.key === column.key && current?.position === position
                        ? current
                        : { key: column.key, position }
                    ));
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    moveColumnToDrop(
                      event.dataTransfer.getData("text/plain") || dragColumnKey,
                      column.key,
                      dragColumnTarget?.key === column.key ? dragColumnTarget.position : "before",
                    );
                    setDragColumnKey("");
                    setDragColumnTarget(null);
                  }}
                  onDragEnd={() => {
                    setDragColumnKey("");
                    setDragColumnTarget(null);
                  }}
                >
                  <label className="admin-transactions__column-toggle">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleColumn(column.key)}
                    />
                    <span>{label}</span>
                  </label>
                  <div className="admin-transactions__column-move" aria-label={`Порядок столбца ${label}`}>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveColumn(column.key, -1)}
                      aria-label={`Переместить ${label} левее`}
                    >
                      <Icon name="bi-chevron-left" size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={index === orderedColumns.length - 1}
                      onClick={() => moveColumn(column.key, 1)}
                      aria-label={`Переместить ${label} правее`}
                    >
                      <Icon name="bi-chevron-right" size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="org-directory-table-shell" onWheelCapture={keepWheelInsideScroller}>
        <table className={`org-directory-table org-directory-table--configurable ${actionsColumnIsLast ? "is-actions-sticky" : ""}`}>
          <colgroup>
            {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => (
                <th className={`org-directory-cell org-directory-cell--${column.key}`} key={column.key}>
                  {column.key === "actions" ? (
                    <span className="org-directory-actions-head" aria-hidden="true">
                      <Icon name="bi-sliders" size={15} />
                    </span>
                  ) : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIndex) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td className={`org-directory-cell org-directory-cell--${column.key}`} key={column.key}>{column.render(row, rowIndex)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {loadState === "empty" || (loadState === "success" && !pageRows.length) ? <div className="org-directory-empty">Записей не найдено.</div> : null}
      </div>

      <div className="org-directory-footer">
        <span className="org-directory-footer__summary">
          {filteredRows.length ? `${startIndex + 1}-${Math.min(startIndex + pageSize, filteredRows.length)} из ${filteredRows.length}` : "0 из 0"}
          <small>Страница {currentPage} из {totalPages}</small>
        </span>
        <div className="org-directory-pager">
          <AdminPageSizeDropdown value={pageSize} options={pageSizeOptions} onChange={setPageSize} />
          <button type="button" disabled={currentPage === 1} onClick={() => goToPage(1)} aria-label="Первая страница">
            <span className="org-directory-double-icon" aria-hidden="true">
              <Icon name="bi-chevron-left" size={13} />
              <Icon name="bi-chevron-left" size={13} />
            </span>
          </button>
          <button type="button" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} aria-label="Предыдущая страница">
            <Icon name="bi-chevron-left" size={15} />
          </button>
          {pageList.map((item, index) => (
            item === "…" ? (
              <span className="org-directory-ellipsis" key={`gap-${index}`}>…</span>
            ) : (
              <button
                type="button"
                className={`org-directory-page-btn ${item === currentPage ? "is-active" : ""}`}
                key={item}
                onClick={() => goToPage(item)}
                aria-current={item === currentPage ? "page" : undefined}
              >
                {item}
              </button>
            )
          ))}
          <button type="button" disabled={currentPage === totalPages} onClick={() => goToPage(currentPage + 1)} aria-label="Следующая страница">
            <Icon name="bi-chevron-right" size={15} />
          </button>
          <button type="button" disabled={currentPage === totalPages} onClick={() => goToPage(totalPages)} aria-label="Последняя страница">
            <span className="org-directory-double-icon" aria-hidden="true">
              <Icon name="bi-chevron-right" size={13} />
              <Icon name="bi-chevron-right" size={13} />
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
