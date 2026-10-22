import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CategoriesPage from "./CategoriesPage";
import { getCategories } from "../api/categories";
import { catalogService } from "../api/catalog";

vi.mock("../api/categories", () => ({
  getCategories: vi.fn(),
}));
vi.mock("../api/catalog", () => ({
  catalogService: {
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    reorderCategories: vi.fn(),
    uploadCategoryImage: vi.fn(),
  },
}));
vi.mock("../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));

const salesRow = { id: "s1", name: "Напитки", slug: "sales-drinks", is_active: true, calculate_service: false, show_in_menu: true };
const dishRow = { id: "d1", name: "Выпечка", slug: "dish-bakery", is_active: true, calculate_service: false, show_in_menu: false };

describe("Sales categories (Категория товаров)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCategories).mockResolvedValue({ data: [salesRow, dishRow] });
    vi.mocked(catalogService.createCategory).mockResolvedValue({ data: { id: "s2" } });
    vi.mocked(catalogService.updateCategory).mockResolvedValue({ data: { id: "s1" } });
  });

  it("renders dish-style rows with Категория товаров header, sales rows only", async () => {
    render(<CategoriesPage type="sales" />);
    expect(await screen.findByRole("heading", { name: "Категория товаров" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Активные" })).toBeInTheDocument();
    expect(await screen.findByText("Напитки")).toBeInTheDocument();
    expect(screen.queryByText("Выпечка")).toBeNull();
    // Тот же row-card скелет, что у блюд, без фото.
    expect(document.querySelector(".dishcat-row")).not.toBeNull();
    expect(document.querySelectorAll(".dishcat-photo-sm")).toHaveLength(0);
    expect(screen.getByText("Рассчитать обслугу")).toBeInTheDocument();
  });

  it("creates with sales slug and edits without image_url", async () => {
    render(<CategoriesPage type="sales" />);
    await screen.findByText("Напитки");
    fireEvent.click(screen.getByRole("button", { name: "Добавить категорию" }));
    const dialog = await screen.findByRole("dialog", { name: "Добавить категорию" });
    expect(dialog.querySelector(".dishcat-photo")).toBeNull();
    fireEvent.change(dialog.querySelector('input[placeholder="Название категории"]'), {
      target: { value: "Соки" },
    });
    fireEvent.click(dialog.querySelector('button[type="submit"]'));
    await waitFor(() => expect(catalogService.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Соки", is_active: true }),
    ));
    const sent = vi.mocked(catalogService.createCategory).mock.calls[0][0];
    expect(String(sent.slug)).toMatch(/^sales/);
    expect(sent).not.toHaveProperty("image_url");

    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    const edit = await screen.findByRole("dialog", { name: "Редактировать категорию" });
    fireEvent.click(edit.querySelector('button[type="submit"]'));
    await waitFor(() => expect(catalogService.updateCategory).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ name: "Напитки" }),
    ));
    const edited = vi.mocked(catalogService.updateCategory).mock.calls[0][1];
    expect(edited).not.toHaveProperty("image_url");
  });

  it("remounts per type: no stale dish rows, tabs reset to active", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [
        { id: "s1", name: "Напитки", slug: "sales-drinks", is_active: true },
        { id: "d1", name: "Выпечка", slug: "dish-bakery", is_active: true },
      ],
    });
    const { rerender } = render(<CategoriesPage key="dishes" type="dishes" />);
    expect(await screen.findByText("Выпечка")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    rerender(<CategoriesPage key="sales" type="sales" />);
    // Состояние не перетекло: активный таб и только товары, без блюд.
    expect(await screen.findByText("Напитки")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Активные" })).toHaveClass("is-active");
    expect(screen.queryByText("Выпечка")).toBeNull();
  });

  it("splits active and archived tabs", async () => {
    vi.mocked(getCategories).mockResolvedValue({
      data: [salesRow, { ...salesRow, id: "s9", name: "Старая", is_active: false }],
    });
    render(<CategoriesPage type="sales" />);
    await screen.findByText("Напитки");
    expect(screen.queryByText("Старая")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    expect(await screen.findByText("Старая")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Восстановить категорию" })).toBeInTheDocument();
  });
});
