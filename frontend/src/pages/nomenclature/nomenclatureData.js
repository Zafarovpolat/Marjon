// Чистые преобразования и справочные функции раздела «Блюда» OWNER.
// Вынесено из NomenclaturePage.jsx (FE-07B) без изменения логики: маппинг
// backend-ответа, парсинг чисел, сборка payload и подбор фото сохранены 1:1.
import { photoLibrary } from "./nomenclatureConfig";

export function matchesDishStatFilter(row, filterKey) {
  switch (filterKey) {
    case "blue:0":
      return row.auto === null;
    case "blue:1":
      return row.auto !== null;
    case "green:0":
      return !String(row.recipe || "").includes("(0");
    case "green:1":
      return String(row.recipe || "").includes("(0");
    case "cyan:0":
      return false;
    case "cyan:1":
      return true;
    case "orange:0":
      return row.cost !== "0 UZS";
    case "orange:1":
      return row.cost === "0 UZS";
    case "violet:0":
      return Boolean(row.printer);
    case "violet:1":
      return !row.printer;
    default:
      return true;
  }
}

export function mapNomenclatureProduct(item) {
  return {
    id: item.id,
    name: item.name || "",
    sort: item.sort_order != null ? String(item.sort_order) : "—",
    type: item.product_type === "sale" ? "Реализация" : "Блюда",
    unit: item.unit || "—",
    cost: item.cost_price != null ? `${Number(item.cost_price).toLocaleString("ru-RU")} UZS` : "—",
    price: item.price != null ? String(item.price) : "—",
    menu: item.category_name || "",
    subcategory: item.subcategory_name || "",
    printer: item.printer_name || "",
    recipe: `Рецепт (${item.ingredients_count ?? 0} шт)`,
    stock: item.stock != null ? String(item.stock) : "-",
    auto: null,
    set: null,
    category: item.category_name || "",
    chef: "",
    photo: item.image_url || "",
  };
}

export function parseNomenclatureMoney(value, fallback = null) {
  const input = String(value ?? "").trim().replace(/\s*UZS$/i, "").trim();
  if (!input) return fallback;
  if (!/^(?:\d+|\d{1,3}(?:[  ]\d{3})+)(?:[.,]\d{1,2})?$/.test(input)) return fallback;
  const parsed = Number(input.replace(/[  ]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseNomenclatureSort(value) {
  const input = String(value ?? "").trim();
  return /^[1-9]\d*$/.test(input) ? Number(input) : Number.NaN;
}

export function buildNomenclatureProductPayload(form, { isUpdate = false } = {}) {
  const payload = {
    name: String(form.name || "").trim(),
    sort_order: parseNomenclatureSort(form.sort),
    product_type: form.type === "Реализация" ? "sale" : "dish",
    price: parseNomenclatureMoney(form.price, 0),
  };
  const costPrice = parseNomenclatureMoney(form.cost);
  if (costPrice !== null) payload.cost_price = costPrice;
  if (!isUpdate) payload.unit = form.unit || "шт";
  return payload;
}

export function getPhotoOptions(row, query = "") {
  const normalized = `${query} ${row.name}`.toLowerCase();
  if (normalized.includes("cola") || normalized.includes("кока") || normalized.includes("oc")) return photoLibrary.cola;
  if (normalized.includes("плов") || normalized.includes("osh") || normalized.includes("ош")) return photoLibrary.plov;
  if (normalized.includes("мастава") || normalized.includes("mastava")) return photoLibrary.mastava;
  if (normalized.includes("лагман") || normalized.includes("lagman")) return photoLibrary.lagman;
  if (row.category === "Напитки" || normalized.includes("suv") || normalized.includes("moxito") || normalized.includes("cocktail") || normalized.includes("сок")) return photoLibrary.drinks;
  return photoLibrary.dishes;
}

// Демо-строки блюд (использовались для превью каталога до backend-контракта).
// Сохранено 1:1 из NomenclaturePage.jsx; в рантайме сейчас не подключено.
export function demoDishRows() {
  return [
    {
      id: "demo-dish-plov",
      name: "Плов",
      sort: "1",
      type: "Блюда",
      unit: "порция",
      cost: "18 000 UZS",
      price: "45000",
      menu: "Горячие блюда",
      subcategory: "Основные блюда",
      printer: "Кухня",
      recipe: "Рецепт (8 шт)",
      stock: "42",
      auto: true,
      set: false,
      category: "Горячие блюда",
      chef: "Повар 1",
      photo: "",
    },
    {
      id: "demo-dish-shashlik",
      name: "Шашлык",
      sort: "2",
      type: "Блюда",
      unit: "порция",
      cost: "32 000 UZS",
      price: "60000",
      menu: "Гриль",
      subcategory: "Мясные блюда",
      printer: "Мангал",
      recipe: "Рецепт (6 шт)",
      stock: "36",
      auto: true,
      set: false,
      category: "Гриль",
      chef: "Повар 2",
      photo: "",
    },
    {
      id: "demo-dish-lagman",
      name: "Лагман",
      sort: "3",
      type: "Блюда",
      unit: "порция",
      cost: "16 000 UZS",
      price: "35000",
      menu: "Горячие блюда",
      subcategory: "Супы",
      printer: "Кухня",
      recipe: "Рецепт (7 шт)",
      stock: "31",
      auto: true,
      set: false,
      category: "Горячие блюда",
      chef: "Повар 1",
      photo: "",
    },
    {
      id: "demo-dish-salad",
      name: "Салат микс",
      sort: "4",
      type: "Блюда",
      unit: "порция",
      cost: "11 000 UZS",
      price: "30000",
      menu: "Салаты",
      subcategory: "Свежие салаты",
      printer: "Холодный цех",
      recipe: "Рецепт (5 шт)",
      stock: "24",
      auto: true,
      set: false,
      category: "Салаты",
      chef: "Повар 2",
      photo: "",
    },
    {
      id: "demo-sale-ayran",
      name: "Айран",
      sort: "5",
      type: "Реализация",
      unit: "шт",
      cost: "5 000 UZS",
      price: "10000",
      menu: "Напитки",
      subcategory: "Кисломолочные",
      printer: "Бар",
      recipe: "Рецепт (2 шт)",
      stock: "54",
      auto: false,
      set: false,
      category: "Напитки",
      chef: "Бар",
      photo: "",
    },
  ];
}

