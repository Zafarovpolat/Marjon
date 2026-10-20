import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import NomenclaturePage, { mapNomenclatureProduct } from "../NomenclaturePage";
import { dishColumnOptions } from "./nomenclatureConfig";
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
  printer_id: "printer-bar-id",
  name: "Плов",
  description: null,
  image_url: null,
  price: 40000,
  cost_price: 12000,
  tax_rate: 12,
  unit: "шт",
  barcode: null,
  sku: null,
  is_active: true,
  is_available: true,
  is_auto: false,
  is_set: false,
  sort_order: 3,
  category_name: null,
  subcategory_name: null,
  printer_name: "БАР",
  ingredients_count: 0,
  stock: null,
  ingredients: [],
  ...overrides,
});

const printers = [
  { id: "printer-bar-id", name: "БАР", ip_address: "192.168.1.36", is_active: true, sort_order: 1 },
];

function mockApis(products, printerList = printers) {
  api.get.mockImplementation((url) => {
    if (String(url).includes("/inventory/products")) return Promise.resolve({ data: products });
    if (String(url).includes("printers")) return Promise.resolve({ data: printerList });
    if (String(url).includes("categories")) return Promise.resolve({ data: [] });
    if (String(url) === "/units") return Promise.resolve({ data: { items: [] } });
    return Promise.resolve({ data: [] });
  });
}

describe("DISHES V24 exact column order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    mockApis([backendProduct()]);
  });

  it("orders SORT first, PHOTO second, ACTIONS last without AUTO (9 columns)", async () => {
    expect(dishColumnOptions.map((c) => c.key)).toEqual(
      ["sort", "photo", "name", "unit", "cost", "price", "printer", "recipe", "actions"],
    );
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    const headers = [...container.querySelectorAll(".dish-grid-table thead th")].map((th) => th.textContent);
    expect(headers).toEqual(
      ["Сорт", "Фото", "Название", "Ед. изм", "Себестоимость", "Цена", "Принтер", "Рецепты", "Действия"],
    );
  });

  it("has no oversized NAME column and shares header/body geometry", () => {
    const nameOpt = dishColumnOptions.find((c) => c.key === "name");
    expect(nameOpt.width).toBe(190);
    expect(nameOpt.width).toBeLessThan(308);
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    expect(css).toMatch(/table-layout:\s*fixed/);
    expect(css).not.toContain("!important");
    // Одна fixed-геометрия: th/td используют те же dish-col-* ширины.
    for (const col of ["sort", "photo", "name", "unit", "cost", "price", "printer", "recipe", "auto", "actions"]) {
      expect(css).toContain(`.dish-col-${col}`);
    }
  });
});

describe("DISHES V24 printer two-line cell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("renders printer name + IP on two lines, no UUID", async () => {
    mockApis([backendProduct()]);
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    await waitFor(() => expect(container.querySelector(".dish-printer-name")).toBeInTheDocument());
    expect(container.querySelector(".dish-printer-name")).toHaveTextContent("БАР");
    expect(container.querySelector(".dish-printer-ip")).toHaveTextContent("192.168.1.36");
    expect(container.querySelector(".dish-grid-table").textContent).not.toContain("printer-bar-id");
  });

  it("handles empty printer with canonical dash", async () => {
    mockApis([backendProduct({ printer_id: null, printer_name: null })], []);
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    await waitFor(() => expect(container.querySelector(".dish-printer-empty")).toBeInTheDocument());
    expect(container.querySelector(".dish-printer-empty")).toHaveTextContent("-");
  });

  it("maps printerIp from backend when present", () => {
    const row = mapNomenclatureProduct(backendProduct({ printer_ip: "10.0.0.5" }));
    expect(row.printerIp).toBe("10.0.0.5");
    expect(row.printer).toBe("БАР");
  });
});

