import { useEffect, useMemo, useState } from "react";
import { staffService } from "../api/staff";
import Icon from "../components/Icon";
import { isAbortError, useLatestRequest, useMutationLocks } from "../hooks/useAsyncSafety";

const roleOptions = [
  { key: "cashier", label: "Кассир", title: "Кассиры" },
  { key: "waiter", label: "Официант", title: "Официанты" },
  { key: "courier", label: "Курьер", title: "Курьеры" },
  { key: "monoblock", label: "Моноблок", title: "Моноблок" },
  { key: "kitchen", label: "Повар", title: "Повара" },
  { key: "warehouse", label: "Завсклад", title: "Завсклад" },
];

const roleMap = roleOptions.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

const onlyDigits = (value = "") => String(value).replace(/\D/g, "");

const phoneCountries = [
  { key: "UZ", label: "Узбекистан", dialCode: "998" },
  { key: "TR", label: "Турция", dialCode: "90" },
  { key: "RU", label: "Россия", dialCode: "7" },
  { key: "KZ", label: "Казахстан", dialCode: "7" },
  { key: "KG", label: "Киргизия", dialCode: "996" },
  { key: "TJ", label: "Таджикистан", dialCode: "992" },
  { key: "TM", label: "Туркменистан", dialCode: "993" },
  { key: "US", label: "Америка", dialCode: "1" },
];

const phoneCountryMap = phoneCountries.reduce((acc, country) => {
  acc[country.key] = country;
  return acc;
}, {});

const getPhoneFlag = (countryKey) =>
  `https://purecatamphetamine.github.io/country-flag-icons/3x2/${countryKey}.svg`;

const inferPhoneCountry = (value = "") => {
  const digits = onlyDigits(value);

  return (
    phoneCountries
      .filter((country) => digits.startsWith(country.dialCode))
      .sort((a, b) => b.dialCode.length - a.dialCode.length)[0]?.key || "UZ"
  );
};

const getPhoneLocal = (value = "", countryKey = "UZ") => {
  const digits = onlyDigits(value);
  const country = phoneCountryMap[countryKey] || phoneCountryMap.UZ;
  return digits.startsWith(country.dialCode) ? digits.slice(country.dialCode.length) : digits;
};

const formatPhoneLocal = (local = "") => {
  const value = local.slice(0, 10);

  if (value.length <= 3) return value;
  if (value.length <= 6) return `${value.slice(0, 3)} ${value.slice(3)}`;
  if (value.length <= 8) return `${value.slice(0, 3)} ${value.slice(3, 6)}-${value.slice(6)}`;
  return `${value.slice(0, 3)} ${value.slice(3, 6)}-${value.slice(6, 8)}-${value.slice(8, 10)}`;
};

const formatPhone = (value = "", countryKey = inferPhoneCountry(value)) => {
  const country = phoneCountryMap[countryKey] || phoneCountryMap.UZ;
  const local = getPhoneLocal(value, country.key);

  if (country.key === "UZ") {
    const uzLocal = local.slice(0, 9);
    const parts = [
      uzLocal.slice(0, 2),
      uzLocal.slice(2, 5),
      uzLocal.slice(5, 7),
      uzLocal.slice(7, 9),
    ].filter(Boolean);

    return parts.length
      ? `+${country.dialCode} ${parts[0]}${parts[1] ? ` ${parts[1]}` : ""}${parts[2] ? `-${parts[2]}` : ""}${parts[3] ? `-${parts[3]}` : ""}`
      : "";
  }

  return local ? `+${country.dialCode} ${formatPhoneLocal(local)}` : "";
};

const normalizePhone = (value = "", countryKey = "UZ") => {
  const country = phoneCountryMap[countryKey] || phoneCountryMap.UZ;
  const parts = [
    country.dialCode,
    getPhoneLocal(value, country.key).slice(0, country.key === "UZ" ? 9 : 10),
  ];

  return parts[1] ? parts.join("") : "";
};

