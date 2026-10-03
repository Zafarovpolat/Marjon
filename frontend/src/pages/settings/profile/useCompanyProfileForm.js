import { useEffect, useMemo, useRef, useState } from "react";
import { settingsService } from "../../../api/settings";
import { readStoredProfile, updateStoredProfile } from "../../../utils/profileCache";
import { isAbortError, useLatestRequest, useMutationLocks } from "../../../hooks/useAsyncSafety";
import { emptyForm } from "./profileSections";

// Контроллер страницы «Настройка профиля» (V1: 4 секции).
// Канонические поля компании грузятся/сохраняются через PATCH /companies/me.
// Поля без backend-поддержки (пароли блюд, цена доставки, тип заказа,
// смена пароля, очистка отчетов) хранятся только локально, никогда не
// отправляются и никогда не показывают ложный успех — см. флаги ниже.
export const PROFILE_PASSWORD_BACKEND_SUPPORTED = false;
export const CLEAR_REPORTS_BACKEND_SUPPORTED = false;
export const ORDER_TYPES_BACKEND_SUPPORTED = false;
// Имя профиля: GET /auth/me отдаёт `name`, но редактируемого
// self-эндпоинта нет — PATCH /auth/users/{id} запрещает правки
// собственной записи (403 "Protected company identity cannot be
// changed"), а authService держит только getCurrentUser.
// Поле рисуется, но не отправляется и не даёт ложного успеха.
export const PROFILE_NAME_BACKEND_SUPPORTED = false;

// Матрица поддержки backend для секции «Основные настройки»:
// FIELD | BACKEND FIELD | GET | PATCH | PERSISTED
// Начало дня | day_start_hour | YES | YES | YES
// НДС с сервису (%) | vat_rate | YES | YES | YES
// Пароль для удаления блюд | — | NO | NO (extra=forbid→422) | NO
// Пароль для удаления блюд после пречека | — | NO | NO | NO
// Пароль при смене официанта | — | NO | NO | NO
// Пароль для восстановления заказа | — | NO | NO | NO
// Цена доставки | — (только зональные delivery_fee) | NO | NO | NO
export const MAIN_SETTINGS_SUPPORT = Object.freeze({
  dayStartHour: { backendField: "day_start_hour", get: true, patch: true, persisted: true },
  vatRate: { backendField: "vat_rate", get: true, patch: true, persisted: true },
  dishDeletePassword: { backendField: null, get: false, patch: false, persisted: false },
  dishDeleteAfterPrecheckPassword: { backendField: null, get: false, patch: false, persisted: false },
  waiterChangePassword: { backendField: null, get: false, patch: false, persisted: false },
  orderRestorePassword: { backendField: null, get: false, patch: false, persisted: false },
  deliveryPrice: { backendField: null, get: false, patch: false, persisted: false },
});

const EMPTY_ORDER_TYPES = Object.freeze({ dineIn: true, takeaway: true, delivery: true });

