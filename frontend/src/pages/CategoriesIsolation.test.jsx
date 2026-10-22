import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CategoriesPage from "./CategoriesPage";
import { getCategories } from "../api/categories";
import { catalogService } from "../api/catalog";
import { settingsService } from "../api/settings";
import { useDishesCatalog } from "./nomenclature/useDishesCatalog";

vi.mock("../api/categories", () => ({ getCategories: vi.fn() }));
vi.mock("../api/catalog", () => ({ catalogService: {
  listProducts: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(),
  deleteCategory: vi.fn(), reorderCategories: vi.fn(),
} }));
vi.mock("../api/settings", () => ({ settingsService: { listResource: vi.fn() } }));
vi.mock("../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));

const activeRows = [
  { id: "dish", name: "Напитки блюд", slug: "dish-drinks", is_active: true },
  { id: "sale", name: "Напитки товаров", slug: "sales-drinks", is_active: true },
  { id: "legacy", name: "Старые блюда", slug: "old-food", is_active: true },
  { id: "raw", name: "Сырьё", slug: "raw-products", is_active: true },
  { id: "semi", name: "Полуфабрикаты", slug: "semi-products", is_active: true },
];
const rows = [...activeRows, ...activeRows.map((row) => ({ ...row, id: `${row.id}-archived`, name: `${row.name} архив`, is_active: false }))];

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  getCategories.mockResolvedValue({ data: rows });
  settingsService.listResource.mockResolvedValue({ data: [] });
  catalogService.listProducts.mockResolvedValue({ data: [] });
  catalogService.createCategory.mockImplementation(async (payload) => ({ data: { id: "created", ...payload } }));
});

describe("Dish and goods categories stay in their originating section", () => {
  it.each([
    ["dishes", ["Напитки блюд", "Старые блюда"]],
    ["sales", ["Напитки товаров"]],
  ])("isolates both active and archived categories for %s", async (type, expected) => {
    render(<CategoriesPage type={type} />);
    await screen.findByText(expected[0]);
    const visible = () => [...document.querySelectorAll(".dishcat-row .dishcat-info strong")].map((el) => el.textContent);
    expect(visible().sort()).toEqual([...expected].sort());
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    expect(visible().sort()).toEqual(expected.map((name) => `${name} архив`).sort());
  });

  it("does not leak cached dish rows when switching to goods and back", async () => {
    const view = render(<CategoriesPage type="dishes" />);
    await screen.findByText("Напитки блюд");
    expect(screen.queryByText("Напитки товаров")).not.toBeInTheDocument();
    view.rerender(<CategoriesPage type="sales" />);
    expect(await screen.findByText("Напитки товаров")).toBeInTheDocument();
    expect(screen.queryByText("Напитки блюд")).not.toBeInTheDocument();
    expect(screen.queryByText("Старые блюда")).not.toBeInTheDocument();
    view.rerender(<CategoriesPage type="dishes" />);
    expect(await screen.findByText("Напитки блюд")).toBeInTheDocument();
    expect(screen.queryByText("Напитки товаров")).not.toBeInTheDocument();
  });

  it.each([["dishes", "dish"], ["sales", "sales"]])("persists the originating section when creating in %s", async (type, prefix) => {
    render(<CategoriesPage type={type} />);
    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Добавить категорию" }));
    const dialog = await screen.findByRole("dialog", { name: "Добавить категорию" });
    fireEvent.change(dialog.querySelector('input[placeholder="Название категории"]'), { target: { value: "Новая категория" } });
    fireEvent.click(dialog.querySelector('button[type="submit"]'));
    await waitFor(() => expect(catalogService.createCategory).toHaveBeenCalledWith(expect.objectContaining({ slug: `${prefix}-новая-категория` })));
    expect(await screen.findByText("Новая категория")).toBeInTheDocument();
  });

  it("isolates dish filters and drawer choices, including after creating from the drawer", async () => {
    const { result } = renderHook(() => useDishesCatalog());
    await waitFor(() => expect(result.current.filterCategoriesLoading).toBe(false));
    expect(result.current.filterCategories.map((row) => row.id).sort()).toEqual(["dish", "legacy"]);
    await act(async () => { await result.current.createDishCategory("Новая категория"); });
    expect(catalogService.createCategory).toHaveBeenCalledWith(expect.objectContaining({ slug: "dish-новая-категория" }));
    expect(result.current.filterCategories.map((row) => row.id).sort()).toEqual(["created", "dish", "legacy"]);
  });
});
