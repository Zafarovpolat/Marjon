import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CategoriesPage from "./CategoriesPage";
import { navItems } from "../components/sidebar/navConfig";

vi.mock("../components/Icon", () => ({ default: ({ name }) => <span aria-hidden="true" data-icon={name} /> }));

const { mockGetCategories, mockCreateCategory, mockUpdateCategory, mockDeleteCategory } = vi.hoisted(() => ({
  mockGetCategories: vi.fn(),
  mockCreateCategory: vi.fn(),
  mockUpdateCategory: vi.fn(),
  mockDeleteCategory: vi.fn(),
}));

vi.mock("../api/categories", () => ({
  getCategories: mockGetCategories,
}));

vi.mock("../api/catalog", () => ({
  catalogService: {
    createCategory: mockCreateCategory,
    updateCategory: mockUpdateCategory,
    deleteCategory: mockDeleteCategory,
    uploadCategoryImage: vi.fn(),
  },
}));

const rawCategory = (overrides = {}) => ({
  id: "cat-uuid",
  company_id: "company-uuid",
  name: "Бакалея",
  slug: "raw-bakaleya",
  sort_order: 0,
  is_active: true,
  calculate_service: false,
  show_in_menu: false,
  image_url: null,
  ...overrides,
});

function mockRawList(rows) {
  mockGetCategories.mockResolvedValue({ data: rows });
}

const menuLabels = () => navItems.find((item) => item.key === "nomenclature")?.children.map((child) => child.label);
const menuPaths = () => navItems.find((item) => item.key === "nomenclature")?.children.map((child) => child.to);
const warehouseLabels = () => navItems.find((item) => item.key === "warehouse")?.children.map((child) => child.label);

