// Модальные окна каталога блюд OWNER: боковая форма.
// Форма добавления/редактирования использует shell staff-примитива
// (staff-modal--cashier-full + staff-form--cashier, портал в body) 1:1.
// V18: «Подкатегория» удалена из формы (в payload её не было никогда —
// backend-поля category_id/subcategory_id/printer_id опциональны).
// Категория/Принтер — настоящие single-селекты канонических справочников
// (категории — тот же GET /inventory/categories, что у фильтра; принтеры —
// GET /printers как у Настройки → Принтеры). Выбор хранит canonical ID и
// уходит в payload только когда выбран (иначе omit). Поле «Повар» удалено:
// backend всегда отдаёт chef:"", пустой disabled-инпут не несёт смысла.
// V21: кастомное окно «База фото» удалено — фото выбирается нативным
// OS-пикером (input[type=file] в строке таблицы и в дровере) и грузится
// только через POST /inventory/products/{id}/photo.
import { createPortal } from "react-dom";
import Icon from "../../components/Icon";
import { fieldLabels } from "./nomenclatureConfig";
import DishSingleSelect from "./DishSingleSelect";
import DishesModifiers from "./DishesModifiers";

const READ_ONLY_DISH_FIELDS = ["menu"];

export default function DishesDialogs({
  drawerOpen,
  drawerClosing,
  requestCloseDrawer,
  finishCloseDrawer,
  editing,
  saving,
  setDrawerOpen,
  form,
  setForm,
  saveDish,
  categoryOptions = [],
  categoriesLoading = false,
  categoriesUnavailable = false,
  printerOptions = [],
  printersLoading = false,
  printersUnavailable = false,
  photoFile,
  photoPreview,
  handlePhotoChange,
  modGroups,
  setModGroups,
  modLoading,
  modError,
  saveModGroup,
  removeModGroup,
}) {
  const closeDrawer = () => {
    if (requestCloseDrawer) requestCloseDrawer();
    else setDrawerOpen(false);
  };
  // V19 — preselect по каноническим IDs: явный выбор формы → id строки
  // (categoryId/printerId из ответа backend) → резолв сохранённого имени
  // через живые справочники. Несовпадение (удалённая запись) = пусто = omit
  // в payload (backend держит). ID не выдумываем.
  const selectedCategoryId = form.categoryId
    ?? (form.category_id ? String(form.category_id) : null)
    ?? categoryOptions.find((item) => item.name === form.category)?.id
    ?? "";
  const selectedPrinterId = form.printerId
    ?? (form.printer_id ? String(form.printer_id) : null)
    ?? printerOptions.find((item) => item.name === form.printer)?.id
    ?? "";
  const pickCategory = (id) => {
    const found = categoryOptions.find((item) => item.id === id);
    setForm((prev) => ({ ...prev, categoryId: id, category: found ? found.name : "" }));
  };
  const pickPrinter = (id) => {
    const found = printerOptions.find((item) => item.id === id);
    setForm((prev) => ({ ...prev, printerId: id, printer: found ? found.name : "" }));
  };
  return (
    <>
      {drawerOpen && createPortal(
        <div
          className={`staff-modal staff-modal--cashier-full dish-drawer${drawerClosing ? " is-closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Редактировать блюдо" : "Добавить блюдо"}
          onAnimationEnd={drawerClosing && finishCloseDrawer ? () => finishCloseDrawer() : undefined}
        >
          <div className="staff-modal__backdrop" onClick={saving ? undefined : closeDrawer} />
          <form
            className="staff-form staff-form--cashier"
            onSubmit={(event) => { event.preventDefault(); saveDish(); }}
          >
            <div className="staff-form__header">
              <div>
                <p>{editing ? "Редактирование" : "Новое блюдо"}</p>
                <h2>{editing ? "Редактировать блюдо" : "Добавить блюдо"}</h2>
              </div>
              <button type="button" disabled={saving} onClick={closeDrawer} aria-label="Закрыть">
                <Icon name="bi-x-lg" size={20} />
              </button>
            </div>
            <div className="dish-drawer__body">
              <div className="cashier-photo">
                <div className="staff-avatar staff-avatar--large">
                  {photoPreview || form.photo ? (
                    <img src={photoPreview || form.photo} alt={editing ? "Фото блюда" : "Новое фото блюда"} />
                  ) : (
                    <Icon name="bi-image" size={26} />
                  )}
                </div>
                <div className="cashier-photo__body">
                  <span>Фото</span>
                  <label className="cashier-photo__upload">
                    <Icon name="bi-camera" size={16} />
                    {photoPreview || form.photo ? "Заменить фото" : "Загрузить фото"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={saving}
                      onChange={handlePhotoChange}
                      aria-label="Загрузить фото блюда"
                    />
                  </label>
                </div>
              </div>
              <div className="staff-form__grid">
                <div className="dish-first-row">
                  <label className="dish-sort-field">
                    <span>{fieldLabels.sort}</span>
                    <input
                      value={form.sort || ""}
                      onChange={(event) => setForm((prev) => ({ ...prev, sort: event.target.value }))}
                    />
                  </label>
                  <label className="dish-name-field">
                    <span>{fieldLabels.name}</span>
                    <input
                      value={form.name || ""}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </label>
                </div>
                {["cost", "price"].map((field) => (
                  <label key={field}>
                    <span>{fieldLabels[field]}</span>
                    <input
                      value={form[field] || ""}
                      onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
                    />
                  </label>
                ))}
                <label>
                  <span>Тип</span>
                  <select value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}>
                    <option>Блюда</option>
                    <option>Реализация</option>
                  </select>
                </label>
                <label>
                  <span>Ед. изм</span>
                  <select
                    value={form.unit}
                    disabled={Boolean(editing)}
                    title={editing ? "Изменение единицы измерения не поддерживается backend update contract." : undefined}
                    onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}
                  >
                    <option>шт</option>
                    <option>порция</option>
                    <option>кг</option>
                    <option>л</option>
                  </select>
                </label>
                {READ_ONLY_DISH_FIELDS.map((field) => (
                  <label key={field}>
                    <span>{fieldLabels[field]}</span>
                    <input
                      value={form[field] || ""}
                      disabled
                      title="Поле доступно только для чтения: write contract не подключён."
                      onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
                    />
                  </label>
                ))}
                <div className="dish-form-field">
                  <span className="dish-form-field__label" aria-hidden="true">Категория</span>
                  <DishSingleSelect
                    label="Категория"
                    placeholder="Категория"
                    options={categoryOptions.map((item) => ({ value: item.id, label: item.name }))}
                    value={selectedCategoryId}
                    onChange={pickCategory}
                    disabled={categoriesUnavailable}
                    loading={categoriesLoading}
                    disabledLabel="Категории недоступны"
                  />
                </div>
                <div className="dish-form-field dish-form__wide">
                  <span className="dish-form-field__label" aria-hidden="true">Принтер</span>
                  <DishSingleSelect
                    label="Принтер"
                    placeholder="Принтер"
                    options={printerOptions.map((item) => ({
                      value: item.id,
                      label: item.active ? item.name : `${item.name} (не активен)`,
                    }))}
                    value={selectedPrinterId}
                    onChange={pickPrinter}
                    disabled={printersUnavailable}
                    loading={printersLoading}
                    disabledLabel="Принтеры недоступны"
                  />
                </div>
              </div>

              <DishesModifiers
                editing={editing}
                modGroups={modGroups}
                setModGroups={setModGroups}
                modLoading={modLoading}
                modError={modError}
                saveModGroup={saveModGroup}
                removeModGroup={removeModGroup}
              />
            </div>

            <div className="staff-form__footer">
              <button type="button" disabled={saving} onClick={closeDrawer}>Отменить</button>
              <button type="submit" disabled={saving}>{saving ? "Сохранение…" : editing ? "Сохранить" : "Добавить"}</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
