import { fireEvent, render, renderHook, screen, waitFor, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import NomenclaturePage, { buildNomenclatureProductPayload, mapNomenclatureProduct } from "../NomenclaturePage";
import { dishColumnOptions } from "./nomenclatureConfig";
import { formatNomenclatureMoneyDisplay } from "./nomenclatureData";
import { useDishesCatalog } from "./useDishesCatalog";

vi.mock("../../api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));

const backendProduct = (overrides = {}) => ({
  id: "product-uuid",
  company_id: "company-uuid",
  category_id: null,
  subcategory_id: null,
  product_type: "dish",
  printer_id: null,
  name: "Backend dish",
  description: null,
  image_url: null,
  price: 45000,
  cost_price: 18000,
  tax_rate: 0,
  unit: "шт",
  barcode: null,
  sku: null,
  is_active: true,
  is_available: true,
  sort_order: 1,
  category_name: "Супы",
  subcategory_name: null,
  printer_name: "Кухня",
  ingredients_count: 3,
  stock: 42,
  ingredients: [],
  ...overrides,
});

function mockCatalogApis(products) {
  api.get.mockImplementation((url) => {
    if (String(url).includes("categories")) return Promise.resolve({ data: [] });
    if (String(url).includes("printers")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: products });
  });
  api.post.mockResolvedValue({ data: backendProduct() });
}

describe("DISHES V21 native photo picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    mockCatalogApis([backendProduct()]);
  });

  it("opens the native OS picker from the table photo button, not the custom window", async () => {
    const clickSpy = vi.spyOn(window.HTMLInputElement.prototype, "click").mockImplementation(() => {});
    render(<NomenclaturePage />);
    const photoButton = await screen.findByRole("button", { name: "Выбрать фото для Backend dish" });
    const photoInput = document.querySelector(".dish-col-photo input[type='file']");
    expect(photoInput).not.toBeNull();
    expect(photoInput).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    fireEvent.click(photoButton);
    expect(clickSpy).toHaveBeenCalled();
    expect(document.querySelector(".dish-photo-modal")).toBeNull();
    clickSpy.mockRestore();
  });

  it("uploads the picked file for the same product id without duplicates", async () => {
    const withPhoto = backendProduct({ image_url: "https://cdn.marjon/photo.jpg" });
    api.post.mockResolvedValue({ data: withPhoto });
    const { result } = renderHook(() => useDishesCatalog());
    await waitFor(() => expect(result.current.filteredRows).toHaveLength(1));
    const file = new File(["bytes"], "dish.jpg", { type: "image/jpeg" });
    await act(async () => {
      await result.current.uploadDishPhoto("product-uuid", file);
    });
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/inventory/products/product-uuid/photo");
    expect(body).toBeInstanceOf(FormData);
    expect(result.current.filteredRows).toHaveLength(1);
    expect(result.current.filteredRows[0].id).toBe("product-uuid");
    expect(result.current.filteredRows[0].photo).toBe("https://cdn.marjon/photo.jpg");
  });

  it("rejects unsupported file types without any request", async () => {
    const { result } = renderHook(() => useDishesCatalog());
    await waitFor(() => expect(result.current.filteredRows).toHaveLength(1));
    const file = new File(["bytes"], "dish.gif", { type: "image/gif" });
    await act(async () => {
      await result.current.uploadDishPhoto("product-uuid", file);
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(result.current.filteredRows[0].photo).toBe("");
  });

  it("keeps truthful state when photo upload fails", async () => {
    api.post.mockRejectedValue({ response: { data: { detail: "storage down" } } });
    const { result } = renderHook(() => useDishesCatalog());
    await waitFor(() => expect(result.current.filteredRows).toHaveLength(1));
    const file = new File(["bytes"], "dish.jpg", { type: "image/jpeg" });
    await act(async () => {
      await result.current.uploadDishPhoto("product-uuid", file);
    });
    expect(result.current.filteredRows[0].photo).toBe("");
    expect(result.current.actionError).toMatch(/storage down/);
  });
});

