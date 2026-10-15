import { readFileSync } from "node:fs";
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { warehouseService } from "../api/warehouse";
import { nomenclatureService } from "../api/nomenclature";
import { catalogService } from "../api/catalog";
import { settingsService } from "../api/settings";
import WarehousePage, { __resetDocRangeCache } from "./WarehousePage";

// Период кэшируется по секции между маунтами — тесты изолируем сбросом.
beforeEach(() => {
  __resetDocRangeCache();
});

vi.mock("../api/warehouse", () => ({
  warehouseService: {
    list: vi.fn(),
    listStock: vi.fn(),
    listIngredients: vi.fn(),
    listWarehouses: vi.fn(),
    createWarehouse: vi.fn(),
    updateWarehouse: vi.fn(),
    deleteWarehouse: vi.fn(),
    getPurchase: vi.fn(),
    createPurchase: vi.fn(),
    getExpense: vi.fn(),
    createInventory: vi.fn(),
    getInventory: vi.fn(),
    updateInventory: vi.fn(),
    deleteInventory: vi.fn(),
  },
}));

vi.mock("../api/nomenclature", () => ({
  nomenclatureService: {
    listIngredients: vi.fn(async () => ({ data: [] })),
  },
}));

vi.mock("../api/catalog", () => ({
  catalogService: {
    listProducts: vi.fn(async () => ({ data: [] })),
  },
}));

vi.mock("../api/settings", () => ({
  settingsService: {
    listResource: vi.fn(async () => ({ data: [] })),
  },
}));