describe("DISHES V24 auto/set real backend switches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("hides AUTO regardless of saved value without changing it", async () => {
    mockApis([backendProduct({ id: "p-off", is_auto: false, is_set: false }), backendProduct({ id: "p-on", name: "Сет", is_auto: true, is_set: true })]);
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    expect(container.querySelector(".dish-col-auto")).toBeNull();
    expect(container.querySelector(".dish-toggle")).toBeNull();
    expect(api.patch).not.toHaveBeenCalled();
    expect(container.querySelector(".dish-col-set")).toBeNull();
  });

  it("does not expose an AUTO mutation in the table", async () => {
    mockApis([backendProduct({ is_auto: false })]);
    api.patch.mockResolvedValue({ data: backendProduct({ is_auto: true }) });
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    expect(container.querySelector(".dish-col-auto")).toBeNull();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("does not attempt hidden AUTO mutations even if endpoint would reject", async () => {
    mockApis([backendProduct({ is_auto: false })]);
    api.patch.mockRejectedValue({ response: { data: { detail: "denied" } } });
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    expect(container.querySelector(".dish-col-auto")).toBeNull();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("leaves hidden AUTO and SET flags untouched on table load", async () => {
    mockApis([backendProduct({ is_auto: false, is_set: false })]);
    api.patch.mockImplementation((url, payload) => {
      return Promise.resolve({ data: backendProduct(payload) });
    });
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    expect(container.querySelector(".dish-col-auto")).toBeNull();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("server state persists (update response becomes row truth)", async () => {
    mockCatalogHookApis();
    const { result } = await importHookWithProduct();
    await waitFor(() => expect(result.current.filteredRows).toHaveLength(1));
    expect(result.current.filteredRows[0].auto).toBe(false);
    api.patch.mockResolvedValue({ data: backendProduct({ is_auto: true }) });
    await act(async () => {
      await result.current.updateRow("product-uuid", "auto", true);
    });
    expect(result.current.filteredRows[0].auto).toBe(true);
    expect(result.current.filteredRows[0].set).toBe(false);
  });

  function mockCatalogHookApis() {
    api.get.mockImplementation((url) => {
      if (String(url).includes("/inventory/products")) return Promise.resolve({ data: [backendProduct()] });
      if (String(url).includes("printers")) return Promise.resolve({ data: [] });
      if (String(url).includes("categories")) return Promise.resolve({ data: [] });
      if (String(url) === "/units") return Promise.resolve({ data: { items: [] } });
      return Promise.resolve({ data: [] });
    });
  }

  async function importHookWithProduct() {
    const { renderHook } = await import("@testing-library/react");
    return renderHook(() => useDishesCatalog());
  }
});

describe("DISHES V24 units preserved + money", () => {
  it("keeps dynamic unit label and UZS money format", () => {
    const row = mapNomenclatureProduct(
      backendProduct({ unit_id: "u1", unit: "legacy", price: 40000, cost_price: 12000 }),
      [{ id: "u1", short_name: "уп", name: "Упаковка" }],
    );
    expect(row.unit).toBe("уп");
    expect(row.price.replace(/\s/g, " ")).toBe("40 000 UZS");
    expect(row.cost.replace(/\s/g, " ")).toBe("12 000 UZS");
    expect(row.sort).toBe("3");
  });
});

describe("DISHES V25 recipes column (real ingredients_count)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("maps the canonical ingredients_count without inventing values", () => {
    expect(mapNomenclatureProduct(backendProduct({ ingredients_count: 5 })).ingredientsCount).toBe(5);
    expect(mapNomenclatureProduct(backendProduct({ ingredients_count: 0 })).ingredientsCount).toBe(0);
    // Нет поля в ответе = 0 (нет рецепта), не фейк.
    const { ingredients_count: _omit, ...noCount } = backendProduct();
    expect(mapNomenclatureProduct(noCount).ingredientsCount).toBe(0);
  });

  it("renders a filled recipe link when composition exists", async () => {
    mockApis([backendProduct({ ingredients_count: 5 })]);
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    // V26: icon+text ссылка (синяя), не бейдж.
    const link = await screen.findByText("Рецепты (5 шт)");
    expect(link.classList.contains("dish-recipe-link")).toBe(true);
    expect(link.classList.contains("is-filled")).toBe(true);
    expect(container.querySelector(".dish-col-stock")).toBeNull();
  });

  it("renders a neutral recipe affordance when the dish has no recipe", async () => {
    mockApis([backendProduct({ ingredients_count: 0 })]);
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    // V26: вместо "-" — та же icon+text ссылка, но нейтрально-чёрная.
    await waitFor(() => expect(container.querySelector(".dish-recipe-link.is-empty")).toBeInTheDocument());
    const link = container.querySelector(".dish-recipe-link.is-empty");
    expect(link).toHaveTextContent("Рецепты");
    expect(link.textContent).not.toContain("-");
  });

  it("paints recipe states blue/neutral via canonical tokens without priority hacks", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const filled = css.match(/\.dish-recipe-link\.is-filled\s*\{[^}]*\}/)?.[0] || "";
    expect(filled).toMatch(/--color-interactive/);
    const empty = css.match(/\.dish-recipe-link\.is-empty\s*\{[^}]*\}/)?.[0] || "";
    expect(empty).toMatch(/--neutral-900/);
    expect(css).not.toContain("!important");
  });
});

