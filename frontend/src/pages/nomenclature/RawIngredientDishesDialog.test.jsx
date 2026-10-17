import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import RawIngredientDishesDialog from "./RawIngredientDishesDialog";

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

const ingredient = { id: "ing-1", name: "Мука", unit: "кг" };

const products = [
  { id: "dish-1", name: "Лаваш", is_active: true, ingredients: [{ ingredient_id: "ing-1", quantity: 0.2 }] },
  { id: "dish-2", name: "Плов", is_active: true, ingredients: [] },
  { id: "dish-3", name: "Старый суп", is_active: false, ingredients: [{ ingredient_id: "ing-1", quantity: 1 }] },
];

const warehouses = [
  { id: "wh-1", name: "Главный", is_main: true },
  { id: "wh-2", name: "Бар", is_main: false },
];

function renderDialog(props = {}) {
  const onSave = vi.fn(async (productId, lines) => ({
    id: productId,
    ingredients: lines,
    ingredients_count: lines.length,
  }));
  const onClose = vi.fn();
  const onChanged = vi.fn();
  const view = render(
    <RawIngredientDishesDialog
      ingredient={ingredient}
      products={products}
      onClose={onClose}
      onSave={onSave}
      onChanged={onChanged}
      {...props}
    />
  );
  return { onSave, onClose, onChanged, ...view };
}

describe("Raw ingredient dishes usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (String(url).includes("/warehouse/list")) return Promise.resolve({ data: warehouses });
      return Promise.resolve({ data: [] });
    });
  });

  it("lists dishes using the ingredient with quantities", async () => {
    renderDialog();
    expect(await screen.findByRole("heading", { name: "Блюда" })).toBeInTheDocument();
    expect(screen.getByText("Лаваш")).toBeInTheDocument();
    expect(screen.getByText("0,2 кг")).toBeInTheDocument();
    expect(screen.getByText("Старый суп (архив)")).toBeInTheDocument();
  });

  it("shows empty state when unused", async () => {
    renderDialog({ ingredient: { id: "ing-9", name: "Сахар", unit: "кг" } });
    expect(await screen.findByText("Этот продукт пока не используется в блюдах")).toBeInTheDocument();
  });

  it("has stored Warehouse select, no Type/Product selects", async () => {
    renderDialog();
    await screen.findByRole("heading", { name: "Блюда" });
    expect(screen.getByRole("combobox", { name: "Блюдо" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Склад" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Тип" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Товар" })).toBeNull();
    expect(screen.queryByText("Сырьё")).toBeNull();
  });

  it("orders form fields Warehouse first, table columns Warehouse before dish", async () => {
    renderDialog();
    await screen.findByRole("heading", { name: "Блюда" });
    const boxes = screen.getAllByRole("combobox");
    expect(boxes.map((box) => box.getAttribute("aria-label"))).toEqual(["Склад", "Блюдо"]);
    const table = screen.getByRole("table", { name: "Блюда из продуктов" });
    const headers = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["№", "Склад", "Блюдо", "Кол-во", "Действия"]);
  });

  it("has no edit action, only delete with raw-table trash icon", async () => {
    renderDialog();
    await screen.findByText("Лаваш");
    expect(screen.queryByRole("button", { name: "Изменить" })).toBeNull();
    const table = screen.getByRole("table", { name: "Блюда из продуктов" });
    expect(within(table).getAllByRole("button", { name: "Удалить" }).length).toBeGreaterThan(0);
    // Диалог портирован в body — проверяем через document.
    expect(document.querySelector(".dish-recipes-table .danger")).not.toBeNull();
  });

  it("quantity input is editable (not disabled)", async () => {
    renderDialog();
    await screen.findByRole("heading", { name: "Блюда" });
    expect(screen.getByLabelText("Количество")).not.toBeDisabled();
  });

  it("detaches dropdown panel inside the recipes dialog (escapes dialog overflow)", async () => {
    renderDialog();
    await screen.findByRole("heading", { name: "Блюда" });
    fireEvent.click(screen.getByRole("combobox", { name: "Блюдо" }));
    const panel = await screen.findByRole("listbox", { name: "Блюдо" });
    expect(panel.closest(".orders-filter-select__panel")).toHaveClass("is-detached");
  });

  it("shows ingredient unit suffix at the end of quantity field", async () => {
    renderDialog();
    await screen.findByRole("heading", { name: "Блюда" });
    const wrap = screen.getByLabelText("Количество").closest(".dish-recipes-qty-wrap");
    expect(wrap).not.toBeNull();
    expect(wrap.querySelector(".dish-recipes-qty-unit")).toHaveTextContent("кг");
  });

  it("dialog lets detached list overflow + qty focus/border match selects", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const dialog = css.match(/body\.dashboard-body \.dish-recipes-dialog\s*\{[^}]*\}/)?.[0] || "";
    expect(dialog).toMatch(/overflow:\s*visible/);
    expect(css).toMatch(/\.orders-filter-select__panel\.is-detached \.orders-filter-select__menu\s*\{[^}]*max-height:\s*min\(354px/);
    expect(css).toMatch(/\.dish-recipes-field input:focus/);
    expect(css).toMatch(/\.dish-recipes-qty-unit\s*\{/);
  });

  it("adds dish usage through canonical PATCH", async () => {
    const { onSave, onChanged } = renderDialog();
    await screen.findByRole("heading", { name: "Блюда" });
    fireEvent.click(screen.getByRole("combobox", { name: "Блюдо" }));
    fireEvent.click(await screen.findByRole("option", { name: "Плов" }));
    fireEvent.change(screen.getByLabelText("Количество"), { target: { value: "0,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      "dish-2",
      [{ ingredient_id: "ing-1", quantity: 0.5, warehouse_id: null }],
    ));
    // Опция «Плов» остаётся в DOM закрывающейся панели селекта —
    // проверяем строку именно таблицы диалога.
    const table = screen.getByRole("table", { name: "Блюда из продуктов" });
    expect(await within(table).findByText("Плов")).toBeInTheDocument();
    expect(await within(table).findAllByText("Основной")).toHaveLength(3);
    expect(onChanged).toHaveBeenCalledWith("dish-2", expect.objectContaining({ id: "dish-2" }));
  });

  it("saves usage to the selected warehouse", async () => {
    const { onSave } = renderDialog();
    await screen.findByRole("heading", { name: "Блюда" });
    fireEvent.click(screen.getByRole("combobox", { name: "Блюдо" }));
    fireEvent.click(await screen.findByRole("option", { name: "Плов" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Склад" }));
    fireEvent.click(await screen.findByRole("option", { name: "Бар" }));
    fireEvent.change(screen.getByLabelText("Количество"), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      "dish-2",
      [{ ingredient_id: "ing-1", quantity: 11, warehouse_id: "wh-2" }],
    ));
    const table = screen.getByRole("table", { name: "Блюда из продуктов" });
    expect(await within(table).findByText("Бар")).toBeInTheDocument();
  });
  it("removes usage through canonical PATCH", async () => {
    const { onSave } = renderDialog();
    await screen.findByText("Лаваш");
    const row = screen.getByText("Лаваш").closest("tr");
    fireEvent.click(row.querySelector('button[aria-label="Удалить"]'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("dish-1", []));
  });
});