describe("DISHES V21 simplified table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    mockCatalogApis([backendProduct()]);
  });

  it("drops Тип/Меню/Подкатегория/Рецепт columns and keeps the useful ones", async () => {
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("button", { name: "Выбрать фото для Backend dish" });
    const headers = [...container.querySelectorAll(".dish-grid-table thead th")].map((th) => th.textContent);
    for (const removed of ["Тип", "Меню", "Подкатегория", "Рецепты"]) {
      expect(headers).not.toContain(removed);
    }
    for (const kept of ["Фото", "Название", "Ед. изм", "Себестоимость", "Цена", "Принтер", "Остаток", "Авто", "Сет", "Сорт", "Действия"]) {
      expect(headers).toContain(kept);
    }
    expect(container.querySelector(".dish-col-type")).toBeNull();
    expect(container.querySelector(".dish-col-menu")).toBeNull();
    expect(container.querySelector(".dish-col-subcategory")).toBeNull();
    expect(container.querySelector(".dish-col-recipe")).toBeNull();
  });

  it("recalculates a compact table min-width from the remaining columns", () => {
    const width = dishColumnOptions.reduce((sum, column) => sum + column.width, 0);
    expect(dishColumnOptions.map((column) => column.key)).toEqual(
      ["photo", "name", "unit", "cost", "price", "printer", "stock", "auto", "set", "sort", "actions"],
    );
    expect(width).toBe(1294);
  });
});

describe("DISHES V21 toggle contract (no fake switches)", () => {
  it("documents the real backend contract: no writable boolean for Остаток/Авто/Сет/Сорт", () => {
    const schemas = readFileSync(`${process.cwd()}/../backend/app/modules/inventory/schemas.py`, "utf8");
    const updateBlock = schemas.match(/class ProductUpdate[\s\S]*?(?=\nclass )/)?.[0] || "";
    // Writable booleans that exist: only is_active / is_available (no table column).
    expect(updateBlock).toContain("is_active");
    expect(updateBlock).toContain("is_available");
    // None of the four requested columns has a writable backend field.
    for (const field of ["auto", "is_set", "set:", "stock"]) {
      expect(updateBlock).not.toMatch(new RegExp(`^\\s*${field}\\s*:`, "m"));
    }
    expect(buildNomenclatureProductPayload({ name: "X", sort: "1", price: "100", auto: true, set: true })).not.toHaveProperty("auto");
  });

  it("keeps truthful display: numeric stock, null auto/set, numeric sort", () => {
    const row = mapNomenclatureProduct(backendProduct({ stock: 42 }));
    expect(row.stock).toBe("42");
    expect(row.auto).toBeNull();
    expect(row.set).toBeNull();
    expect(row.sort).toBe("1");
    expect(mapNomenclatureProduct(backendProduct({ stock: null })).stock).toBe("-");
  });
});

describe("DISHES V21 clients-style compact header", () => {
  it("keeps eyebrow МЕНЮ and H1 Блюда with the compact clients rhythm", async () => {
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    expect(container.querySelector(".settings-title-group p")).toHaveTextContent("Меню");
    expect(screen.getByRole("heading", { name: "Блюда" })).toBeInTheDocument();
    expect(container.querySelector(".dish-catalog-header .settings-accent-bar")).toBeInTheDocument();
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const h1Rule = css.match(/\.dish-catalog-page \.dish-catalog-header \.settings-title-group h1\s*\{[^}]*\}/g);
    const lastH1 = h1Rule[h1Rule.length - 1];
    expect(lastH1).toMatch(/font-size:\s*clamp\(24px, 2\.4vw, 28px\)/);
    expect(lastH1).toMatch(/font-weight:\s*600/);
    expect(css).toMatch(/\.dish-catalog-page \.dish-catalog-header\s*\{\s*[^}]*margin-bottom:\s*12px/);
    expect(css).not.toContain("!important");
  });
});