describe("DISHES V25 owner toggle color", () => {
  it("paints active AUTO/SET switches in OWNER accent #1FC9C9 without priority hacks", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const onRule = css.match(/\.dish-toggle\.is-on\s*\{[^}]*\}/)?.[0] || "";
    expect(onRule).toMatch(/--owner-accent/);
    expect(onRule).toMatch(/#1fc9c9/i);
    expect(css).not.toContain("!important");
  });
});

describe("DISHES V27 exact center alignment, no ellipsis", () => {
  const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const dishesCssNoComments = () => stripComments(
    readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8"),
  );

  it("keeps the exact 9-column order", () => {
    expect(dishColumnOptions.map((c) => c.key)).toEqual(
      ["sort", "photo", "name", "unit", "cost", "price", "printer", "recipe", "actions"],
    );
  });

  it("centers every header under the shared table geometry", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const thRule = css.match(
      /body\.dashboard-body \.dish-catalog-page\.owner-report-view \.dish-grid-table th\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(thRule).toMatch(/text-align:\s*center/);
  });

  it("centers name, money and printer cells (same classes for header/body)", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    for (const col of ["name", "cost", "price", "printer"]) {
      expect(css).toMatch(new RegExp(`\\.dish-col-${col}[^}]*text-align:\\s*center`));
    }
    // Группа кнопок действий центрируется целиком.
    expect(css).toMatch(/\.dish-row-actions\s*\{[^}]*justify-content:\s*center/);
    // Двухстрочный принтер — центрированная inline-grid группа.
    expect(css).toMatch(/\.dish-printer-lines\s*\{[^}]*display:\s*inline-grid/);
    expect(css).toMatch(/\.dish-printer-lines\s*\{[^}]*justify-items:\s*center/);
  });

  it("has no text-overflow ellipsis anywhere in dishes table rules", () => {
    const css = dishesCssNoComments();
    const tableRules = [...css.matchAll(/[^{}]*\.dish-grid-table[^{}]*\{[^}]*\}/g)].map((m) => m[0]);
    expect(tableRules.length).toBeGreaterThan(0);
    for (const rule of tableRules) {
      expect(rule).not.toMatch(/text-overflow:\s*ellipsis/);
    }
  });

  it("lets name/printer/recipe text wrap instead of truncating", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const nameRule = css.match(/\.dish-grid-table \.dish-name-text\s*\{[^}]*\}/)?.[0] || "";
    expect(nameRule).not.toMatch(/white-space:\s*nowrap/);
    expect(nameRule).not.toMatch(/text-overflow:\s*ellipsis/);
    const printerName = css.match(/\.dish-grid-table \.dish-printer-name\s*\{[^}]*\}/)?.[0] || "";
    expect(printerName).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(printerName).not.toMatch(/white-space:\s*nowrap/);
    const recipeLink = css.match(/\.dish-grid-table \.dish-recipe-link\s*\{[^}]*\}/)?.[0] || "";
    expect(recipeLink).not.toMatch(/white-space:\s*nowrap/);
    expect(recipeLink).not.toMatch(/text-overflow:\s*ellipsis/);
  });

  it("renders no explicit dot-dot-dot fallback in dishes table source", () => {
    const tableSrc = readFileSync(
      `${process.cwd()}/src/pages/nomenclature/DishesTable.jsx`, "utf8",
    );
    expect(tableSrc).not.toContain('"..."');
    expect(tableSrc).not.toContain("'...'");
    expect(tableSrc).not.toContain("…");
  });

    it("opens table cells so overflowing controls never render dot leaders", () => {
    // Точки после тумблеров: 43px-кнопка шире контент-бокса td, legacy
    // overflow:hidden + ellipsis рисовал "..." даже без текста.
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const tdRule = css.match(
      /body\.dashboard-body \.dish-catalog-page\.owner-report-view \.dish-grid-table td\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(tdRule).toMatch(/overflow:\s*visible/);
    expect(tdRule).toMatch(/text-overflow:\s*clip/);
    expect(tdRule).not.toMatch(/ellipsis/);
  });

  it("keeps printer two-line structure and V26 recipe/switch visuals", () => {
    const tableSrc = readFileSync(
      `${process.cwd()}/src/pages/nomenclature/DishesTable.jsx`, "utf8",
    );
    expect(tableSrc).toMatch(/dish-printer-name/);
    expect(tableSrc).toMatch(/dish-printer-ip/);
    expect(tableSrc).toMatch(/dish-recipe-link/);
    expect(tableSrc).not.toMatch(/dish-toggle/);
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    expect(css).toMatch(/@keyframes dish-toggle-ripple-accent/);
    expect(css).not.toContain("!important");
  });
});

