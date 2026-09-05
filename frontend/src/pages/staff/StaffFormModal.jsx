import Icon from "../../components/Icon";
import {
  roleOptions,
  staffAccessModules,
  staffAccessActions,
  staffOrderTypeActions,
} from "./staffConstants";
import {
  formatPhone,
  getPhoneFlag,
  normalizePhone,
  phoneCountries,
  phoneCountryMap,
} from "./staffPhone";

// Модальное окно создания/редактирования сотрудника OWNER.
// Вынесено из StaffRolePage.jsx (FE-07B). Разметка, классы, текст и мёртвый
// блок `{false && ...}` сохранены 1:1; форма и обработчики (включая блокировку
// повторной отправки и числовой парсинг) принадлежат оркестратору — приходят пропсами.
export default function StaffFormModal({
  editingId,
  saving,
  closeModal,
  saveStaff,
  form,
  updateForm,
  toggleForm,
  setPinLen,
  selectPhoneCountry,
  toggleAccess,
  handlePhotoChange,
  showPassword,
  setShowPassword,
  phoneCountryOpen,
  setPhoneCountryOpen,
}) {
  return (
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
            {/* Email опционален: кассир/официант входит по PIN, а веб-панель
                нужна не всем. Если поле пустое, оркестратор синтезирует технический
                адрес — сотрудник создаётся без e-mail. */}
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
            {/* can_approve_attendance — экран прихода/ухода на терминале: на
                десктопе must(), на бэкенде гейт на /hr/attendance/*. Дефолт OFF,
                выдаёт только владелец здесь — с терминала право не выдаётся. */}
            <button
              className={`staff-permission-switch ${form.canApproveAttendance ? "is-on" : ""}`}
              type="button"
              onClick={() => toggleForm("canApproveAttendance")}
            >
              <span>Приход / уход сотрудников</span>
              <b className="staff-switch" aria-hidden="true" />
            </button>
            {/* can_view_past_periods — прошлые периоды в финансах и приходе/уходе.
                Без него сервер отдаёт ТОЛЬКО сегодняшний день (date_from/date_to из
                запроса игнорируются), поэтому ограничение не обойти прямым вызовом API. */}
            <button
              className={`staff-permission-switch ${form.canViewPastPeriods ? "is-on" : ""}`}
              type="button"
              onClick={() => toggleForm("canViewPastPeriods")}
            >
              <span>Прошлые периоды (финансы, приход / уход)</span>
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
  );
}






