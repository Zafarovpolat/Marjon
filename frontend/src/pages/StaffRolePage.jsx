import { useMemo, useState } from "react";
import Icon from "../components/Icon";

const roleOptions = [
  { key: "cashier", label: "Кассир", title: "Кассиры" },
  { key: "waiter", label: "Официант", title: "Официанты" },
  { key: "courier", label: "Курьер", title: "Курьеры" },
  { key: "monoblock", label: "Моноблок", title: "Моноблок" },
  { key: "kitchen", label: "Повар", title: "Повара" },
  { key: "manager", label: "Менеджер", title: "Менеджеры" },
  { key: "warehouse", label: "Завсклад", title: "Завсклад" },
];

const roleMap = roleOptions.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

const initialStaff = [
  {
    id: 5439,
    fullName: "SARDORKASSA",
    phone: "998770702103",
    roleKey: "cashier",
    permission: "Удаления блюд",
    status: "active",
    pin: "5439",
    password: "cashier5439",
    comment: "Основная касса",
  },
  {
    id: 5440,
    fullName: "KACCA 2",
    phone: "998770702102",
    roleKey: "cashier",
    permission: "Удаления блюд",
    status: "active",
    pin: "5440",
    password: "cashier5440",
    comment: "Вторая касса",
  },
  {
    id: 15349,
    fullName: "Khusniddin Khusanboyev",
    phone: "998882229904",
    roleKey: "cashier",
    permission: "Удаления блюд",
    status: "active",
    pin: "3490",
    password: "khusniddin",
    comment: "Дневная смена",
  },
  {
    id: 16751,
    fullName: "Nurmuxammad",
    phone: "998943027535",
    roleKey: "cashier",
    permission: "Удаления блюд",
    status: "active",
    pin: "6751",
    password: "nurmuxammad",
    comment: "Вечерняя смена",
  },
  {
    id: 21402,
    fullName: "Azizbek",
    phone: "998901112233",
    roleKey: "waiter",
    permission: "Приём заказов",
    status: "active",
    pin: "1402",
    password: "azizbek",
    comment: "Зал",
  },
  {
    id: 21419,
    fullName: "Dilnoza",
    phone: "998902224455",
    roleKey: "waiter",
    permission: "Приём заказов",
    status: "archived",
    pin: "1419",
    password: "dilnoza",
    comment: "В архиве",
  },
  {
    id: 23710,
    fullName: "Javohir Courier",
    phone: "998933334455",
    roleKey: "courier",
    permission: "Доставка",
    status: "active",
    pin: "3710",
    password: "courier",
    comment: "Центр города",
  },
  {
    id: 24501,
    fullName: "Terminal 1",
    phone: "998900001001",
    roleKey: "monoblock",
    permission: "Кассовый экран",
    status: "active",
    pin: "4501",
    password: "terminal",
    comment: "Основной моноблок",
  },
  {
    id: 25118,
    fullName: "Povar Bekzod",
    phone: "998977778899",
    roleKey: "kitchen",
    permission: "Кухня",
    status: "active",
    pin: "5118",
    password: "kitchen",
    comment: "Горячий цех",
  },
  {
    id: 26834,
    fullName: "Rustam Manager",
    phone: "998944445566",
    roleKey: "manager",
    permission: "Отчёты и смены",
    status: "active",
    pin: "6834",
    password: "manager",
    comment: "Администратор",
  },
  {
    id: 27605,
    fullName: "Omborchi",
    phone: "998955556677",
    roleKey: "warehouse",
    permission: "Склад",
    status: "active",
    pin: "7605",
    password: "warehouse",
    comment: "Складская зона",
  },
];

const emptyForm = {
  fullName: "",
  phone: "",
  roleKey: "cashier",
  permission: "",
  pin: "",
  password: "",
  status: "active",
  comment: "",
  photo: "",
};

