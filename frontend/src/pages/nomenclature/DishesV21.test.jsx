import { fireEvent, render, renderHook, screen, waitFor, act, within } from "@testing-library/react";
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

  it("drops Тип/Меню/Подкатегория/Остаток columns and keeps the useful ones", async () => {
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("button", { name: "Выбрать фото для Backend dish" });
    const headers = [...container.querySelectorAll(".dish-grid-table thead th")].map((th) => th.textContent);
    // V25: Остаток заменён на Рецепты (реальный ingredients_count).
    for (const removed of ["Тип", "Меню", "Подкатегория", "Остаток"]) {
      expect(headers).not.toContain(removed);
    }
    for (const kept of ["Фото", "Название", "Ед. изм", "Себестоимость", "Цена", "Принтер", "Рецепты", "Авто", "Сорт", "Действия"]) {
      expect(headers).toContain(kept);
    }
    expect(headers).not.toContain("Сет");
    expect(container.querySelector(".dish-col-type")).toBeNull();
    expect(container.querySelector(".dish-col-menu")).toBeNull();
    expect(container.querySelector(".dish-col-subcategory")).toBeNull();
    expect(container.querySelector(".dish-col-stock")).toBeNull();
    expect(container.querySelector(".dish-col-recipe")).not.toBeNull();
  });

  it("recalculates a compact table min-width from the remaining columns", () => {
    const width = dishColumnOptions.reduce((sum, column) => sum + column.width, 0);
    // V24: точный порядок СОРТ первым, ФОТО вторым, ДЕЙСТВИЯ последними.
    // V25: ОСТАТОК заменён на РЕЦЕПТЫ.
    expect(dishColumnOptions.map((column) => column.key)).toEqual(
      ["sort", "photo", "name", "unit", "cost", "price", "printer", "recipe", "auto", "actions"],
    );
    expect(width).toBe(1108);
  });
});