const emptyForm = {
  fullName: "",
  email: "",
  phone: "",
  phoneCountry: "UZ",
  roleKey: "",
  pin: "",
  // Длина PIN выбирается в форме: 2 цифры (быстрее на кассе) или 4 (по умолчанию).
  pinLen: 4,
  password: "",
  status: "active",
  photo: "",
  // Гранулярные права (наша фича): сериализуются в permissions.* на бэкенд,
  // применяются на кассе/десктопе. printer_ip/nfc_id — привязка POS-терминала.
  printerIp: "",
  nfcId: "",
  canDeleteDishes: false,
  // can_manage_orders — на десктопе это must() (строгая проверка): официанту
  // отмена/перенос/удаление отправленных блюд доступны ТОЛЬКО при явном true.
  // Дефолт OFF: опасное право выдаётся осознанно (иначе оно недостижимо у официанта).
  canManageOrders: false,
  // can_takeaway_at_table — на десктопе это can() (мягкая проверка): без явного false
  // «с собой» за столом доступно. Дефолт ON сохраняет текущее поведение — тумблер лишь ОГРАНИЧИВАЕТ.
  canTakeawayAtTable: true,
  canChangeOrderType: false,
  canCloseBill: false,
  canOpenCashDrawerAfterPayment: false,
  canViewClosedOrders: false,
  canEditStopList: false,
  // can_view_stop_list / can_approve_attendance — на десктопе это can() (мягкая
  // проверка): без явного false доступ РАЗРЕШЁН. Дефолт ON сохраняет текущее
  // поведение (кассир их и так видит) — владелец может лишь ОГРАНИЧИТЬ.
  canViewStopList: true,
  canViewFinance: false,
  canCashOps: false,
  canApproveAttendance: true,
  // Спец-права десктопа: открывают «режим разработчика» на терминале
  // (управление персоналом/правами и складские записи) кассиру-менеджеру.
  // Дефолт OFF — единственная точка эскалации, выдаёт осознанно только владелец здесь.
  canManageStaff: false,
  canManageWarehouse: false,
  access: {},
};

const getPermissionSummary = (values) => {
  const permissions = [
    values.canDeleteDishes && "Удаление блюд",
    values.canManageOrders && "Управление заказами",
    values.canChangeOrderType && "Изменение типа заказа",
    values.canCloseBill && "Закрытие счета",
    values.canOpenCashDrawerAfterPayment && "Открытие денежного ящика",
    values.canViewClosedOrders && "Просмотр закрытых заказов",
    values.canEditStopList && "Редактирование стоп-листа",
    values.canViewFinance && "Просмотр финансов",
    values.canCashOps && "Приход/расход",
    values.canManageStaff && "Управление персоналом",
    values.canManageWarehouse && "Управление складом",
  ].filter(Boolean);

  return permissions.join(", ") || values.permission || "Базовый доступ";
};

const staffAccessModules = [
  { key: "home", label: "Главная" },
  { key: "warehouse_stock", label: "Склады (Остаток товаров)" },
  { key: "goods_income", label: "Приход товаров" },
  { key: "goods_expense", label: "Расход товаров" },
  { key: "income_log", label: "Журнал приходов" },
  { key: "transfers", label: "Перемещения" },
  { key: "supplier_returns", label: "Возврат поставщику" },
  { key: "inventory", label: "Инвентаризация" },
  { key: "write_off", label: "Списание" },
  { key: "write_off_categories", label: "Категории списания" },
  { key: "z_report", label: "Z-отчет" },
  { key: "orders_report", label: "Отчет по заказам" },
  { key: "tables_report", label: "Отчет по столам" },
  { key: "waiters_report", label: "Отчет по официантам" },
  { key: "dishes_report", label: "Отчет по блюдам" },
  { key: "couriers_report", label: "Отчет по курьерам" },
  { key: "deleted_dishes_report", label: "Отчет по удаленным блюдам" },
  { key: "debtors_creditors", label: "Дебиторы и Кредиторы" },
  { key: "cashflow", label: "Денежный поток" },
  { key: "cashier", label: "Кассир" },
  { key: "waiter", label: "Официант" },
  { key: "monoblock", label: "Моноблок" },
  { key: "cook", label: "Повар" },
  { key: "manager", label: "Менеджер" },
  { key: "warehouse_manager", label: "Завсклад" },
  { key: "attendance", label: "Посещаемость" },
  { key: "courier", label: "Курьер" },
  { key: "clients", label: "Клиенты" },
  { key: "suppliers", label: "Поставщик" },
  { key: "places", label: "Места" },
  { key: "payment_methods", label: "Способы оплаты" },
  { key: "units", label: "Ед. измерения" },
  { key: "profile_settings", label: "Настройка профиля" },
  { key: "printer_settings", label: "Настройка принтеров" },
  { key: "banners", label: "Баннеры" },
  { key: "playlists", label: "Плейлисты" },
  { key: "devices", label: "Устройства" },
  { key: "cash_operations", label: "Денежные операции" },
  { key: "income_expense_categories", label: "Категории приход-расходов" },
  { key: "dishes", label: "Блюда" },
  { key: "dish_categories", label: "Категории блюда (меню)" },
  { key: "raw_materials", label: "Сырьё" },
  { key: "raw_categories", label: "Категории сырья" },
  { key: "semi_finished", label: "Полуфабрикаты" },
  { key: "semi_finished_categories", label: "Категории полуфабрикатов" },
  { key: "sales_categories", label: "Категории реализации" },
  { key: "call_center", label: "Call Center" },
  { key: "booking", label: "Брон" },
  { key: "order_edit", label: "Заказы (изменить, удалить)" },
  { key: "order_types", label: "Заказы (типы)", actions: ["takeaway", "table", "delivery", "new"] },
];

const staffAccessActions = [
  { key: "create", label: "Создать" },
  { key: "read", label: "Читать" },
  { key: "update", label: "Обновлять" },
  { key: "delete", label: "Удалить" },
];

