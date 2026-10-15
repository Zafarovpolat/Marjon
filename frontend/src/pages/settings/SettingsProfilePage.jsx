// Страница «Настройка профиля» (V1: ровно 4 внутренние секции).
// Каждая секция рендерит собственный контент; общего плейсхолдера нет.
// Поля без backend-поддержки рисуются, но никогда не отправляются
// и не показывают ложный успех (см. useCompanyProfileForm).
import { useState } from "react";
import { createPortal } from "react-dom";
import logo from "../../assets/marjon-logo.svg";
import Icon from "../../components/Icon";
import Toast from "../../components/Toast";
import { useAuth } from "../../context/AuthContext";
import { ordersService } from "../../api/orders";
import { warehouseService } from "../../api/warehouse";
import { profileSections } from "./profile/profileSections";
import { useCompanyProfileForm } from "./profile/useCompanyProfileForm";

const ORDER_TYPE_ROWS = [
  { key: "dineIn", label: "На стол" },
  { key: "takeaway", label: "На вынос" },
  { key: "delivery", label: "Доставка" },
];

export default function SettingsProfilePage() {
  const { user } = useAuth();
  const {
    form,
    activeSection,
    setActiveSection,
    loading,
    saving,
    error,
    clearError: clearProfileError,
    success,
    successClosing,
    clearSuccess,
    set,
    handleImageChange,
    resetForm,
    clearLogo,
    handleSave,
    profileName,
    setProfileName,
    dayStartHour,
    setDayStartHour,
    vatRate,
    setVatRate,
    showSupportButton,
    supportSaving,
    saveSupportVisibility,
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
  } = useCompanyProfileForm(user);

  const activeMeta = profileSections.find((section) => section.key === activeSection) || profileSections[0];
  const profilePreview = form.profileLogo || form.companyLogo || logo;
  const showHeaderActions = activeSection !== "profile";
  // Массовая очистка данных: confirmTarget — какое уточняющее окно открыто
  // (null | "reports" | "purchases"), clearing — идёт ли удаление.
  // Результат показываем честно (без ложного успеха).
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [clearing, setClearing] = useState(null);
  const [clearResult, setClearResult] = useState("");
  const [clearError, setClearError] = useState("");

  const openClearConfirm = (target) => {
    if (clearing) return;
    setClearError("");
    setConfirmTarget(target);
  };

  const closeClearConfirm = () => {
    if (clearing) return;
    setConfirmTarget(null);
    setClearError("");
  };

  const runClearReports = async () => {
    setClearing("reports");
    setClearError("");
    try {
      const { data } = await ordersService.purge();
      const orders = Number(data?.orders) || 0;
      const payments = Number(data?.payments) || 0;
      setConfirmTarget(null);
      setClearResult(`Отчёты очищены: удалено заказов: ${orders}, платежей: ${payments}.`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setClearError(typeof detail === "string" ? `Не удалось очистить отчёты: ${detail}` : "Не удалось очистить отчёты.");
    } finally {
      setClearing(null);
    }
  };

  const runClearPurchases = async () => {
    setClearing("purchases");
    setClearError("");
    try {
      const { data } = await warehouseService.list("incoming");
      const docs = Array.isArray(data) ? data : data?.items || [];
      let removed = 0;
      let failed = 0;
      for (const doc of docs) {
        if (!doc?.id) continue;
        try {
          await warehouseService.deletePurchase(doc.id);
          removed += 1;
        } catch {
          failed += 1;
        }
      }
      try {
        localStorage.removeItem("marjon:purchase-last-values:v1");
      } catch {
        // хранилище недоступно — молча, на очистку не влияет
      }
      setConfirmTarget(null);
      setClearResult(failed > 0
        ? `История продуктов: удалено ${removed} из ${docs.length} (ошибок: ${failed}). Остатки не изменились.`
        : `История продуктов очищена: удалено документов: ${removed}. Остатки не изменились.`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setClearError(typeof detail === "string" ? `Не удалось очистить историю продуктов: ${detail}` : "Не удалось очистить историю продуктов.");
    } finally {
      setClearing(null);
    }
  };

  const confirmClearContent = confirmTarget === "purchases"
    ? {
        title: "Очистить историю продуктов?",
        body: "Будет удалена вся история добавления продуктов. Остатки на складах не изменятся. Это действие необратимо.",
        run: runClearPurchases,
      }
    : {
        title: "Очистить все отчеты?",
        body: "Будут удалены ВСЕ заказы, платежи, чеки и доставки. Все отчёты в категории «Отчёты» станут пустыми. Это действие необратимо.",
        run: runClearReports,
      };

  if (loading) {
    return (
      <section className="company-profile-page">
        <div className="company-profile-shell">
          <p className="company-profile-loading">Загрузка...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="company-profile-page">
      <div className="company-profile-shell">
        <aside className="company-profile-nav" aria-label="Разделы настроек">
          {profileSections.map((section) => (
            <button
              key={section.key}
              type="button"
              className={activeSection === section.key ? "is-active" : ""}
              onClick={() => setActiveSection(section.key)}
            >
              <Icon name={section.icon} size={18} />
              <span>{section.label}</span>
            </button>
          ))}
        </aside>

        <div className="company-profile-content">
          <header className="company-profile-header">
            <div className="settings-title-group">
              <span className="settings-accent-bar" />
              <div>
                <p>Настройки</p>
                <h1>{activeMeta.label}</h1>
              </div>
            </div>
            {showHeaderActions ? (
              <div className="company-profile-actions">
                <button
                  type="button"
                  className="company-profile-cancel"
                  onClick={activeSection === "main" ? resetMain : activeSection === "other" ? resetOrderTypes : resetForm}
                >
                  Отменить
                </button>
                {activeSection === "other" ? (
                  <button
                    type="button"
                    className="company-profile-save"
                    disabled
                    title="Тип заказа пока не поддерживается backend и не сохраняется"
                  >
                    Сохранить
                  </button>
                ) : (
                  <button
                    type="button"
                    className="company-profile-save"
                    disabled={activeSection === "main" ? mainSaving : saving}
                    onClick={activeSection === "main" ? saveMain : handleSave}
                  >
                    {activeSection === "main" && mainSaving ? "Сохранение..." : activeSection === "basic" && saving ? "Сохранение..." : "Сохранить"}
                  </button>
                )}
              </div>
            ) : null}
          </header>

          {error ? <Toast kind="error" message={error} onClose={clearProfileError} /> : null}
          {success ? <Toast kind="success" message={success} leaving={successClosing} onClose={clearSuccess} /> : null}

          {activeSection === "basic" ? (
            <div className="company-profile-main">
              <section className="company-profile-logo-panel company-profile-identity">
                <div className="company-profile-identity-main">
                  <strong className="company-profile-identity-title">Лого профиля</strong>
                  <div className="company-profile-identity-row">
                    <div className="company-profile-logo-actions">
                      <label className="company-profile-upload">
                        <input type="file" accept="image/*" onChange={(event) => handleImageChange("profileLogo", event)} />
                        <span>
                          <img src={profilePreview} alt="Лого профиля" />
                        </span>
                        <b>Заменить</b>
                      </label>
                    </div>
                    <label className="company-profile-identity-name">
                      <b>Имя профиля</b>
                      <input
                        value={profileName}
                        onChange={(event) => setProfileName(event.target.value)}
                        placeholder="Введите имя профиля"
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="company-profile-logo-panel">
                <div className="company-profile-logo-copy">
                  <strong>Лого компании</strong>
                  <span>Используется как фирменный логотип компании в чеках, ссылках и брендовых элементах.</span>
                </div>
                <div className="company-profile-logo-actions">
                  <label className="company-profile-upload">
                    <input type="file" accept="image/*" onChange={(event) => handleImageChange("companyLogo", event)} />
                    <span>
                      {form.companyLogo ? <img src={form.companyLogo} alt="Лого компании" /> : <Icon name="bi-image" size={22} />}
                    </span>
                    <b>Загрузить</b>
                  </label>
                  {form.companyLogo ? (
                    <button type="button" onClick={() => clearLogo("companyLogo")}>Очистить</button>
                  ) : null}
                </div>
              </section>

              <div className="company-profile-field-list">
                <label>
                  <span>
                    <b>Название компании</b>
                    <em>Введите полное название компании</em>
                  </span>
                  <input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Название компании" />
                </label>

                <label>
                  <span>
                    <b>Адрес компании</b>
                    <em>Введите текущий юридический адрес</em>
                  </span>
                  <input value={form.address} onChange={(event) => set("address", event.target.value)} placeholder="Введите адрес" />
                </label>

                <label>
                  <span>
                    <b>ИНН</b>
                    <em>Введите ИНН</em>
                  </span>
                  <input value={form.inn} onChange={(event) => set("inn", event.target.value)} placeholder="123456789" />
                </label>
              </div>

              <div className="company-profile-danger-row">
                <button
                  type="button"
                  className="company-profile-danger"
                  disabled={clearing !== null}
                  onClick={() => openClearConfirm("reports")}
                >
                  <Icon name="bi-exclamation-octagon" size={18} />
                  {clearing === "reports" ? "Удаление…" : "Очистить все отчеты"}
                </button>
                <button
                  type="button"
                  className="company-profile-danger"
                  disabled={clearing !== null}
                  onClick={() => openClearConfirm("purchases")}
                >
                  <Icon name="bi-exclamation-octagon" size={18} />
                  {clearing === "purchases" ? "Удаление…" : "Очистить историю продуктов"}
                </button>
              </div>
              {confirmTarget ? createPortal((
                <div className="settings-owner-view company-clear-layer">
                  <div className="settings-drawer settings-modal-overlay" role="presentation">
                    <div className="settings-drawer__backdrop" onClick={clearing ? undefined : closeClearConfirm} />
                    <div
                      className="settings-form settings-modal settings-confirm company-clear-confirm"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="company-clear-title"
                      aria-describedby="company-clear-body"
                    >
                      <header className="settings-form__header">
                        <span className="settings-accent-bar" />
                        <div>
                          <p>Удаление</p>
                          <h2 id="company-clear-title">{confirmClearContent.title}</h2>
                        </div>
                        <button type="button" aria-label="Закрыть" disabled={clearing !== null} onClick={closeClearConfirm}>
                          <Icon name="bi-x-lg" size={18} />
                        </button>
                      </header>
                      <div className="settings-form__body">
                        <p id="company-clear-body" className="settings-confirm__text">
                          {confirmClearContent.body}
                        </p>
                        {clearError ? <p className="settings-form__error" role="alert">{clearError}</p> : null}
                      </div>
                      <footer className="settings-form__footer">
                        <button type="button" autoFocus disabled={clearing !== null} onClick={closeClearConfirm}>Отмена</button>
                        <button
                          type="button"
                          className="settings-confirm__delete"
                          disabled={clearing !== null}
                          onClick={confirmClearContent.run}
                        >
                          {clearing !== null ? "Очистка…" : "Очистить"}
                        </button>
                      </footer>
                    </div>
                  </div>
                </div>
              ), document.body) : null}
              <p className="company-profile-field-hint" role={clearResult ? "status" : undefined}>
                {clearResult || "Очистка удаляет данные без возможности восстановления. Остатки на складах не меняются."}
              </p>
            </div>
          ) : null}

          {activeSection === "main" ? (
            <div className="company-profile-main">
              <div className="company-profile-field-list">
                <label>
                  <span>
                    <b>Начало дня</b>
                    <em>Укажите время или пароль для открытия рабочего дня</em>
                  </span>
                  <select value={dayStartHour} onChange={(event) => setDayStartHour(event.target.value)}>
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={String(hour)}>
                        {String(hour).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>
                    <b>Пароль для удаления блюд</b>
                    <em>Требуется backend — пока не сохраняется</em>
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={dishDeletePassword}
                    onChange={(event) => setDishDeletePassword(event.target.value)}
                    placeholder="Введите пароль"
                  />
                </label>

                <label>
                  <span>
                    <b>Пароль для удаления блюд после пречека</b>
                    <em>Требуется backend — пока не сохраняется</em>
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={dishDeleteAfterPrecheckPassword}
                    onChange={(event) => setDishDeleteAfterPrecheckPassword(event.target.value)}
                    placeholder="Введите пароль"
                  />
                </label>

                <label>
                  <span>
                    <b>Пароль при смене официанта</b>
                    <em>Требуется backend — пока не сохраняется</em>
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={waiterChangePassword}
                    onChange={(event) => setWaiterChangePassword(event.target.value)}
                    placeholder="Введите пароль"
                  />
                </label>

                <label>
                  <span>
                    <b>Пароль для восстановления заказа</b>
                    <em>Требуется backend — пока не сохраняется</em>
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={orderRestorePassword}
                    onChange={(event) => setOrderRestorePassword(event.target.value)}
                    placeholder="Введите пароль"
                  />
                </label>

                <label>
                  <span>
                    <b>Цена доставки</b>
                    <em>Требуется backend — пока не сохраняется</em>
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={deliveryPrice}
                    onChange={(event) => setDeliveryPrice(event.target.value)}
                    placeholder="0"
                  />
                </label>

                <label>
                  <span>
                    <b>НДС с сервису (%)</b>
                    <em>Процент НДС с сервисного сбора</em>
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={vatRate}
                    onChange={(event) => setVatRate(event.target.value)}
                    placeholder="0"
                  />
                </label>

                <div className="company-profile-order-row">
                  <span>
                    <b>Показывать кнопку поддержки</b>
                    <em>Показывать кнопку «Связь с поддержкой» в интерфейсе</em>
                  </span>
                  <label className="company-profile-toggle company-profile-toggle--support" aria-label="Показывать кнопку поддержки">
                    <input
                      type="checkbox"
                      checked={showSupportButton}
                      disabled={supportSaving}
                      onChange={(event) => saveSupportVisibility(event.target.checked)}
                    />
                    <span className="company-profile-toggle__track" aria-hidden="true">
                      <span className="company-profile-toggle__thumb" />
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {activeSection === "other" ? (
            <div className="company-profile-main">
              <div className="company-profile-field-list">
                {ORDER_TYPE_ROWS.map((row) => (
                  <div className="company-profile-order-row" key={row.key}>
                    <span>
                      <b>Тип заказа</b>
                      <em>{row.label}</em>
                    </span>
                    <label className="company-profile-toggle" aria-label={row.label}>
                      <input
                        type="checkbox"
                        checked={Boolean(orderTypes[row.key])}
                        onChange={() => toggleOrderType(row.key)}
                      />
                      <span className="company-profile-toggle__track" aria-hidden="true">
                        <span className="company-profile-toggle__thumb" />
                      </span>
                    </label>
                  </div>
                ))}
              </div>
              <p className="company-profile-field-hint">Тип заказа пока хранится только на этом экране: backend-поле отсутствует, сохранение отключено.</p>
            </div>
          ) : null}

          {activeSection === "profile" ? (
            <div className="company-profile-main">
              <div className="company-profile-field-list">
                <label>
                  <span>
                    <b>Новый пароль</b>
                    <em>Минимум 8 символов: буква и цифра</em>
                  </span>
                  <span className="company-profile-password-wrap">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Введите новый пароль"
                    />
                    <button
                      type="button"
                      className="company-profile-eye"
                      onClick={() => setShowNewPassword((value) => !value)}
                      aria-label={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
                      aria-pressed={showNewPassword}
                    >
                      <Icon name={showNewPassword ? "bi-eye-slash" : "bi-eye"} size={18} />
                    </button>
                  </span>
                </label>

                <label>
                  <span>
                    <b>Повторите новый пароль</b>
                    <em>Должен совпадать с новым паролем</em>
                  </span>
                  <span className="company-profile-password-wrap">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Повторите новый пароль"
                    />
                    <button
                      type="button"
                      className="company-profile-eye"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      aria-label={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
                      aria-pressed={showConfirmPassword}
                    >
                      <Icon name={showConfirmPassword ? "bi-eye-slash" : "bi-eye"} size={18} />
                    </button>
                  </span>
                </label>
              </div>

              <div className="company-profile-password-actions">
                <button type="button" className="company-profile-save" disabled={passSaving} onClick={savePassword}>
                  {passSaving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
