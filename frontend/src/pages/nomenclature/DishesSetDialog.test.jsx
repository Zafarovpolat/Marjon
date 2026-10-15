import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import DishesSetDialog from "./DishesSetDialog";

vi.mock("../../api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  formatMoney: (value) => String(value ?? ""),
  formatNumber: (value) => String(value ?? ""),
}));

vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));
vi.mock("../../components/ReportEmptyState", () => ({
  default: ({ title }) => <div><strong>{title}</strong></div>,
}));

vi.mock("../../hooks/useAnchoredDialogMotion", () => ({
  useAnchoredDialogMotion: () => ({
    dialogRef: { current: null },
    motionClassName: "",
    motionStyle: undefined,
    requestClose: vi.fn(),
    handleAnimationEnd: vi.fn(),
  }),
}));

const setDish = { id: "set-1", name: "Комбо - 1", price: "69 000 сум", cost: "0 сум" };

const dishes = [
  { id: "dish-1", name: "Лаваш", unit: "шт", price: "40000", cost_price: "9000", category_name: "Выпечка", is_active: true, product_type: "dish", allow_in_sets: true },
  { id: "dish-2", name: "Кола", unit: "шт", price: "10000", category_name: "Напитки", is_active: true, product_type: "dish", allow_in_sets: true },
  { id: "sale-1", name: "Айран", unit: "шт", price: "10000", category_name: "Напитки", is_active: true, product_type: "sale", allow_in_sets: true },
  { id: "dish-9", name: "Суп", unit: "шт", price: "12000", category_name: "Выпечка", is_active: true, product_type: "dish", allow_in_sets: false },
];

const dishCats = [
  { id: "c1", name: "Выпечка", slug: "dish-bakery", is_active: true },
  { id: "c2", name: "Напитки", slug: "sales-drinks", is_active: true },
];

function mockSetApis({ lines = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (String(url).includes("/set-items")) return Promise.resolve({ data: lines });
    if (String(url).includes("/inventory/products")) return Promise.resolve({ data: dishes });
    if (String(url).includes("/inventory/categories")) return Promise.resolve({ data: dishCats });
    return Promise.resolve({ data: [] });
  });
  api.put.mockImplementation((url, body) => Promise.resolve({
    data: (body || []).map((line) => ({ ...line })),
  }));
}

function renderDialog(props = {}) {
  const onSave = vi.fn(async (dishId, lines) => {
    const { data } = await api.put(`/inventory/products/${dishId}/set-items`, lines);
    return data;
  });
  const onClose = vi.fn();
  const view = render(
    <DishesSetDialog dish={setDish} onClose={onClose} onSave={onSave} {...props} />
  );
  return { onSave, onClose, ...view };
}