export function useCompanyProfileForm(user) {
  const storedProfile = useMemo(() => readStoredProfile(user?.id), [user?.id]);
  const [form, setForm] = useState({ ...emptyForm, profileLogo: storedProfile.photo || "" });
  const [savedForm, setSavedForm] = useState({ ...emptyForm, profileLogo: storedProfile.photo || "" });
  const [activeSection, setActiveSectionState] = useState("basic");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [successClosing, setSuccessClosing] = useState(false);
  const beginRequest = useLatestRequest();
  const { acquire, release } = useMutationLocks();

  // V3: success-баннер живёт 5 секунд (4500 fully visible + ~500 animate
  // out) и только после РЕАЛЬНОГО успеха. Таймеры сбрасываются при новом
  // сейве, смене секции, Cancel и размонтировании.
  const toastTimers = useRef([]);
  function clearToastTimers() {
    toastTimers.current.forEach((timer) => clearTimeout(timer));
    toastTimers.current = [];
  }
  useEffect(() => () => clearToastTimers(), []);
  function flashSuccess(message) {
    clearToastTimers();
    setSuccessClosing(false);
    setSuccess(message);
    toastTimers.current.push(setTimeout(() => setSuccessClosing(true), 4500));
    toastTimers.current.push(setTimeout(() => {
      setSuccess("");
      setSuccessClosing(false);
    }, 5000));
  }
  function clearSuccess() {
    clearToastTimers();
    setSuccessClosing(false);
    setSuccess("");
  }

  // «Основные настройки»: поддерживается backend (своя кнопка «Сохранить»).
  const [dayStartHour, setDayStartHour] = useState("0");
  const [vatRate, setVatRate] = useState("");
  const [savedMain, setSavedMain] = useState({ dayStartHour: "0", vatRate: "" });
  const [mainSaving, setMainSaving] = useState(false);

  // «Основные настройки»: без backend-поддержки — локально, не отправляется.
  const [dishDeletePassword, setDishDeletePassword] = useState("");
  const [dishDeleteAfterPrecheckPassword, setDishDeleteAfterPrecheckPassword] = useState("");
  const [waiterChangePassword, setWaiterChangePassword] = useState("");
  const [orderRestorePassword, setOrderRestorePassword] = useState("");
  const [deliveryPrice, setDeliveryPrice] = useState("");

  // «Другие настройки»: тип заказа — локально, backend-поля нет.
  const [orderTypes, setOrderTypes] = useState({ ...EMPTY_ORDER_TYPES });

  // «Настройка профиля»: смена пароля — локально, эндпоинта нет.
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passSaving, setPassSaving] = useState(false);

  // «Имя профиля»: truthful initial из user (GET /auth/me), backend-правки
  // нет — значение никогда не отправляется (см. handleSave).
  const derivedProfileName = user?.name || user?.full_name || "";
  const [profileName, setProfileNameState] = useState("");
  const [profileNamePristine, setProfileNamePristine] = useState(true);
  useEffect(() => {
    if (profileNamePristine) setProfileNameState(derivedProfileName);
  }, [derivedProfileName, profileNamePristine]);

  useEffect(() => {
    const request = beginRequest();
    settingsService.getCompanyProfile({ signal: request.signal })
      .then(({ data }) => {
        if (!request.isCurrent()) return;
        const next = {
          name: data.name || "",
          phone: data.phone || "",
          address: data.address || "",
          inn: data.inn || "",
          currency: data.currency || "UZS",
          companyLogo: storedProfile.companyLogo || "",
          profileLogo: storedProfile.photo || "",
        };
        setForm(next);
        setSavedForm(next);
        const nextMain = {
          dayStartHour: data?.day_start_hour != null ? String(data.day_start_hour) : "0",
          vatRate: data?.vat_rate != null ? String(data.vat_rate) : "",
        };
        setDayStartHour(nextMain.dayStartHour);
        setVatRate(nextMain.vatRate);
        setSavedMain(nextMain);
      })
      .catch((err) => {
        if (request.isCurrent() && !isAbortError(err)) setError(err.response?.data?.detail || "Не удалось загрузить профиль.");
      })
      .finally(() => { if (request.isCurrent()) setLoading(false); });
  }, [beginRequest, storedProfile.companyLogo, storedProfile.name, storedProfile.photo, user?.id]);

  function setActiveSection(key) {
    setActiveSectionState(key);
    setError("");
    clearSuccess();
  }

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
    clearSuccess();
  };

  const setProfileName = (value) => {
    setProfileNameState(value);
    setProfileNamePristine(false);
    setError("");
    clearSuccess();
  };

  function handleImageChange(key, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Выберите файл изображения.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => set(key, String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function resetForm() {
    setForm(savedForm);
    setProfileNameState(derivedProfileName);
    setProfileNamePristine(true);
    setError("");
    clearSuccess();
  }

  function clearLogo(key) {
    set(key, "");
  }

  // «Основные данные»: сохраняются только канонические поля.
  // phone/currency в V1 не редактируются — отправляем сохранённые значения,
  // чтобы не затереть их пустыми строками.
  async function handleSave(event) {
    event.preventDefault();
    if (!acquire("company-profile-save")) return;
    if (!form.name.trim()) {
      setError("Укажите название компании.");
      clearSuccess();
      release("company-profile-save");
      return;
    }
    setSaving(true);
    setError("");
    clearSuccess();

    try {
      // Имя профиля умышленно вне payload: backend-правки нет.
      const payload = {
        name: form.name,
        phone: savedForm.phone,
        address: form.address,
        inn: form.inn,
        currency: savedForm.currency,
      };
      const { data } = await settingsService.updateCompanyProfile(payload);
      if (!data || typeof data !== "object") throw new Error("Backend не вернул сохранённый профиль.");
      const confirmed = {
        ...form,
        name: data.name || "",
        phone: data.phone || "",
        address: data.address || "",
        inn: data.inn || "",
        currency: data.currency || "UZS",
      };
      const nextStored = {
        ...readStoredProfile(user?.id),
        name: confirmed.name,
        photo: form.profileLogo,
        companyLogo: form.companyLogo,
      };
      updateStoredProfile(user?.id, nextStored);
      setForm(confirmed);
      setSavedForm(confirmed);
      // Успех — только за сохранённые company-поля. Имя профиля backend
      // не принимает: если черновик отличается от серверного — говорим прямо.
      if (profileName.trim() !== derivedProfileName.trim()) {
        flashSuccess("Профиль сохранён. Имя профиля требует backend и не сохранено.");
      } else {
        flashSuccess("Профиль сохранён.");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось сохранить профиль.");
    } finally {
      setSaving(false);
      release("company-profile-save");
    }
  }

  function resetMain() {
    setDayStartHour(savedMain.dayStartHour);
    setVatRate(savedMain.vatRate);
    setDishDeletePassword("");
    setDishDeleteAfterPrecheckPassword("");
    setWaiterChangePassword("");
    setOrderRestorePassword("");
    setDeliveryPrice("");
    setError("");
    clearSuccess();
  }

  // «Основные настройки»: отправляются ТОЛЬКО day_start_hour и vat_rate.
  // Пароли/цена доставки не поддерживаются backend и в payload не входят.
  async function saveMain(event) {
    event?.preventDefault?.();
    if (!acquire("company-main-settings-save")) return;
    setMainSaving(true);
    setError("");
    clearSuccess();

    try {
      const payload = {
        day_start_hour: Math.max(0, Math.min(23, Math.trunc(Number(dayStartHour) || 0))),
      };
      if (String(vatRate).trim() !== "") {
        const parsed = Number(String(vatRate).replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
          throw new Error("НДС должен быть числом от 0 до 100.");
        }
        payload.vat_rate = parsed;
      }
      const { data } = await settingsService.updateCompanyProfile(payload);
      if (!data || typeof data !== "object") throw new Error("Backend не вернул сохранённые настройки.");
      const nextMain = {
        dayStartHour: data?.day_start_hour != null ? String(data.day_start_hour) : savedMain.dayStartHour,
        vatRate: data?.vat_rate != null ? String(data.vat_rate) : savedMain.vatRate,
      };
      setDayStartHour(nextMain.dayStartHour);
      setVatRate(nextMain.vatRate);
      setSavedMain(nextMain);
      flashSuccess("Основные настройки сохранены.");
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Не удалось сохранить основные настройки.");
    } finally {
      setMainSaving(false);
      release("company-main-settings-save");
    }
  }

  function toggleOrderType(key) {
    setOrderTypes((current) => ({ ...current, [key]: !current[key] }));
    setError("");
    clearSuccess();
  }

  function resetOrderTypes() {
    setOrderTypes({ ...EMPTY_ORDER_TYPES });
    setError("");
    clearSuccess();
  }

  // «Настройка профиля»: смена пароля.
  // Реального эндпоинта смены пароля нет — мутаций не выполняем.
  async function savePassword(event) {
    event?.preventDefault?.();
    if (passSaving) return;
    if (!newPassword || !confirmPassword) {
      setError("Заполните оба поля пароля.");
      clearSuccess();
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают.");
      clearSuccess();
      return;
    }
    // Канонические правила пароля backend (auth/schemas: мин. 8, буква+цифра).
    if (newPassword.length < 8) {
      setError("Пароль должен быть не менее 8 символов.");
      clearSuccess();
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError("Пароль должен содержать хотя бы одну букву и одну цифру.");
      clearSuccess();
      return;
    }
    setPassSaving(true);
    try {
      setError("");
      flashSuccess("Смена пароля недоступна: backend-эндпоинт отсутствует. Пароль не изменён.");
    } finally {
      setPassSaving(false);
    }
  }

  function resetPassword() {
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    clearSuccess();
  }

  return {
    form,
    activeSection,
    setActiveSection,
    loading,
    saving,
    error,
    success,
    successClosing,
    setSuccess,
    clearSuccess,
    set,
    profileName,
    setProfileName,
    handleImageChange,
    resetForm,
    clearLogo,
    handleSave,
    dayStartHour,
    setDayStartHour,
    vatRate,
    setVatRate,
    mainSaving,
    saveMain,
    resetMain,
    dishDeletePassword,
    setDishDeletePassword,
    dishDeleteAfterPrecheckPassword,
    setDishDeleteAfterPrecheckPassword,
    waiterChangePassword,
    setWaiterChangePassword,
    orderRestorePassword,
    setOrderRestorePassword,
    deliveryPrice,
    setDeliveryPrice,
    orderTypes,
    toggleOrderType,
    resetOrderTypes,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    showNewPassword,
    setShowNewPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    passSaving,
    savePassword,
    resetPassword,
  };
}
