// Статические справочники и конфигурация раздела «Номенклатура» OWNER.
// Вынесено из NomenclaturePage.jsx (FE-07B) без изменения значений.
// Raw/Semi и Inventory Core остаются отложенными — конфиги ниже описывают
// только отложенные разделы и каталог блюд.
export const ACTIVE = "Активно";
export const ARCHIVED = "Архив";

export const dishColumnOptions = [
  { key: "photo", label: "Фото", width: 74 },
  { key: "name", label: "Название", width: 184 },
  { key: "type", label: "Тип", width: 118 },
  { key: "unit", label: "Ед. изм", width: 82 },
  { key: "cost", label: "Себестоимость", width: 132 },
  { key: "price", label: "Цена", width: 112 },
  { key: "menu", label: "Меню", width: 146 },
  { key: "subcategory", label: "Подкатегория", width: 152 },
  { key: "printer", label: "Принтер", width: 162 },
  { key: "recipe", label: "Рецепты", width: 134 },
  { key: "stock", label: "Остаток", width: 116 },
  { key: "auto", label: "Авто", width: 70 },
  { key: "set", label: "Сет", width: 70 },
  { key: "sort", label: "Сорт", width: 78 },
  { key: "actions", label: "Действия", width: 104 },
];

export const defaultDishColumnVisibility = Object.fromEntries(dishColumnOptions.map((column) => [column.key, true]));

export const photoLibrary = {
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
