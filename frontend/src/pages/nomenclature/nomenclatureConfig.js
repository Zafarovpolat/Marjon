// Статические справочники и конфигурация раздела «Номенклатура» OWNER.
// Вынесено из NomenclaturePage.jsx (FE-07B) без изменения значений.
// Raw/Semi и Inventory Core остаются отложенными — конфиги ниже описывают
// только отложенные разделы и каталог блюд.
export const ACTIVE = "Активно";
export const ARCHIVED = "Архив";

export const dishColumnOptions = [
  { key: "photo", label: "Фото", width: 72 },
  { key: "name", label: "Название", width: 308 },
  { key: "unit", label: "Ед. изм", width: 94 },
  { key: "cost", label: "Себестоимость", width: 136 },
  { key: "price", label: "Цена", width: 136 },
  { key: "printer", label: "Принтер", width: 154 },
  { key: "stock", label: "Остаток", width: 88 },
  { key: "auto", label: "Авто", width: 72 },
  { key: "set", label: "Сет", width: 72 },
  { key: "sort", label: "Сорт", width: 72 },
  { key: "actions", label: "Действия", width: 90 },
];

// V21: Тип/Меню/Подкатегория/Рецепты убраны только из презентации таблицы
// (backend-поля, API-ответ и форма дровера не тронуты).
// V22: пропорции под мокап — Название забирает максимум, утилитарные
// колонки компактны, действия фиксированы (сумма 1294).

export const defaultDishColumnVisibility = Object.fromEntries(dishColumnOptions.map((column) => [column.key, true]));

export const nomenclatureConfigs = {
  raw: {
    title: "Сырьё",
    action: "Добавить +",
    columns: ["Название", "Категория", "Подкатегория", "Ед. изм", "Остаток", "Мин. остаток", "Цена закупки", "Поставщик", "Статус", "Действия"],
  },
  semi: {
    title: "Полуфабрикаты",
    action: "Добавить +",
    columns: ["Название", "Категория", "Подкатегория", "Ед. изм", "Себестоимость", "Состав", "Статус", "Действия"],
  },
};

// Значения по умолчанию для формы блюда (создание нового товара).
export const emptyDishForm = { name: "", sort: "1", type: "Блюда", unit: "шт", cost: "0 UZS", price: "", menu: "", subcategory: "", printer: "", recipe: "Рецепт (0 шт)", stock: "-", auto: false, set: false, category: "", chef: "" };

export const fieldLabels = {
  name: "Название",
  sort: "Сорт",
  price: "Цена",
  cost: "Себестоимость",
  menu: "Меню",
  subcategory: "Подкатегория",
  printer: "Принтер",
  category: "Категория",
  chef: "Повар",
};