const staffOrderTypeActions = [
  { key: "takeaway", label: "На вынос" },
  { key: "table", label: "На стол" },
  { key: "delivery", label: "Доставка" },
  { key: "new", label: "Новый" },
];

function mapStaffUser(user) {
  const roleKey = user.role_slug || user.role_slugs?.[0] || "cashier";
  const perm = user.permissions || {};
  return {
    id: user.id,
    fullName: user.name || user.email?.split("@")[0] || "—",
    email: user.email || "",
    phone: user.phone || "",
    roleKey,
    status: user.is_active !== false ? "active" : "archived",
    pin: "",
    password: "",
    photo: user.avatar_url || "",
    // Десериализация гранулярных прав из permissions.* (наш бэкенд их хранит).
    // pin_code бэкенд не возвращает — PIN всегда пустой при префилле формы.
    printerIp: user.printer_ip || "",
    nfcId: user.nfc_id || "",
    canDeleteDishes: !!perm.can_delete_dishes,
    // must() на десктопе → absent трактуем как false (тумблер OFF)
    canManageOrders: !!perm.can_manage_orders,
    // can() на десктопе → absent означает «разрешено»: absent/true = ON, только явный false = OFF.
    canTakeawayAtTable: perm.can_takeaway_at_table !== false,
    canChangeOrderType: !!perm.can_change_order_type,
    canCloseBill: !!perm.can_close_bill,
    canOpenCashDrawerAfterPayment: !!perm.can_open_cash_drawer,
    canViewClosedOrders: !!perm.can_view_closed_orders,
    canEditStopList: !!perm.can_edit_stop_list,
    // can() на десктопе → absent означает «разрешено», поэтому absent = true (ON).
    // Явный false в БД → тумблер OFF. Так владелец видит реальное состояние.
    canViewStopList: perm.can_view_stop_list !== false,
    canViewFinance: !!perm.can_view_finance,
    canCashOps: !!perm.can_cash_ops,
    canApproveAttendance: perm.can_approve_attendance !== false,
    // Спец-права десктопа (must() на бэкенде): absent трактуем как false —
    // показываем реальное состояние, чтобы владелец видел, у кого есть эскалация.
    canManageStaff: !!perm.can_manage_staff,
    canManageWarehouse: !!perm.can_manage_warehouse,
    access: perm.modules || {},
  };
}

