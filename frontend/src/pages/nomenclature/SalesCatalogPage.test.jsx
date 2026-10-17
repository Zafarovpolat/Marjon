import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { getCategories } from "../../api/categories";
import SalesCatalogPage from "./SalesCatalogPage";

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  formatMoney: (value) => String(value ?? ""),
  formatNumber: (value) => String(value ?? ""),
}));
vi.mock("../../api/categories", () => ({
  getCategories: vi.fn(),
}));
vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));
vi.mock("../../components/ReportEmptyState", () => ({
  default: ({ title }) => <div><strong>{title}</strong></div>,
}));

const saleProduct = {
  id: "sale-1",
  company_id: "c1",
  name: "Кола",
  product_type: "sale",
  price: "10000",
  cost_price: "5000",
  unit: "шт",
  sort_order: 1,
  is_active: true,
  is_available: true,
  category_id: "sc1",
  category_name: "Напитки",
  ingredients_count: 0,
  ingredients: [],
};
const dishProduct = {
  ...saleProduct,
  id: "dish-1",
  name: "Лаваш",
  product_type: "dish",
  category_id: "dc1",
  category_name: "Выпечка",
};
const salesCats = [{ id: "sc1", name: "Напитки", slug: "sales-drinks", is_active: true }];
const dishCats = [{ id: "dc1", name: "Выпечка", slug: "dish-bakery", is_active: true }];

function mockSalesApis({ products = [saleProduct, dishProduct] } = {}) {
  getCategories.mockResolvedValue({ data: [...salesCats, ...dishCats] });
  api.get.mockImplementation((url) => {
    if (String(url).includes("/inventory/products")) return Promise.resolve({ data: products });
    if (String(url) === "/units") return Promise.resolve({ data: [] });
    if (String(url).includes("/printers")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockImplementation((url) => {
    if (String(url).includes("/inventory/products")) {
      return Promise.resolve({ data: { ...saleProduct, id: "new-sale" } });
    }
    return Promise.resolve({ data: {} });
  });
  api.patch.mockResolvedValue({ data: { id: "sale-1" } });
  api.delete.mockResolvedValue({});
}

describe("Sales catalog (Товары)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSalesApis();
  });

  it("renders Товары header and table without Рецепты column, sale rows only", async () => {
    const { container } = render(<SalesCatalogPage />);
    expect(await screen.findByRole("heading", { name: "Товары" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Товары" });
    const headers = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).not.toContain("Рецепты");
    for (const kept of ["Фото", "Название", "Действия"]) {
      expect(headers).toContain(kept);
    }
    expect(within(table).getByText("Кола")).toBeInTheDocument();
    expect(within(table).queryByText("Лаваш")).toBeNull();
  });

  it("creates new items as sale type", async () => {
    render(<SalesCatalogPage />);
    await screen.findByText("Кола");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    const drawer = await screen.findByRole("dialog", { name: "Добавить блюдо" });
    // Пресет нового товара — Реализация (поля Тип в drawer больше нет,
    // тип виден только в сейв-пейлоаде).
    fireEvent.change(within(drawer).getByLabelText("Название"), { target: { value: "Фанта" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/inventory/products",
      expect.objectContaining({ name: "Фанта", product_type: "sale" }),
    ));
  });

  it("drawer category select offers only sales categories", async () => {
    render(<SalesCatalogPage />);
    await screen.findByText("Кола");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    const drawer = await screen.findByRole("dialog", { name: "Добавить блюдо" });
    fireEvent.click(within(drawer).getByRole("combobox", { name: "Категория" }));
    expect(await screen.findByRole("option", { name: "Напитки" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Выпечка" })).toBeNull();
  });

  it("archives through confirm with товар wording", async () => {
    render(<SalesCatalogPage />);
    await screen.findByText("Кола");
    const row = screen.getByText("Кола").closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Удалить" }));
    const confirm = await screen.findByRole("dialog", { name: "Архивировать товар?" });
    expect(confirm).toHaveTextContent("будет перемещён в архив");
    fireEvent.click(within(confirm).getByRole("button", { name: "Архивировать" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/inventory/products/sale-1"));
  });
});
