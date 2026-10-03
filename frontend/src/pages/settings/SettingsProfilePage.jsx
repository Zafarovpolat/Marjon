// Страница «Настройка профиля» (V1: ровно 4 внутренние секции).
// Каждая секция рендерит собственный контент; общего плейсхолдера нет.
// Поля без backend-поддержки рисуются, но никогда не отправляются
// и не показывают ложный успех (см. useCompanyProfileForm).
import logo from "../../assets/marjon-logo.svg";
import Icon from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
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
    success,
    successClosing,
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

          {error ? <div className="company-profile-alert is-error">{error}</div> : null}
          {success ? <div className={`company-profile-alert is-success${successClosing ? " is-leaving" : ""}`}>{success}</div> : null}

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

              <button
                type="button"
                className="company-profile-danger"
                disabled
                title="Очистка отчетов недоступна: backend-эндпоинт отсутствует"
              >
                <Icon name="bi-exclamation-octagon" size={18} />
                Очистить все отчеты
              </button>
              <p className="company-profile-field-hint">Очистка отчетов недоступна: backend-эндпоинт отсутствует. Данные не удаляются.</p>
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
