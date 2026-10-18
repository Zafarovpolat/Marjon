import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import NomenclaturePage from "../NomenclaturePage";
import { navItems } from "../../components/sidebar/navConfig";

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

const ingredient = (overrides = {}) => ({
  id: "ing-uuid",
  company_id: "company-uuid",
  name: "Мука",
  unit: "кг",
  category: "Бакалея",
  supplier_name: "Поставщик 1",
  is_active: true,
  stock: 10,
  min_stock: 2,
  purchase_price: 15000,
  avg_quantity: 100,
  deficit_threshold: 20,
  ...overrides,
});

// V47: нормы остатка обязательны — заполнение двух полей drawer.
function fillNorms(avg = "100", deficit = "20") {
  fireEvent.change(screen.getByPlaceholderText("Среднее количество"), { target: { value: avg } });
  fireEvent.change(screen.getByPlaceholderText("Порог дефицита"), { target: { value: deficit } });
}

const rawCategories = [
  { id: "cat-1", name: "Бакалея", slug: "raw-bakaleya" },
  { id: "cat-2", name: "Молочка", slug: "raw-molochka" },
];

function mockRawApis({ ingredients = [], categories = rawCategories, products = [], units = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (String(url).includes("/inventory/ingredients")) return Promise.resolve({ data: ingredients });
    if (String(url).includes("/inventory/products")) return Promise.resolve({ data: products });
    if (String(url).includes("/inventory/categories")) return Promise.resolve({ data: categories });
    if (String(url) === "/units") return Promise.resolve({ data: units });
    return Promise.resolve({ data: [] });
  });
  api.patch.mockImplementation((url, body) => {
    if (String(url).includes("/inventory/products/")) {
      const id = String(url).split("/").pop();
      const current = products.find((row) => row.id === id) || {};
      return Promise.resolve({
        data: { ...current, ...(body || {}), ingredients_count: (body?.ingredients || []).length },
      });
    }
    const id = String(url).split("/").pop();
    const current = ingredients.find((row) => row.id === id);
    return Promise.resolve({ data: { ...(current || {}), ...(body || {}) } });
  });
  api.post.mockImplementation(() => Promise.resolve({ data: ingredient({ id: "new-id" }) }));
}