describe("RAW CATEGORIES V1.1 row design", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. header structure matches Category Dishes", async () => {
    mockRawList([]);
    const { container } = render(<CategoriesPage type="raw" />);
    await waitFor(() => expect(mockGetCategories).toHaveBeenCalled());
    expect(container.querySelector(".is-raw-categories")).not.toBeNull();
    const header = container.querySelector(".rawcat-header.settings-header");
    expect(header).not.toBeNull();
    expect(header.querySelector(".settings-accent-bar")).not.toBeNull();
    expect(screen.getByText("Склад")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Категория продуктов" })).toBeInTheDocument();
  });

  it("no HTML table header in Raw Categories", async () => {
    mockRawList([rawCategory()]);
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    expect(container.querySelector(".rawcat-list table")).toBeNull();
    expect(container.querySelector("thead")).toBeNull();
    expect(screen.queryByRole("columnheader")).toBeNull();
    expect(screen.queryByText("НАЗВАНИЕ КАТЕГОРИИ")).toBeNull();
  });

  it("separate rounded category rows like Dish Categories", async () => {
    mockRawList([
      rawCategory({ id: "1", name: "Первая" }),
      rawCategory({ id: "2", name: "Вторая" }),
    ]);
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Первая");
    const rows = container.querySelectorAll(".rawcat-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].tagName).toBe("ARTICLE");
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    expect(css).toMatch(/\.rawcat-row\s*\{[^}]*border-radius:\s*14px/);
    expect(css).toMatch(/\.rawcat-list\s*\{[^}]*gap:\s*10px/);
    expect(css).toMatch(/background:\s*#fff/i);
  });

  it("row names on left from canonical data", async () => {
    mockRawList([
      rawCategory({ id: "1", name: "GO\u2019SHT MAHSULOTLARI", slug: "raw-gosht" }),
      rawCategory({ id: "2", name: "sabzavotlar", slug: "raw-sabzavot" }),
    ]);
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("GO\u2019SHT MAHSULOTLARI");
    expect(screen.getByText("sabzavotlar")).toBeInTheDocument();
    expect(container.querySelector(".rawcat-list").textContent).not.toMatch(/#raw-/);
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    expect(css).toMatch(/\.rawcat-name\s*\{[^}]*justify-self:\s*start/);
  });

  it("status geometrically centered", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея" })]);
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    expect(container.querySelector(".rawcat-status")).not.toBeNull();
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    expect(css).toMatch(/\.rawcat-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.rawcat-status\s*\{[^}]*justify-self:\s*center/);
    expect(css).not.toContain("table-layout");
  });

  it("status uses Dish Categories dot style without invented archive", async () => {
    mockRawList([
      rawCategory({ id: "1", name: "Активная", is_active: true }),
      rawCategory({ id: "2", name: "Пассивная", is_active: false }),
    ]);
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Активная");
    expect(screen.getByText("Активен")).toBeInTheDocument();
    expect(screen.queryByText("Пассивная")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    expect(await screen.findByText("Пассивная")).toBeInTheDocument();
    expect(screen.getByText("Неактивен")).toBeInTheDocument();
    expect(container.querySelector(".rawcat-list").textContent).not.toMatch(/Архив категорий/i);
    expect(container.querySelector(".rawcat-list").textContent).not.toMatch(/#активно/);
    const dots = container.querySelectorAll(".settings-status-badge__dot");
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it("actions aligned right", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея" })]);
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    expect(container.querySelector(".rawcat-actions")).not.toBeNull();
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    expect(css).toMatch(/\.rawcat-actions\s*\{[^}]*justify-self:\s*end/);
  });

  it("edit button matches Category Dishes", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея" })]);
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    const edit = screen.getByRole("button", { name: "Редактировать" });
    expect(edit).toHaveClass("settings-place__edit");
    expect(container.querySelector(".rawcat-actions .settings-place__edit")).not.toBeNull();
  });

  it("delete button matches Category Dishes", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея" })]);
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    const archive = screen.getByRole("button", { name: "Архивировать категорию" });
    expect(archive).toHaveClass("settings-action-delete");
    expect(container.querySelector(".rawcat-actions .settings-action-delete")).not.toBeNull();
  });

  it("active tab is default with animated switch", async () => {
    mockRawList([]);
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Категории продуктов пока не добавлены.");
    const activeTab = screen.getByRole("tab", { name: "Активные" });
    expect(activeTab).toHaveClass("is-active");
    expect(activeTab).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".dish-status-tabs")).not.toBeNull();
    expect(container.querySelector(".dish-status-tabs__indicator")).not.toBeNull();
  });

  it("active trash opens archive confirm and never calls physical DELETE", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея" })]);
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
    render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    fireEvent.click(screen.getByRole("button", { name: "Архивировать категорию" }));
    expect(await screen.findByText("Архивировать категорию?")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockDeleteCategory).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("archive success moves row from Active to Archived", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея", is_active: true })]);
    mockUpdateCategory.mockResolvedValue({ data: rawCategory({ id: "1", name: "Бакалея", is_active: false }) });
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    fireEvent.click(screen.getByRole("button", { name: "Архивировать категорию" }));
    const dialog = await screen.findByText("Архивировать категорию?");
    expect(dialog).toBeInTheDocument();
    mockGetCategories.mockResolvedValue({ data: [rawCategory({ id: "1", name: "Бакалея", is_active: false })] });
    fireEvent.click(within(dialog.closest("form")).getByRole("button", { name: "Архивировать" }));
    await waitFor(() => expect(mockUpdateCategory).toHaveBeenCalledWith("1", { is_active: false }));
    await waitFor(() => expect(screen.queryByText("Бакалея")).toBeNull());
    expect(screen.getByText("Категории продуктов пока не добавлены.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    expect(await screen.findByText("Бакалея")).toBeInTheDocument();
    expect(container.querySelector(".rawcat-list").textContent).not.toContain("Категории продуктов пока не добавлены.");
  });

  it("archived rows show Restore and permanent Delete, no Edit", async () => {
    mockRawList([rawCategory({ id: "1", name: "Старая", is_active: false })]);
    render(<CategoriesPage type="raw" />);
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await screen.findByText("Старая");
    expect(screen.getByRole("button", { name: "Восстановить категорию" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить окончательно" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Редактировать" })).toBeNull();
  });

  it("restore returns category to Active", async () => {
    mockRawList([rawCategory({ id: "1", name: "Старая", is_active: false })]);
    mockUpdateCategory.mockResolvedValue({ data: rawCategory({ id: "1", name: "Старая", is_active: true }) });
    render(<CategoriesPage type="raw" />);
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await screen.findByText("Старая");
    mockGetCategories.mockResolvedValue({ data: [rawCategory({ id: "1", name: "Старая", is_active: true })] });
    fireEvent.click(screen.getByRole("button", { name: "Восстановить категорию" }));
    await waitFor(() => expect(mockUpdateCategory).toHaveBeenCalledWith("1", { is_active: true }));
    await waitFor(() => expect(screen.queryByText("Старая")).toBeNull());
    fireEvent.click(screen.getByRole("tab", { name: "Активные" }));
    expect(await screen.findByText("Старая")).toBeInTheDocument();
  });

  it("archived empty state uses the compact dish template, not a PNG", async () => {
    mockRawList([]);
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Категории продуктов пока не добавлены.");
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    expect(await screen.findByText("Архив категорий продуктов пуст.")).toBeInTheDocument();
    expect(container.querySelector(".rawcat-empty.menu-category-empty")).not.toBeNull();
    expect(container.querySelector('.rawcat-empty [data-icon="bi-inbox"]')).not.toBeNull();
    expect(container.querySelector(".rawcat-empty img")).toBeNull();
    expect(container.querySelector(".owner-report-empty")).toBeNull();
  });

  it("list request includes archived rows", async () => {
    mockRawList([]);
    render(<CategoriesPage type="raw" />);
    await screen.findByText("Категории продуктов пока не добавлены.");
    await waitFor(() => expect(mockGetCategories).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ include_inactive: true }) }),
    ));
  });

  it("9. permanent delete opens confirmation, no browser confirm", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея", is_active: false })]);
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
    render(<CategoriesPage type="raw" />);
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await screen.findByText("Бакалея");
    fireEvent.click(screen.getByRole("button", { name: "Удалить окончательно" }));
    expect(await screen.findByText("Удалить категорию навсегда?")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("10. delete 409 keeps confirm open with message", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея", is_active: false })]);
    mockDeleteCategory.mockRejectedValue({ response: { data: { detail: "Категория используется блюдами" } } });
    render(<CategoriesPage type="raw" />);
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await screen.findByText("Бакалея");
    fireEvent.click(screen.getByRole("button", { name: "Удалить окончательно" }));
    const dialog = await screen.findByText("Удалить категорию навсегда?");
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog.closest("form")).getByRole("button", { name: "Удалить" }));
    expect(await screen.findByText("Категория используется блюдами")).toBeInTheDocument();
    expect(screen.getByText("Бакалея")).toBeInTheDocument();
    expect(mockDeleteCategory).toHaveBeenCalledWith("1");
  });

  it("11. cross-company 404 is surfaced without silent removal", async () => {
    mockRawList([rawCategory({ id: "1", name: "Чужая", is_active: false })]);
    mockDeleteCategory.mockRejectedValue({ response: { status: 404, data: { detail: "Not found" } } });
    render(<CategoriesPage type="raw" />);
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await screen.findByText("Чужая");
    fireEvent.click(screen.getByRole("button", { name: "Удалить окончательно" }));
    await screen.findByText("Удалить категорию навсегда?");
    fireEvent.click(within(screen.getByText("Удалить категорию навсегда?").closest("form")).getByRole("button", { name: "Удалить" }));
    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(screen.getByText("Чужая")).toBeInTheDocument();
  });

  it("5. add button opens real modal", async () => {
    mockRawList([]);
    render(<CategoriesPage type="raw" />);
    await screen.findByText("Категории продуктов пока не добавлены.");
    const add = screen.getByRole("button", { name: "Добавить" });
    expect(add).toHaveClass("rawcat-add-button");
    fireEvent.click(add);
    expect(await screen.findByText("Добавить категорию продуктов")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Название категории")).toBeInTheDocument();
    expect(document.body.querySelector(".rawcat-modal-layer")).not.toBeNull();
  });

  it("6. real category creation through canonical API", async () => {
    mockRawList([]);
    mockCreateCategory.mockResolvedValue({ data: rawCategory({ id: "new-1", name: "Молочка" }) });
    render(<CategoriesPage type="raw" />);
    await screen.findByText("Категории продуктов пока не добавлены.");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    fireEvent.change(screen.getByPlaceholderText("Название категории"), { target: { value: "Молочка" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(mockCreateCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Молочка", is_active: true }),
    ));
    const payload = mockCreateCategory.mock.calls[0][0];
    expect(payload.slug).toMatch(/^raw-/);
    expect(payload).not.toHaveProperty("calculate_service");
    expect(payload).not.toHaveProperty("show_in_menu");
    expect(await screen.findByText("Молочка")).toBeInTheDocument();
  });

  it("7. edit opens correct category with prefill", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея" })]);
    render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    expect(await screen.findByText("Редактировать категорию продуктов")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Название категории")).toHaveValue("Бакалея");
  });

  it("8. real category update without dish-only fields", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея" })]);
    mockUpdateCategory.mockResolvedValue({ data: rawCategory({ id: "1", name: "Бакалея плюс" }) });
    render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    mockGetCategories.mockResolvedValue({ data: [rawCategory({ id: "1", name: "Бакалея плюс" })] });
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    const input = await screen.findByPlaceholderText("Название категории");
    fireEvent.change(input, { target: { value: "Бакалея плюс" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(mockUpdateCategory).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ name: "Бакалея плюс" }),
    ));
    const payload = mockUpdateCategory.mock.calls[0][1];
    expect(payload).not.toHaveProperty("slug");
    expect(payload).not.toHaveProperty("calculate_service");
    expect(payload).not.toHaveProperty("image_url");
  });

  it("active empty state uses an inline inbox icon and message, not a report panel", async () => {
    mockRawList([]);
    const { container } = render(<CategoriesPage type="raw" />);
    const title = await screen.findByText("Категории продуктов пока не добавлены.");
    expect(container.querySelector(".rawcat-list-wrap.is-empty")).not.toBeNull();
    expect(container.querySelectorAll(".rawcat-row")).toHaveLength(0);
    const empty = container.querySelector(".rawcat-empty");
    expect(empty).toHaveClass("menu-category-empty");
    expect(empty).toHaveAttribute("role", "status");
    expect(empty.children).toHaveLength(2);
    expect(empty.firstElementChild).toHaveAttribute("data-icon", "bi-inbox");
    expect(empty.lastElementChild.tagName).toBe("SPAN");
    expect(empty.lastElementChild.textContent).toBe(title.textContent);
    expect(empty.querySelector("img")).toBeNull();
    expect(container.querySelector(".owner-report-empty")).toBeNull();
  });

  it.each(["Активные", "Архивированные"])("%s: raw empty content matches the existing dish empty layout", async (tab) => {
    mockRawList([]);
    const dishView = render(<CategoriesPage type="dishes" />);
    await screen.findByText("Категорий пока нет.");
    fireEvent.click(screen.getByRole("tab", { name: tab }));
    const dishPattern = dishView.container.querySelector(".menu-category-empty").cloneNode(true);
    dishPattern.lastElementChild.textContent = "";
    dishView.unmount();

    const rawView = render(<CategoriesPage type="raw" />);
    await screen.findByText("Категории продуктов пока не добавлены.");
    fireEvent.click(screen.getByRole("tab", { name: tab }));
    const rawEmpty = rawView.container.querySelector(".rawcat-empty");
    const rawPattern = rawEmpty.cloneNode(true);
    rawPattern.lastElementChild.textContent = "";
    expect(rawEmpty).toHaveClass("menu-category-empty");
    expect(rawPattern.innerHTML).toBe(dishPattern.innerHTML);
    expect(rawEmpty.querySelector("img")).toBeNull();
    expect(mockCreateCategory).not.toHaveBeenCalled();
    expect(mockUpdateCategory).not.toHaveBeenCalled();
    expect(mockDeleteCategory).not.toHaveBeenCalled();
  });

  it("empty remount refetches and keeps both tab layouts compact", async () => {
    mockRawList([]);
    const first = render(<CategoriesPage type="raw" />);
    await screen.findByText("Категории продуктов пока не добавлены.");
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    expect(screen.getByText("Архив категорий продуктов пуст.")).toBeInTheDocument();
    first.unmount();
    const second = render(<CategoriesPage type="raw" />);
    await screen.findByText("Категории продуктов пока не добавлены.");
    expect(screen.getByRole("tab", { name: "Активные" })).toHaveAttribute("aria-selected", "true");
    expect(second.container.querySelector(".rawcat-empty")).toHaveClass("menu-category-empty");
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    expect(screen.getByText("Архив категорий продуктов пуст.")).toBeInTheDocument();
    expect(second.container.querySelector(".rawcat-empty")).toHaveClass("menu-category-empty");
    expect(second.container.querySelector(".rawcat-empty img")).toBeNull();
    expect(mockGetCategories).toHaveBeenCalledTimes(2);
  });

  it("keeps loading and errors distinct from a confirmed empty list", async () => {
    mockGetCategories.mockReturnValue(new Promise(() => {}));
    const pending = render(<CategoriesPage type="raw" />);
    expect(screen.getByText("Загрузка…")).toBeInTheDocument();
    expect(pending.container.querySelector(".rawcat-empty")).toBeNull();
    pending.unmount();
    mockGetCategories.mockRejectedValue(new Error("offline"));
    const failed = render(<CategoriesPage type="raw" />);
    await screen.findByText("Не удалось загрузить категории.");
    expect(failed.container.querySelector(".rawcat-empty")).toBeNull();
    expect(failed.container.querySelector(".owner-report-empty")).toBeNull();
  });

  it("data remains canonical without fake rows", async () => {
    mockRawList([rawCategory({ id: "1", name: "Настоящая" })]);
    const { container } = render(<CategoriesPage type="raw" />);
    await screen.findByText("Настоящая");
    expect(container.querySelector(".rawcat-list").textContent).not.toMatch(/Test|Demo|Fake|Пример/i);
    expect(mockGetCategories).toHaveBeenCalled();
  });

  it("F5 persistence — remount refetches canonical list", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея" })]);
    const view = render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    expect(mockGetCategories).toHaveBeenCalledTimes(1);
    view.unmount();
    mockRawList([rawCategory({ id: "1", name: "Бакалея" })]);
    render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    expect(mockGetCategories).toHaveBeenCalledTimes(2);
  });

  it("dish list request includes archived rows", async () => {
    mockRawList([]);
    render(<CategoriesPage type="dishes" />);
    await waitFor(() => expect(mockGetCategories).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ include_inactive: true }) }),
    ));
  });

  it("empty archive panel is compact (no viewport fill)", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    expect(css).toMatch(/\.menu-categories-page\.is-dish-categories \.menu-categories-card/);
    expect(css).toMatch(/min-height:\s*0/);
    expect(css).toMatch(/\.menu-categories-page\.is-dish-categories:has\(\.menu-category-empty\) \.menu-categories-card/);
    expect(css).toMatch(/\.menu-categories-page\.is-raw-categories:has\(\.rawcat-empty\) \.menu-categories-card/);
  });

  it("many rows scroll inside instead of growing the page", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    expect(css).toMatch(/\.menu-categories-page\.is-dish-categories \.menu-category-list\.dishcat-list\s*\{[^}]*max-height/);
    expect(css).toMatch(/\.rawcat-list\s*\{[^}]*max-height/);
  });

  it("dish categories branch unchanged", async () => {
    mockRawList([]);
    const { container } = render(<CategoriesPage type="dishes" />);
    await waitFor(() => expect(mockGetCategories).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Категория блюд" })).toBeInTheDocument();
    expect(container.querySelector(".is-dish-categories")).not.toBeNull();
    expect(container.querySelector(".is-raw-categories")).toBeNull();
    expect(container.querySelector(".rawcat-row")).toBeNull();
  });

  it("menu Category Dishes first", () => {
    expect(menuLabels()).toEqual(["Категория блюд", "Блюда", "Категория товаров", "Товары", "Продажа", "Стоп-лист"]);
    expect(menuPaths()).toEqual([
      "/nomenclature/dish-categories",
      "/nomenclature/dishes",
      "/nomenclature/sales-categories",
      "/nomenclature/sales",
      "/nomenclature/menu",
      "/nomenclature/stop-list",
    ]);
  });

  it("menu Dishes second, Goods third/fourth, Sale fifth, Stop-list sixth", () => {
    const labels = menuLabels();
    expect(labels[1]).toBe("Блюда");
    expect(labels[2]).toBe("Категория товаров");
    expect(labels[3]).toBe("Товары");
    expect(labels[4]).toBe("Продажа");
    expect(labels[5]).toBe("Стоп-лист");
  });

  it("warehouse Category first, Raw second", () => {
    expect(warehouseLabels()).toEqual(["Категория продуктов", "Продукты"]);
  });

  it("add/edit/delete unchanged behavior", async () => {
    mockRawList([rawCategory({ id: "1", name: "Бакалея", is_active: true })]);
    render(<CategoriesPage type="raw" />);
    await screen.findByText("Бакалея");
    expect(screen.getByRole("button", { name: "Редактировать" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Архивировать категорию" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить" })).toBeInTheDocument();
  });
});

