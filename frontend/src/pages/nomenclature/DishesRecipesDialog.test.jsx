import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import DishesRecipesDialog from "./DishesRecipesDialog";

vi.mock("../../api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
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

const dish = (overrides = {}) => ({
  id: "dish-1",
  name: "Лаваш",
  cost: "12 000 сум",
  price: "40 000 сум",
  recipeIngredients: [],
  ...overrides,
});

const ingredients = [
  { id: "ing-meat", name: "Мясо", unit: "кг", category: "Мясо", is_active: true },
  { id: "ing-onion", name: "Лук", unit: "кг", category: "Овощи", is_active: true },
  { id: "ing-old", name: "Старое", unit: "шт", category: "Другое", is_active: false },
];

const warehouses = [
  { id: "wh-1", name: "Главный", is_main: true },
  { id: "wh-2", name: "Бар", is_main: false },
];

const rawCats = [
  { id: "c1", name: "Мясо", slug: "raw-meat" },
  { id: "c2", name: "Овощи", slug: "raw-veg" },
];

function mockApis() {
  api.get.mockImplementation((url, config) => {
    if (String(url).includes("/inventory/ingredients")) return Promise.resolve({ data: ingredients });
    if (String(url).includes("/warehouse/list")) return Promise.resolve({ data: warehouses });
    if (String(url).includes("/inventory/categories")) return Promise.resolve({ data: rawCats });
    if (String(url).includes("/inventory/stock")) {
      const wid = config?.params?.warehouse_id;
      if (wid === "wh-2") return Promise.resolve({ data: [{ ingredient_id: "ing-onion" }] });
      return Promise.resolve({ data: ingredients.map((i) => ({ ingredient_id: i.id })) });
    }
    return Promise.resolve({ data: [] });
  });
  api.patch.mockImplementation((url, body) => Promise.resolve({
    data: {
      id: "dish-1",
      ingredients: (body?.ingredients || []).map((line) => ({
        ingredient_id: line.ingredient_id,
        ingredient_name: ingredients.find((i) => i.id === line.ingredient_id)?.name || "",
        quantity: line.quantity,
        unit: ingredients.find((i) => i.id === line.ingredient_id)?.unit || "",
      })),
      ingredients_count: (body?.ingredients || []).length,
    },
  }));
}

function renderDialog(props = {}) {
  const onSave = vi.fn(async (dishId, lines) => {
    const { data } = await api.patch(`/inventory/products/${dishId}`, { ingredients: lines });
    return { id: dishId, recipeIngredients: data.ingredients, ingredientsCount: data.ingredients_count };
  });
  const onClose = vi.fn();
  const onChanged = vi.fn();
  const view = render(
    <DishesRecipesDialog dish={dish()} onClose={onClose} onSave={onSave} onChanged={onChanged} {...props} />
  );
  return { onSave, onClose, onChanged, ...view };
}

describe("Dishes recipes composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApis();
  });

  it("loads raw products and shows empty composition", async () => {
    renderDialog();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/inventory/ingredients"));
    expect(await screen.findByText("Состав рецепта пока пуст")).toBeInTheDocument();
  });

  it("adds meat 200g to lavash recipe through canonical PATCH", async () => {
    const { onSave, onChanged } = renderDialog();
    await screen.findByText("Состав рецепта пока пуст");
    fireEvent.click(screen.getByRole("combobox", { name: "Сырьё" }));
    fireEvent.click(await screen.findByRole("option", { name: "Мясо" }));
    fireEvent.change(screen.getByLabelText("Количество"), { target: { value: "0,2" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/inventory/products/dish-1",
      { ingredients: [{ ingredient_id: "ing-meat", quantity: 0.2, warehouse_id: null }] },
    ));
    expect(await within(screen.getByRole("table", { name: "Состав рецепта" })).findByText("Мясо")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it("lists only active raw products", async () => {
    renderDialog();
    await screen.findByText("Состав рецепта пока пуст");
    fireEvent.click(screen.getByRole("combobox", { name: "Сырьё" }));
    expect(await screen.findByRole("option", { name: "Лук" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Старое/ })).toBeNull();
  });

  it("warehouse filter limits products to stocked ones", async () => {
    renderDialog();
    await screen.findByText("Состав рецепта пока пуст");
    fireEvent.click(screen.getByRole("combobox", { name: "Склад" }));
    fireEvent.click(await screen.findByRole("option", { name: "Бар" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Сырьё" }));
    expect(await screen.findByRole("option", { name: "Лук" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Мясо/ })).toBeNull();
  });

  it("category filter limits products to the category", async () => {
    renderDialog();
    await screen.findByText("Состав рецепта пока пуст");
    expect(screen.queryByRole("combobox", { name: "Тип" })).toBeNull();
    fireEvent.click(screen.getByRole("combobox", { name: "Категория" }));
    fireEvent.click(await screen.findByRole("option", { name: "Овощи" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Сырьё" }));
    expect(await screen.findByRole("option", { name: "Лук" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Мясо/ })).toBeNull();
  });

  it("parent category includes subcategory products", async () => {
    api.get.mockImplementation((url, config) => {
      if (String(url).includes("/inventory/ingredients")) {
        return Promise.resolve({ data: [
          ...ingredients,
          { id: "ing-green", name: "Укроп", unit: "кг", category: "Зелень", is_active: true },
        ] });
      }
      if (String(url).includes("/inventory/categories")) {
        return Promise.resolve({ data: [
          ...rawCats,
          { id: "c3", name: "Зелень", slug: "raw-green", parent_id: "c2" },
        ] });
      }
      if (String(url).includes("/warehouse/list")) return Promise.resolve({ data: warehouses });
      if (String(url).includes("/inventory/stock")) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    renderDialog();
    await screen.findByText("Состав рецепта пока пуст");
    fireEvent.click(screen.getByRole("combobox", { name: "Категория" }));
    expect(await screen.findByRole("option", { name: "Зелень (Овощи)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Овощи" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Сырьё" }));
    expect(await screen.findByRole("option", { name: "Лук" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Укроп" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Мясо/ })).toBeNull();
  });

  it("table shows warehouse before product with working delete icon", async () => {
    renderDialog({
      dish: dish({
        recipeIngredients: [
          { ingredient_id: "ing-meat", ingredient_name: "Мясо", quantity: 0.2, unit: "кг" },
        ],
      }),
    });
    const table = await screen.findByRole("table", { name: "Состав рецепта" });
    const headers = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["№", "Склад", "Сырьё", "Кол-во", "Действия"]);
    expect(within(table).getByRole("button", { name: "Удалить ингредиент" })).toBeInTheDocument();
  });

  it("rejects zero quantity without API call", async () => {
    renderDialog();
    await screen.findByText("Состав рецепта пока пуст");
    fireEvent.click(screen.getByRole("combobox", { name: "Сырьё" }));
    fireEvent.click(await screen.findByRole("option", { name: "Лук" }));
    fireEvent.change(screen.getByLabelText("Количество"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Добавить" })).toBeDisabled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("removes a recipe line through canonical PATCH", async () => {
    renderDialog({
      dish: dish({
        recipeIngredients: [
          { ingredient_id: "ing-meat", ingredient_name: "Мясо", quantity: 0.2, unit: "кг" },
          { ingredient_id: "ing-onion", ingredient_name: "Лук", quantity: 0.05, unit: "кг" },
        ],
      }),
    });
    await screen.findByText("Мясо");
    const row = screen.getByText("Лук").closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Удалить ингредиент" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/inventory/products/dish-1",
      { ingredients: [{ ingredient_id: "ing-meat", quantity: 0.2, warehouse_id: null }] },
    ));
    await waitFor(() => expect(screen.queryByText("Лук")).toBeNull());
  });

  it("saves line warehouse and shows it in the table", async () => {
    renderDialog({
      dish: dish({
        recipeIngredients: [
          { ingredient_id: "ing-meat", ingredient_name: "Мясо", quantity: 0.2, unit: "кг", warehouse_id: "wh-2" },
        ],
      }),
    });
    const table = await screen.findByRole("table", { name: "Состав рецепта" });
    expect(await within(table).findByText("Бар")).toBeInTheDocument();
    expect(await within(table).findByText("Мясо")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Сырьё" }));
    fireEvent.click(await screen.findByRole("option", { name: "Лук" }));
    fireEvent.change(screen.getByLabelText("Количество"), { target: { value: "0,1" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/inventory/products/dish-1",
      { ingredients: [
        { ingredient_id: "ing-meat", quantity: 0.2, warehouse_id: "wh-2" },
        { ingredient_id: "ing-onion", quantity: 0.1, warehouse_id: null },
      ] },
    ));
  });

  it("shows backend error without losing lines", async () => {
    api.patch.mockRejectedValueOnce({ response: { data: { detail: "No stock" } } });
    renderDialog({
      dish: dish({
        recipeIngredients: [
          { ingredient_id: "ing-meat", ingredient_name: "Мясо", quantity: 0.2, unit: "кг" },
        ],
      }),
    });
    await screen.findByText("Мясо");
    const row = screen.getByText("Мясо").closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Удалить ингредиент" }));
    expect(await screen.findByText("No stock")).toBeInTheDocument();
    expect(screen.getByText("Мясо")).toBeInTheDocument();
  });

  it("edits quantity through center panel without deleting first", async () => {
    renderDialog({
      dish: dish({
        recipeIngredients: [
          { ingredient_id: "ing-meat", ingredient_name: "Мясо", quantity: 0.2, unit: "кг" },
        ],
      }),
    });
    await within(screen.getByRole("table", { name: "Состав рецепта" })).findByText("Мясо");
    const row = within(screen.getByRole("table", { name: "Состав рецепта" })).getByText("Мясо").closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Изменить ингредиент" }));
    // Строка на месте до сейва (без мгновенного удаления).
    expect(within(screen.getByRole("table", { name: "Состав рецепта" })).getByText("Мясо")).toBeInTheDocument();
    expect(screen.getByLabelText("Количество ингредиента")).toHaveValue("0,2");
    fireEvent.change(screen.getByLabelText("Количество ингредиента"), { target: { value: "0,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/inventory/products/dish-1",
      { ingredients: [{ ingredient_id: "ing-meat", quantity: 0.5, warehouse_id: null }] },
    ));
  });

  it("shows selected raw unit at the end of quantity field", async () => {
    renderDialog();
    await screen.findByText("Состав рецепта пока пуст");
    const qtyUnit = () => screen.getByLabelText("Количество")
      .closest("label").querySelector(".dish-recipes-qty-unit");
    expect(qtyUnit()).toBeNull();
    fireEvent.click(screen.getByRole("combobox", { name: "Сырьё" }));
    fireEvent.click(await screen.findByRole("option", { name: "Мясо" }));
    expect(qtyUnit()).toHaveTextContent("кг");
  });

  it("shows header photo placeholder and metrics", async () => {
    renderDialog();
    await screen.findByText("Состав рецепта пока пуст");
    expect(screen.getByRole("button", { name: "Фото блюда отсутствует" })).toBeInTheDocument();
    expect(screen.getByText("Себестоимость")).toBeInTheDocument();
    expect(screen.getByText("Цена продажи")).toBeInTheDocument();
  });

  it("returns from photo viewer to recipes on Escape", async () => {
    const { onClose } = renderDialog({ dish: dish({ photo: "http://img/lavash.jpg" }) });
    await screen.findByText("Состав рецепта пока пуст");
    fireEvent.click(screen.getByRole("button", { name: "Открыть фото Лаваш" }));
    expect(await screen.findByRole("dialog", { name: "Фото «Лаваш»" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Рецепты" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Фото «Лаваш»" })).toBeNull());
  });
});