function StaffRolePage({ role = "all" }) {
  const routeRole = roleMap[role] ? role : "all";
  const pageTitle =
    routeRole === "all" ? "Список сотрудников" : `Список сотрудников: ${roleMap[routeRole].title}`;

  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingActionId, setPendingActionId] = useState("");
  const beginRequest = useLatestRequest();
  const mutationLocks = useMutationLocks();

  useEffect(() => {
    const request = beginRequest();
    setStaffError("");
    staffService.listStaffUsers({ signal: request.signal })
      .then(({ data }) => {
        if (!request.isCurrent()) return;
        const mapped = (data || []).map(mapStaffUser);
        setStaff(mapped);
      })
      .catch((err) => {
        if (!request.isCurrent() || isAbortError(err)) return;
        console.warn("Не удалось загрузить сотрудников:", err.message);
        setStaff([]);
        setStaffError("Не удалось загрузить сотрудников.");
      })
      .finally(() => { if (request.isCurrent()) setStaffLoading(false); });
  }, [beginRequest]);

  const defaultFilters = useMemo(() => ({
    query: "",
    roleKey: routeRole === "all" ? "" : routeRole,
    status: "",
  }), [routeRole]);

  const [activeTab, setActiveTab] = useState("active");
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filters, setFilters] = useState(defaultFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [phoneCountryOpen, setPhoneCountryOpen] = useState(false);
  const [form, setForm] = useState({
    ...emptyForm,
  });

  useEffect(() => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
  }, [defaultFilters]);

  const visibleStaff = useMemo(() => {
    const normalizedQuery = filters.query.trim().toLowerCase();

    return staff.filter((employee) => {
      const matchesRoute = routeRole === "all" || employee.roleKey === routeRole;
      const matchesTab = employee.status === activeTab;
      const matchesQuery =
        !normalizedQuery ||
        employee.fullName.toLowerCase().includes(normalizedQuery) ||
        employee.phone.includes(normalizedQuery);
      const matchesRole = !filters.roleKey || employee.roleKey === filters.roleKey;
      const matchesStatus = !filters.status || employee.status === filters.status;

      return matchesRoute && matchesTab && matchesQuery && matchesRole && matchesStatus;
    });
  }, [activeTab, filters, routeRole, staff]);

  const openAddModal = () => {
    setEditingId(null);
    setShowPassword(false);
    setPhoneCountryOpen(false);
    setForm({
      ...emptyForm,
      phoneCountry: "UZ",
      roleKey: routeRole === "all" ? "cashier" : routeRole,
    });
    setModalOpen(true);
  };

  const openEditModal = (employee) => {
    setEditingId(employee.id);
    setShowPassword(false);
    setPhoneCountryOpen(false);
    setForm({ ...emptyForm, ...employee, phoneCountry: employee.phoneCountry || inferPhoneCountry(employee.phone) });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setShowPassword(false);
    setPhoneCountryOpen(false);
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  // Смена длины PIN: лишние цифры обрезаем сразу (maxLength уже введённое не режет),
  // иначе при переключении 4 → 2 в поле осталось бы «1234» и сохранение упало бы.
  const setPinLen = (len) => {
    setForm((current) => ({ ...current, pinLen: len, pin: current.pin.slice(0, len) }));
  };

  const toggleForm = (field) => {
    setForm((current) => ({ ...current, [field]: !current[field] }));
  };

  const selectPhoneCountry = (countryKey) => {
    setForm((current) => ({
      ...current,
      phoneCountry: countryKey,
      phone: current.phone ? normalizePhone(getPhoneLocal(current.phone, current.phoneCountry), countryKey) : "",
    }));
    setPhoneCountryOpen(false);
  };

  const toggleAccess = (moduleKey, actionKey = "enabled") => {
    setForm((current) => {
      const moduleAccess = current.access?.[moduleKey] || {};

      return {
        ...current,
        access: {
          ...(current.access || {}),
          [moduleKey]: {
            ...moduleAccess,
            [actionKey]: !moduleAccess[actionKey],
          },
        },
      };
    });
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => updateForm("photo", reader.result);
    reader.readAsDataURL(file);
  };

  const saveStaff = async (event) => {
    event.preventDefault();
    if (!mutationLocks.acquire("staff-save")) return;
    const phone = normalizePhone(form.phone, form.phoneCountry);
    const roleKey = form.roleKey || "cashier";
    // Email опционален: для POS-персонала (вход по PIN на кассе/десктопе)
    // генерируем синтетический, чтобы бэкенд (email обязателен) принял запись.
    // Менеджер может задать реальный email — тогда сотрудник войдёт в веб-панель.
    const email = form.email.trim() || `${phone || Date.now()}@staff.marjon`;
    if (!roleOptions.some((option) => option.key === roleKey)) {
      window.alert("Укажите допустимую роль сотрудника.");
      mutationLocks.release("staff-save");
      return;
    }
    // Пароль валидируем только когда он задан: пустое поле при редактировании
    // означает «не менять», при создании подставляется дефолт для PIN-персонала.
    if (form.password && (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))) {
      window.alert("Пароль должен содержать минимум 8 символов, букву и цифру.");
      mutationLocks.release("staff-save");
      return;
    }
    const pinLen = Number(form.pinLen) || 4;
    if (form.pin && !new RegExp(`^\\d{${pinLen}}$`).test(form.pin)) {
      window.alert(`PIN должен содержать ровно ${pinLen} цифры.`);
      mutationLocks.release("staff-save");
      return;
    }
    setSaving(true);

    // Толстый payload: наш бэкенд хранит permissions.* (гранулярные права),
    // printer_ip, nfc_id, pin_code (хешируется на бэкенде) и is_active.
    // Отдельного /pin-эндпоинта нет — PIN уходит в теле общего запроса.
    const permissions = {
      can_delete_dishes: !!form.canDeleteDishes,
      can_manage_orders: !!form.canManageOrders,
      can_takeaway_at_table: !!form.canTakeawayAtTable,
      can_change_order_type: !!form.canChangeOrderType,
      can_close_bill: !!form.canCloseBill,
      can_open_cash_drawer: !!form.canOpenCashDrawerAfterPayment,
      can_view_closed_orders: !!form.canViewClosedOrders,
      can_edit_stop_list: !!form.canEditStopList,
      can_view_stop_list: !!form.canViewStopList,
      can_view_finance: !!form.canViewFinance,
      can_cash_ops: !!form.canCashOps,
      can_approve_attendance: !!form.canApproveAttendance,
      can_manage_staff: !!form.canManageStaff,
      can_manage_warehouse: !!form.canManageWarehouse,
      modules: form.access || {},
    };
    const staffFields = {
      name: form.fullName.trim() || undefined,
      role_name: roleMap[roleKey]?.label || roleKey,
      pin_code: form.pin || null,
      printer_ip: form.printerIp || null,
      nfc_id: form.nfcId || null,
      is_active: form.status !== "archived",
      permissions,
    };

    try {
      if (!editingId) {
        const { data: createdUser } = await staffService.createCompanyUser({
          email,
          password: form.password || "Pass1234",
          phone: phone || null,
          role_slug: roleKey,
          ...staffFields,
        });
        setStaff((current) => [
          mapStaffUser(createdUser),
          ...current.filter((item) => item.id !== createdUser.id),
        ]);
      } else {
        const { data: updatedUser } = await staffService.updateCompanyUser(editingId, {
          email,
          password: form.password || undefined,
          phone: phone || null,
          role_slug: roleKey,
          ...staffFields,
        });
        setStaff((current) =>
          current.map((emp) => (emp.id === editingId ? mapStaffUser(updatedUser) : emp)),
        );
      }
      closeModal();
    } catch (err) {
      console.error("Ошибка сохранения:", err.response?.data?.detail || err.message);
      window.alert(err.response?.data?.detail || "Ошибка сохранения");
    } finally {
      setSaving(false);
      mutationLocks.release("staff-save");
    }
  };

  const archiveStaff = async (id) => {
    const key = `staff-action:${id}`;
    if (!mutationLocks.acquire(key)) return;
    setPendingActionId(String(id));
    try {
      await staffService.deleteCompanyUser(id);
      setStaff((current) => current.map((employee) => (
        employee.id === id ? { ...employee, status: "archived" } : employee
      )));
    } catch (err) {
      window.alert(err.response?.data?.detail || "Не удалось архивировать сотрудника.");
    } finally {
      setPendingActionId("");
      mutationLocks.release(key);
    }
  };

  const restoreStaff = async (id) => {
    const key = `staff-action:${id}`;
    if (!mutationLocks.acquire(key)) return;
    setPendingActionId(String(id));
    try {
      await staffService.updateCompanyUser(id, { is_active: true });
      setStaff((current) => current.map((employee) => (
        employee.id === id ? { ...employee, status: "active" } : employee
      )));
    } catch (err) {
      window.alert(err.response?.data?.detail || "Не удалось восстановить сотрудника.");
    } finally {
      setPendingActionId("");
      mutationLocks.release(key);
    }
  };

  const applyFilters = () => {
    setFilters(draftFilters);
  };

  const clearFilters = () => {
    const resetFilters = {
      query: "",
      roleKey: routeRole === "all" ? "" : routeRole,
      status: "",
    };
    setDraftFilters(resetFilters);
    setFilters(resetFilters);
  };

  return (
    <div className="staff-page">
      <section className="staff-card">
        <header className="staff-header">
          <div className="staff-header__title">
            <span className="staff-header__accent" aria-hidden="true" />
            <div>
              <p className="staff-header__eyebrow">Пользователи</p>
              <h1>{pageTitle}</h1>
            </div>
          </div>
          <button className="staff-add-button" type="button" onClick={openAddModal}>
            <Icon name="bi-plus" size={18} />
            Добавить +
          </button>
        </header>

        <div className="staff-tabs" role="tablist" aria-label="Статус сотрудников">
          <button
            className={activeTab === "active" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveTab("active")}
          >
            <Icon name="bi-check2-circle" size={17} />
            Активные
          </button>
          <button
            className={activeTab === "archived" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveTab("archived")}
          >
            <Icon name="bi-archive" size={17} />
            Архивированные
          </button>
        </div>

        <div className="staff-filters">
          <label>
            <span>Поиск</span>
            <div className="staff-filter-control">
              <Icon name="bi-search" size={17} />
              <input
                type="search"
                value={draftFilters.query}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, query: event.target.value }))
                }
                placeholder="ФИО или телефон"
              />
            </div>
          </label>
          <label>
            <span>Роль</span>
            <select
              value={draftFilters.roleKey}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, roleKey: event.target.value }))
              }
              disabled={routeRole !== "all"}
            >
              <option value="">Все роли</option>
              {roleOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Статус</span>
            <select
              value={draftFilters.status}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="">Все статусы</option>
              <option value="active">Активные</option>
              <option value="archived">Архивированные</option>
            </select>
          </label>
          <div className="staff-filter-buttons">
            <button type="button" onClick={applyFilters}>
              <Icon name="bi-funnel" size={16} />
              Фильтровать
            </button>
            <button type="button" className="staff-clear-button" onClick={clearFilters}>
              <Icon name="bi-arrow-counterclockwise" size={16} />
              Очистить
            </button>
          </div>
        </div>

        {staffLoading ? <div className="staff-empty-cell" role="status">Загрузка сотрудников...</div> : null}
        {staffError ? <div className="login-error" role="alert">{staffError}</div> : null}
        <div className="staff-table-wrapper">
          <table className="staff-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Фото</th>
                <th>ФИО</th>
                <th>Номер телефона</th>
                <th>Роль</th>
                <th>Доступ RBAC</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleStaff.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.id}</td>
                  <td>
                    <div className="staff-avatar">
                      {employee.photo ? (
                        <img src={employee.photo} alt={employee.fullName} />
                      ) : (
                        <span>{employee.fullName.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                  </td>
                  <td className="staff-name-cell">{employee.fullName}</td>
                  <td>{formatPhone(employee.phone, employee.phoneCountry || inferPhoneCountry(employee.phone))}</td>
                  <td>
                    <span className="staff-role-badge">
                      {roleMap[employee.roleKey]?.label || employee.roleKey}
                    </span>
                  </td>
                  <td>
                    <span className="staff-permission">
                      <span className="staff-permission-dot" aria-hidden="true" />
                      {getPermissionSummary(employee)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`staff-status-badge ${
                        employee.status === "archived" ? "is-archived" : ""
                      }`}
                    >
                      {employee.status === "archived" ? "#архив" : "#активно"}
                    </span>
                  </td>
                  <td>
                    <div className="staff-actions">
                      <button
                        type="button"
                        className="edit-action-button"
                        onClick={() => openEditModal(employee)}
                        aria-label="Edit"
                        title="Edit"
                      >
                        <Icon name="bi-pencil" size={15} />
                      </button>
                      {employee.status === "archived" ? (
                        <button
                          type="button"
                          disabled={pendingActionId === String(employee.id)}
                          className="staff-restore-action"
                          onClick={() => restoreStaff(employee.id)}
                          aria-label="Restore"
                          title="Restore"
                        >
                          <Icon name="bi-recycle" size={15} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pendingActionId === String(employee.id)}
                          className="staff-delete-action"
                          onClick={() => archiveStaff(employee.id)}
                          aria-label="Archive"
                          title="Archive"
                        >
                          <Icon name="bi-trash3" size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!staffLoading && !staffError && visibleStaff.length === 0 && (
                <tr>
                  <td colSpan={8} className="staff-empty-cell">
                    Сотрудники не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <div className="staff-modal" role="dialog" aria-modal="true">
          <div className="staff-modal__backdrop" onClick={saving ? undefined : closeModal} />
          <form
            key={editingId ? `staff-edit-${editingId}` : "staff-add-empty"}
            className="staff-form"
            onSubmit={saveStaff}
            autoComplete="off"
          >
            <div className="staff-autofill-trap" aria-hidden="true">
              <input type="text" name="username" tabIndex={-1} autoComplete="username" />
              <input type="password" name="password" tabIndex={-1} autoComplete="new-password" />
            </div>
            <div className="staff-form__header">
              <div>
                <p>{editingId ? "Редактирование" : "Новый сотрудник"}</p>
                <h2>{editingId ? "Изменить сотрудника" : "Добавить сотрудника"}</h2>
              </div>
              <button type="button" disabled={saving} onClick={closeModal} aria-label="Закрыть">
                <Icon name="bi-x-lg" size={20} />
              </button>
            </div>

            <div className="staff-form__grid staff-form__grid--edit">
              <label>
                <span>Email (необязательно)</span>
                <input
                  type="email"
                  autoComplete="off"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="Только для входа в веб-панель"
                />
              </label>
              <label>
                <span>Имя *</span>
                <input
                  required
                  autoComplete="off"
                  value={form.fullName}
                  onChange={(event) => updateForm("fullName", event.target.value)}
                  placeholder="Имя сотрудника"
                />
              </label>
              <label>
                <span>Номер телефона</span>
                <div className="staff-phone-field">
                  <button
                    className="staff-phone-country"
                    type="button"
                    onClick={() => setPhoneCountryOpen((value) => !value)}
                    aria-label="Выбрать страну"
                    aria-expanded={phoneCountryOpen}
                  >
                    <img
                      src={getPhoneFlag(form.phoneCountry || "UZ")}
                      alt={phoneCountryMap[form.phoneCountry || "UZ"]?.label || ""}
                    />
                    <Icon name="bi-chevron-down" size={12} />
                  </button>
                  {phoneCountryOpen && (
                    <div className="staff-phone-country-menu">
                      {phoneCountries.map((country) => (
                        <button
                          className={form.phoneCountry === country.key ? "is-active" : ""}
                          type="button"
                          key={country.key}
                          onClick={() => selectPhoneCountry(country.key)}
                        >
                          <img src={getPhoneFlag(country.key)} alt="" />
                          <span>{country.label}</span>
                          <b>+{country.dialCode}</b>
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    required
                    autoComplete="off"
                    inputMode="tel"
                    value={
                      form.phone
                        ? formatPhone(form.phone, form.phoneCountry)
                        : `+${phoneCountryMap[form.phoneCountry || "UZ"]?.dialCode || "998"}`
                    }
                    onChange={(event) =>
                      updateForm("phone", normalizePhone(event.target.value, form.phoneCountry))
                    }
                    placeholder=""
                  />
                </div>
              </label>
              <label>
                <span>{editingId ? "Новый пароль" : "Пароль *"}</span>
                <div className="staff-password-field">
                  <input
                    required={!editingId}
                    autoComplete="new-password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => updateForm("password", event.target.value)}
                    placeholder="Пароль"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    aria-pressed={showPassword}
                  >
                    <Icon name={showPassword ? "bi-eye-slash" : "bi-eye"} size={18} />
                  </button>
                </div>
              </label>
              <label>
                <span>Длина PIN</span>
                <select value={form.pinLen} onChange={(event) => setPinLen(Number(event.target.value))}>
                  <option value={2}>2 цифры</option>
                  <option value={4}>4 цифры</option>
                </select>
              </label>
              <label>
                <span>PIN-код {form.pinLen} цифры</span>
                <input
                  value={form.pin}
                  maxLength={form.pinLen}
                  inputMode="numeric"
                  pattern={`[0-9]{${form.pinLen}}`}
                  onChange={(event) => updateForm("pin", event.target.value.replace(/\D/g, ""))}
                  placeholder={"0".repeat(form.pinLen)}
                />
              </label>
              <label>
                <span>IP принтера</span>
                <input
                  autoComplete="off"
                  value={form.printerIp}
                  onChange={(event) => updateForm("printerIp", event.target.value)}
                  placeholder="Напр. 192.168.0.50 (POS-терминал)"
                />
              </label>
              <label>
                <span>NFC-идентификатор</span>
                <input
                  autoComplete="off"
                  value={form.nfcId}
                  onChange={(event) => updateForm("nfcId", event.target.value)}
                  placeholder="Карта/брелок для быстрого входа"
                />
              </label>
              <div className="staff-permission-switches">
                <button
                  className={`staff-permission-switch ${form.status === "active" ? "is-on" : ""}`}
                  type="button"
                  onClick={() =>
                    updateForm("status", form.status === "active" ? "archived" : "active")
                  }
                >
                  <span>Статус</span>
                  <i>{form.status === "active" ? "Активный" : "Архив"}</i>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                <button
                  className={`staff-permission-switch ${form.canDeleteDishes ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canDeleteDishes")}
                >
                  <span>Удаления блюд</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                {/* can_manage_orders — must() на десктопе: без этого права официант
                    НЕ может отменять/переносить/удалять отправленные блюда и заказы. */}
                <button
                  className={`staff-permission-switch ${form.canManageOrders ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canManageOrders")}
                >
                  <span>Управление заказами (отмена / перенос / удаление)</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                <button
                  className={`staff-permission-switch ${form.canTakeawayAtTable ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canTakeawayAtTable")}
                >
                  <span>Заказ на вынос за столом</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                <button
                  className={`staff-permission-switch ${form.canChangeOrderType ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canChangeOrderType")}
                >
                  <span>Изменить тип заказа</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                <button
                  className={`staff-permission-switch ${form.canCloseBill ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canCloseBill")}
                >
                  <span>Может закрыть счет</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                <button
                  className={`staff-permission-switch ${
                    form.canOpenCashDrawerAfterPayment ? "is-on" : ""
                  }`}
                  type="button"
                  onClick={() => toggleForm("canOpenCashDrawerAfterPayment")}
                >
                  <span>Открыть денежный ящик после оплаты</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                <button
                  className={`staff-permission-switch ${form.canViewClosedOrders ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canViewClosedOrders")}
                >
                  <span>Просмотр закрытых заказов</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                <button
                  className={`staff-permission-switch ${form.canEditStopList ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canEditStopList")}
                >
                  <span>Редактирование стоп-листа</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                {/* can_view_stop_list — can() на десктопе: по умолчанию включено,
                    выключение ОГРАНИЧИВАЕТ просмотр стоп-листа на кассе. */}
                <button
                  className={`staff-permission-switch ${form.canViewStopList ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canViewStopList")}
                >
                  <span>Просмотр стоп-листа</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                <button
                  className={`staff-permission-switch ${form.canViewFinance ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canViewFinance")}
                >
                  <span>Просмотр финансов</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                <button
                  className={`staff-permission-switch ${form.canCashOps ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canCashOps")}
                >
                  <span>Приход / расход (касса)</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                {/* can_approve_attendance — can() на десктопе: по умолчанию включено,
                    выключение убирает у кассира одобрение прихода/ухода поваров. */}
                <button
                  className={`staff-permission-switch ${form.canApproveAttendance ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canApproveAttendance")}
                >
                  <span>Подтверждение прихода / ухода повара</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                {/* Спец-права десктопа: открывают «режим разработчика» на терминале.
                    can_manage_staff — хаб управления персоналом и правами кассиров;
                    can_manage_warehouse — складские записи (приход/списание/инвентаризация).
                    Единственная точка эскалации — выдаёт только владелец здесь. Бэкенд
                    (require_permission_or_admin) не позволит кассиру-менеджеру выдать эти
                    права дальше, поэтому на кассе/десктопе их в тумблерах прав НЕТ. */}
                <button
                  className={`staff-permission-switch ${form.canManageStaff ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canManageStaff")}
                >
                  <span>Управление персоналом (режим разработчика на терминале)</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
                <button
                  className={`staff-permission-switch ${form.canManageWarehouse ? "is-on" : ""}`}
                  type="button"
                  onClick={() => toggleForm("canManageWarehouse")}
                >
                  <span>Управление складом (приход / списание / инвентаризация)</span>
                  <b className="staff-switch" aria-hidden="true" />
                </button>
              </div>
              <p className="muted" role="status">
                Права применяются на кассе и десктопе после сохранения.
              </p>
              <div className="staff-permission-matrix">
                {staffAccessModules.map((module) => {
                  const moduleAccess = form.access?.[module.key] || {};
                  const actions =
                    module.key === "order_types" ? staffOrderTypeActions : staffAccessActions;

                  return (
                    <div
                      className={`staff-access-row ${moduleAccess.enabled ? "is-open" : ""}`}
                      key={module.key}
                    >
                      <div className="staff-access-toggle">
                        <button
                          className={`staff-switch-button ${moduleAccess.enabled ? "is-on" : ""}`}
                          type="button"
                          onClick={() => toggleAccess(module.key)}
                          aria-pressed={Boolean(moduleAccess.enabled)}
                          aria-label={`${module.label}: ${moduleAccess.enabled ? "выключить" : "включить"}`}
                        >
                          <b className="staff-mini-switch" aria-hidden="true" />
                        </button>
                        <span>{module.label}</span>
                      </div>
                      <div
                        className="staff-access-actions"
                        aria-hidden={!moduleAccess.enabled}
                      >
                        {actions.map((action) => (
                          <button
                            className={`staff-access-action ${
                              moduleAccess[action.key] ? "is-on" : ""
                            }`}
                            type="button"
                            key={action.key}
                            onClick={() => toggleAccess(module.key, action.key)}
                            disabled={!moduleAccess.enabled}
                            aria-pressed={Boolean(moduleAccess[action.key])}
                          >
                            <b className="staff-mini-switch" aria-hidden="true" />
                            <span>{action.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <label className="staff-form__comment">
                <span>Комментарий (недоступно)</span>
                <textarea
                  value=""
                  disabled
                  title="Backend contract отсутствует"
                  placeholder="Заметка по сотруднику"
                />
              </label>
            </div>

            {false && (
              <>
            <label className="staff-photo-upload">
              <span>Фото / avatar upload</span>
              <div>
                <div className="staff-avatar staff-avatar--large">
                  {form.photo ? (
                    <img src={form.photo} alt="Avatar preview" />
                  ) : (
                    <Icon name="bi-person" size={24} />
                  )}
                </div>
                <input type="file" accept="image/*" onChange={handlePhotoChange} />
              </div>
            </label>

            <div className="staff-form__grid">
              <label>
                <span>ФИО</span>
                <input
                  required
                  value={form.fullName}
                  onChange={(event) => updateForm("fullName", event.target.value)}
                  placeholder="Имя сотрудника"
                />
              </label>
              <label>
                <span>Номер телефона</span>
                <input
                  required
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                  placeholder="998..."
                />
              </label>
              <label>
                <span>Роль</span>
                <select
                  value={form.roleKey}
                  onChange={(event) => updateForm("roleKey", event.target.value)}
                >
                  {roleOptions.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Длина PIN</span>
                <select value={form.pinLen} onChange={(event) => setPinLen(Number(event.target.value))}>
                  <option value={2}>2 цифры</option>
                  <option value={4}>4 цифры</option>
                </select>
              </label>
              <label>
                <span>PIN-код {form.pinLen} цифры</span>
                <input
                  value={form.pin}
                  maxLength={form.pinLen}
                  inputMode="numeric"
                  pattern={`[0-9]{${form.pinLen}}`}
                  onChange={(event) => updateForm("pin", event.target.value.replace(/\D/g, ""))}
                  placeholder={"0".repeat(form.pinLen)}
                />
              </label>
              <label>
                <span>Пароль</span>
                <div className="staff-password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => updateForm("password", event.target.value)}
                    placeholder="Пароль"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    aria-pressed={showPassword}
                  >
                    <Icon name={showPassword ? "bi-eye-slash" : "bi-eye"} size={18} />
                  </button>
                </div>
              </label>
              <label>
                <span>Доступы / permissions</span>
                <input
                  value={form.permission}
                  onChange={(event) => updateForm("permission", event.target.value)}
                  placeholder="Например: Удаления блюд"
                />
              </label>
              <label className="staff-form__status">
                <span>Статус active</span>
                <select
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value)}
                >
                  <option value="active">Активный</option>
                  <option value="archived">Архив</option>
                </select>
              </label>
              <label className="staff-form__comment">
                <span>Комментарий</span>
                <textarea
                  value={form.comment}
                  onChange={(event) => updateForm("comment", event.target.value)}
                  placeholder="Заметка по сотруднику"
                />
              </label>
            </div>

              </>
            )}

            <div className="staff-form__footer">
              <button type="button" disabled={saving} onClick={closeModal}>
                Отмена
              </button>
              <button type="submit" disabled={saving}>{saving ? "Сохранение..." : editingId ? "Сохранить" : "Добавить"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default StaffRolePage;