describe("RAW V2 Dishes visual family", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. header matches Dishes visual structure", async () => {
    mockRawApis({ ingredients: [] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/inventory/ingredients",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    const page = container.querySelector(".raw-materials-page");
    expect(page).not.toBeNull();
    expect(page.classList.contains("dish-catalog-page")).toBe(true);
    expect(page.classList.contains("owner-report-view")).toBe(true);
    expect(container.querySelector(".dish-catalog-card")).not.toBeNull();
    const header = container.querySelector(".settings-header.dish-catalog-header");
    expect(header).not.toBeNull();
    expect(header.querySelector(".settings-accent-bar")).not.toBeNull();
    expect(screen.getByText("Склад")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Продукты" })).toBeInTheDocument();
  });

  it("2. Active/Archived switch present with animated indicator", async () => {
    mockRawApis({ ingredients: [] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    expect(screen.getByRole("tablist", { name: "Статус продуктов" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Активные" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Архивированные" })).toBeInTheDocument();
    expect(container.querySelector(".dish-status-tabs")).not.toBeNull();
    expect(container.querySelector(".dish-status-tabs__indicator")).not.toBeNull();
  });

  it("3. correct default active tab", async () => {
    mockRawApis({
      ingredients: [
        ingredient({ id: "a1", name: "Мука", is_active: true }),
        ingredient({ id: "a2", name: "Старая крупа", is_active: false }),
      ],
    });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Мука");
    const activeTab = screen.getByRole("tab", { name: "Активные" });
    expect(activeTab).toHaveClass("is-active");
    expect(activeTab).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".raw-grid-table").textContent).toContain("Мука");
    expect(container.querySelector(".raw-grid-table").textContent).not.toContain("Старая крупа");
  });

  it("4. real active/archived filtering from canonical is_active", async () => {
    mockRawApis({
      ingredients: [
        ingredient({ id: "a1", name: "Мука", is_active: true }),
        ingredient({ id: "a2", name: "Старая крупа", is_active: false }),
      ],
    });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Мука");
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await waitFor(() => expect(container.querySelector(".raw-grid-table").textContent).toContain("Старая крупа"));
    expect(container.querySelector(".raw-grid-table").textContent).not.toContain("Мука");
    expect(screen.getByRole("tab", { name: "Архивированные" })).toHaveClass("is-active");
    const ingredientCalls = api.get.mock.calls.filter(([url]) => String(url).includes("/inventory/ingredients"));
    expect(ingredientCalls).toHaveLength(1);
  });

  it("5. filter button expands panel without supplier", async () => {
    mockRawApis({ ingredients: [] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    const toggle = container.querySelector(".dishes-filter-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".raw-filter-collapse.is-open")).not.toBeNull();
    expect(screen.getByPlaceholderText("Поиск продуктов")).toBeInTheDocument();
    expect(screen.getByLabelText("Категория продуктов")).toBeInTheDocument();
    expect(screen.queryByLabelText("Поставщик")).toBeNull();
  });

  it("6. filter button collapses panel and keeps draft", async () => {
    mockRawApis({ ingredients: [] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    const toggle = container.querySelector(".dishes-filter-toggle");
    fireEvent.click(toggle);
    const search = screen.getByPlaceholderText("Поиск продуктов");
    fireEvent.change(search, { target: { value: "черновик" } });
    fireEvent.click(toggle);
    expect(container.querySelector(".raw-filter-collapse.is-open")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByPlaceholderText("Поиск продуктов")).toHaveValue("черновик");
  });

  it("7. search and category filters apply through canonical fetch", async () => {
    mockRawApis({
      ingredients: [
        ingredient({ id: "a1", name: "Мука", category: "Бакалея", is_active: true }),
        ingredient({ id: "a2", name: "Молоко", category: "Молочка", is_active: true }),
      ],
    });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Мука");
    fireEvent.click(container.querySelector(".dishes-filter-toggle"));
    fireEvent.change(screen.getByPlaceholderText("Поиск продуктов"), { target: { value: "молоко" } });
    const apply = container.querySelectorAll(".report-filter-apply");
    fireEvent.click(apply[apply.length - 1]);
    await waitFor(() => expect(container.querySelector(".raw-grid-table").textContent).toContain("Молоко"));
    expect(container.querySelector(".raw-grid-table").textContent).not.toContain("Мука");
  });

  it("8. apply/clear behavior resets to full list", async () => {
    mockRawApis({
      ingredients: [
        ingredient({ id: "a1", name: "Мука", is_active: true }),
        ingredient({ id: "a2", name: "Молоко", is_active: true }),
      ],
    });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Мука");
    fireEvent.click(container.querySelector(".dishes-filter-toggle"));
    fireEvent.change(screen.getByPlaceholderText("Поиск продуктов"), { target: { value: "молоко" } });
    const apply = container.querySelectorAll(".report-filter-apply");
    fireEvent.click(apply[apply.length - 1]);
    await waitFor(() => expect(container.querySelector(".raw-grid-table").textContent).not.toContain("Мука"));
    const clear = container.querySelectorAll(".report-filter-clear");
    fireEvent.click(clear[clear.length - 1]);
    await waitFor(() => expect(container.querySelector(".raw-grid-table").textContent).toContain("Мука"));
    expect(container.querySelector(".raw-grid-table").textContent).toContain("Молоко");
  });

  it("9. add drawer follows dish family without photo, PLU or supplier", async () => {
    mockRawApis({ ingredients: [] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    const add = screen.getByRole("button", { name: "Добавить" });
    expect(add).toHaveClass("dish-add-button");
    expect(add.textContent).not.toMatch(/\+\s*\+/);
    fireEvent.click(add);
    expect(await screen.findByText("Добавить продукты")).toBeInTheDocument();
    expect(screen.getByText("Новые продукты")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Напр. Помидор")).toBeInTheDocument();
    const drawer = document.body.querySelector(".staff-modal.dish-drawer");
    expect(drawer).not.toBeNull();
    expect(drawer.querySelector(".staff-form--cashier")).not.toBeNull();
    // Dish parity: custom single-selects (not native selects), status in
    // dish-form-switches, footer Отменить/Добавить.
    expect(drawer.querySelector(".dish-form-switches")).not.toBeNull();
    expect(drawer.querySelector("select")).toBeNull();
    // Шаблон — только карточка: никаких остатков/цен закупки в drawer нет.
    // Нормы остатка — в карточке: среднее количество + порог дефицита
    // (между Категорией и Типом потери), оба обязательны.
    expect(screen.getByPlaceholderText("Среднее количество")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Порог дефицита")).toBeInTheDocument();
    expect(screen.queryByText(/Шаблон продукта/)).toBeNull();
    // Норма потерь: тип + значение (значение disabled, пока тип не выбран).
    expect(screen.getByRole("combobox", { name: "Тип потери" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Значение потери")).toBeDisabled();
    expect(drawer.textContent).not.toMatch(/PLU/i);
    expect(drawer.textContent).not.toMatch(/Поставщик/);
    expect(drawer.querySelector('input[type="file"]')).toBeNull();
    const footerButtons = [...drawer.querySelectorAll(".staff-form__footer button")].map((b) => b.textContent);
    expect(footerButtons).toEqual(expect.arrayContaining(["Отменить", "Добавить"]));
  });

  it("9m. norms are required and sent with the create payload", async () => {
    mockRawApis({
      ingredients: [],
      units: [{ id: "u1", short_name: "кг", status: true }],
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByText("Добавить продукты");
    const drawer = document.body.querySelector(".staff-modal.dish-drawer");
    expect(drawer).not.toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Напр. Помидор"), { target: { value: "Мука" } });
    fireEvent.click(within(drawer).getByRole("combobox", { name: "Ед. изм" }));
    fireEvent.click(await screen.findByRole("option", { name: "кг" }));
    const submit = within(drawer).getByRole("button", { name: "Добавить" });
    // Обе нормы обязательны: пустые → честная ошибка, без POST.
    fireEvent.click(submit);
    expect(await within(drawer).findByText("Укажите среднее количество.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Среднее количество"), { target: { value: "100" } });
    fireEvent.click(submit);
    expect(await within(drawer).findByText("Укажите порог дефицита.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Порог дефицита"), { target: { value: "20" } });
    fireEvent.click(submit);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/inventory/ingredients",
      expect.objectContaining({ name: "Мука", unit: "кг", avg_quantity: 100, deficit_threshold: 20 }),
    ));
  });

  it("10. raw table follows ZimZim structure without photo", async () => {
    mockRawApis({ ingredients: [ingredient()] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Мука");
    const headers = [...container.querySelectorAll(".raw-grid-table thead th")].map((th) => th.textContent);
    expect(headers).toEqual(["№", "Название", "Категория", "Ед. изм", "Блюда", "Статус", "Действия"]);
    const tableText = container.querySelector(".raw-grid-table").textContent;
    for (const absent of ["Остаток", "Цена закупки", "Поставщик", "Фото"]) {
      expect(tableText).not.toContain(absent);
    }
    expect(container.querySelector(".raw-grid-table tbody tr td")).toHaveTextContent("1");
  });

  it("10b. edit drawer has no stock summary — template card only", async () => {
    mockRawApis({ ingredients: [ingredient({ id: "a1", name: "Мука" })] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Мука");
    fireEvent.click(within(container.querySelector(".raw-grid-table tbody tr")).getByRole("button", { name: "Редактировать" }));
    expect(await screen.findByText("Редактировать продукты")).toBeInTheDocument();
    // Остаток/мин. остаток/цена закупки живут в движениях, не в шаблоне.
    expect(document.body.querySelector(".raw-stock-summary")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Цена закупки/);
    expect(screen.queryByText(/Шаблон продукта/)).toBeNull();
    expect(screen.getByRole("combobox", { name: "Тип потери" })).toBeInTheDocument();
  });

  it("10c. dishes usage badge mirrors recipes pattern", async () => {
    mockRawApis({
      ingredients: [ingredient({ id: "a1", name: "Мука" }), ingredient({ id: "a2", name: "Сахар" })],
      products: [
        { id: "dish-1", name: "Лаваш", is_active: true, ingredients: [{ ingredient_id: "a1", quantity: 0.2 }], ingredients_count: 1 },
        { id: "dish-2", name: "Плов", is_active: true, ingredients: [{ ingredient_id: "other", quantity: 1 }], ingredients_count: 1 },
      ],
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Мука");
    expect(screen.getByRole("button", { name: "Блюда (1 шт)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Блюда" })).toBeInTheDocument();
  });

  it("10d. dishes dialog has stored Warehouse select, no Type/Product, and saves usage", async () => {
    mockRawApis({
      ingredients: [ingredient({ id: "a1", name: "Мука", unit: "кг" })],
      products: [
        { id: "dish-1", name: "Лаваш", is_active: true, ingredients: [{ ingredient_id: "a1", quantity: 0.2 }], ingredients_count: 1 },
        { id: "dish-2", name: "Плов", is_active: true, ingredients: [], ingredients_count: 0 },
      ],
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Мука");
    fireEvent.click(screen.getByRole("button", { name: "Блюда (1 шт)" }));
    expect(await screen.findByRole("heading", { name: "Блюда" })).toBeInTheDocument();
    expect(screen.getByText("Лаваш")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Тип" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Склад" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Товар" })).toBeNull();
    fireEvent.click(screen.getByRole("combobox", { name: "Блюдо" }));
    fireEvent.click(await screen.findByRole("option", { name: "Плов" }));
    fireEvent.change(screen.getByLabelText("Количество"), { target: { value: "0,5" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Добавить" }).pop());
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/inventory/products/dish-2",
      { ingredients: [{ ingredient_id: "a1", quantity: 0.5, warehouse_id: null }] },
    ));
    const usageTable = screen.getByRole("table", { name: "Блюда из продуктов" });
    expect(await within(usageTable).findByText("Плов")).toBeInTheDocument();
  });

  it("10e. unit select uses canonical settings units, not hardcoded list", async () => {
    mockRawApis({
      ingredients: [],
      units: [
        { id: "u1", name: "Килограмм", short_name: "Кг", status: true, sort: 1 },
        { id: "u2", name: "Штука", short_name: "Шт", status: true, sort: 2 },
      ],
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByText("Добавить продукты");
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/units"));
    fireEvent.click(screen.getByRole("combobox", { name: "Ед. изм" }));
    expect(await screen.findByRole("option", { name: "Килограмм (Кг)" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Штука (Шт)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "упак" })).toBeNull();
    expect(screen.queryByRole("option", { name: "порция" })).toBeNull();
  });

  it("10f. unit select is honestly disabled when units fail", async () => {
    mockRawApis({ ingredients: [] });
    api.get.mockImplementation((url) => {
      if (String(url) === "/units") return Promise.reject({ response: { data: { detail: "Нет связи" } } });
      if (String(url).includes("/inventory/ingredients")) return Promise.resolve({ data: [] });
      if (String(url).includes("/inventory/products")) return Promise.resolve({ data: [] });
      if (String(url).includes("/inventory/categories")) return Promise.resolve({ data: rawCategories });
      return Promise.resolve({ data: [] });
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByText("Добавить продукты");
    const trigger = await screen.findByRole("combobox", { name: "Ед. изм" });
    await waitFor(() => expect(trigger).toBeDisabled());
    // Никакого фейкового преселекта: пусто + честный disabled-текст.
    expect(trigger.textContent).toMatch(/Единицы измерения недоступны/);
    expect(trigger.textContent).not.toMatch(/не активна/);
  });

  it("10g. unit placeholder by default, save requires explicit unit", async () => {
    mockRawApis({
      ingredients: [],
      units: [{ id: "u1", name: "Килограмм", short_name: "Кг", status: true, sort: 1 }],
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByText("Добавить продукты");
    expect(screen.getByRole("combobox", { name: "Ед. изм" })).toHaveTextContent("Выберите ед. изм");
    fireEvent.change(screen.getByPlaceholderText("Напр. Помидор"), { target: { value: "Укроп" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Добавить" }).pop());
    // Ошибка видна и в шапке страницы, и в drawer — проверяем наличие.
    expect((await screen.findAllByText("Выберите единицу измерения.")).length).toBeGreaterThan(0);
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("combobox", { name: "Ед. изм" }));
    fireEvent.click(await screen.findByRole("option", { name: "Килограмм (Кг)" }));
    fillNorms();
    fireEvent.click(screen.getAllByRole("button", { name: "Добавить" }).pop());
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/inventory/ingredients",
      expect.objectContaining({ name: "Укроп", unit: "Кг" }),
    ));
  });

  it("10h. create posts template-only payload without stock movements", async () => {
    mockRawApis({
      ingredients: [],
      units: [{ id: "u1", name: "Килограмм", short_name: "Кг", status: true, sort: 1 }],
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByText("Добавить продукты");
    fireEvent.change(screen.getByPlaceholderText("Напр. Помидор"), { target: { value: "Укроп" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Ед. изм" }));
    fireEvent.click(await screen.findByRole("option", { name: "Килограмм (Кг)" }));
    fillNorms("100", "20");
    fireEvent.click(screen.getAllByRole("button", { name: "Добавить" }).pop());
    // Только карточка шаблона: название/ед.изм/категория/нормы, без остатков и цен.
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/inventory/ingredients",
      expect.objectContaining({ name: "Укроп", unit: "Кг" }),
    ));
    const sent = api.post.mock.calls.find(([url]) => String(url).includes("/inventory/ingredients"))[1];
    expect(Object.keys(sent).sort()).toEqual(["avg_quantity", "category", "deficit_threshold", "loss_type", "loss_value", "name", "unit"]);
    expect(api.post.mock.calls.some(([url]) => String(url).includes("/inventory/stock/movements"))).toBe(false);
  });

  it("11. existing edit/archive/restore actions preserved", async () => {
    mockRawApis({ ingredients: [ingredient({ id: "a1", name: "Мука", is_active: true })] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Мука");
    expect(within(container.querySelector(".raw-grid-table tbody tr")).getByRole("button", { name: "Редактировать" })).toBeInTheDocument();
    const archive = within(container.querySelector(".raw-grid-table tbody tr")).getByRole("button", { name: "Архивировать" });
    fireEvent.click(archive);
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/inventory/ingredients/a1", { is_active: false }));
  });

  it("12-13. few rows shrink, many rows keep inner scroll region", async () => {
    mockRawApis({ ingredients: [ingredient({ id: "a1", name: "Мука" })] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Мука");
    const wrap = container.querySelector(".raw-grid-wrap");
    expect(wrap).not.toHaveClass("is-empty");
    expect(container.querySelector(".dish-grid-scroll")).not.toBeNull();
    expect(container.querySelector("table[aria-label='Продукты']")).not.toBeNull();
  });

  it("16. compact empty states for active and archived", async () => {
    mockRawApis({ ingredients: [] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    expect(container.querySelector(".raw-grid-wrap.is-empty")).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    expect(await screen.findByText("Архив продуктов пуст.")).toBeInTheDocument();
  });

  it("17. no runtime fake data — rows come only from backend", async () => {
    mockRawApis({ ingredients: [ingredient({ name: "Реальная мука" })] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Реальная мука");
    expect(container.querySelector(".raw-grid-table").textContent).not.toMatch(/Тест|Demo|Fake/i);
    expect(api.get).toHaveBeenCalledWith(
      "/inventory/ingredients",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("9b. create posts no stock movement — balances come only from receipts", async () => {
    mockRawApis({
      ingredients: [],
      units: [{ id: "u1", name: "Килограмм", short_name: "Кг", status: true, sort: 1 }],
    });
    api.post.mockImplementation((url, body) => {
      if (String(url).includes("/inventory/ingredients")) {
        return Promise.resolve({ data: ingredient({ id: "new-id", name: body.name }) });
      }
      return Promise.resolve({ data: {} });
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByText("Добавить продукты");
    fireEvent.change(screen.getByPlaceholderText("Напр. Помидор"), { target: { value: "Помидор" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Ед. изм" }));
    fireEvent.click(await screen.findByRole("option", { name: "Килограмм (Кг)" }));
    fillNorms("100", "20");
    fireEvent.click(screen.getAllByRole("button", { name: "Добавить" }).pop());
    // Шаблон создаётся одним POST; движений из карточки нет — остаток
    // появится только после прихода («Добавить продуктов»).
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/inventory/ingredients",
      expect.objectContaining({ name: "Помидор", unit: "Кг" }),
    ));
    expect(api.post.mock.calls.some(([url]) => String(url).includes("/inventory/stock/movements"))).toBe(false);
  });

  it("9c. inactive status on create patches is_active", async () => {
    mockRawApis({
      ingredients: [],
      units: [{ id: "u1", name: "Килограмм", short_name: "Кг", status: true, sort: 1 }],
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByText("Добавить продукты");
    fireEvent.change(screen.getByPlaceholderText("Напр. Помидор"), { target: { value: "Укроп" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Ед. изм" }));
    fireEvent.click(await screen.findByRole("option", { name: "Килограмм (Кг)" }));
    fireEvent.click(screen.getByRole("switch", { name: "Статус" }));
    fillNorms();
    fireEvent.click(screen.getAllByRole("button", { name: "Добавить" }).pop());
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/inventory/ingredients/new-id",
      { is_active: false },
    ));
  });

  it("9d. edit saves template fields only, no adjustment movement", async () => {
    mockRawApis({ ingredients: [ingredient({ id: "a1", name: "Мука", stock: 10, min_stock: 2 })] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Мука");
    fireEvent.click(within(container.querySelector(".raw-grid-table tbody tr")).getByRole("button", { name: "Редактировать" }));
    await screen.findByText("Редактировать продукты");
    fireEvent.change(screen.getByPlaceholderText("Напр. Помидор"), { target: { value: "Мука в/с" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    // Только PATCH карточки; остаток правится приходом, не шаблоном.
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/inventory/ingredients/a1",
      expect.objectContaining({ name: "Мука в/с" }),
    ));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("9f. create with loss norm posts type and value", async () => {
    mockRawApis({
      ingredients: [],
      units: [{ id: "u1", name: "Килограмм", short_name: "Кг", status: true, sort: 1 }],
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByText("Добавить продукты");
    fireEvent.change(screen.getByPlaceholderText("Напр. Помидор"), { target: { value: "Помидор" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Ед. изм" }));
    fireEvent.click(await screen.findByRole("option", { name: "Килограмм (Кг)" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Тип потери" }));
    fireEvent.click(await screen.findByRole("option", { name: "Количество" }));
    fireEvent.change(screen.getByPlaceholderText("Например: 0.2 (на 1 кг)"), { target: { value: "0,3" } });
    fillNorms();
    fireEvent.click(screen.getAllByRole("button", { name: "Добавить" }).pop());
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/inventory/ingredients",
      expect.objectContaining({ name: "Помидор", loss_type: "amount", loss_value: 0.3 }),
    ));
  });

  it("9g. loss value without type is rejected without API call", async () => {
    mockRawApis({
      ingredients: [],
      units: [{ id: "u1", name: "Килограмм", short_name: "Кг", status: true, sort: 1 }],
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByText("Добавить продукты");
    fireEvent.change(screen.getByPlaceholderText("Напр. Помидор"), { target: { value: "Помидор" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Ед. изм" }));
    fireEvent.click(await screen.findByRole("option", { name: "Килограмм (Кг)" }));
    // Поле заблокировано без типа (проверено в тесте 9); fireEvent обходит
    // disabled — так проверяем именно валидацию save: значение без типа.
    fireEvent.change(screen.getByPlaceholderText("Значение потери"), { target: { value: "0.3" } });
    fillNorms();
    fireEvent.click(screen.getAllByRole("button", { name: "Добавить" }).pop());
    // Ошибка видна и на странице, и в drawer (оба рендерят actionError).
    expect(await screen.findAllByText("Выберите тип потери.")).toHaveLength(2);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("9h. percent over 100 is rejected without API call", async () => {
    mockRawApis({
      ingredients: [],
      units: [{ id: "u1", name: "Килограмм", short_name: "Кг", status: true, sort: 1 }],
    });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByText("Добавить продукты");
    fireEvent.change(screen.getByPlaceholderText("Напр. Помидор"), { target: { value: "Помидор" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Ед. изм" }));
    fireEvent.click(await screen.findByRole("option", { name: "Килограмм (Кг)" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Тип потери" }));
    fireEvent.click(await screen.findByRole("option", { name: "Процент" }));
    fireEvent.change(screen.getByPlaceholderText("Например: 10"), { target: { value: "150" } });
    fillNorms();
    fireEvent.click(screen.getAllByRole("button", { name: "Добавить" }).pop());
    expect(await screen.findAllByText("Процент потери — от 0 до 100.")).toHaveLength(2);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("9i. edit drawer prefills saved loss norm", async () => {
    mockRawApis({ ingredients: [ingredient({
      id: "a1", name: "Помидор", loss_type: "amount", loss_value: 0.3,
    })] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Помидор");
    fireEvent.click(within(container.querySelector(".raw-grid-table tbody tr")).getByRole("button", { name: "Редактировать" }));
    expect(await screen.findByText("Редактировать продукты")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Тип потери" })).toHaveTextContent("Количество");
    expect(screen.getByPlaceholderText("Например: 0.2 (на 1 кг)")).toHaveValue("0.3");
  });

  it("9j. server decimals show as entered with unit suffix", async () => {
    // Сервер хранит Numeric(15,4): «0.1» возвращается как «0.1000» —
    // показываем «0.1» + суффикс единицы («Лт»).
    mockRawApis({ ingredients: [ingredient({
      id: "a1", name: "Огурец", unit: "Лт", loss_type: "amount", loss_value: "0.1000",
    })] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Огурец");
    fireEvent.click(within(container.querySelector(".raw-grid-table tbody tr")).getByRole("button", { name: "Редактировать" }));
    expect(await screen.findByText("Редактировать продукты")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Например: 0.2 (на 1 кг)")).toHaveValue("0.1");
    const suffix = document.body.querySelector(".dish-form-field__suffix");
    expect(suffix).not.toBeNull();
    expect(suffix.textContent).toBe("Лт");
  });

  it("9k. percent loss shows % suffix", async () => {
    // Тип «Процент»: в конце значения знак процента («10%»).
    mockRawApis({ ingredients: [ingredient({
      id: "a1", name: "Помидор", unit: "Кг", loss_type: "percent", loss_value: 10,
    })] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Помидор");
    fireEvent.click(within(container.querySelector(".raw-grid-table tbody tr")).getByRole("button", { name: "Редактировать" }));
    expect(await screen.findByText("Редактировать продукты")).toBeInTheDocument();
    expect(screen.getByLabelText("Процент потери")).toHaveValue("10");
    const suffix = document.body.querySelector(".dish-form-field__suffix");
    expect(suffix).not.toBeNull();
    expect(suffix.textContent).toBe("%");
  });

  it("9l. amount loss label is Потери with unit suffix", async () => {
    // Тип «Количество»: подпись «Потери», в конце значения ед. изм («0.1 Лт»).
    mockRawApis({ ingredients: [ingredient({
      id: "a1", name: "Огурец", unit: "Лт", loss_type: "amount", loss_value: "0.1000",
    })] });
    const { container } = render(<NomenclaturePage type="raw" />);
    await screen.findByText("Огурец");
    fireEvent.click(within(container.querySelector(".raw-grid-table tbody tr")).getByRole("button", { name: "Редактировать" }));
    expect(await screen.findByText("Редактировать продукты")).toBeInTheDocument();
    expect(screen.getByLabelText("Потери")).toHaveValue("0.1");
    const suffix = document.body.querySelector(".dish-form-field__suffix");
    expect(suffix).not.toBeNull();
    expect(suffix.textContent).toBe("Лт");
  });

  it("9e. drawer closes through exit animation", async () => {
    mockRawApis({ ingredients: [] });
    render(<NomenclaturePage type="raw" />);
    await screen.findByText("Продукты пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByText("Добавить продукты");
    const drawer = document.body.querySelector(".staff-modal.dish-drawer");
    expect(drawer).not.toBeNull();
    expect(drawer).not.toHaveClass("is-closing");
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(drawer).toHaveClass("is-closing");
  });

  it("18. no foreign WIP regression in sidebar", () => {
    const warehouse = navItems.find((item) => item.key === "warehouse");
    // 5cbdb93 восстановил входы «Полуфабрикаты»/«Категория полуфабрикатов»:
    // маршруты /nomenclature/semi-finished* есть в App.jsx, без пунктов меню
    // они оставались недостижимыми.
    expect(warehouse.children).toHaveLength(4);
    expect(warehouse.children.map((child) => child.label)).toEqual([
      "Категория продуктов",
      "Продукты",
      "Полуфабрикаты",
      "Категория полуфабрикатов",
    ]);
    expect(navItems.map((item) => item.key)).toEqual([
      "dashboard",
      "reports",
      "users",
      "nomenclature",
      "warehouse",
      "warehouse-report",
      "finance",
      "settings",
    ]);
  });
});

describe("RAW V2 CSS family (read-only reference, scoped file)", () => {
  it("14. sticky header from Dishes reference", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const thead = css.match(/\.dish-grid-table thead th\s*\{[^}]*\}/)?.[0] || "";
    expect(thead).toMatch(/position:\s*sticky/);
    expect(thead).toMatch(/top:\s*0/);
    expect(thead).toMatch(/background:\s*var\(--blue-50/);
  });

  it("15. hidden scrollbar from Dishes reference + no !important in raw CSS", () => {
    const dishes = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    expect(dishes).toMatch(/scrollbar-width:\s*none/);
    expect(dishes).toMatch(/\.dish-grid-scroll::-webkit-scrollbar/);
    const raw = readFileSync(`${process.cwd()}/src/styles/owner/raw-materials.css`, "utf8");
    expect(raw).not.toContain("!important");
  });

  it("15b. raw table fits viewport (beats dish 1660px min-width)", () => {
    const raw = readFileSync(`${process.cwd()}/src/styles/owner/raw-materials.css`, "utf8");
    const fit = raw.match(/\.dish-catalog-page\.owner-report-view\.raw-materials-page \.raw-grid-table\s*\{[^}]*\}/)?.[0] || "";
    expect(fit).toMatch(/width:\s*100%/);
    expect(fit).toMatch(/min-width:\s*0/);
  });

  it("15c. recipes-dialog dropdowns get panel styling and close animation", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    expect(css).toMatch(/:is\(\.dish-catalog-page, \.dish-drawer, \.dish-recipes-dialog[^)]*\) \.orders-filter-select__panel\.is-closing/);
    expect(css).toMatch(/:is\(\.dish-catalog-page, \.dish-drawer, \.dish-recipes-dialog[^)]*\) \.orders-filter-select__panel \.orders-filter-select__menu/);
    expect(css).toMatch(/:is\(\.dish-catalog-page, \.dish-drawer, \.dish-recipes-dialog[^)]*\) \.orders-filter-select__option \{/);
  });

  it("outer white panel + table tokens match Dishes", () => {
    const dishes = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const card = dishes.match(/\.dish-catalog-page\.owner-report-view \.dish-catalog-card\s*\{[^}]*\}/)?.[0] || "";
    expect(card).toMatch(/border-radius:\s*18px/);
    expect(card).toMatch(/padding:\s*22px/);
    const wrap = dishes.match(/\.dish-catalog-page\.owner-report-view \.dish-grid-wrap\s*\{[^}]*\}/)?.[0] || "";
    expect(wrap).toMatch(/border-radius:\s*20px/);
    const tokens = readFileSync(`${process.cwd()}/src/styles/global/marjon-tokens.css`, "utf8");
    expect(tokens).toMatch(/#D0D9E8/i);
    expect(tokens).toMatch(/#EFF6FF/i);
    expect(tokens).toMatch(/#F4F7FC/i);
  });
});
