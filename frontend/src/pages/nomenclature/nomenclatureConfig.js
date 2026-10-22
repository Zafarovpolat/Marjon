// Статические справочники и конфигурация раздела «Номенклатура» OWNER.
// Вынесено из NomenclaturePage.jsx (FE-07B) без изменения значений.
// Raw/Semi и Inventory Core остаются отложенными — конфиги ниже описывают
// только отложенные разделы и каталог блюд.
export const ACTIVE = "Активно";
export const ARCHIVED = "Архив";

export const dishColumnOptions = [
  { key: "sort", label: "Сорт", width: 56 },
  { key: "photo", label: "Фото", width: 72 },
  { key: "name", label: "Название", width: 190 },
  { key: "unit", label: "Ед. изм", width: 80 },
  // V28 — категория блюда в таблице (реальный category_name из API).
  { key: "category", label: "Категория", width: 140 },
  { key: "cost", label: "Себестоимость", width: 130 },
  { key: "price", label: "Цена", width: 130 },
  { key: "printer", label: "Принтер", width: 170 },
  { key: "recipe", label: "Рецепты", width: 120 },
  { key: "actions", label: "Действия", width: 96 },
];

// V21: Тип/Меню/Подкатегория/Рецепты убраны только из презентации таблицы
// (backend-поля, API-ответ и форма дровера не тронуты).
// V24: точный порядок СОРТ→ФОТО→НАЗВАНИЕ→ЕД.ИЗМ→СЕБЕСТ→ЦЕНА→ПРИНТЕР→
// ОСТАТОК→АВТО→СЕТ→ДЕЙСТВИЯ. Название зафиксировано 220 (не 308/auto):
// гибкая, но не oversized — убирает мёртвую зону между Названием и Ед.изм.
// Сумма 1154, header/body — одна fixed-геометрия.
// V25: ОСТАТОК заменён на РЕЦЕПТЫ (реальный ingredients_count backend).
// Рецепты 120 — компактно под "Рецепт (12 шт)"; Название 230 (+10 баланс).
// Сумма 1204, та же одна fixed-геометрия.
// V26: средние ЕД.ИЗМ/СЕБЕСТ/ЦЕНА/ПРИНТЕР в CSS — width:auto (остаток ширины
// делится между ними); числа ниже остались плановыми минимумами для
// tableMinWidth (горизонтальный скролл на узких экранах).
// V27: ФОТО 64→72 (воздух после фото сдвигает НАЗВАНИЕ вправо),
// НАЗВАНИЕ 230→190 (блок ЕД.ИЗМ/СЕБЕСТ/ЦЕНА едет влево, контент всех ячеек
// центрирован — см. dishes.css). Сумма 1172, та же одна fixed-геометрия.

export const defaultDishColumnVisibility = Object.fromEntries(dishColumnOptions.map((column) => [column.key, true]));

export const nomenclatureConfigs = {
  raw: {
    title: "Продукты",
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
export const emptyDishForm = { name: "", sort: "1", type: "Блюда", unitId: "", unit: "", cost: "", price: "", menu: "", subcategory: "", printer: "", recipe: "Рецепт (0 шт)", stock: "-", active: true, auto: false, set: false, category: "", chef: "" };

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
