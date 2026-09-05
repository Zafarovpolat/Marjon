import { useEffect, useMemo, useState } from "react";
import { staffService } from "../api/staff";
import { isAbortError, useLatestRequest, useMutationLocks } from "../hooks/useAsyncSafety";
import {
  emptyForm,
  mapStaffUser,
  roleMap,
  roleOptions,
} from "./staff/staffConstants";
import { getPhoneLocal, inferPhoneCountry, normalizePhone } from "./staff/staffPhone";
import StaffToolbar from "./staff/StaffToolbar";
import StaffTable from "./staff/StaffTable";
import StaffFormModal from "./staff/StaffFormModal";

// Оркестратор раздела «Сотрудники» OWNER (FE-07B). Владеет сквозным состоянием
// (список, фильтры, форма создания/редактирования) и обработчиками; рендер
// разнесён по презентационным подкомпонентам. Транспорт только через
// staffService (FE-05); безопасность запросов/мутаций сохранена (FE-06).
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
      can_view_past_periods: !!form.canViewPastPeriods,
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
        <StaffToolbar
          pageTitle={pageTitle}
          openAddModal={openAddModal}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          draftFilters={draftFilters}
          setDraftFilters={setDraftFilters}
          routeRole={routeRole}
          applyFilters={applyFilters}
          clearFilters={clearFilters}
        />

        <StaffTable
          staffLoading={staffLoading}
          staffError={staffError}
          visibleStaff={visibleStaff}
          pendingActionId={pendingActionId}
          openEditModal={openEditModal}
          archiveStaff={archiveStaff}
          restoreStaff={restoreStaff}
        />
      </section>

      {modalOpen && (
        <StaffFormModal
          editingId={editingId}
          saving={saving}
          closeModal={closeModal}
          saveStaff={saveStaff}
          form={form}
          updateForm={updateForm}
          toggleForm={toggleForm}
          setPinLen={setPinLen}
          selectPhoneCountry={selectPhoneCountry}
          toggleAccess={toggleAccess}
          handlePhotoChange={handlePhotoChange}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          phoneCountryOpen={phoneCountryOpen}
          setPhoneCountryOpen={setPhoneCountryOpen}
        />
      )}
    </div>
  );
}

export default StaffRolePage;