describe("DISHES V26 switch cursor + micro-animation", () => {
  const dishesCss = () => readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");

  it("has no busy wait/progress cursor anywhere in dishes scope", () => {
    expect(dishesCss()).not.toMatch(/cursor:\s*wait/i);
    expect(dishesCss()).not.toMatch(/cursor:\s*progress/i);
  });

  it("keeps pointer idle cursor and neutral pending cursor on the toggle", () => {
    const css = dishesCss();
    const base = css.match(/\.dish-toggle\s*\{[^}]*\}/)?.[0] || "";
    expect(base).toMatch(/cursor:\s*pointer/);
    const pending = css.match(/\.dish-toggle:disabled\s*\{[^}]*\}/)?.[0] || "";
    expect(pending).toMatch(/cursor:\s*default/);
    expect(pending).not.toMatch(/cursor:\s*wait/i);
  });

  it("defines a short ripple/drop-shadow animation with accent color", () => {
    const css = dishesCss();
    expect(css).toMatch(/@keyframes dish-toggle-ripple-accent/);
    expect(css).toMatch(/rgba\(31,\s*201,\s*201/);
    expect(css).toMatch(/dish-toggle-ripple 260ms/);
    // Пульс задаётся самим keyframes (scale 0.7 → 1.25), а не :active-сжатием:
    // :active не должен ломать transform тумблера.
    expect(css).toMatch(/@keyframes dish-toggle-ripple\s*\{[\s\S]*?scale\(0\.7\)[\s\S]*?scale\(1\.25\)/);
    expect(css).not.toMatch(/\.dish-toggle:active\s*\{[^}]*scale\(/);
    expect(css).not.toContain("!important");
  });

  it("respects reduced motion for switch animation", () => {
    const css = dishesCss();
    expect(css).toMatch(/prefers-reduced-motion/);
    expect(css).toMatch(/\.dish-toggle\.is-rippling::after\s*\{[^}]*animation:\s*none/);
  });

  it("no longer renders the table toggle or sends its PATCH", async () => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    api.get.mockImplementation((url) => {
      if (String(url).includes("/inventory/products")) {
        return Promise.resolve({ data: [backendProduct({ is_auto: false })] });
      }
      return Promise.resolve({ data: [] });
    });
    api.patch.mockResolvedValue({ data: backendProduct({ is_auto: true }) });
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    expect(container.querySelector(".dish-toggle")).toBeNull();
    expect(api.patch).not.toHaveBeenCalled();
  });
});

describe("DISHES V28 switch outer geometry 40x22", () => {
  const overridesCss = () => readFileSync(`${process.cwd()}/src/styles/react-overrides.css`, "utf8");

  it("sizes the winning toggle rule 36x20 with 16px thumb", () => {
    const css = overridesCss();
    const base = css.match(/\.dish-catalog-page \.dish-toggle\s*\{[^}]*\}/)?.[0] || "";
    expect(base).toMatch(/width:\s*36px/);
    expect(base).toMatch(/height:\s*20px/);
    const knob = css.match(/\.dish-catalog-page \.dish-toggle span\s*\{[^}]*\}/)?.[0] || "";
    expect(knob).toMatch(/width:\s*16px/);
    expect(knob).toMatch(/height:\s*16px/);
    expect(css).not.toContain("!important");
  });

  it("centers the thumb symmetrically in OFF and ON (±8px in 36px track)", () => {
    // Трек 36, паддинг 2x2 (border-box) → ход 32-16=16, симметрия ±8.
    const css = overridesCss();
    const off = css.match(/\.dish-catalog-page \.dish-toggle span\s*\{[^}]*\}/)?.[0] || "";
    expect(off).toMatch(/translateX\(-8px\)/);
    const on = css.match(/\.dish-catalog-page \.dish-toggle\.is-on span\s*\{[^}]*\}/)?.[0] || "";
    expect(on).toMatch(/translateX\(8px\)/);
  });

  it("paints dishes ON #2ED06A and keeps cursor/ripple contract", () => {
    const css = overridesCss();
    const onRule = css.match(/\.dish-catalog-page \.dish-toggle\.is-on\s*\{[^}]*\}/)?.[0] || "";
    expect(onRule).toMatch(/#2ed06a/i);
    const dishes = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    expect(dishes).toMatch(/@keyframes dish-toggle-ripple-accent/);
    expect(dishes).not.toMatch(/cursor:\s*wait/i);
  });
});