describe("DISHES V21 toggle contract (no fake switches)", () => {
  it("documents the real backend contract: is_auto/is_set are writable booleans", () => {
    const schemas = readFileSync(`${process.cwd()}/../backend/app/modules/inventory/schemas.py`, "utf8");
    const updateBlock = schemas.match(/class ProductUpdate[\s\S]*?(?=\nclass )/)?.[0] || "";
    // Writable booleans: is_active / is_available (legacy) + V24 is_auto/is_set.
    expect(updateBlock).toContain("is_active");
    expect(updateBlock).toContain("is_available");
    expect(updateBlock).toContain("is_auto");
    expect(updateBlock).toContain("is_set");
    // Остаток/Сорт — не boolean-тумблеры таблицы (stock вычисляется,
    // sort_order — число в payload, не свитч).
    for (const field of ["stock"]) {
      expect(updateBlock).not.toMatch(new RegExp(`^\\s*${field}\\s*:`, "m"));
    }
    expect(buildNomenclatureProductPayload({ name: "X", sort: "1", price: "100", auto: true, set: true })).not.toHaveProperty("auto");
  });

  it("keeps truthful display: numeric stock, boolean auto/set, numeric sort", () => {
    const row = mapNomenclatureProduct(backendProduct({ stock: 42, is_auto: true, is_set: false }));
    expect(row.stock).toBe("42");
    expect(row.auto).toBe(true);
    expect(row.set).toBe(false);
    expect(row.sort).toBe("1");
    expect(mapNomenclatureProduct(backendProduct({ stock: null })).stock).toBe("-");
    // Legacy отсутствие полей = false (миграция backfill).
    expect(mapNomenclatureProduct(backendProduct()).auto).toBe(false);
    expect(mapNomenclatureProduct(backendProduct()).set).toBe(false);
    // V25: ingredients_count маппится для колонки РЕЦЕПТЫ (3 из фикстуры).
    expect(mapNomenclatureProduct(backendProduct()).ingredientsCount).toBe(3);
    expect(mapNomenclatureProduct(backendProduct({ ingredients_count: 0 })).ingredientsCount).toBe(0);
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

  it("renders the name as dominant non-link text without ellipsis", async () => {
    // V27: троеточия удалены — длинный текст переносится, не обрезается.
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("button", { name: "Выбрать фото для Backend dish" });
    expect(container.querySelector(".dish-name-link")).toBeNull();
    const name = container.querySelector(".dish-col-name .dish-name-text");
    expect(name).not.toBeNull();
    expect(name.tagName).toBe("SPAN");
    expect(name).toHaveTextContent("Backend dish");
    expect(name).toHaveAttribute("title", "Backend dish");
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const nameRule = css.match(/\.dish-grid-table \.dish-name-text\s*\{[^}]*\}/)?.[0] || "";
    expect(nameRule).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(nameRule).not.toMatch(/white-space:\s*nowrap/);
  });

  it("keeps the truthful ingredients_count while opening the read-only Recipes dialog", async () => {
    // V25: Остаток заменён на Рецепты. Фикстура несёт ingredients_count: 3.
    // V26: визуал — icon+text ссылка (синяя), не бейдж и не "-".
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("button", { name: "Выбрать фото для Backend dish" });
    expect(container.querySelector(".dish-col-stock")).toBeNull();
    const link = container.querySelector(".dish-col-recipe .dish-recipe-link");
    expect(link).not.toBeNull();
    expect(link.tagName).toBe("BUTTON");
    expect(link).toHaveAttribute("aria-haspopup", "dialog");
    expect(link.classList.contains("is-filled")).toBe(true);
    expect(link).toHaveTextContent("Рецепты (3 шт)");
    fireEvent.click(link);
    const dialog = screen.getByRole("dialog", { name: "Рецепты" });
    expect(dialog).toHaveTextContent("Backend dish");
    expect(within(dialog).getByRole("button", { name: "Добавить" })).toBeDisabled();
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

  it("gives the name column the fixed compact width and keeps utilities compact", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const nameRule = css.match(/\.dish-grid-table \.dish-col-name\s*\{[^}]*\}/g);
    const lastName = nameRule[nameRule.length - 1];
    // V27: Название 190 + ФОТО 72 — название уходит вправо от фото,
    // блок ЕД.ИЗМ/СЕБЕСТ/ЦЕНА едет влево. Не auto.
    expect(lastName).toMatch(/width:\s*190px/);
    expect(lastName).not.toMatch(/width:\s*auto/);
    // V27: боковые колонки фиксированы…
    for (const [col, width] of [["sort", 56], ["photo", 72], ["recipe", 120], ["actions", 96]]) {
      expect(css).toMatch(new RegExp(`\\.dish-col-${col}[^}]*width:\\s*${width}px`));
    }
    for (const col of ["auto", "set"]) {
      expect(css).toMatch(new RegExp(`\\.dish-col-${col}[^}]*width:\\s*64px`));
    }
    // …а средние 4 (Ед.изм/Себест/Цена/Принтер) — гибкие auto: остаток
    // ширины делится между ними, центр растягивается. cost/price
    // сгруппированы в одном правиле — ищем width рядом с классом.
    for (const col of ["unit", "cost", "price", "printer"]) {
      expect(css).toMatch(new RegExp(`\\.dish-col-${col}[^}]*width:\\s*auto`));
    }
  });

  it("keeps 10 columns without the removed ones returning", async () => {
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("button", { name: "Выбрать фото для Backend dish" });
    const headers = [...container.querySelectorAll(".dish-grid-table thead th")].map((th) => th.textContent);
    expect(headers).toHaveLength(10);
    // V25: Остаток тоже удалён (заменён на Рецепты).
    for (const removed of ["Тип", "Меню", "Подкатегория", "Остаток"]) {
      expect(headers).not.toContain(removed);
    }
    expect(headers).toContain("Рецепты");
  });
});