describe("Dishes set composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetApis();
  });

  it("loads lines and shows set header with live total", async () => {
    mockSetApis({
      lines: [{ product_id: "dish-1", quantity: 1, price: 40000 }],
    });
    renderDialog();
    expect(await screen.findByRole("heading", { name: "Сет" })).toBeInTheDocument();
    expect(screen.getByText("Комбо - 1")).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Состав сета" });
    expect(within(table).getByText("Лаваш")).toBeInTheDocument();
    expect(table.textContent).toMatch(/40[\s\u00a0\u202f]*000 сум/);
  });

  it("adds a dish through canonical PUT with quantity and price", async () => {
    const { onSave } = renderDialog();
    await screen.findByText("Состав сета пока пуст");
    fireEvent.click(screen.getByRole("combobox", { name: "Блюдо" }));
    fireEvent.click(await screen.findByRole("option", { name: "Лаваш" }));
    // Цена подтянулась из блюда, сгруппированная.
    expect(screen.getByLabelText("Цена в сете")).toHaveValue("40 000");
    fireEvent.change(screen.getByLabelText("Количество"), { target: { value: "2" } });
    // Живая сумма строки — белый инпут.
    expect(screen.getByLabelText("Сумма в сете")).toHaveValue("80 000");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      "/inventory/products/set-1/set-items",
      [{ product_id: "dish-1", quantity: 2, price: 40000 }],
    ));
    const table = screen.getByRole("table", { name: "Состав сета" });
    expect(await within(table).findByText("Лаваш")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalled();
  });

  it("offers only active dishes, never sale products or the set itself", async () => {
    renderDialog();
    await screen.findByText("Состав сета пока пуст");
    fireEvent.click(screen.getByRole("combobox", { name: "Блюдо" }));
    expect(await screen.findByRole("option", { name: "Лаваш" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Айран/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Комбо/ })).toBeNull();
  });

  it("shows only dishes with enabled СЕТ toggle, hides toggled-off ones", async () => {
    renderDialog();
    await screen.findByText("Состав сета пока пуст");
    fireEvent.click(screen.getByRole("combobox", { name: "Блюдо" }));
    expect(await screen.findByRole("option", { name: "Лаваш" })).toBeInTheDocument();
    // Суп активен, но тумблер колонки выключен — в Товаре его нет.
    expect(screen.queryByRole("option", { name: /Суп/ })).toBeNull();
  });

  it("switches component list by Тип: Товар shows sale goods, hides dishes", async () => {
    renderDialog();
    await screen.findByText("Состав сета пока пуст");
    expect(screen.getByRole("combobox", { name: "Тип" })).toHaveTextContent("Блюдо");
    // Дефолт: поле и колонка называются Блюдо.
    expect(screen.getByRole("combobox", { name: "Блюдо" })).toBeInTheDocument();
    expect(screen.getByText("БЛЮДО")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Тип" }));
    fireEvent.click(await screen.findByRole("option", { name: "Товар" }));
    // Поле переименовалось в Товар; шапка таблицы — ТОВАР.
    expect(screen.getByRole("combobox", { name: "Товар" })).toBeInTheDocument();
    expect(screen.getByText("ТОВАР")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Товар" }));
    expect(await screen.findByRole("option", { name: "Айран" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Лаваш/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Кола/ })).toBeNull();
    // Категории тоже по своему дереву: Напитки есть, Выпечки нет.
    fireEvent.click(screen.getByRole("combobox", { name: "Категория" }));
    expect(await screen.findByRole("option", { name: "Напитки" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Выпечка/ })).toBeNull();
  });

  it("shows header with sale price, cost and set total", async () => {
    renderDialog();
    await screen.findByText("Состав сета пока пуст");
    expect(screen.getByText("Цена продажи")).toBeInTheDocument();
    expect(screen.getByText("Себестоимость")).toBeInTheDocument();
    expect(screen.getByText("Сумма набора")).toBeInTheDocument();
    expect(screen.getByText("69 000 сум")).toBeInTheDocument();
    expect(screen.getByText("0 сум")).toBeInTheDocument();
  });

  it("derives categories from loaded goods, not slugs", async () => {
    renderDialog();
    await screen.findByText("Состав сета пока пуст");
    fireEvent.click(screen.getByRole("combobox", { name: "Категория" }));
    expect(await screen.findByRole("option", { name: "Выпечка" })).toBeInTheDocument();
    // Напитки — дерево товаров (sales-слаг): в Блюдах её нет.
    expect(screen.queryByRole("option", { name: "Напитки" })).toBeNull();
  });

  it("derives price from edited sum", async () => {
    renderDialog();
    await screen.findByText("Состав сета пока пуст");
    fireEvent.click(screen.getByRole("combobox", { name: "Блюдо" }));
    fireEvent.click(await screen.findByRole("option", { name: "Лаваш" }));
    fireEvent.change(screen.getByLabelText("Количество"), { target: { value: "2" } });
    expect(screen.getByLabelText("Сумма в сете")).toHaveValue("80 000");
    fireEvent.change(screen.getByLabelText("Сумма в сете"), { target: { value: "46 000" } });
    expect(screen.getByLabelText("Цена в сете")).toHaveValue("23 000");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      "/inventory/products/set-1/set-items",
      [{ product_id: "dish-1", quantity: 2, price: 23000 }],
    ));
  });

  it("trims trailing zeros in table quantities and prices", async () => {
    mockSetApis({
      lines: [{ product_id: "dish-1", quantity: 2.0, price: 23000.0 }],
    });
    renderDialog();
    const table = await screen.findByRole("table", { name: "Состав сета" });
    expect(within(table).getByText("2 шт")).toBeInTheDocument();
    expect(within(table).getByText("23 000 сум")).toBeInTheDocument();
    expect(within(table).getByText("46 000 сум")).toBeInTheDocument();
  });

  it("shows selected dish unit at the end of quantity field", async () => {
    renderDialog({ rows: [{ id: "dish-1", name: "Лаваш", unit: "Кг" }] });
    await screen.findByText("Состав сета пока пуст");
    const qtyUnit = () => screen.getByLabelText("Количество")
      .closest("label").querySelector(".dish-recipes-qty-unit");
    expect(qtyUnit()).toBeNull();
    fireEvent.click(screen.getByRole("combobox", { name: "Блюдо" }));
    fireEvent.click(await screen.findByRole("option", { name: "Лаваш" }));
    // Ед.изм из строк каталога (Кг), а не сырой дефолт «шт».
    expect(qtyUnit()).toHaveTextContent("Кг");
  });

  it("hides goods of foreign subtree in dishes", async () => {
    renderDialog();
    await screen.findByText("Состав сета пока пуст");
    // Кола — блюдо в категории из дерева товаров: в Блюдах её нет.
    fireEvent.click(screen.getByRole("combobox", { name: "Блюдо" }));
    expect(await screen.findByRole("option", { name: "Лаваш" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Кола/ })).toBeNull();
  });

  it("computes header cost from lines", async () => {
    mockSetApis({
      lines: [{ product_id: "dish-1", quantity: 2, price: 40000 }],
    });
    renderDialog();
    await screen.findByRole("table", { name: "Состав сета" });
    // 2 лаваша × 9 000 себестоимости.
    expect(screen.getByText("18 000 сум")).toBeInTheDocument();
  });

  it("edits quantity and sum through center panel", async () => {
    mockSetApis({
      lines: [{ product_id: "dish-1", quantity: 2, price: 40000 }],
    });
    renderDialog();
    const table = await screen.findByRole("table", { name: "Состав сета" });
    const row = within(table).getByText("Лаваш").closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Изменить позицию" }));
    // Панель с предзаполнением, строка жива до сейва.
    expect(await screen.findByRole("dialog", { name: "Изменить позицию" })).toBeInTheDocument();
    expect(screen.getByLabelText("Количество позиции")).toHaveValue("2");
    expect(screen.getByLabelText("Сумма позиции")).toHaveValue("80 000");
    fireEvent.change(screen.getByLabelText("Количество позиции"), { target: { value: "3" } });
    expect(screen.getByLabelText("Сумма позиции")).toHaveValue("120 000");
    fireEvent.change(screen.getByLabelText("Сумма позиции"), { target: { value: "90 000" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith(
      "/inventory/products/set-1/set-items",
      [{ product_id: "dish-1", quantity: 3, price: 30000 }],
    ));
  });

  it("shows header photo placeholder", async () => {
    renderDialog();
    await screen.findByText("Состав сета пока пуст");
    expect(screen.getByRole("button", { name: "Фото блюда отсутствует" })).toBeInTheDocument();
  });

  it("returns from photo viewer to set on Escape with animation", async () => {
    const { onClose } = renderDialog({ dish: { ...setDish, photo: "http://img/set.jpg" } });
    await screen.findByText("Состав сета пока пуст");
    fireEvent.click(screen.getByRole("button", { name: "Открыть фото Комбо - 1" }));
    expect(await screen.findByRole("dialog", { name: "Фото «Комбо - 1»" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    // Слой уходит с анимацией, сет остаётся открыт.
    expect(document.querySelector(".dish-photo-viewer-layer.is-closing")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Сет" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Фото «Комбо - 1»" })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes edit panel on Escape without touching lines", async () => {
    mockSetApis({
      lines: [{ product_id: "dish-1", quantity: 2, price: 40000 }],
    });
    renderDialog();
    const table = await screen.findByRole("table", { name: "Состав сета" });
    const row = within(table).getByText("Лаваш").closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Изменить позицию" }));
    expect(await screen.findByRole("dialog", { name: "Изменить позицию" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Изменить позицию" })).toBeNull());
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Сет" })).toBeInTheDocument();
  });

  it("removes a line through canonical PUT", async () => {
    mockSetApis({
      lines: [{ product_id: "dish-1", quantity: 1, price: 40000 }],
    });
    renderDialog();
    const table = await screen.findByRole("table", { name: "Состав сета" });
    await within(table).findByText("Лаваш");
    const row = within(table).getByText("Лаваш").closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Удалить позицию" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      "/inventory/products/set-1/set-items",
      [],
    ));
  });

  it("keeps no focus box on table set/recipe links", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const focus = css.match(/\.dish-catalog-page \.dish-grid-table \.dish-recipe-link:focus\s*\{[^}]*\}/)?.[0] || "";
    expect(focus).toMatch(/outline:\s*none/);
    const visible = css.match(/\.dish-catalog-page \.dish-grid-table \.dish-recipe-link:focus-visible\s*\{[^}]*\}/)?.[0] || "";
    expect(visible).toMatch(/outline:\s*none/);
    expect(visible).not.toMatch(/outline:\s*2px/);
    expect(visible).not.toMatch(/text-decoration:\s*underline/);
  });
  it("bounds set table with inner scroll", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    expect(css).toMatch(/\.dish-set-dialog \.dish-recipes-table-scroll\s*\{[^}]*max-height/);
    expect(css).toMatch(/\.dish-set-dialog \.dish-recipes-table thead th\s*\{[^}]*position:\s*sticky/);
  });

  it("keeps nested shades inside dialog with animated edit panel", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    expect(css).toMatch(/\.dish-photo-viewer-layer--boxed/);
    expect(css).toMatch(/\.dish-edit-overlay--boxed/);
    expect(css).toMatch(/\.dish-edit-overlay\.is-closing/);
    expect(css).toMatch(/@keyframes dish-edit-card-in/);
    expect(css).toMatch(/\.dish-photo-viewer-layer\s*\{[^}]*place-items:\s*start center/);
  });

  it("keeps set skeleton in data-row geometry to avoid open jerk", () => {
    const jsx = readFileSync(`${process.cwd()}/src/pages/nomenclature/DishesSetDialog.jsx`, "utf8");
    expect(jsx).toMatch(/dish-set-skeleton-cell/);
    expect(jsx).toMatch(/dish-set-skeleton-bar/);
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const skeleton = css.match(/\.dish-set-dialog \.dish-recipes-table td\.dish-set-skeleton-cell\s*\{[^}]*\}/)?.[0] || "";
    expect(skeleton).toMatch(/padding:\s*15px 16px/);
    const dataCell = css.match(/\.dish-recipes-dialog \.dish-recipes-table td\s*\{[^}]*\}/)?.[0] || "";
    expect(dataCell).toMatch(/padding:\s*15px 16px/);
  });

  it("shows empty-shaped skeleton while loading an empty set", async () => {
    mockSetApis({ lines: [] });
    renderDialog();
    // Первый кадр — призрак иллюстрации, а не схлопнувшийся ряд.
    expect(document.querySelector(".dish-set-skeleton-cell--empty")).not.toBeNull();
    expect(screen.queryByText("Состав сета пока пуст")).toBeNull();
    // Подтверждённая пустота — та же рамка, без прыжка диалога.
    await screen.findByText("Состав сета пока пуст");
    expect(document.querySelector(".dish-set-skeleton-cell--empty")).toBeNull();
  });
  it("keeps dialog photo zoom fullscreen like table viewer, dimmed and flicker-free", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    // Единая тень 0.4 для всех вьюверов фото.
    expect(css).toMatch(/\.dish-photo-viewer-overlay\s*\{[^}]*0\.4\)/);
    // Уход с fill-mode: опоздавший таймер не возвращает кадр на миг.
    expect(css).toMatch(/\.dish-photo-viewer-layer\.is-closing\s*\{[^}]*both/);
    expect(css).toMatch(/\.dish-photo-viewer-layer\.is-closing \.dish-photo-viewer\s*\{[^}]*both/);
    // Кнопки открытия фото без тёмного фокус-квадрата после Esc.
    expect(css).toMatch(/\.dish-photo-button:focus-visible[\s\S]*?outline:\s*none/);
    expect(css).toMatch(/\.dish-head-photo:focus-visible[\s\S]*?box-shadow:\s*none/);
    // Зум диалогов — полноэкранным порталом в body (геометрия таблицы),
    // а не boxed-слоем внутри окна: без белых боков и обрезки низа.
    for (const file of ["DishesSetDialog.jsx", "DishesRecipesDialog.jsx"]) {
      const jsx = readFileSync(`${process.cwd()}/src/pages/nomenclature/${file}`, "utf8");
      expect(jsx).toMatch(/zoomPhoto && dish\.photo \? createPortal\(/);
      expect(jsx).not.toMatch(/dish-photo-viewer-layer--boxed/);
    }
    // Фото всегда спереди панели: слой выше любого бэкдропа диалогов.
    expect(css).toMatch(/\.dish-photo-viewer-layer\s*\{[^}]*z-index:\s*100000/);
  });
  it("keeps edit panel flicker-free with no backdrop dim inside dialogs", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    // Уход с fill-mode: опоздавший таймер не возвращает панель на миг.
    expect(css).toMatch(/\.dish-edit-overlay\.is-closing\s*\{[^}]*both/);
    expect(css).toMatch(/\.dish-edit-overlay\.is-closing \.dish-edit-card\s*\{[^}]*both/);
    // Вложенный слой — лёгкая дымка (задняя панель чуть темнеет),
    // у карточки усиленная собственная тень.
    expect(css).toMatch(/\.dish-edit-overlay--boxed\s*\{[^}]*0\.18\)/);
    expect(css).toMatch(/\.dish-edit-card\s*\{[^}]*box-shadow:\s*0 36px 100px/);
  });
  it("wires Сет button through NomenclaturePage with matching prop name", () => {
    const page = readFileSync(`${process.cwd()}/src/pages/NomenclaturePage.jsx`, "utf8");
    expect(page).toMatch(/onOpenSet=\{/);
    const table = readFileSync(`${process.cwd()}/src/pages/nomenclature/DishesTable.jsx`, "utf8");
    expect(table).toMatch(/onOpenSet \? \(/);
  });

  it("clear button resets the form, not the list", async () => {
    mockSetApis({
      lines: [{ product_id: "dish-1", quantity: 1, price: 40000 }],
    });
    renderDialog();
    await screen.findByRole("table", { name: "Состав сета" });
    fireEvent.click(screen.getByRole("combobox", { name: "Блюдо" }));
    fireEvent.click(await screen.findByRole("option", { name: "Лаваш" }));
    fireEvent.click(screen.getByRole("button", { name: "Очистить" }));
    expect(screen.getByLabelText("Количество")).toHaveValue("");
    expect(api.put).not.toHaveBeenCalled();
    const table = screen.getByRole("table", { name: "Состав сета" });
    expect(within(table).getByText("Лаваш")).toBeInTheDocument();
  });
});