describe("RAW CATEGORIES V1.1 CSS family", () => {
  it("sticky header, hidden scrollbar, compact empty", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    expect(css).not.toMatch(/table-layout/);
    expect(css).toMatch(/scrollbar-width:\s*none/);
    expect(css).toMatch(/\.rawcat-list::-webkit-scrollbar/);
    expect(css).not.toMatch(/!important\s*;/);
  });

  it("panel and row tokens match dish categories", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    expect(css).toMatch(/border-radius:\s*18px/);
    expect(css).toMatch(/border-radius:\s*14px/);
    expect(css).toMatch(/#1FC9C9/);
    expect(css).toMatch(/\.rawcat-status \.settings-status-badge/);
  });

  it("removes only the empty list's spare padding and reuses the existing dish empty skin", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/raw-categories.css`, "utf8");
    expect(css).toMatch(/\.is-raw-categories \.rawcat-list-wrap\.is-empty \.rawcat-list\s*\{\s*padding-bottom:\s*0;\s*\}/);
    expect(css).toMatch(/\.is-raw-categories \.rawcat-list\s*\{[^}]*padding-bottom:\s*2px/);
    expect(css).not.toContain("owner-report-empty");
    expect(css).not.toMatch(/\.rawcat-empty\s*\{[^}]*(?:padding|min-height|height|display):/);
  });
});
