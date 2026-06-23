import { useMemo, useState } from "react";
import Icon from "../components/Icon";

const ACTIVE = "Активно";
const ARCHIVED = "Архив";

const dishStats = [
  { label: "Кол-во товаров", value: "52", rows: [["Реализация", "10"], ["Блюда", "42"]], icon: "bi-basket", tone: "blue" },
  { label: "Рецепт", value: "42", rows: [["С рецептом", "10"], ["Без рецепта", "32"]], icon: "bi-journal-bookmark", tone: "green" },
  { label: "ИКПУ", value: "52", rows: [["Заполнен", "0"], ["Не заполнен", "52"]], icon: "bi-card-heading", tone: "cyan" },
  { label: "Себестоимость", value: "52", rows: [["Заполнен", "0"], ["Не заполнен", "52"]], icon: "bi-cash-coin", tone: "orange" },
  { label: "Принтер", value: "52", rows: [["Подключен", "49"], ["Не подключен", "3"]], icon: "bi-printer", tone: "violet" },
];

const initialDishRows = [
  { id: 1, name: "Billiard", sort: "1", type: "Блюда", unit: "шт", cost: "0 UZS", price: "0", menu: "Billiard", printer: "", recipe: "Рецепт (0 шт)", stock: "-", auto: false, set: false, category: "Игры", chef: "Бар", photo: "" },
  { id: 2, name: "Tuxum qoyurma", sort: "1", type: "Блюда", unit: "шт", cost: "1 801 UZS", price: "10000", menu: "БИРИНЧИ ТАОМ", printer: "Кухня 192.168.1.51", recipe: "Рецепт (3 шт)", stock: "-", auto: true, set: false, category: "Горячие блюда", chef: "Повар 1", photo: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=120&q=80" },
  { id: 3, name: "Moxito", sort: "10", type: "Реализация", unit: "шт", cost: "0 UZS", price: "15000", menu: "ИЧИМЛИКЛАР", printer: "БАР 192.168.1.36", recipe: "Рецепт (0 шт)", stock: "0 (100)-", auto: null, set: null, category: "Напитки", chef: "Бар", photo: "https://images.unsplash.com/photo-1551538827-9c037cb4f32a?auto=format&fit=crop&w=120&q=80" },
  { id: 4, name: "Cocktail", sort: "11", type: "Реализация", unit: "шт", cost: "0 UZS", price: "25000", menu: "ИЧИМЛИКЛАР", printer: "БАР 192.168.1.36", recipe: "Рецепт (0 шт)", stock: "0 (100)-", auto: null, set: null, category: "Напитки", chef: "Бар", photo: "https://images.unsplash.com/photo-1570598912132-0ba1dc952b7d?auto=format&fit=crop&w=120&q=80" },
  { id: 5, name: "Suv (bez gaz) 0.5", sort: "12", type: "Реализация", unit: "шт", cost: "0 UZS", price: "5000", menu: "ИЧИМЛИКЛАР", printer: "БАР 192.168.1.36", recipe: "Рецепт (0 шт)", stock: "0 (100)-", auto: null, set: null, category: "Напитки", chef: "Бар", photo: "" },
  { id: 6, name: "Suv (bez gaz) 1", sort: "13", type: "Реализация", unit: "шт", cost: "0 UZS", price: "8000", menu: "ИЧИМЛИКЛАР", printer: "БАР 192.168.1.36", recipe: "Рецепт (0 шт)", stock: "0 (100)-", auto: null, set: null, category: "Напитки", chef: "Бар", photo: "" },
  { id: 7, name: "Suv (bez gaz) 1.5", sort: "14", type: "Реализация", unit: "шт", cost: "0 UZS", price: "12000", menu: "ИЧИМЛИКЛАР", printer: "БАР 192.168.1.36", recipe: "Рецепт (0 шт)", stock: "0 (100)-", auto: null, set: null, category: "Напитки", chef: "Бар", photo: "" },
  { id: 8, name: "OCARD", sort: "15", type: "Реализация", unit: "шт", cost: "0 UZS", price: "18000", menu: "ИЧИМЛИКЛАР", printer: "БАР 192.168.1.36", recipe: "Рецепт (0 шт)", stock: "0 (100)-", auto: null, set: null, category: "Напитки", chef: "Бар", photo: "" },
  { id: 9, name: "Боржоми", sort: "16", type: "Реализация", unit: "шт", cost: "0 UZS", price: "20000", menu: "ИЧИМЛИКЛАР", printer: "БАР 192.168.1.36", recipe: "Рецепт (0 шт)", stock: "0 (100)-", auto: null, set: null, category: "Напитки", chef: "Бар", photo: "" },
  { id: 10, name: "Чорток", sort: "17", type: "Реализация", unit: "шт", cost: "0 UZS", price: "12000", menu: "ИЧИМЛИКЛАР", printer: "БАР 192.168.1.36", recipe: "Рецепт (0 шт)", stock: "0 (100)-", auto: null, set: null, category: "Напитки", chef: "Бар", photo: "" },
  { id: 11, name: "Сок", sort: "18", type: "Реализация", unit: "шт", cost: "0 UZS", price: "18000", menu: "ИЧИМЛИКЛАР", printer: "БАР 192.168.1.36", recipe: "Рецепт (0 шт)", stock: "0 (100)-", auto: null, set: null, category: "Напитки", chef: "Бар", photo: "" },
  { id: 12, name: "Сузма", sort: "19", type: "Блюда", unit: "порция", cost: "4 500 UZS", price: "10000", menu: "САЛАТЛАР", printer: "Кухня 192.168.1.51", recipe: "Рецепт (2 шт)", stock: "-", auto: true, set: false, category: "Салаты", chef: "Повар 2", photo: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=120&q=80" },
];

const photoLibrary = {
  cola: [
    "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1581636625402-29b2a704ef13?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=260&q=80",
  ],
  plov: [
    "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1617692855027-33b14f061079?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=260&q=80",
  ],
  mastava: [
    "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1604152135912-04a022e23696?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1594756202469-9ff9799b2e4e?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?auto=format&fit=crop&w=260&q=80",
  ],
  lagman: [
    "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1626804475297-41608ea09aeb?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1516684669134-de6f7c473a2a?auto=format&fit=crop&w=260&q=80",
  ],
  drinks: [
    "https://images.unsplash.com/photo-1551538827-9c037cb4f32a?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1570598912132-0ba1dc952b7d?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=260&q=80",
  ],
  dishes: [
    "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=260&q=80",
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=260&q=80",
  ],
};

const fallbackConfigs = {
  raw: {
    title: "Сырьё",
    action: "Добавить +",
    columns: ["Название", "Категория", "Ед. изм", "Остаток", "Мин. остаток", "Цена закупки", "Поставщик", "Статус", "Действия"],
    rows: [
      ["Говядина", "Мясо", "кг", "24.5", "5", "78 000 UZS", "Bozor", ACTIVE],
      ["Рис", "Крупы", "кг", "55", "10", "15 000 UZS", "Поставщик 1", ACTIVE],
      ["Лук", "Овощи", "кг", "12", "5", "4 000 UZS", "Bozor", ACTIVE],
    ],
  },
  semi: {
    title: "Полуфабрикаты",
    action: "Добавить +",
    columns: ["Название", "Категория", "Ед. изм", "Себестоимость", "Состав", "Статус", "Действия"],
    rows: [
      ["Фарш говяжий", "Заготовки", "кг", "65 000 UZS", "3 ингредиента", ACTIVE],
      ["Тесто", "Заготовки", "кг", "12 000 UZS", "4 ингредиента", ACTIVE],
    ],
  },
};

function NomenclaturePage({ type = "dishes" }) {
  if (type === "dishes") return <DishesCatalogPage />;
  return <SimpleNomenclaturePage config={fallbackConfigs[type] || fallbackConfigs.raw} />;
}

function DishesCatalogPage() {
  const [rows, setRows] = useState(initialDishRows);
  const [draftFilters, setDraftFilters] = useState({ search: "", chef: "", category: "" });
  const [filters, setFilters] = useState(draftFilters);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [photoPicker, setPhotoPicker] = useState(null);
  const [photoSearch, setPhotoSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", sort: "1", type: "Блюда", unit: "шт", cost: "0 UZS", price: "", menu: "", printer: "", recipe: "Рецепт (0 шт)", stock: "-", auto: false, set: false, category: "", chef: "" });

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const searchMatch = !filters.search || row.name.toLowerCase().includes(filters.search.toLowerCase());
      const chefMatch = !filters.chef || row.chef === filters.chef;
      const categoryMatch = !filters.category || row.category === filters.category;
      return searchMatch && chefMatch && categoryMatch;
    });
  }, [rows, filters]);

  const updateRow = (id, key, value) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  };

  const openDrawer = (row = null) => {
    setEditing(row);
    setForm(row || { name: "", sort: "1", type: "Блюда", unit: "шт", cost: "0 UZS", price: "", menu: "", printer: "", recipe: "Рецепт (0 шт)", stock: "-", auto: false, set: false, category: "", chef: "" });
    setDrawerOpen(true);
  };

  const saveDish = () => {
    if (editing) {
      setRows((prev) => prev.map((row) => (row.id === editing.id ? { ...row, ...form } : row)));
    } else {
      setRows((prev) => [{ ...form, id: Date.now(), photo: "" }, ...prev]);
    }
    setDrawerOpen(false);
  };

  const archiveDish = (id) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const openPhotoPicker = (row) => {
    setPhotoPicker(row);
    setPhotoSearch(row.name);
  };

  const selectPhoto = (photo) => {
    if (!photoPicker) return;
    updateRow(photoPicker.id, "photo", photo);
    setPhotoPicker(null);
    setPhotoSearch("");
  };

  return (
    <section className="nomenclature-page dish-catalog-page">
      <div className="dish-catalog-card">
        <div className="dish-catalog-header">
          <div className="report-title-group">
            <span className="report-accent-bar" />
            <div>
              <h1>Блюда</h1>
              <p>Каталог блюд и товаров с быстрым редактированием цен, сортировки и настроек.</p>
            </div>
          </div>
          <div className="dish-header-actions">
            <button type="button" className="btn-soft">
              <Icon name="bi-box-arrow-in-down" /> Импорт Excel
            </button>
            <button type="button" className="btn-primary" onClick={() => openDrawer()}>
              <Icon name="bi-plus" /> Добавить
            </button>
          </div>
        </div>

        <div className="dish-stat-grid">
          {dishStats.map((stat) => (
            <article className={`dish-stat-card dish-stat-${stat.tone}`} key={stat.label}>
              <div className="dish-stat-top">
                <span>{stat.label}</span>
                <Icon name={stat.icon} size={20} />
              </div>
              <strong>{stat.value}</strong>
              <div className="dish-stat-lines">
                {stat.rows.map(([label, value]) => (
                  <span key={label}>
                    <em>{label}</em>
                    <b>{value}</b>
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="dish-toolbar">
          <label className="dish-search">
            <Icon name="bi-search" />
            <input
              value={draftFilters.search}
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Поиск"
            />
          </label>
          <select value={draftFilters.chef} onChange={(event) => setDraftFilters((prev) => ({ ...prev, chef: event.target.value }))}>
            <option value="">Выберите повара</option>
            <option value="Повар 1">Повар 1</option>
            <option value="Повар 2">Повар 2</option>
            <option value="Бар">Бар</option>
          </select>
          <select value={draftFilters.category} onChange={(event) => setDraftFilters((prev) => ({ ...prev, category: event.target.value }))}>
            <option value="">Категория</option>
            <option value="Горячие блюда">Горячие блюда</option>
            <option value="Напитки">Напитки</option>
            <option value="Салаты">Салаты</option>
            <option value="Игры">Игры</option>
          </select>
          <button type="button" className="btn-outline-primary" onClick={() => setFilters(draftFilters)}>
            <Icon name="bi-funnel" /> Фильтровать
          </button>
          <button
            type="button"
            className="btn-outline-danger"
            onClick={() => {
              const empty = { search: "", chef: "", category: "" };
              setDraftFilters(empty);
              setFilters(empty);
            }}
          >
            Очистить
          </button>
          <button type="button" className="btn-primary dish-toolbar-add" onClick={() => openDrawer()}>
            Добавить
          </button>
          <button type="button" className="dish-more-btn" aria-label="Ещё">
            <Icon name="bi-three-dots" />
          </button>
        </div>

        <div className="dish-grid-wrap">
          <table className="dish-grid-table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Выбрать все" /></th>
                <th>Действия</th>
                <th>Фото</th>
                <th>Название</th>
                <th>Сорт</th>
                <th>Тип</th>
                <th>Ед. изм</th>
                <th>Себестоимость</th>
                <th>Цена</th>
                <th>Меню</th>
                <th>Принтер</th>
                <th>Рецепты</th>
                <th>Остаток</th>
                <th>Авто</th>
                <th>Сет</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td><input type="checkbox" aria-label={`Выбрать ${row.name}`} /></td>
                  <td>
                    <div className="dish-row-actions">
                      <button type="button" onClick={() => openDrawer(row)} aria-label="Редактировать">
                        <Icon name="bi-pencil" size={15} />
                      </button>
                      <button type="button" className="danger" onClick={() => archiveDish(row.id)} aria-label="Удалить">
                        <Icon name="bi-trash3" size={15} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <button type="button" className="dish-photo-button" onClick={() => openPhotoPicker(row)} aria-label={`Выбрать фото для ${row.name}`}>
                      {row.photo ? (
                        <img className="dish-photo" src={row.photo} alt={row.name} />
                      ) : (
                        <span className="dish-photo-placeholder"><Icon name="bi-image" /></span>
                      )}
                    </button>
                  </td>
                  <td><button type="button" className="dish-name-link">{row.name}</button></td>
                  <td>
                    <input className="dish-mini-input" value={row.sort} onChange={(event) => updateRow(row.id, "sort", event.target.value)} />
                  </td>
                  <td><span className={`dish-type-pill ${row.type === "Реализация" ? "realization" : ""}`}>{row.type}</span></td>
                  <td>{row.unit}</td>
                  <td>{row.cost}</td>
                  <td>
                    <input className="dish-price-input" value={row.price} onChange={(event) => updateRow(row.id, "price", event.target.value)} />
                  </td>
                  <td><span className="dish-menu-pill">{row.menu}</span></td>
                  <td className="dish-printer-cell">{row.printer || "-"}</td>
                  <td><button type="button" className="dish-recipe-link">{row.recipe}</button></td>
                  <td>
                    <button type="button" className="dish-stock-box">
                      {row.stock}
                      {row.stock !== "-" && <Icon name="bi-arrow-repeat" size={13} />}
                    </button>
                  </td>
                  <td>{renderToggle(row.auto, () => updateRow(row.id, "auto", !row.auto))}</td>
                  <td>{renderToggle(row.set, () => updateRow(row.id, "set", !row.set))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <div className="nomenclature-drawer dish-drawer">
          <div className="nomenclature-drawer-card">
            <div className="nomenclature-drawer-header">
              <h2>{editing ? "Редактировать блюдо" : "Добавить блюдо"}</h2>
              <button type="button" onClick={() => setDrawerOpen(false)}><Icon name="bi-x-lg" /></button>
            </div>
            <div className="nomenclature-form">
              {["name", "sort", "price", "cost", "menu", "printer", "category", "chef"].map((field) => (
                <label key={field}>
                  <span>{fieldLabels[field]}</span>
                  <input value={form[field] || ""} onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))} />
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
                <select value={form.unit} onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}>
                  <option>шт</option>
                  <option>порция</option>
                  <option>кг</option>
                  <option>л</option>
                </select>
              </label>
            </div>
            <div className="nomenclature-drawer-footer">
              <button type="button" className="btn-soft" onClick={() => setDrawerOpen(false)}>Отмена</button>
              <button type="button" className="btn-primary" onClick={saveDish}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {photoPicker && (
        <div className="dish-photo-modal" role="dialog" aria-modal="true">
          <div className="dish-photo-modal__backdrop" onClick={() => setPhotoPicker(null)} />
          <div className="dish-photo-modal__card">
            <div className="dish-photo-modal__header">
              <div>
                <span>База фото</span>
                <h2>{photoPicker.name}</h2>
              </div>
              <button type="button" onClick={() => setPhotoPicker(null)} aria-label="Закрыть">
                <Icon name="bi-x-lg" />
              </button>
            </div>
            <label className="dish-photo-search">
              <Icon name="bi-search" />
              <input
                value={photoSearch}
                onChange={(event) => setPhotoSearch(event.target.value)}
                placeholder="Напишите: плов, ош, cola, мастава..."
                autoFocus
              />
            </label>
            <div className="dish-photo-modal__grid">
              {getPhotoOptions(photoPicker, photoSearch).map((photo) => (
                <button type="button" key={photo} className="dish-photo-option" onClick={() => selectPhoto(photo)}>
                  <img src={photo} alt={photoPicker.name} />
                  {photoPicker.photo === photo && <span><Icon name="bi-check2" /> Выбрано</span>}
                </button>
              ))}
            </div>
            <div className="dish-photo-modal__footer">
              <button type="button" className="btn-soft" onClick={() => setPhotoPicker(null)}>Отмена</button>
              <button type="button" className="btn-outline-danger" onClick={() => selectPhoto("")}>Убрать фото</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function getPhotoOptions(row, query = "") {
  const normalized = `${query} ${row.name}`.toLowerCase();
  if (normalized.includes("cola") || normalized.includes("кока") || normalized.includes("oc")) return photoLibrary.cola;
  if (normalized.includes("плов") || normalized.includes("osh") || normalized.includes("ош")) return photoLibrary.plov;
  if (normalized.includes("мастава") || normalized.includes("mastava")) return photoLibrary.mastava;
  if (normalized.includes("лагман") || normalized.includes("lagman")) return photoLibrary.lagman;
  if (row.category === "Напитки" || normalized.includes("suv") || normalized.includes("moxito") || normalized.includes("cocktail") || normalized.includes("сок")) return photoLibrary.drinks;
  return photoLibrary.dishes;
}

function renderToggle(value, onClick) {
  if (value === null) return <span className="dish-toggle-empty">-</span>;
  return (
    <button type="button" className={`dish-toggle ${value ? "is-on" : ""}`} onClick={onClick} aria-pressed={value}>
      <span />
    </button>
  );
}

const fieldLabels = {
  name: "Название",
  sort: "Сорт",
  price: "Цена",
  cost: "Себестоимость",
  menu: "Меню",
  printer: "Принтер",
  category: "Категория",
  chef: "Повар",
};

function SimpleNomenclaturePage({ config }) {
  const [query, setQuery] = useState("");
  const filteredRows = config.rows.filter((row) => row.join(" ").toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="nomenclature-page">
      <div className="nomenclature-card">
        <div className="nomenclature-header">
          <div className="report-title-group">
            <span className="report-accent-bar" />
            <div>
              <h1>{config.title}</h1>
              <p>Справочник склада в Marjon-дизайне.</p>
            </div>
          </div>
          <div className="nomenclature-actions">
            <button type="button" className="btn-primary"><Icon name="bi-plus" /> {config.action}</button>
          </div>
        </div>
        <div className="nomenclature-filters">
          <label>
            <Icon name="bi-search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск" />
          </label>
        </div>
        <div className="nomenclature-table-wrapper">
          <table className="nomenclature-table">
            <thead>
              <tr>{config.columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) => (
                    <td key={`${row[0]}-${cell}`}>
                      {index === row.length - 1 ? <span className="nomenclature-status-badge">{cell}</span> : cell}
                    </td>
                  ))}
                  <td>
                    <div className="dish-row-actions">
                      <button type="button"><Icon name="bi-pencil" size={15} /></button>
                      <button type="button" className="danger"><Icon name="bi-trash3" size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default NomenclaturePage;