vi.mock("../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));
vi.mock("../components/ReportEmptyState", () => ({
  default: ({ title }) => <div><strong>{title}</strong></div>,
}));

const warehouses = [
  { id: "wh-1", company_id: "c1", name: "Главный склад", address: null, is_main: true, branch_id: null },
  { id: "wh-2", company_id: "c1", name: "BAR", address: null, is_main: false, branch_id: null },
];

const stock = [
  { warehouse_id: "wh-1", ingredient_id: "ing-1", quantity: 50, cost_price: 1000, unit: "кг" },
  { warehouse_id: "wh-1", ingredient_id: "ing-2", quantity: 10, cost_price: 500, unit: "кг" },
  { warehouse_id: "wh-2", ingredient_id: "ing-1", quantity: 5, cost_price: 1000, unit: "кг" },
];

const ingredients = [
  { id: "ing-1", name: "kartoshka", category: "sabzavotlar", unit: "кг" },
  { id: "ing-2", name: "POMIDOR", category: "sabzavotlar", unit: "кг" },
];

function mockStock({ warehouses: wh = warehouses, stock: items = stock, ingredients: ings = ingredients } = {}) {
  warehouseService.listStock.mockResolvedValue({ data: items });
  warehouseService.listWarehouses.mockResolvedValue({ data: wh });
  warehouseService.listIngredients.mockResolvedValue({ data: ings });
  warehouseService.list.mockResolvedValue({ data: [] });
}

describe("Warehouse stock summary (V36 dishes family)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. renders per-warehouse rows with tfoot total at the bottom", async () => {
    mockStock();
    const { container } = render(<WarehousePage initialSection="stock" />);
    expect(await screen.findByRole("heading", { name: "Остаток товаров" })).toBeInTheDocument();
    const headers = [...container.querySelectorAll(".warehouse-stock-table thead th")].map((th) => th.textContent);
    expect(headers).toEqual(["№", "Название", "Продукты", "Товары", "Сумма", "Статус", "Действия"]);
    const table = screen.getByRole("table", { name: "Остаток по складам" });
    // wh-1: 50×1000 + 10×500 = 55 000; wh-2: 5×1000 = 5 000; итого 60 000.
    expect(within(table).getByText("Главный склад")).toBeInTheDocument();
    expect(within(table).getByText("BAR")).toBeInTheDocument();
    expect(table.textContent).toMatch(/55[\s\u00a0\u202f]*000 UZS/);
    expect(table.textContent).toMatch(/5[\s\u00a0\u202f]*000 UZS/);
    const tfoot = container.querySelector(".warehouse-stock-table tfoot");
    expect(tfoot).not.toBeNull();
    expect(tfoot.textContent).toMatch(/Итого/);
    expect(tfoot.textContent).toMatch(/60[\s\u00a0\u202f]*000 UZS/);
    // Товары отделяются от Продуктов: без sale-карточек всё — Продукты.
    expect(warehouseService.list).toHaveBeenCalledWith("incoming", expect.anything());
  });

  it("2. add warehouse through centered modal posts name and active status", async () => {
    mockStock();
    warehouseService.createWarehouse.mockImplementation(async (payload) => ({
      data: { id: "wh-3", name: payload.name, is_main: false },
    }));
    render(<WarehousePage initialSection="stock" />);
    await screen.findByText("Главный склад");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(await screen.findByRole("heading", { name: "Добавить склад" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Название склада"), { target: { value: "Третий" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Добавить" }).pop());
    await waitFor(() => expect(warehouseService.createWarehouse).toHaveBeenCalledWith({ name: "Третий", is_active: true }));
    await waitFor(() => expect(warehouseService.listStock).toHaveBeenCalledTimes(2));
  });

  it("3. rename warehouse through edit modal", async () => {
    mockStock();
    warehouseService.updateWarehouse.mockResolvedValue({ data: {} });
    render(<WarehousePage initialSection="stock" />);
    await screen.findByText("BAR");
    const row = screen.getByText("BAR").closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Редактировать" }));
    expect(await screen.findByRole("heading", { name: "Редактировать склад" })).toBeInTheDocument();
    const input = screen.getByLabelText("Название склада");
    fireEvent.change(input, { target: { value: "Бар" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(warehouseService.updateWarehouse).toHaveBeenCalledWith("wh-2", { name: "Бар", is_active: true }));
  });

  it("4. delete guarded warehouse shows backend 409 detail", async () => {
    mockStock();
    warehouseService.deleteWarehouse.mockRejectedValue({
      response: { data: { detail: "Склад используется: остатки" } },
    });
    render(<WarehousePage initialSection="stock" />);
    await screen.findByText("BAR");
    const row = screen.getByText("BAR").closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Удалить" }));
    expect(await screen.findByRole("heading", { name: "Удалить склад?" })).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(warehouseService.deleteWarehouse).toHaveBeenCalledWith("wh-2"));
    expect(await screen.findByText("Склад используется: остатки")).toBeInTheDocument();
  });

  it("5. empty warehouses show compact empty state without tfoot", async () => {
    mockStock({ warehouses: [], stock: [] });
    const { container } = render(<WarehousePage initialSection="stock" />);
    expect(await screen.findByText("Склады пока не добавлены.")).toBeInTheDocument();
    expect(container.querySelector(".warehouse-stock-table tfoot")).toBeNull();
  });

  it("9. warehouse modal closes through exit animation with proportional X", async () => {
    mockStock();
    render(<WarehousePage initialSection="stock" />);
    await screen.findByText("Главный склад");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await screen.findByRole("heading", { name: "Добавить склад" });
    const overlay = document.querySelector(".warehouse-modal-layer .settings-modal-overlay, .settings-modal.warehouse-modal");
    expect(overlay).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(document.querySelector(".settings-modal-overlay.is-closing")).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Добавить склад" })).toBeNull());
    const css = readFileSync(`${process.cwd()}/src/styles/owner/warehouse.css`, "utf8");
    const x = css.match(
      /\.settings-owner-view \.settings-modal\.warehouse-modal \.settings-form__header button\[aria-label="Закрыть"\]\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(x).toMatch(/width:\s*38px/);
    expect(x).toMatch(/border-radius:\s*999px/);
  });

  it("6. warehouse name is a link that opens detail without Excel or search", async () => {
    mockStock();
    render(<WarehousePage initialSection="stock" />);
    const link = await screen.findByRole("button", { name: "Открыть остатки склада Главный склад" });
    expect(link).toHaveClass("wh-stock-link");
    fireEvent.click(link);
    const detail = await screen.findByRole("table", { name: "Остаток склада Главный склад" });
    expect(within(detail).getByText("Всего")).toBeInTheDocument();
    expect(within(detail).getByText("Продукты")).toBeInTheDocument();
    expect(within(detail).getByText("Товары")).toBeInTheDocument();
    // Без Excel и поисковика — по требованию OWNER.
    expect(screen.queryByRole("button", { name: /excel/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/поиск/i)).toBeNull();
    // Категории по умолчанию закрыты — позиции видны после раскрытия.
    expect(within(detail).queryByText("kartoshka")).toBeNull();
    fireEvent.click(within(detail).getByRole("button", { name: "Развернуть категорию продуктов sabzavotlar" }));
    expect(await within(detail).findByText("kartoshka")).toBeInTheDocument();
  });

  it("7. detail groups by category with totals; warehouseId prop renders detail directly", async () => {
    mockStock();
    render(<WarehousePage initialSection="stock" warehouseId="wh-1" />);
    const detail = await screen.findByRole("table", { name: "Остаток склада Главный склад" });
    // wh-1: qty 50+10=60; sum 50×1000+10×500=55 000.
    expect(detail.textContent).toMatch(/60/);
    expect(detail.textContent).toMatch(/55[\s\u00a0\u202f]*000 UZS/);
    expect(within(detail).getByText("sabzavotlar")).toBeInTheDocument();
    // Позиции скрыты, пока категория закрыта.
    expect(within(detail).queryByText("POMIDOR")).toBeNull();
    fireEvent.click(within(detail).getByRole("button", { name: "Развернуть категорию продуктов sabzavotlar" }));
    expect(await within(detail).findByText("POMIDOR")).toBeInTheDocument();
    // Кнопки «Назад» в шапке нет — возврат через стрелку топбара (роут).
    expect(screen.queryByRole("button", { name: /назад/i })).toBeNull();
  });

  it("7b. link click notifies onOpenWarehouse for route navigation", async () => {
    mockStock();
    const onOpen = vi.fn();
    render(<WarehousePage initialSection="stock" onOpenWarehouse={onOpen} />);
    fireEvent.click(await screen.findByRole("button", { name: "Открыть остатки склада BAR" }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    expect(onOpen.mock.calls[0][0]).toMatchObject({ id: "wh-2", name: "BAR" });
  });

  it("8. category toggle expands and collapses ingredient lines", async () => {
    mockStock();
    render(<WarehousePage initialSection="stock" />);
    fireEvent.click(await screen.findByRole("button", { name: "Открыть остатки склада Главный склад" }));
    const detail = await screen.findByRole("table", { name: "Остаток склада Главный склад" });
    // По умолчанию закрыто.
    expect(within(detail).queryByText("kartoshka")).toBeNull();
    fireEvent.click(within(detail).getByRole("button", { name: "Развернуть категорию продуктов sabzavotlar" }));
    await within(detail).findByText("kartoshka");
    const toggle = within(detail).getByRole("button", { name: "Свернуть категорию продуктов sabzavotlar" });
    fireEvent.click(toggle);
    // Закрытие с анимацией 200мс: строки уходят не мгновенно.
    await waitFor(() => expect(within(detail).queryByText("kartoshka")).toBeNull());
    expect(within(detail).getByText("sabzavotlar")).toBeInTheDocument();
  });

  it("8b. tovar ingredient splits into Товары column and tree", async () => {
    mockStock();
    catalogService.listProducts.mockResolvedValue({
      data: [{ id: "prod-1", name: "POMIDOR", category_name: "sabzavotlar", unit: "кг", price: 500, product_type: "sale", is_active: true }],
    });
    const { container } = render(<WarehousePage initialSection="stock" />);
    const table = await screen.findByRole("table", { name: "Остаток по складам" });
    // wh-1: продукты 50×1000=50 000, товары 10×500=5 000, сумма 55 000.
    expect(table.textContent).toMatch(/50[\s\u00a0\u202f]*000 UZS/);
    expect(table.textContent).toMatch(/55[\s\u00a0\u202f]*000 UZS/);
    // Статус-точка как в Официантах: без пилюли, точка + текст.
    expect(container.querySelector(".wh-status-dot.is-active")).not.toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Открыть остатки склада Главный склад" }));
    const detail = await screen.findByRole("table", { name: "Остаток склада Главный склад" });
    expect(within(detail).getByText("Товары по категориям")).toBeInTheDocument();
    expect(within(detail).getByText("Продукты по категориям")).toBeInTheDocument();
  });

  it("8c. period picker reloads stock as of date and locks mutations", async () => {
    mockStock();
    render(<WarehousePage initialSection="stock" />);
    await screen.findByText("Главный склад");
    // Кнопка периода — тот же canonical-пикер, что в отчётах (сегодня = текущие).
    // По умолчанию пресет Сегодня активен, как в Отчётах.
    expect(screen.getByRole("button", { name: "Остатки на дату" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Остатки на дату" }));
    expect(await screen.findByRole("button", { name: "Сегодня" })).toHaveClass("is-active");
    fireEvent.click(await screen.findByRole("button", { name: "Вчера" }));
    // Как в отчётах: пресет — черновик до ОК.
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    const pad = (value) => String(value).padStart(2, "0");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayApi = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
    await waitFor(() => {
      const calls = warehouseService.listStock.mock.calls;
      expect(calls.some((call) => call[0]?.params?.as_of === yesterdayApi)).toBe(true);
    });
    // Исторический срез read-only: Добавить скрыт, плашка видна.
    // Формат даты в плашке — точками (ДД.ММ.ГГГГ), как кнопка и отчёты.
    expect(screen.queryByRole("button", { name: "Добавить" })).toBeNull();
    expect(await screen.findByText(/Срез на \d{2}\.\d{2}\.\d{4} — только просмотр/)).toBeInTheDocument();
    // Кнопка периода — та же пилюля 22px, что в Отчётах (REPORT-02/DISHES-01).
    const whCss = readFileSync(`${process.cwd()}/src/styles/owner/warehouse.css`, "utf8");
    const periodRule = whCss.match(/\.warehouse-stock-page[^{]*\.report-period-button\s*\{[^}]*\}/)?.[0] || "";
    expect(periodRule).toMatch(/border-radius:\s*22px/);
    // Пресет Сегодня возвращает к текущим остаткам.
    fireEvent.click(screen.getByRole("button", { name: "Остатки на дату" }));
    fireEvent.click(await screen.findByRole("button", { name: "Сегодня" }));
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    await waitFor(() => {
      const calls = warehouseService.listStock.mock.calls;
      expect(calls[calls.length - 1][0]?.params).toBeUndefined();
    });
    expect(await screen.findByRole("button", { name: "Добавить" })).toBeInTheDocument();
  });

  it("8c2. stockRangeToAsOf takes period end as the snapshot date", async () => {
    const { stockRangeToAsOf } = await import("./WarehousePage");
    expect(stockRangeToAsOf({ start: "01.10.2026", end: "05.10.2026" })).toBe("2026-10-05");
    expect(stockRangeToAsOf({ start: "05.10.2026", end: "05.10.2026" })).toBe("2026-10-05");
    expect(stockRangeToAsOf({})).toBe("");
  });

  it("8e. incoming summary groups by warehouse with product/tovar split", async () => {
    const pad = (value) => String(value).padStart(2, "0");
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const regToday = `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()} / 12:00`;
    const doc = (id, number, whId, whName, total) => ({
      id, number, supplier: `Поставщик-${number}`, warehouse_id: whId, warehouse_name: whName,
      date: isoToday, registered_at: regToday,
      items_count: 1, total_amount: total,
      status: "draft", created_by_name: "",
    });
    warehouseService.list.mockResolvedValue({
      data: [
        doc("d1", 1, "wh-1", "Главный склад", 2500),
        doc("d2", 2, "wh-1", "Главный склад", 3000),
        doc("d3", 3, "wh-2", "BAR", 500),
      ],
    });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    // Продукт vs Товар — по строкам getPurchase (есть product_id → Товар).
    warehouseService.getPurchase.mockImplementation(async (id) => {
      if (id === "d1") {
        return { data: { items: [
          { quantity: 2, cost_price: 1000, product_id: null },
          { quantity: 1, cost_price: 500, product_id: "prod-1" },
        ] } };
      }
      if (id === "d2") {
        return { data: { items: [{ quantity: 1, cost_price: 3000, product_id: null }] } };
      }
      return { data: { items: [{ quantity: 5, cost_price: 100, product_id: "prod-2" }] } };
    });
    const { container } = render(<WarehousePage initialSection="incoming" />);
    const table = await screen.findByRole("table", { name: "Приход по складам" });
    const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(headers).toEqual(["№", "Название", "Продукт", "Товар", "Сумма"]);
    // Снизу — карточка «Инвентаризация» как таблица Прихода (излишки).
    const invTable = await screen.findByRole("table", { name: "Инвентаризация по складам" });
    expect([...invTable.querySelectorAll("thead th")].map((th) => th.textContent))
      .toEqual(["№", "Название", "Продукт", "Товар", "Сумма"]);
    // wh-1: продукты 2×1000+1×3000=5 000, товары 1×500=500, сумма 5 500.
    // wh-2: товары 5×100=500.
    expect(within(table).getByText("Главный склад")).toBeInTheDocument();
    expect(within(table).getByText("BAR")).toBeInTheDocument();
    expect(table.textContent).toMatch(/5[\s\u00a0\u202f]*500 UZS/);
    expect(table.textContent).toMatch(/500 UZS/);
    const tfoot = container.querySelector(".warehouse-stock-table tfoot");
    expect(tfoot).not.toBeNull();
    expect(tfoot.textContent).toMatch(/Итого/);
    expect(tfoot.textContent).toMatch(/6[\s\u00a0\u202f]*000 UZS/);
    // Кнопка периода общая (docRange); кнопки «Новый приход +» нет.
    expect(screen.getByRole("button", { name: "Период документов" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Новый приход/ })).toBeNull();
  });

  it("8h. incoming summary period filters like reports", async () => {
    const pad = (value) => String(value).padStart(2, "0");
    const isoDay = (offset) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - offset);
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    };
    const regDay = (offset) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - offset);
      return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} / 12:00`;
    };
    const doc = (id, number, whId, whName, date, registeredAt, total) => ({
      id, number, supplier: `Поставщик-${number}`, warehouse_id: whId, warehouse_name: whName,
      date, registered_at: registeredAt,
      items_count: 1, total_amount: total,
      status: "draft", created_by_name: "",
    });
    warehouseService.list.mockResolvedValue({
      data: [
        doc("d1", 1, "wh-1", "Главный склад", isoDay(1), regDay(0), 1000),
        doc("d2", 2, "wh-2", "BAR", isoDay(0), regDay(1), 2000),
      ],
    });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    warehouseService.getPurchase.mockResolvedValue({ data: { items: [] } });
    render(<WarehousePage initialSection="incoming" />);
    const table = await screen.findByRole("table", { name: "Приход по складам" });
    const rowFor = (name) => within(table).getByText(name).closest("tr");
    // По умолчанию Сегодня: wh-1 = 1 000, wh-2 = 0 (период по дате регистрации).
    expect(rowFor("Главный склад").textContent).toMatch(/1[\s\u00a0\u202f]*000 UZS/);
    // Вчера + ОК — наоборот (пресет черновик до ОК, как в отчётах).
    fireEvent.click(screen.getByRole("button", { name: "Период документов" }));
    fireEvent.click(await screen.findByRole("button", { name: "Вчера" }));
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    expect(await within(table).findByText("BAR")).toBeInTheDocument();
    expect(rowFor("BAR").textContent).toMatch(/2[\s\u00a0\u202f]*000 UZS/);
    // Сегодня + ОК — возврат.
    fireEvent.click(screen.getByRole("button", { name: "Период документов" }));
    fireEvent.click(await screen.findByRole("button", { name: "Сегодня" }));
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    expect(rowFor("Главный склад").textContent).toMatch(/1[\s\u00a0\u202f]*000 UZS/);
  });

  it("8i. incoming warehouse click opens stock-like breakdown of primary приход", async () => {
    const pad = (value) => String(value).padStart(2, "0");
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const regToday = `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()} / 12:00`;
    const doc = (id, number, supplier, whId, whName) => ({
      id, number, supplier, warehouse_id: whId, warehouse_name: whName,
      date: isoToday, registered_at: regToday,
      items_count: 2, total_amount: 220000,
      status: "draft", created_by_name: "",
    });
    warehouseService.list.mockResolvedValue({
      data: [
        doc("d1", 1, "Анвар", "wh-1", "Главный склад"),
        doc("d2", 2, "Другой", "wh-2", "BAR"),
      ],
    });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    // Только первичный приход: строки документа (расхода здесь нет).
    warehouseService.getPurchase.mockImplementation(async (id) => {
      if (id !== "d1") return { data: { items: [] } };
      return { data: { items: [
        { id: "li-1", ingredient_id: "ing-1", product_id: null, name: "kartoshka", quantity: 20, unit: "кг", cost_price: 5000 },
        { id: "li-2", ingredient_id: null, product_id: "prod-1", name: "COCA COLA", quantity: 10, unit: "шт", cost_price: 12000 },
      ] } };
    });
    warehouseService.listIngredients.mockResolvedValue({
      data: [{ id: "ing-1", name: "kartoshka", category: "sabzavotlar", unit: "кг" }],
    });
    render(<WarehousePage initialSection="incoming" />);
    fireEvent.click(await screen.findByRole("button", { name: "Открыть приходы склада Главный склад" }));
    // Внутренний экран как в Остатках: Всего/Продукты/Товары + категории.
    const detail = await screen.findByRole("table", { name: "Приход склада Главный склад" });
    expect(within(detail).getByText("Всего")).toBeInTheDocument();
    expect(within(detail).getByText("Продукты")).toBeInTheDocument();
    expect(within(detail).getByText("Товары")).toBeInTheDocument();
    // 20×5000 + 10×12000 = 220 000; кол-во 30.
    expect(detail.textContent).toMatch(/220[\s\u00a0\u202f]*000 UZS/);
    // Категории по умолчанию закрыты — позиции видны после раскрытия.
    expect(within(detail).queryByText("kartoshka")).toBeNull();
    fireEvent.click(within(detail).getByRole("button", { name: "Развернуть категорию продуктов sabzavotlar" }));
    expect(await within(detail).findByText("kartoshka")).toBeInTheDocument();
    // Чужого склада здесь нет, Excel/поиска нет, кнопки «Новый приход» нет.
    expect(within(detail).queryByText("Другой")).toBeNull();
    expect(screen.queryByRole("button", { name: /excel/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Новый приход/ })).toBeNull();
    // Период и в детализации; кнопки «Назад» в шапке нет —
    // возврат стрелкой топбара (popstate) на главный экран «Приход товаров».
    expect(screen.getByRole("button", { name: "Период документов" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /назад/i })).toBeNull();
    // Стрелка топбара: history.back -> popstate закрывает детализацию.
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByRole("table", { name: "Приход по складам" })).toBeInTheDocument();
  });

  it("8j. outgoing summary groups by warehouse with sale-match tovar split", async () => {
    const pad = (value) => String(value).padStart(2, "0");
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const regToday = `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()} / 12:00`;
    const doc = (id, number, whId, whName) => ({
      id, number, receiver: `Получатель-${number}`, warehouse_id: whId, warehouse_name: whName,
      date: isoToday, registered_at: regToday,
      items_count: 1, total_amount: 1000,
      status: "draft", created_by_name: "",
    });
    warehouseService.list.mockResolvedValue({
      data: [doc("e1", 1, "wh-1", "Главный склад"), doc("e2", 2, "wh-2", "BAR")],
    });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    warehouseService.listIngredients.mockResolvedValue({
      data: [
        { id: "ing-1", name: "kartoshka", category: "sabzavotlar", unit: "кг" },
        { id: "ing-2", name: "COCA COLA", category: "напитки", unit: "шт" },
      ],
    });
    catalogService.listProducts.mockResolvedValue({
      data: [{ id: "prod-1", name: "COCA COLA", unit: "шт", product_type: "sale", is_active: true }],
    });
    // У строк расхода нет product_id — Товар отделяем совпадением с sale.
    warehouseService.getExpense.mockImplementation(async (id) => {
      if (id === "e1") {
        return { data: { items: [
          { ingredient_id: "ing-1", name: "kartoshka", quantity: 2, unit: "кг", cost_price: 1000 },
          { ingredient_id: "ing-2", name: "COCA COLA", quantity: 3, unit: "шт", cost_price: 500 },
        ] } };
      }
      return { data: { items: [
        { ingredient_id: "ing-1", name: "kartoshka", quantity: 1, unit: "кг", cost_price: 1000 },
      ] } };
    });
    render(<WarehousePage initialSection="outgoing" />);
    const table = await screen.findByRole("table", { name: "Расход по складам" });
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent))
      .toEqual(["№", "Название", "Продукт", "Товар", "Сумма"]);
    // wh-1: продукты 2×1000=2 000, товары 3×500=1 500, сумма 3 500.
    const rowFor = (name) => within(table).getByText(name).closest("tr");
    expect(rowFor("Главный склад").textContent).toMatch(/3[\s\u00a0\u202f]*500 UZS/);
    expect(rowFor("BAR").textContent).toMatch(/1[\s\u00a0\u202f]*000 UZS/);
    expect(table.textContent).toMatch(/4[\s\u00a0\u202f]*500 UZS/);
    // Кнопки «Новый расход +» нет (как в Приходе), период на месте.
    expect(screen.getByRole("button", { name: "Период документов" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Новый расход/ })).toBeNull();
  });

  it("8k. outgoing summary period filters like reports", async () => {
    const pad = (value) => String(value).padStart(2, "0");
    const isoDay = (offset) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - offset);
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    };
    const regDay = (offset) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - offset);
      return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} / 12:00`;
    };
    const doc = (id, number, whId, whName, date, registeredAt, total) => ({
      id, number, receiver: `Получатель-${number}`, warehouse_id: whId, warehouse_name: whName,
      date, registered_at: registeredAt,
      items_count: 1, total_amount: total,
      status: "draft", created_by_name: "",
    });
    warehouseService.list.mockResolvedValue({
      data: [
        doc("e1", 1, "wh-1", "Главный склад", isoDay(1), regDay(0), 1000),
        doc("e2", 2, "wh-2", "BAR", isoDay(0), regDay(1), 2000),
      ],
    });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    warehouseService.getExpense.mockResolvedValue({ data: { items: [] } });
    render(<WarehousePage initialSection="outgoing" />);
    const table = await screen.findByRole("table", { name: "Расход по складам" });
    const rowFor = (name) => within(table).getByText(name).closest("tr");
    expect(rowFor("Главный склад").textContent).toMatch(/1[\s\u00a0\u202f]*000 UZS/);
    fireEvent.click(screen.getByRole("button", { name: "Период документов" }));
    fireEvent.click(await screen.findByRole("button", { name: "Вчера" }));
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    expect(rowFor("BAR").textContent).toMatch(/2[\s\u00a0\u202f]*000 UZS/);
  });

  it("8l. outgoing warehouse click opens stock-like breakdown of expense only", async () => {
    const pad = (value) => String(value).padStart(2, "0");
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const regToday = `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()} / 12:00`;
    warehouseService.list.mockResolvedValue({
      data: [{
        id: "e1", number: 1, receiver: "Кухня", warehouse_id: "wh-1", warehouse_name: "Главный склад",
        date: isoToday, registered_at: regToday,
        items_count: 1, total_amount: 100000,
        status: "draft", created_by_name: "",
      }],
    });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    warehouseService.listIngredients.mockResolvedValue({
      data: [{ id: "ing-1", name: "kartoshka", category: "sabzavotlar", unit: "кг" }],
    });
    catalogService.listProducts.mockResolvedValue({ data: [] });
    warehouseService.getExpense.mockResolvedValue({ data: { items: [
      { ingredient_id: "ing-1", name: "kartoshka", quantity: 20, unit: "кг", cost_price: 5000 },
    ] } });
    render(<WarehousePage initialSection="outgoing" />);
    fireEvent.click(await screen.findByRole("button", { name: "Открыть расходы склада Главный склад" }));
    const detail = await screen.findByRole("table", { name: "Расход склада Главный склад" });
    expect(within(detail).getByText("Всего")).toBeInTheDocument();
    // 20×5000 = 100 000, всё — Продукты.
    expect(detail.textContent).toMatch(/100[\s\u00a0\u202f]*000 UZS/);
    expect(within(detail).queryByText("kartoshka")).toBeNull();
    fireEvent.click(within(detail).getByRole("button", { name: "Развернуть категорию продуктов sabzavotlar" }));
    expect(await within(detail).findByText("kartoshka")).toBeInTheDocument();
    // Кнопки «Назад» в шапке нет — возврат стрелкой топбара (popstate)
    // на главный экран «Расход товаров».
    expect(screen.queryByRole("button", { name: /назад/i })).toBeNull();
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByRole("table", { name: "Расход по складам" })).toBeInTheDocument();
  });

  it("8e2. docDateToISO normalizes doc dates for range compare", async () => {
    const { docDateToISO, registeredAtToISO } = await import("./WarehousePage");
    expect(docDateToISO("2026-10-05")).toBe("2026-10-05");
    expect(docDateToISO("05.10.2026")).toBe("2026-10-05");
    expect(docDateToISO("05-10-2026")).toBe("2026-10-05");
    expect(docDateToISO("")).toBe("");
    // registered_at — UTC без зоны ("05.10.2026 / 12:00"): полдень не
    // перепрыгивает сутки при переводе в локальный день.
    expect(registeredAtToISO("05.10.2026 / 12:00")).toBe("2026-10-05");
    expect(registeredAtToISO("")).toBe("");
    expect(registeredAtToISO("—")).toBe("");
  });

  it("8g. incoming-journal list header has reports period button", async () => {
    warehouseService.list.mockResolvedValue({ data: [] });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    render(<WarehousePage initialSection="incoming-journal" />);
    expect(await screen.findByRole("button", { name: "Период документов" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать" })).toBeInTheDocument();
    // Календарь журнала — нежирный, как в отчётах: попап живёт внутри
    // dish-header-actions, где react-overrides ставит button 800.
    const whCss = readFileSync(`${process.cwd()}/src/styles/owner/warehouse.css`, "utf8");
    const journalRule = whCss.match(/\.warehouse-journal-page[^{]*\{[^}]*\}/g)?.find((rule) => rule.includes(".report-date-calendar-grid button")) || "";
    expect(journalRule).toMatch(/font-weight:\s*400/);
  });

  it("8f. stock period button shows range like reports", async () => {
    mockStock();
    render(<WarehousePage initialSection="stock" />);
    await screen.findByText("Главный склад");
    const pad = (value) => String(value).padStart(2, "0");
    const fmt = (dt) => `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const monStr = fmt(monday);
    const todayStr = fmt(now);
    fireEvent.click(screen.getByRole("button", { name: "Остатки на дату" }));
    fireEvent.click(await screen.findByRole("button", { name: "Эта неделя" }));
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    // Кнопка — диапазоном, как в отчётах (а не одной датой).
    const trigger = screen.getByRole("button", { name: "Остатки на дату" });
    if (monStr === todayStr) {
      expect(trigger).toHaveTextContent(monStr);
    } else {
      expect(trigger).toHaveTextContent(`${monStr} – ${todayStr}`);
    }
    // Данные — текущие (конец недели = сегодня): Добавить на месте, среза нет.
    expect(screen.getByRole("button", { name: "Добавить" })).toBeInTheDocument();
    expect(screen.queryByText(/только просмотр/)).toBeNull();
    // Пресет подсвечен и после применения.
    fireEvent.click(trigger);
    expect(await screen.findByRole("button", { name: "Эта неделя" })).toHaveClass("is-active");
  });

  it("8d. detail header has period picker", async () => {
    mockStock();
    render(<WarehousePage initialSection="stock" warehouseId="wh-1" />);
    const detail = await screen.findByRole("table", { name: "Остаток склада Главный склад" });
    expect(detail).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Остатки на дату" })).toBeInTheDocument();
  });
});

describe("Warehouse incoming-journal (Добавить продуктов)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("10. shows warehouse fallback name and local registration time", async () => {
    // Журнал фильтруется периодом (по умолчанию Сегодня, как в отчётах) —
    // дата документа = сегодня, иначе строка скрыта фильтром.
    const pad0 = (value) => String(value).padStart(2, "0");
    const now0 = new Date();
    const todayApi0 = `${now0.getFullYear()}-${pad0(now0.getMonth() + 1)}-${pad0(now0.getDate())}`;
    const todayDMY0 = `${pad0(now0.getDate())}-${pad0(now0.getMonth() + 1)}-${now0.getFullYear()}`;
    // registered_at — сегодня в полдень UTC (локальный день совпадает при
    // любом разумном часовом поясе, как в 8e/8h).
    const regToday0 = `${pad0(now0.getDate())}.${pad0(now0.getMonth() + 1)}.${now0.getFullYear()} / 12:00`;
    warehouseService.list.mockResolvedValue({
      data: [{
        id: "doc-1",
        number: 7,
        supplier: "Анвар",
        warehouse_id: "wh-1",
        warehouse_name: null,
        date: todayApi0,
        registered_at: regToday0,
        items_count: 3,
        total_amount: 2400000,
        status: "draft",
        created_by_name: "admin",
      }],
    });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    render(<WarehousePage initialSection="incoming-journal" />);
    expect(await screen.findByRole("heading", { name: "Добавить продуктов" })).toBeInTheDocument();
    // Склад без названия подтягивается из справочника по id.
    expect(await screen.findByText("Главный склад")).toBeInTheDocument();
    // Дата поступления — в формате DD-MM-YYYY.
    expect(await screen.findByText(todayDMY0)).toBeInTheDocument();
    // UTC-строка backend показывается в локальном времени браузера.
    const local = new Date(Date.UTC(now0.getFullYear(), now0.getMonth(), now0.getDate(), 12, 0));
    const pad = (value) => String(value).padStart(2, "0");
    const expected = `${pad(local.getDate())}.${pad(local.getMonth() + 1)}.${local.getFullYear()} / ${pad(local.getHours())}:${pad(local.getMinutes())}`;
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it("11. row click navigates to document detail instead of expanding inline", async () => {
    const pad1 = (value) => String(value).padStart(2, "0");
    const now1 = new Date();
    const todayApi1 = `${now1.getFullYear()}-${pad1(now1.getMonth() + 1)}-${pad1(now1.getDate())}`;
    const regToday1 = `${pad1(now1.getDate())}.${pad1(now1.getMonth() + 1)}.${now1.getFullYear()} / 12:00`;
    warehouseService.list.mockResolvedValue({
      data: [{
        id: "doc-1",
        number: 7,
        supplier: "Анвар",
        warehouse_id: "wh-1",
        warehouse_name: "Главный склад",
        date: todayApi1,
        registered_at: regToday1,
        items_count: 2,
        total_amount: 2400000,
        status: "draft",
        created_by_name: "admin",
      }],
    });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    const onOpenDocDetail = vi.fn();
    render(<WarehousePage initialSection="incoming-journal" onOpenDocDetail={onOpenDocDetail} />);
    const row = (await screen.findByText("Анвар")).closest("tr");
    fireEvent.click(row);
    expect(onOpenDocDetail).toHaveBeenCalledWith("doc-1");
    // Под строкой ничего не раскрывается.
    expect(screen.queryByRole("table", { name: "Состав прихода 7" })).toBeNull();
    expect(warehouseService.getPurchase).not.toHaveBeenCalled();
  });

  it("12. detail view mirrors creation window with document lines only", async () => {
    warehouseService.getPurchase.mockResolvedValue({
      data: {
        id: "doc-1",
        number: 7,
        supplier: "Анвар",
        warehouse_id: "wh-1",
        warehouse_name: "Главный склад",
        date: "2026-10-08",
        total_amount: 220000,
        status: "draft",
        items: [
          { id: "li-1", ingredient_id: "ing-1", name: "kartoshka", quantity: "20.0000", unit: "кг", cost_price: "5000.0000", total: "100000.0000" },
          { id: "li-2", ingredient_id: null, name: "COCA COLA", quantity: 10, unit: "шт", cost_price: 12000, total: 120000 },
        ],
      },
    });
    warehouseService.listIngredients.mockResolvedValue({ data: ingredients });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    render(<WarehousePage initialSection="incoming-journal" detailDocId="doc-1" />);
    const table = await screen.findByRole("table", { name: "Создать приход" });
    // Только позиции документа, не весь каталог.
    expect(within(table).getByText("kartoshka")).toBeInTheDocument();
    expect(within(table).getByText("COCA COLA")).toBeInTheDocument();
    expect(within(table).queryByText("POMIDOR")).toBeNull();
    // Шапка документа.
    expect(screen.getByText("Анвар")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-10-08")).toBeInTheDocument();
    // Только просмотр: без кнопки Сохранить и без полей ввода — цифры
    // с суффиксами одной строкой (Decimal backend без хвоста и точки).
    expect(screen.queryByRole("button", { name: /Сохранить/ })).toBeNull();
    expect(screen.queryByLabelText("Цена kartoshka")).toBeNull();
    expect(screen.queryByLabelText("Количество kartoshka")).toBeNull();
    expect(screen.getByText("5 000 UZS")).toBeInTheDocument();
    expect(screen.getByText("20 кг")).toBeInTheDocument();
    expect(warehouseService.getPurchase).toHaveBeenCalledWith("doc-1");
  });

  it("12b. detail without items warns about stale backend instead of empty catalog", async () => {
    // Старый backend отдаёт документ без ключа items — показываем честную
    // плашку про обновление, а не «продукты не добавлены».
    warehouseService.getPurchase.mockResolvedValue({
      data: {
        id: "doc-2",
        number: 8,
        supplier: "Анвар",
        warehouse_id: "wh-1",
        warehouse_name: "Главный склад",
        date: "2026-10-08",
        status: "draft",
      },
    });
    warehouseService.listIngredients.mockResolvedValue({ data: ingredients });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    render(<WarehousePage initialSection="incoming-journal" detailDocId="doc-2" />);
    expect(await screen.findByText(/Состав документа недоступен/)).toBeInTheDocument();
    expect(screen.queryByText(/Продукты пока не добавлены/)).toBeNull();
  });

  it("13. create lists templates and sale goods with type column and own links", async () => {
    warehouseService.list.mockResolvedValue({ data: [] });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    nomenclatureService.listIngredients.mockResolvedValue({
      data: [
        { id: "ing-1", name: "kartoshka", category: "sabzavotlar", unit: "кг", purchase_price: 5000, is_active: true },
      ],
    });
    catalogService.listProducts.mockResolvedValue({
      data: [
        { id: "prod-1", name: "COCA COLA", category_name: "напитки", unit: "шт", price: 12000, product_type: "sale", is_active: true },
      ],
    });
    settingsService.listResource.mockResolvedValue({ data: [] });
    warehouseService.createPurchase.mockResolvedValue({ data: { id: "doc-9" } });
    const onClose = vi.fn();
    render(<WarehousePage initialSection="incoming-journal" startCreating onCloseCreate={onClose} />);
    const table = await screen.findByRole("table", { name: "Создать приход" });
    // Шаблоны (Продукт) и Товары-реализация (Товар) с колонкой Тип.
    expect(within(table).getByText("kartoshka")).toBeInTheDocument();
    expect(within(table).getByText("COCA COLA")).toBeInTheDocument();
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent))
      .toEqual(["Категория", "Названия", "Тип", "Цена", "Кол-во", "Итоговая сумма"]);
    // Склад обязателен: выбираем.
    fireEvent.click(screen.getByRole("combobox", { name: "Выбор склада" }));
    fireEvent.click(await screen.findByRole("option", { name: "Главный склад" }));
    // Количество без цены — сохранить нельзя.
    fireEvent.change(screen.getByLabelText("Количество kartoshka"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
    expect(await screen.findByText("Укажите количество и цену хотя бы для одного продукта.")).toBeInTheDocument();
    expect(warehouseService.createPurchase).not.toHaveBeenCalled();
    // Продукт уходит со ссылкой на шаблон, Товар — со ссылкой на карточку
    // (шаблон backend автопривяжет сам).
    fireEvent.change(screen.getByLabelText("Цена kartoshka"), { target: { value: "4000" } });
    fireEvent.change(screen.getByLabelText("Количество COCA COLA"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Цена COCA COLA"), { target: { value: "12000" } });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
    await waitFor(() => expect(warehouseService.createPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouse_id: "wh-1",
        items: [
          { name: "kartoshka", ingredient_id: "ing-1", quantity: 5, unit: "кг", cost_price: 4000 },
          { name: "COCA COLA", product_id: "prod-1", quantity: 10, unit: "шт", cost_price: 12000 },
        ],
      }),
    ));
    expect(onClose).toHaveBeenCalled();
  });

  it("13b. remembers last price only across sessions via localStorage (qty always empty)", async () => {
    nomenclatureService.listIngredients.mockResolvedValue({
      data: [
        { id: "m1", name: "Мясо", category: "овощи", unit: "кг", purchase_price: 90000, is_active: true },
      ],
    });
    catalogService.listProducts.mockResolvedValue({ data: [] });
    settingsService.listResource.mockResolvedValue({ data: [] });
    warehouseService.list.mockResolvedValue({ data: [] });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    warehouseService.createPurchase.mockResolvedValue({ data: { id: "doc-10" } });
    // Прошлая сессия: вчера для Мяса ввели цену 100 000 и кол-во 10.
    localStorage.setItem(
      "marjon:purchase-last-values:v1",
      JSON.stringify({ "ing-m1": { price: "100000", qty: "10", total: "" } }),
    );
    const onClose = vi.fn();
    render(<WarehousePage initialSection="incoming-journal" startCreating onCloseCreate={onClose} />);
    const table = await screen.findByRole("table", { name: "Создать приход" });
    expect(within(table).getByText("Мясо")).toBeInTheDocument();
    // Сегодня поле цены уже заполнено вчерашним значением, кол-во — пустое.
    expect(screen.getByLabelText("Цена Мясо").value).toBe("100 000");
    expect(screen.getByLabelText("Количество Мясо").value).toBe("");
    // Меняем на 110 000 × 30 и сохраняем.
    fireEvent.click(screen.getByRole("combobox", { name: "Выбор склада" }));
    fireEvent.click(await screen.findByRole("option", { name: "Главный склад" }));
    fireEvent.change(screen.getByLabelText("Цена Мясо"), { target: { value: "110000" } });
    fireEvent.change(screen.getByLabelText("Количество Мясо"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
    await waitFor(() => expect(warehouseService.createPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          { name: "Мясо", ingredient_id: "m1", quantity: 30, unit: "кг", cost_price: 110000 },
        ],
      }),
    ));
    // Запомнилась только цена, кол-во для следующей сессии пустое.
    expect(JSON.parse(localStorage.getItem("marjon:purchase-last-values:v1"))).toMatchObject({
      "ing-m1": { price: "110000", qty: "" },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("17b. journal create opens inline without leaving the list", async () => {
    warehouseService.list.mockResolvedValue({ data: [] });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    nomenclatureService.listIngredients.mockResolvedValue({ data: [] });
    catalogService.listProducts.mockResolvedValue({ data: [] });
    settingsService.listResource.mockResolvedValue({ data: [] });
    render(<WarehousePage initialSection="incoming-journal" />);
    // Кнопка Создать открывает создание тем же маунтом (без onOpenCreate).
    fireEvent.click(await screen.findByRole("button", { name: "Создать" }));
    expect(await screen.findByRole("table", { name: "Создать приход" })).toBeInTheDocument();
    // Выход — назад топбара (history.back): возврат к списку той же подкатегории.
    window.history.back();
    expect(await screen.findByRole("button", { name: "Создать" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Создать приход" })).toBeNull();
  });

  it("18. journal period survives detail navigation within the section", async () => {    const pad = (value) => String(value).padStart(2, "0");
    const isoDay = (offset) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - offset);
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    };
    const regDay = (offset) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - offset);
      return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} / 12:00`;
    };
    const doc = (id, number, supplier, dayOffset, total) => ({
      id, number, supplier, warehouse_id: "wh-1", warehouse_name: "Главный склад",
      date: isoDay(dayOffset), registered_at: regDay(dayOffset),
      items_count: 1, total_amount: total, status: "draft", created_by_name: "",
    });
    warehouseService.list.mockResolvedValue({
      data: [doc("d1", 1, "Анвар", 0, 1000), doc("d2", 2, "Бозор", 1, 2000)],
    });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    warehouseService.getPurchase.mockResolvedValue({
      data: {
        id: "d2", number: 2, supplier: "Бозор", warehouse_id: "wh-1",
        warehouse_name: "Главный склад", date: isoDay(1), total_amount: 2000, status: "draft",
        items: [{ id: "li-1", ingredient_id: "ing-1", name: "kartoshka", quantity: 2, unit: "кг", cost_price: 500 }],
      },
    });
    // Список и деталка — разные маунты (как роуты): key форсит перемонтирование.
    function Harness() {
      const [docId, setDocId] = useState(null);
      return (
        <>
          {docId ? <button type="button" onClick={() => setDocId(null)}>Назад в журнал</button> : null}
          <WarehousePage
            key={docId ? "detail" : "list"}
            initialSection="incoming-journal"
            {...(docId ? { detailDocId: docId } : { onOpenDocDetail: (id) => setDocId(id) })}
          />
        </>
      );
    }
    render(<Harness />);
    // По умолчанию Сегодня — виден только сегодняшний документ.
    expect(await screen.findByText("Анвар")).toBeInTheDocument();
    expect(screen.queryByText("Бозор")).toBeNull();
    // Ставим Вчера — видны оба.
    fireEvent.click(screen.getByRole("button", { name: "Период документов" }));
    fireEvent.click(await screen.findByRole("button", { name: "Вчера" }));
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    expect(await screen.findByText("Бозор")).toBeInTheDocument();
    // Уходим в историю строки и возвращаемся назад.
    fireEvent.click(screen.getByText("Бозор").closest("tr"));
    expect(await screen.findByRole("table", { name: "Создать приход" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Назад в журнал" }));
    // Период не сбросился на Сегодня — вчерашний документ на месте.
    expect(await screen.findByText("Бозор")).toBeInTheDocument();
  });
});

describe("Warehouse inventory (Инвентаризация, V42)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const invCheck = (id, status = "draft") => ({
    id,
    warehouse_id: "wh-1",
    warehouse_name: "Главный склад",
    comment: "Пересчёт мяса",
    check_type: "Приход и расход учтены",
    status,
    created_by_name: "admin",
    created_at: new Date().toISOString(),
  });

  it("14. list shows check rows with create button and without actions", async () => {
    warehouseService.list.mockResolvedValue({ data: [invCheck("inv-1"), invCheck("inv-2", "accepted")] });
    render(<WarehousePage initialSection="inventory" />);
    const table = await screen.findByRole("table", { name: "Инвентаризация" });
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent))
      .toEqual(["№", "Склад", "Дата регистрации", "Комментарий"]);
    expect(within(table).getAllByText("Главный склад")).toHaveLength(2);
    expect(within(table).getAllByText("Пересчёт мяса")).toHaveLength(2);
    expect(within(table).queryByRole("button", { name: "Удалить инвентаризацию" })).toBeNull();
    expect(screen.getByRole("button", { name: "Период документов" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать" })).toBeInTheDocument();
  });

  it("14b. row click opens centered corrections (Дата регистрации / Название / Корректировка)", async () => {
    warehouseService.list.mockResolvedValue({ data: [invCheck("inv-1")] });
    warehouseService.getInventory.mockResolvedValue({ data: { items: [
      { id: "li-1", name: "Фанта", unit: "шт", stock_qty: "20.0000", actual_qty: "10.0000", diff_qty: "-10.0000" },
      { id: "li-2", name: "Соль", unit: "Гр", stock_qty: "0.0000", actual_qty: "19.0000", diff_qty: "19.0000" },
    ] } });
    render(<WarehousePage initialSection="inventory" />);
    const table = await screen.findByRole("table", { name: "Инвентаризация" });
    fireEvent.click(within(table).getAllByText("Главный склад")[0].closest("tr"));
    const modal = await screen.findByRole("table", { name: "Корректировки инвентаризации" });
    expect([...modal.querySelectorAll("thead th")].map((th) => th.textContent))
      .toEqual(["Дата регистрации", "Название", "Корректировка"]);
    expect(warehouseService.getInventory).toHaveBeenCalledWith("inv-1");
    expect(within(modal).getByText("Фанта")).toBeInTheDocument();
    expect(within(modal).getByText("Соль")).toBeInTheDocument();
    // Недостача красным, излишек зелёным.
    const minus = within(modal).getByText(/10 шт/);
    expect(minus).toHaveClass("is-minus");
    const plus = within(modal).getByText(/19 Гр/);
    expect(plus).toHaveClass("is-plus");
    // Дата регистрации проверки — в каждой строке.
    expect(within(modal).getAllByText(/\d{2}\.\d{2}\.\d{4} \/ \d{2}:\d{2}/).length).toBeGreaterThan(0);
    // Закрытие по Escape возвращает к списку.
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("table", { name: "Корректировки инвентаризации" })).toBeNull());
    expect(await screen.findByRole("table", { name: "Инвентаризация" })).toBeInTheDocument();
  });

  it("14c. corrections failure renders an error without fake rows", async () => {
    warehouseService.list.mockResolvedValue({ data: [invCheck("inv-1")] });
    warehouseService.getInventory.mockRejectedValue(new Error("offline"));
    render(<WarehousePage initialSection="inventory" />);
    const table = await screen.findByRole("table", { name: "Инвентаризация" });
    fireEvent.click(within(table).getAllByText("Главный склад")[0].closest("tr"));
    expect(await screen.findByText("Не удалось загрузить корректировки.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Корректировки инвентаризации" })).toBeNull();
  });

  it("14d. comment field saves through PATCH and reloads the list", async () => {
    warehouseService.list.mockResolvedValue({ data: [invCheck("inv-1")] });
    warehouseService.getInventory.mockResolvedValue({ data: { items: [
      { id: "li-1", name: "Фанта", unit: "шт", diff_qty: "-10.0000" },
    ] } });
    warehouseService.updateInventory.mockResolvedValue({ data: {} });
    render(<WarehousePage initialSection="inventory" />);
    const table = await screen.findByRole("table", { name: "Инвентаризация" });
    fireEvent.click(within(table).getAllByText("Главный склад")[0].closest("tr"));
    await screen.findByRole("table", { name: "Корректировки инвентаризации" });
    const field = screen.getByRole("textbox", { name: "Комментарий инвентаризации" });
    expect(field).toHaveValue("Пересчёт мяса");
    fireEvent.change(field, { target: { value: "Ночная проверка" } });
    const callsBefore = warehouseService.list.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(warehouseService.updateInventory).toHaveBeenCalledWith("inv-1", { comment: "Ночная проверка" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(warehouseService.list.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(warehouseService.list).toHaveBeenLastCalledWith("inventory", expect.anything());
  });

  it("14e. comment save failure keeps the modal with an error", async () => {
    warehouseService.list.mockResolvedValue({ data: [invCheck("inv-1")] });
    warehouseService.getInventory.mockResolvedValue({ data: { items: [] } });
    warehouseService.updateInventory.mockRejectedValue({ response: { data: { detail: "Нет прав." } } });
    render(<WarehousePage initialSection="inventory" />);
    const table = await screen.findByRole("table", { name: "Инвентаризация" });
    fireEvent.click(within(table).getAllByText("Главный склад")[0].closest("tr"));
    await screen.findByRole("table", { name: "Корректировки инвентаризации" });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Нет прав.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("14f. clearing the comment erases it through PATCH with an empty string", async () => {
    warehouseService.list.mockResolvedValue({ data: [invCheck("inv-1")] });
    warehouseService.getInventory.mockResolvedValue({ data: { items: [] } });
    warehouseService.updateInventory.mockResolvedValue({ data: {} });
    render(<WarehousePage initialSection="inventory" />);
    const table = await screen.findByRole("table", { name: "Инвентаризация" });
    fireEvent.click(within(table).getAllByText("Главный склад")[0].closest("tr"));
    await screen.findByRole("table", { name: "Корректировки инвентаризации" });
    const field = screen.getByRole("textbox", { name: "Комментарий инвентаризации" });
    expect(field).toHaveValue("Пересчёт мяса");
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(warehouseService.updateInventory).toHaveBeenCalledWith("inv-1", { comment: "" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("15. create modal posts counted lines with warehouse and apply flag", async () => {
    warehouseService.list.mockResolvedValue({ data: [] });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    warehouseService.listStock.mockResolvedValue({
      data: [{ warehouse_id: "wh-1", ingredient_id: "ing-1", quantity: 100, cost_price: 1000, unit: "кг" }],
    });
    nomenclatureService.listIngredients.mockResolvedValue({ data: ingredients });
    catalogService.listProducts.mockResolvedValue({ data: [] });
    warehouseService.createInventory.mockResolvedValue({ data: { id: "inv-9" } });
    render(<WarehousePage initialSection="inventory" />);
    fireEvent.click(await screen.findByRole("button", { name: "Создать" }));
    expect(await screen.findByRole("heading", { name: "Создать инвентаризацию" })).toBeInTheDocument();
    // Переключателя сверху нет — расхождения всегда учитываются.
    expect(screen.queryByRole("switch")).toBeNull();
    // Склад обязателен.
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
    expect(await screen.findByText("Выберите склад.")).toBeInTheDocument();
    expect(warehouseService.createInventory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("combobox", { name: "Склад инвентаризации" }));
    fireEvent.click(await screen.findByRole("option", { name: "Главный склад" }));
    // В таблице — только приходившее на склад или с остатком: POMIDOR
    // (без прихода и остатка) скрыт, kartoshka (остаток 100) на месте.
    expect(screen.queryByText("POMIDOR")).toBeNull();    // Факт без позиций — сохранить нельзя.
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
    expect(await screen.findByText(/хотя бы для одной позиции/)).toBeInTheDocument();
    // 100 → 95: недостача 5 уйдёт в расход на бэкенде.
    fireEvent.change(screen.getByLabelText("Факт kartoshka"), { target: { value: "95" } });
    expect(await screen.findByText(/−5/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
    await waitFor(() => expect(warehouseService.createInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouse_id: "wh-1",
        apply_to_stock: true,
        items: [{ ingredient_id: "ing-1", actual_qty: 95 }],
      }),
    ));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Создать инвентаризацию" })).toBeNull());
  });

  it("16. inventory card shows surplus purchases with warehouse detail", async () => {
    const pad = (value) => String(value).padStart(2, "0");
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const regToday = `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()} / 12:00`;
    const doc = (id, number, supplier, whId, whName, total, status) => ({
      id, number, supplier, warehouse_id: whId, warehouse_name: whName,
      date: isoToday, registered_at: regToday,
      items_count: 1, total_amount: total,
      status, created_by_name: "",
    });
    warehouseService.list.mockResolvedValue({
      data: [
        doc("d1", 1, "Инвентаризация", "wh-1", "Главный склад", 50000, "accepted"),
        doc("d2", 2, "Анвар", "wh-1", "Главный склад", 100000, "accepted"),
      ],
    });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    warehouseService.getPurchase.mockImplementation(async (id) => {
      if (id !== "d1") return { data: { items: [] } };
      return { data: { items: [
        { id: "li-1", ingredient_id: "ing-1", product_id: null, name: "myaso", quantity: 5, unit: "кг", cost_price: 10000 },
      ] } };
    });
    warehouseService.listIngredients.mockResolvedValue({
      data: [{ id: "ing-1", name: "myaso", category: "gosht", unit: "кг" }],
    });
    render(<WarehousePage initialSection="incoming" />);
    // Излишек +5кг × 10 000 = 50 000 — только в карточке инвентаризации.
    const invTable = await screen.findByRole("table", { name: "Инвентаризация по складам" });
    const invRow = within(invTable).getByText("Главный склад").closest("tr");
    expect(invRow.textContent).toMatch(/50[\s\u00a0\u202f]*000 UZS/);
    expect(invRow.textContent).not.toMatch(/100[\s\u00a0\u202f]*000/);
    // Обычный приход живёт только в верхней таблице (fallback total→Продукт).
    // Верхняя таблица суммирует ВСЕ приходы: 50 000 излишков + 100 000 обычных.
    const primary = screen.getByRole("table", { name: "Приход по складам" });
    expect(within(primary).getByText("Главный склад").closest("tr").textContent)
      .toMatch(/150[\s\u00a0\u202f]*000 UZS/);
    // Клик — внутренний экран склада с излишками.
    fireEvent.click(await screen.findByRole("button", { name: "Открыть инвентаризацию склада Главный склад" }));
    const detail = await screen.findByRole("table", { name: "Инвентаризация склада Главный склад" });
    expect(within(detail).getByText("Всего")).toBeInTheDocument();
    expect(detail.textContent).toMatch(/50[\s\u00a0\u202f]*000 UZS/);
    expect(within(detail).queryByText("myaso")).toBeNull();
    fireEvent.click(within(detail).getByRole("button", { name: "Развернуть категорию продуктов gosht" }));
    expect(await within(detail).findByText("myaso")).toBeInTheDocument();
    // Кнопки «Назад» в шапке нет — возврат стрелкой топбара (popstate)
    // на главный экран «Приход товаров».
    expect(screen.queryByRole("button", { name: /назад/i })).toBeNull();
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByRole("table", { name: "Приход по складам" })).toBeInTheDocument();
  });

  it("17. expense inventory card shows shortage documents with warehouse detail", async () => {
    const pad = (value) => String(value).padStart(2, "0");
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const regToday = `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()} / 12:00`;
    const doc = (id, number, receiver, whId, whName, total, status) => ({
      id, number, receiver, warehouse_id: whId, warehouse_name: whName,
      date: isoToday, registered_at: regToday,
      items_count: 1, total_amount: total,
      status, created_by_name: "",
    });
    warehouseService.list.mockResolvedValue({
      data: [
        doc("e1", 1, "Инвентаризация", "wh-1", "Главный склад", 10000, "accepted"),
        doc("e2", 2, "Кухня", "wh-1", "Главный склад", 20000, "accepted"),
      ],
    });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    warehouseService.listIngredients.mockResolvedValue({
      data: [{ id: "ing-1", name: "kartoshka", category: "sabzavotlar", unit: "кг" }],
    });
    catalogService.listProducts.mockResolvedValue({ data: [] });
    warehouseService.getExpense.mockImplementation(async (id) => {
      if (id !== "e1") return { data: { items: [] } };
      return { data: { items: [
        { id: "li-1", ingredient_id: "ing-1", name: "kartoshka", quantity: 5, unit: "кг", cost_price: 2000 },
      ] } };
    });
    render(<WarehousePage initialSection="outgoing" />);
    // Недостача −5кг × 2 000 = 10 000 — только в карточке инвентаризации.
    const invTable = await screen.findByRole("table", { name: "Инвентаризация расходов по складам" });
    const invRow = within(invTable).getByText("Главный склад").closest("tr");
    expect(invRow.textContent).toMatch(/10[\s\u00a0\u202f]*000 UZS/);
    expect(invRow.textContent).not.toMatch(/20[\s\u00a0\u202f]*000/);
    // Верхняя таблица — ТОЛЬКО ручной расход без инвентаризации (20 000).
    // Недостача 10 000 живёт только в нижней карточке.
    const primary = screen.getByRole("table", { name: "Расход по складам" });
    expect(within(primary).getByText("Главный склад").closest("tr").textContent)
      .toMatch(/20[\s\u00a0\u202f]*000 UZS/);
    expect(within(primary).getByText("Главный склад").closest("tr").textContent)
      .not.toMatch(/30[\s\u00a0\u202f]*000/);
    // Кнопки «Создать» в карточках Прихода/Расхода нет.
    expect(screen.queryByRole("button", { name: "Создать" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Открыть инвентаризацию расходов склада Главный склад" }));
    const detail = await screen.findByRole("table", { name: "Инвентаризация склада Главный склад" });
    expect(within(detail).getByText("Всего")).toBeInTheDocument();
    expect(detail.textContent).toMatch(/10[\s\u00a0\u202f]*000 UZS/);
    fireEvent.click(within(detail).getByRole("button", { name: "Развернуть категорию продуктов sabzavotlar" }));
    expect(await within(detail).findByText("kartoshka")).toBeInTheDocument();
    // Кнопки «Назад» в шапке нет — возврат стрелкой топбара (popstate)
    // на главный экран «Расход товаров».
    expect(screen.queryByRole("button", { name: /назад/i })).toBeNull();
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByRole("table", { name: "Расход по складам" })).toBeInTheDocument();
  });

  it("19. modal shows one row per ingredient when sale product links to template", async () => {
    warehouseService.list.mockResolvedValue({ data: [] });
    warehouseService.listWarehouses.mockResolvedValue({ data: warehouses });
    warehouseService.listStock.mockResolvedValue({
      data: [{ warehouse_id: "wh-1", ingredient_id: "ing-1", quantity: 100, cost_price: 1000, unit: "шт" }],
    });
    nomenclatureService.listIngredients.mockResolvedValue({
      data: [{ id: "ing-1", name: "fanta", category: "napitki", unit: "шт" }],
    });
    catalogService.listProducts.mockResolvedValue({
      data: [{ id: "prod-1", name: "fanta", category_name: "napitki", unit: "шт", product_type: "sale", is_active: true }],
    });
    render(<WarehousePage initialSection="inventory" />);
    fireEvent.click(await screen.findByRole("button", { name: "Создать" }));
    expect(await screen.findByRole("heading", { name: "Создать инвентаризацию" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Склад инвентаризации" }));
    fireEvent.click(await screen.findByRole("option", { name: "Главный склад" }));
    // Один учёт — одна строка (Товар с привязкой), дубль-Продукт скрыт.
    expect(await screen.findAllByLabelText("Факт fanta")).toHaveLength(1);
  });
});