function StaffRolePage({ role = "all" }) {
  const routeRole = roleMap[role] ? role : "all";
  const pageTitle =
    routeRole === "all" ? "Список сотрудников" : `Список сотрудников: ${roleMap[routeRole].title}`;

  const [staff, setStaff] = useState(initialStaff);
  const [activeTab, setActiveTab] = useState("active");
  const [draftFilters, setDraftFilters] = useState({
    query: "",
    roleKey: routeRole === "all" ? "" : routeRole,
    status: "",
  });
  const [filters, setFilters] = useState(draftFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    ...emptyForm,
    roleKey: routeRole === "all" ? "cashier" : routeRole,
  });

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
    setForm({
      ...emptyForm,
      roleKey: routeRole === "all" ? "cashier" : routeRole,
    });
    setModalOpen(true);
  };

  const openEditModal = (employee) => {
    setEditingId(employee.id);
    setForm({ ...emptyForm, ...employee });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => updateForm("photo", reader.result);
    reader.readAsDataURL(file);
  };

  const saveStaff = (event) => {
    event.preventDefault();

    if (editingId) {
      setStaff((current) =>
        current.map((employee) =>
          employee.id === editingId
            ? {
                ...employee,
                ...form,
                id: editingId,
                status: form.status === "archived" ? "archived" : "active",
              }
            : employee,
        ),
      );
    } else {
      setStaff((current) => [
        {
          ...form,
          id: Date.now(),
          status: form.status === "archived" ? "archived" : "active",
        },
        ...current,
      ]);
    }

    closeModal();
  };

  const archiveStaff = (id) => {
    setStaff((current) =>
      current.map((employee) =>
        employee.id === id ? { ...employee, status: "archived" } : employee,
      ),
    );
  };

  const restoreStaff = (id) => {
    setStaff((current) =>
      current.map((employee) =>
        employee.id === id ? { ...employee, status: "active" } : employee,
      ),
    );
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

        <div className="staff-table-wrapper">
          <table className="staff-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Фото</th>
                <th>ФИО</th>
                <th>Номер телефона</th>
                <th>Роль</th>
                <th>Доступ</th>
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
                  <td>{employee.phone}</td>
                  <td>
                    <span className="staff-role-badge">
                      {roleMap[employee.roleKey]?.label || employee.roleKey}
                    </span>
                  </td>
                  <td>
                    <span className="staff-permission">
                      <span className="staff-permission-dot" aria-hidden="true" />
                      {employee.permission || "Базовый доступ"}
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
                      <button type="button" onClick={() => openEditModal(employee)}>
                        <Icon name="bi-pencil" size={15} />
                        Edit
                      </button>
                      {employee.status === "archived" ? (
                        <button
                          type="button"
                          className="staff-restore-action"
                          onClick={() => restoreStaff(employee.id)}
                        >
                          <Icon name="bi-recycle" size={15} />
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="staff-delete-action"
                          onClick={() => archiveStaff(employee.id)}
                        >
                          <Icon name="bi-trash3" size={15} />
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {visibleStaff.length === 0 && (
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
          <div className="staff-modal__backdrop" onClick={closeModal} />
          <form className="staff-form" onSubmit={saveStaff}>
            <div className="staff-form__header">
              <div>
                <p>{editingId ? "Редактирование" : "Новый сотрудник"}</p>
                <h2>{editingId ? "Изменить сотрудника" : "Добавить сотрудника"}</h2>
              </div>
              <button type="button" onClick={closeModal} aria-label="Закрыть">
                <Icon name="bi-x-lg" size={20} />
              </button>
            </div>

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
                <span>PIN-код 4 цифры</span>
                <input
                  value={form.pin}
                  maxLength={4}
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  onChange={(event) => updateForm("pin", event.target.value.replace(/\D/g, ""))}
                  placeholder="0000"
                />
              </label>
              <label>
                <span>Пароль</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => updateForm("password", event.target.value)}
                  placeholder="Пароль"
                />
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

            <div className="staff-form__footer">
              <button type="button" onClick={closeModal}>
                Отмена
              </button>
              <button type="submit">{editingId ? "Сохранить" : "Добавить"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default StaffRolePage;