describe("DISHES V22 table polish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    mockCatalogApis([backendProduct({ price: "40000.00", stock: 24 })]);
  });

  it("formats money unified without .00 and renders price as read-only text", async () => {
    expect(formatNomenclatureMoneyDisplay(40000)).toMatch(/40\D000\DUZS/);
    expect(formatNomenclatureMoneyDisplay("40000.00")).toMatch(/40\D000\DUZS/);
    expect(formatNomenclatureMoneyDisplay("40000.0")).toMatch(/40\D000\DUZS/);
    expect(formatNomenclatureMoneyDisplay("bad")).toBe("—");
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("button", { name: "Выбрать фото для Backend dish" });
    expect(container.querySelector(".dish-price-input")).toBeNull();
    const priceText = container.querySelector(".dish-col-price .dish-price-text");
    expect(priceText).not.toBeNull();
    expect(priceText.textContent).toMatch(/40\D000\DUZS/);
  });

  it("renders the name as dominant non-link text with safe ellipsis", async () => {
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("button", { name: "Выбрать фото для Backend dish" });
    expect(container.querySelector(".dish-name-link")).toBeNull();
    const name = container.querySelector(".dish-col-name .dish-name-text");
    expect(name).not.toBeNull();
    expect(name.tagName).toBe("SPAN");
    expect(name).toHaveTextContent("Backend dish");
    expect(name).toHaveAttribute("title", "Backend dish");
  });

  it("shows stock as a truthful badge, not a fake control", async () => {
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("button", { name: "Выбрать фото для Backend dish" });
    expect(container.querySelector(".dish-stock-box")).toBeNull();
    const badge = container.querySelector(".dish-col-stock .dish-stock-badge");
    expect(badge).not.toBeNull();
    expect(badge.tagName).toBe("SPAN");
    expect(badge.classList.contains("is-positive")).toBe(true);
    expect(badge).toHaveTextContent("24");
  });

  it("polishes the photo thumbnail to 40x40 cover with neutral placeholder", async () => {
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("button", { name: "Выбрать фото для Backend dish" });
    const placeholder = container.querySelector(".dish-col-photo .dish-photo-placeholder");
    expect(placeholder).not.toBeNull();
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const photoRule = css.match(/\.dish-catalog-page \.dish-grid-table \.dish-photo-button,[\s\S]*?\}/)?.[0] || "";
    expect(photoRule).toMatch(/width:\s*40px/);
    expect(photoRule).toMatch(/height:\s*40px/);
    expect(photoRule).toMatch(/border-radius:\s*9px/);
    const rowRule = css.match(/\.dish-catalog-page \.dish-grid-table tbody td\s*\{[^}]*\}/)?.[0] || "";
    expect(rowRule).toMatch(/padding-top:\s*8px/);
    expect(rowRule).toMatch(/padding-bottom:\s*8px/);
  });
});

describe("DISHES V23 full-width table", () => {
  it("stretches wrap, scroll and table to 100% with a safe min-width", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const tableRule = css.match(/\.dish-catalog-page\.owner-report-view \.dish-grid-table\s*\{[^}]*\}/)?.[0] || "";
    expect(tableRule).toMatch(/width:\s*100%/);
    expect(tableRule).not.toMatch(/max-content/);
    expect(tableRule).toMatch(/min-width:\s*var\(--dish-grid-min-width/);
    expect(tableRule).toMatch(/table-layout:\s*fixed/);
    expect(css).toMatch(/\.dish-catalog-page\.owner-report-view \.dish-grid-scroll\s*\{[^}]*width:\s*100%/);
    expect(css).not.toContain("!important");
  });

  it("gives the name column the flexible width and keeps utilities compact", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const nameRule = css.match(/\.dish-grid-table \.dish-col-name\s*\{[^}]*\}/g);
    const lastName = nameRule[nameRule.length - 1];
    expect(lastName).toMatch(/width:\s*auto/);
    for (const [col, width] of [["photo", 72], ["unit", 94], ["cost", 136], ["price", 136], ["printer", 154], ["stock", 88], ["sort", 72], ["actions", 90]]) {
      const rules = css.match(new RegExp(`\\.dish-grid-table \\.dish-col-${col}\\s*\\{[^}]*\\}`, "g"));
      expect(rules && rules[rules.length - 1]).toMatch(new RegExp(`width:\\s*${width}px`));
    }
  });

  it("keeps 11 columns without the removed ones returning", async () => {
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("button", { name: "Выбрать фото для Backend dish" });
    const headers = [...container.querySelectorAll(".dish-grid-table thead th")].map((th) => th.textContent);
    expect(headers).toHaveLength(11);
    for (const removed of ["Тип", "Меню", "Подкатегория", "Рецепты"]) {
      expect(headers).not.toContain(removed);
    }
  });
});
