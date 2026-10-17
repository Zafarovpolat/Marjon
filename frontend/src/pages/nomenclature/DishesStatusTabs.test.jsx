import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import NomenclaturePage from "../NomenclaturePage";

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
  printer_name: null,
  ingredients_count: 0,
  stock: null,
  ingredients: [],
  ...overrides,
});

const printers = [];

function mockApis(products) {
  api.get.mockImplementation((url) => {
    if (String(url).includes("/inventory/products")) return Promise.resolve({ data: products });
    if (String(url).includes("printers")) return Promise.resolve({ data: printers });
    if (String(url).includes("categories")) return Promise.resolve({ data: [] });
    if (String(url) === "/units") return Promise.resolve({ data: { items: [] } });
    return Promise.resolve({ data: [] });
  });
}

// Переключатель Активные/Архивированные в шапке Блюд: реальный фильтр по
// canonical is_active, данные — GET /inventory/products?include_all=true.
describe("DISHES status tabs Active/Archived", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("loads the catalog with include_all so archived rows exist client-side", async () => {
    mockApis([backendProduct()]);
    render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/inventory/products",
        expect.objectContaining({ params: { include_all: true } }),
      ),
    );
  });

  it("defaults to Активные and shows only active dishes", async () => {
    mockApis([
      backendProduct({ id: "p1", name: "Плов", is_active: true }),
      backendProduct({ id: "p2", name: "Старый суп", is_active: false }),
    ]);
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    const activeTab = screen.getByRole("tab", { name: "Активные" });
    expect(activeTab).toHaveClass("is-active");
    expect(activeTab).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(container.querySelector(".dish-grid-table").textContent).toContain("Плов"));
    expect(container.querySelector(".dish-grid-table").textContent).not.toContain("Старый суп");
  });

  it("switches to Архивированные and shows only archived dishes", async () => {
    mockApis([
      backendProduct({ id: "p1", name: "Плов", is_active: true }),
      backendProduct({ id: "p2", name: "Старый суп", is_active: false }),
    ]);
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    const archivedTab = screen.getByRole("tab", { name: "Архивированные" });
    expect(archivedTab).toHaveClass("is-active");
    expect(archivedTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Активные" })).not.toHaveClass("is-active");
    await waitFor(() =>
      expect(container.querySelector(".dish-grid-table").textContent).toContain("Старый суп"),
    );
    expect(container.querySelector(".dish-grid-table").textContent).not.toContain("Плов");
    // Переключение — чисто клиентское, без повторного запроса.
    expect(api.get.mock.calls.filter(([url]) => String(url).includes("/inventory/products"))).toHaveLength(1);
  });

  it("paints the toggle pill in the Staff family with #EFF6FF container", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const container = css.match(/\.dish-status-tabs\s*\{[^}]*\}/)?.[0] || "";
    expect(container).toMatch(/background:\s*#EFF6FF/i);
    // V2: белый сегмент несёт скользящий индикатор (transition transform/width),
    // кнопки прозрачные — как у Сотрудников.
    const indicator = css.match(/\.dish-status-tabs__indicator\s*\{[^}]*\}/)?.[0] || "";
    expect(indicator).toMatch(/background:\s*#fff/i);
    expect(indicator).toMatch(/transition:\s*transform[^;]*width/);
    expect(indicator).toMatch(/250ms/);
    const active = css.match(/\.dish-status-tabs button\.is-active\s*\{[^}]*\}/)?.[0] || "";
    expect(active).toMatch(/background:\s*transparent/i);
    expect(css).not.toContain("!important");
  });

  it("styles the archive confirm calmly: compact header, 22px buttons, outlined red", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    // V2.3: текстовый блок прижат к акценту (gap 7px), остальное не двигаем.
    const header = css.match(/\.dish-confirm-layer \.settings-form__header\s*\{[^}]*\}/)?.[0] || "";
    expect(header).toMatch(/gap:\s*7px/);
    // Header block sits closer to the accent; texts slightly larger than base.
    const eyebrow = css.match(/\.dish-confirm-layer \.settings-form__header p\s*\{[^}]*\}/)?.[0] || "";
    expect(eyebrow).toMatch(/font-size:\s*13px/);
    const title = css.match(/\.dish-confirm-layer \.settings-form__header h2\s*\{[^}]*\}/)?.[0] || "";
    expect(title).toMatch(/font-size:\s*20px/);
    expect(title).toMatch(/font-weight:\s*600/);
    expect(title).toMatch(/line-height:\s*1\.3/);
    const footerBtn = css.match(/\.dish-confirm-layer \.settings-form__footer button\s*\{[^}]*\}/)?.[0] || "";
    expect(footerBtn).toMatch(/border-radius:\s*22px/);
    const arch = css.match(
      /\.dish-confirm-layer \.settings-form__footer button\.dishcat-confirm__delete\[type="submit"\]\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(arch).toMatch(/background:\s*#FFFFFF/i);
    expect(arch).toMatch(/border-color:\s*#EF4444/i);
    expect(arch).toMatch(/color:\s*#EF4444/i);
    expect(arch).not.toMatch(/box-shadow:\s*0 0 0/);
    const hover = css.match(
      /\.dish-confirm-layer \.settings-form__footer button\.dishcat-confirm__delete\[type="submit"\]:hover:not\(:disabled\)\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(hover).toMatch(/background:\s*rgba\(239,\s*68,\s*68,\s*0\.06\)/);
    expect(hover).toMatch(/border-color:\s*#EF4444/i);
    expect(hover).toMatch(/color:\s*#EF4444/i);
    expect(hover).toMatch(/box-shadow:\s*none/);
    expect(hover).toMatch(/transform:\s*none/);
  });
});

// V2: Staff-style sliding indicator + archive confirm + real restore.
describe("DISHES archive/restore confirms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  const activeDish = (overrides = {}) => backendProduct({ id: "p1", name: "Лаваш", is_active: true, ...overrides });
  const archivedDish = (overrides = {}) =>
    backendProduct({ id: "p2", name: "Старый суп", is_active: false, ...overrides });

  it("renders a measured sliding indicator under the active segment", async () => {
    mockApis([activeDish()]);
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    const indicator = container.querySelector(".dish-status-tabs__indicator");
    expect(indicator).not.toBeNull();
    expect(indicator.style.transform).toMatch(/translateX\(/);
    expect(indicator.style.width).not.toBe("");
  });

  it("opens an archive confirm on trash and archives only on confirm", async () => {
    mockApis([activeDish(), archivedDish()]);
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    await screen.findByText("Лаваш");
    const row = container.querySelector(".dish-grid-table tbody tr");
    fireEvent.click(within(row).getByRole("button", { name: "Удалить" }));
    const dialog = await screen.findByRole("dialog", { name: "Архивировать блюдо?" });
    expect(dialog).toHaveTextContent("Лаваш");
    expect(api.delete).not.toHaveBeenCalled();
    // Отмена: без мутации, диалог закрыт, строка на месте.
    fireEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Архивировать блюдо?" })).toBeNull());
    expect(api.delete).not.toHaveBeenCalled();
    expect(container.querySelector(".dish-grid-table").textContent).toContain("Лаваш");
    // Подтверждение: реальный DELETE + refetch, строка уезжает в Архивированные.
    api.delete.mockResolvedValue({});
    api.get.mockImplementation((url) => {
      if (String(url).includes("/inventory/products")) {
        return Promise.resolve({ data: [activeDish({ is_active: false }), archivedDish()] });
      }
      return Promise.resolve({ data: [] });
    });
    fireEvent.click(within(row).getByRole("button", { name: "Удалить" }));
    const dialog2 = await screen.findByRole("dialog", { name: "Архивировать блюдо?" });
    fireEvent.click(within(dialog2).getByRole("button", { name: "Архивировать" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/inventory/products/p1"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Архивировать блюдо?" })).toBeNull());
    expect(container.querySelector(".dish-grid-table").textContent).not.toContain("Лаваш");
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await waitFor(() =>
      expect(container.querySelector(".dish-grid-table").textContent).toContain("Лаваш"),
    );
  });

  it("keeps the row on archive API failure without fake removal", async () => {
    mockApis([activeDish()]);
    api.delete.mockRejectedValue({ response: { data: { detail: "Ошибка сервера" } } });
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    const row = container.querySelector(".dish-grid-table tbody tr");
    fireEvent.click(within(row).getByRole("button", { name: "Удалить" }));
    const dialog = await screen.findByRole("dialog", { name: "Архивировать блюдо?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Архивировать" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalled());
    expect(container.querySelector(".dish-grid-table").textContent).toContain("Лаваш");
  });

  it("shows restore (not trash) in Archived and restores through confirm", async () => {
    mockApis([activeDish(), archivedDish()]);
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await waitFor(() =>
      expect(container.querySelector(".dish-grid-table").textContent).toContain("Старый суп"),
    );
    const row = container.querySelector(".dish-grid-table tbody tr");
    expect(within(row).queryByRole("button", { name: "Удалить" })).toBeNull();
    const restore = within(row).getByRole("button", { name: "Восстановить" });
    expect(restore).toHaveClass("dish-restore-action");
    // Отмена восстановления: без PATCH.
    fireEvent.click(restore);
    const dialog = await screen.findByRole("dialog", { name: "Восстановить блюдо?" });
    expect(dialog).toHaveTextContent("Старый суп");
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Восстановить блюдо?" })).toBeNull());
    expect(api.patch).not.toHaveBeenCalled();
    // Подтверждение: реальный PATCH is_active:true, строка возвращается в Активные.
    api.patch.mockResolvedValue({ data: archivedDish({ is_active: true }) });
    // Restore shifts archive neighbours; the full canonical GET is authoritative.
    mockApis([activeDish(), archivedDish({ is_active: true })]);
    fireEvent.click(within(row).getByRole("button", { name: "Восстановить" }));
    const dialog2 = await screen.findByRole("dialog", { name: "Восстановить блюдо?" });
    fireEvent.click(within(dialog2).getByRole("button", { name: "Восстановить" }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/inventory/products/p2", { is_active: true }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Восстановить блюдо?" })).toBeNull());
    fireEvent.click(screen.getByRole("tab", { name: "Активные" }));
    await waitFor(() =>
      expect(container.querySelector(".dish-grid-table").textContent).toContain("Старый суп"),
    );
  });

  it("keeps the archived row on restore API failure", async () => {
    mockApis([archivedDish()]);
    api.patch.mockRejectedValue({ response: { data: { detail: "Ошибка сервера" } } });
    const { container } = render(<NomenclaturePage />);
    await screen.findByRole("table", { name: "Блюда" });
    fireEvent.click(screen.getByRole("tab", { name: "Архивированные" }));
    await waitFor(() =>
      expect(container.querySelector(".dish-grid-table").textContent).toContain("Старый суп"),
    );
    const row = container.querySelector(".dish-grid-table tbody tr");
    fireEvent.click(within(row).getByRole("button", { name: "Восстановить" }));
    const dialog = await screen.findByRole("dialog", { name: "Восстановить блюдо?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Восстановить" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(container.querySelector(".dish-grid-table").textContent).toContain("Старый суп");
  });
});
