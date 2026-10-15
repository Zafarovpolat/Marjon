import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { formatDateLabel, todayInputValue } from "../utils/date";
import MenuPage, { mapSalesReport } from "./MenuPage";

vi.mock("../api/client", () => ({ api: { get: vi.fn() } }));
vi.mock("../components/ReportDateRangePicker", () => ({
  default: ({ value, onChange, variant, buttonAriaLabel }) => <button type="button" aria-label={buttonAriaLabel} data-variant={variant} onClick={() => onChange({ preset: "", start: "01.09.2026", end: "02.09.2026" })}>{value.start}</button>,
}));

const empty = { rows: [], totals: { quantity: "0", amount: "0.00", orders_count: 0 } };
const options = { categories: [{ value: "c1", label: "Кухня" }, { value: "c2", label: "Кухня" }] };
const row = { product_id: "p1", name: "Историческое блюдо", category_id: "c1", category_name: "Кухня", quantity: "2", price: "25.25", amount: "50.50" };
const populated = { rows: [row], totals: { quantity: "2", amount: "50.50", orders_count: 246 } };
const response = (path, sales = empty) => ({ data: path === "/reports/dishes/filters" ? options : path === "/finance/transactions/summary" ? { income_amount: "345.67" } : path === "/reports/cancelled/summary" ? { quantity: "3.125" } : sales });
const calls = () => api.get.mock.calls.filter(([path]) => path === "/reports/dishes");
// Column settings remain hidden; the V4 filters use the Reports inline panel.
const categoryChoices = () => [...document.querySelectorAll('.sales-category-filter [role="option"]')];
const settingsTrigger = () => screen.getByText("Настроить таблицу").closest("button");
const filterToggle = () => document.querySelector(".sales-period .orders-filter-toggle");
const openFilters = () => fireEvent.click(filterToggle());
const applyFilters = () => fireEvent.click(within(screen.getByRole("form", { name: "Фильтры продаж" })).getByRole("button", { name: "Фильтровать", exact: true }));
async function loaded() { return screen.findByText("Продаж за выбранный период нет."); }

beforeEach(() => {
  api.get.mockImplementation((path) => Promise.resolve(response(path)));
});

describe("Sale canonical data foundation", () => {
  it("renders exactly the four requested canonical KPI cards with distinct values, no icons and no fake trend", async () => {
    api.get.mockImplementation((path) => Promise.resolve(response(path, populated)));
    render(<MenuPage />);
    await screen.findByText(row.name);
    const cards = document.querySelectorAll(".sales-summary-grid article");
    expect([...cards].map((card) => card.getAttribute("aria-label"))).toEqual(["Денежные приходы", "Выручка", "Заказы", "Отменённые блюда"]);
    expect([...cards].map((card) => card.querySelector("strong").textContent)).toEqual(["345,67 UZS", "50,5 UZS", "246", "3,125"]);
    cards.forEach((card) => expect(card.querySelector("svg")).toBeNull());
    expect(document.querySelector(".sales-summary-grid").textContent).not.toMatch(/предыдущему|\+0%|Продано|Позиций/);
  });

  it("uses the Dishes header structure and Orders action template, removing the visible middle strip", async () => {
    render(<MenuPage />);
    await loaded();
    const heading = screen.getByRole("heading", { name: "Продажа" });
    expect(heading.closest(".settings-title-group").querySelector(".settings-accent-bar")).not.toBeNull();
    expect(document.querySelector(".sales-card")).toHaveClass("settings-card");
    expect(screen.queryByText("Сколько чего продалось по блюдам и товарам.")).not.toBeInTheDocument();
    expect(document.querySelector(".sales-scope-note")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Поиск блюда" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Категория продаж" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Настроить таблицу" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Очистить" })).not.toBeInTheDocument();
    const apply = screen.getByRole("button", { name: "Фильтровать", exact: true });
    expect(apply.closest(".orders-report-page.owner-report-view")).not.toBeNull();
    expect(apply.closest(".report-actions.owner-report-actions")).not.toBeNull();
    expect(apply).toHaveClass("orders-filter-toggle");
    expect(apply).toHaveAttribute("type", "button");
    expect(apply).toHaveAttribute("aria-controls", "sales-filters");
    expect(apply).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".orders-filter-collapse__inner")).toHaveAttribute("inert");
    expect(document.querySelector(".sales-table-controls")).toHaveAttribute("hidden");
    fireEvent.click(apply);
    expect(document.querySelector(".sales-filter-area .orders-filter-collapse")).toHaveClass("is-open");
    expect(calls()).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Поиск блюда" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Категория продаж" })).toBeInTheDocument();
  });

  it("sends the same period to all aggregates, but category/query only to sales", async () => {
    render(<MenuPage />);
    await loaded();
    openFilters();
    fireEvent.click(screen.getByLabelText("Категория продаж"));
    fireEvent.click(categoryChoices()[0]);
    fireEvent.change(screen.getByLabelText("Поиск блюда"), { target: { value: "Лаваш" } });
    applyFilters();
    fireEvent.click(screen.getByRole("button", { name: "Период отчёта о продажах" }));
    await waitFor(() => expect(calls().at(-1)[1].params.date_from).toBe("2026-09-01"));
    for (const path of ["/finance/transactions/summary", "/reports/cancelled/summary"]) {
      expect(api.get.mock.calls.filter(([url]) => url === path).at(-1)[1].params).toEqual({ date_from: "2026-09-01", date_to: "2026-09-02" });
    }
    expect(calls().at(-1)[1].params).toMatchObject({ query: "Лаваш", category_id: ["c1"] });
  });

  it("replaces all four KPI values after a period change", async () => {
    api.get.mockImplementation((path, config) => Promise.resolve(config?.params?.date_from === "2026-09-01" ? response(path, populated) : { ...response(path), data: path === "/finance/transactions/summary" ? { income_amount: 0 } : path === "/reports/cancelled/summary" ? { quantity: 0 } : response(path).data }));
    render(<MenuPage />);
    await loaded();
    expect([...document.querySelectorAll(".sales-summary-grid strong")].map((e) => e.textContent)).toEqual(["0 UZS", "0 UZS", "0", "0"]);
    fireEvent.click(screen.getByRole("button", { name: "Период отчёта о продажах" }));
    await screen.findByText(row.name);
    expect([...document.querySelectorAll(".sales-summary-grid strong")].map((e) => e.textContent)).toEqual(["345,67 UZS", "50,5 UZS", "246", "3,125"]);
  });

  it.each(["/finance/transactions/summary", "/reports/cancelled/summary"])("does not fake a complete successful snapshot when %s fails", async (failedPath) => {
    api.get.mockImplementation((path) => path === failedPath ? Promise.reject(new Error("offline")) : Promise.resolve(response(path, populated)));
    render(<MenuPage />);
    await screen.findByRole("alert");
    expect([...document.querySelectorAll(".sales-summary-grid strong")].map((e) => e.textContent)).toEqual(["—", "—", "—", "—"]);
    expect(screen.queryByText(row.name)).not.toBeInTheDocument();
  });

  it("never publishes mixed/late period snapshots", async () => {
    const pending = [];
    api.get.mockImplementation((path, config) => path.endsWith("/filters") ? Promise.resolve(response(path)) : new Promise((resolve) => pending.push({ path, config, resolve })));
    render(<MenuPage />);
    fireEvent.click(screen.getByRole("button", { name: "Период отчёта о продажах" }));
    const next = pending.filter(({ config }) => config.params.date_from === "2026-09-01");
    expect(next).toHaveLength(3);
    next.slice(0, 2).forEach(({ path, resolve }) => resolve(response(path, populated)));
    expect([...document.querySelectorAll(".sales-summary-grid strong")].map((e) => e.textContent)).toEqual(["—", "—", "—", "—"]);
    next[2].resolve(response(next[2].path, populated));
    await screen.findByText(row.name);
    pending.filter(({ config }) => config.params.date_from !== "2026-09-01").forEach(({ path, resolve }) => resolve({ ...response(path), data: path === "/finance/transactions/summary" ? { income_amount: 999 } : path === "/reports/cancelled/summary" ? { quantity: 999 } : empty }));
    await waitFor(() => expect(screen.getByText("345,67 UZS")).toBeInTheDocument());
    expect(screen.queryByText("999 UZS")).not.toBeInTheDocument();
  });

  it("uses only the canonical report/filter clients, with real default dates", async () => {
    render(<MenuPage />);
    await loaded();
    const today = todayInputValue();
    expect(calls()[0][1].params).toEqual({ date_from: today, date_to: today });
    expect(api.get.mock.calls.map(([path]) => path)).toEqual(["/reports/dishes/filters", "/reports/dishes", "/finance/transactions/summary", "/reports/cancelled/summary"]);
    expect(screen.getByRole("button", { name: "Период отчёта о продажах" })).toHaveAttribute("data-variant", "canonical");
    expect(screen.getByText(formatDateLabel(today))).toBeInTheDocument();
  });

  it("applies period and can reopen it without unmounting during requests", async () => {
    render(<MenuPage />);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Период отчёта о продажах" }));
    await waitFor(() => expect(calls().at(-1)[1].params).toMatchObject({ date_from: "2026-09-01", date_to: "2026-09-02" }));
    expect(screen.getByRole("button", { name: "Период отчёта о продажах" })).toBeInTheDocument();
  });

  it("sends search only on apply, and uses server query rather than client filtering", async () => {
    render(<MenuPage />);
    await loaded();
    openFilters();
    fireEvent.change(screen.getByLabelText("Поиск блюда"), { target: { value: "  Лаваш  " } });
    expect(calls()).toHaveLength(1);
    applyFilters();
    await waitFor(() => expect(calls().at(-1)[1].params.query).toBe("Лаваш"));
  });

  it("preserves same-name category IDs and sends repeated canonical category_id", async () => {
    render(<MenuPage />);
    await loaded();
    openFilters();
    fireEvent.click(screen.getByLabelText("Категория продаж"));
    const choices = categoryChoices();
    fireEvent.click(choices[0]);
    fireEvent.click(choices[1]);
    expect(calls()).toHaveLength(1);
    applyFilters();
    await waitFor(() => expect(calls().at(-1)[1].params.category_id).toEqual(["c1", "c2"]));
    expect(calls().at(-1)[1].paramsSerializer).toEqual({ indexes: null });
  });

  it("does not offer or pretend to send an unsupported branch filter", async () => {
    render(<MenuPage />);
    await loaded();
    expect(screen.queryByRole("combobox", { name: /филиал/i })).not.toBeInTheDocument();
    expect(calls()[0][1].params).not.toHaveProperty("branch_id");
  });

  it("clear resets applied server filters without business-state storage", async () => {
    render(<MenuPage />);
    await loaded();
    openFilters();
    fireEvent.change(screen.getByLabelText("Поиск блюда"), { target: { value: "Лаваш" } });
    applyFilters();
    await waitFor(() => expect(calls().at(-1)[1].params.query).toBe("Лаваш"));
    fireEvent.click(screen.getByText("Очистить", { exact: true }));
    await waitFor(() => expect(calls().at(-1)[1].params).not.toHaveProperty("query"));
    expect(screen.getByLabelText("Поиск блюда")).toHaveValue("");
  });

  it("maps canonical historical price/amount and does not fetch current master products", async () => {
    api.get.mockImplementation((path) => Promise.resolve(response(path, populated)));
    render(<MenuPage />);
    await screen.findByText(row.name);
    const table = screen.getByRole("table", { name: "Продажи" });
    expect(within(table).getByRole("columnheader", { name: "Средняя цена" })).toBeInTheDocument();
    expect(within(table).getByText("25,25 UZS")).toBeInTheDocument();
    expect(within(table).getByText("50,5 UZS")).toBeInTheDocument();
    expect(within(table).getByText("100%")).toBeInTheDocument();
    expect(api.get.mock.calls.some(([path]) => path.startsWith("/inventory") || path.startsWith("/pos"))).toBe(false);
  });

  it("uses authoritative totals and counts unique product IDs in the complete returned rows", async () => {
    const data = { rows: [row, { ...row, name: "Старое название" }], totals: { quantity: "8", amount: "101", orders_count: 246 } };
    api.get.mockImplementation((path) => Promise.resolve(response(path, data)));
    render(<MenuPage />);
    await screen.findByText(row.name);
    const summary = document.querySelector(".sales-summary-grid");
    expect(within(summary).getByText("101 UZS")).toBeInTheDocument();
    expect(within(summary).getByText("246")).toBeInTheDocument();
    expect(within(summary).getByText("345,67 UZS")).toBeInTheDocument();
    expect(within(summary).getByText("3,125")).toBeInTheDocument();
    expect(within(summary).queryByText("Продано")).not.toBeInTheDocument();
    expect(within(summary).queryByText("Позиций")).not.toBeInTheDocument();
  });

  it("zero total remains zero even with a positive historical price", () => {
    const report = mapSalesReport({ rows: [{ ...row, price: "40000", amount: "0" }], totals: { quantity: "2", amount: "0", orders_count: 1 } });
    expect(report.rows[0]).toMatchObject({ revenue: 0, avgPrice: 40000, share: 0 });
    expect(report.amount).toBe(0);
  });

  it("keeps rows split by historical name rather than collapsing product snapshots", () => {
    const report = mapSalesReport({ rows: [row, { ...row, name: "Старое название" }], totals: { quantity: 4, amount: 101, orders_count: 1 } });
    expect(report.rows).toHaveLength(2);
    expect(new Set(report.rows.map((item) => item.key)).size).toBe(2);
    expect(report.positions).toBe(1);
  });

  it.each([[], {}, { rows: [], totals: { quantity: 0 } }, { rows: [], totals: { quantity: "NaN", amount: 0 } }, { rows: [{ ...row, price: null }], totals: populated.totals }])("rejects invalid/legacy contract instead of inventing zero KPIs: %j", (data) => {
    expect(() => mapSalesReport(data)).toThrow("Некорректный ответ");
  });

  it("renders truthful success-empty with zero authoritative KPIs and no fake rows/export", async () => {
    render(<MenuPage />);
    await loaded();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /экспорт/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Продажи" }).querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("shows loading rather than empty or fake zeros before response", async () => {
    api.get.mockImplementation((path) => path === "/reports/dishes" ? new Promise(() => {}) : Promise.resolve(response(path)));
    render(<MenuPage />);
    expect(screen.getByText("Загрузка…")).toBeInTheDocument();
    expect(screen.queryByText("0 UZS")).not.toBeInTheDocument();
    expect(screen.queryByText("Продаж за выбранный период нет.")).not.toBeInTheDocument();
  });

  it("renders API failure without successful empty or zero KPI state", async () => {
    api.get.mockImplementation((path) => path === "/reports/dishes" ? Promise.reject(new Error("offline")) : Promise.resolve(response(path)));
    render(<MenuPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить продажи.");
    expect(screen.queryByText("0 UZS")).not.toBeInTheDocument();
    expect(screen.queryByText("Продаж за выбранный период нет.")).not.toBeInTheDocument();
  });

  it("exposes filter-options failure without replacing a successful report with fake options", async () => {
    api.get.mockImplementation((path) => path.endsWith("/filters") ? Promise.reject(new Error("offline")) : Promise.resolve(response(path)));
    render(<MenuPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить категории");
    await loaded();
    expect(screen.getByLabelText("Категория продаж")).toBeDisabled();
  });

  it("column popover closes on outside click and Escape; last column cannot be hidden", async () => {
    render(<MenuPage />);
    await loaded();
    const trigger = settingsTrigger();
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("heading", { name: "Продажа" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    screen.getAllByRole("checkbox", { hidden: true }).slice(0, -1).forEach((checkbox) => fireEvent.click(checkbox));
    expect(screen.getByLabelText("Доля")).toBeDisabled();
    expect(screen.getByRole("table", { name: "Продажи" }).querySelectorAll("th")).toHaveLength(1);
  });

  it("scoped CSS owns search spacing, responsive toolbar and approved table skin", () => {
    const css = readFileSync("src/styles/owner/sales.css", "utf8");
    const main = readFileSync("src/main.jsx", "utf8");
    expect(css).toContain(".sales-page--v2 .sales-filters-grid");
    expect(css).not.toContain(".sales-toolbar > label");
    expect(css).not.toContain("transition:"); // Orders owns the animation, not Sale.
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain("border-radius: 20px");
    expect(css).toContain("background: #eff6ff");
    expect(css).toContain(".sales-page--v2 .sales-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
    expect(css).not.toContain("!important");
    expect(css).toContain(".sales-table-controls[hidden] { display: none; }");
    expect(css).toContain("border: 1px solid #d0d9e8; border-radius: 16px");
    expect(css).toContain("padding: 16px 22px 22px");
    expect(css).toContain("font-size: clamp(24px, 2.4vw, 28px); font-weight: 600");
    expect(main.indexOf('styles/owner/sales.css')).toBeGreaterThan(main.indexOf('styles/react-overrides.css'));
  });
});

describe("Sale V4 Reports filters and adaptive table", () => {
  it("V5 updates only empty filter placeholders and retains real selected category labels", async () => {
    render(<MenuPage />);
    await loaded();
    openFilters();
    expect(screen.getByPlaceholderText("Поиск блюда и товара")).toBe(screen.getByRole("textbox", { name: "Поиск блюда" }));
    const category = screen.getByRole("combobox", { name: "Категория продаж" });
    expect(category).toHaveTextContent("Выберите категорию");
    fireEvent.click(category);
    fireEvent.click(categoryChoices()[0]);
    expect(category).toHaveTextContent("Кухня");
    expect(category).not.toHaveTextContent("Выберите категорию");
    expect(calls()).toHaveLength(1);
  });

  it("V5 uses the table outline and keeps the accent on the same rounded contour", () => {
    const css = readFileSync("src/styles/owner/sales.css", "utf8");
    const card = css.match(/\.sales-page--v2 \.sales-kpi \{([^}]+)\}/)[1];
    const table = css.match(/\.sales-page--v2 \.sales-table-wrap \{([^}]+)\}/)[1];
    expect(card.match(/border: ([^;]+);/)[1]).toBe(table.match(/border: ([^;]+);/)[1]);
    expect(card).toContain("border-radius: 16px");
    expect(card).toContain("padding: 18px 18px 16px");
    expect(css).toContain("border-top: 3px solid var(--sale-kpi-accent)");
    const accent = css.match(/\.sales-page--v2 \.sales-kpi::before \{([^}]+)\}/)[1];
    expect(accent).toContain("inset: -1px;");
    expect(accent).toContain("border-radius: inherit;");
    expect(accent).not.toMatch(/(?:^|;)\s*height:/);
    for (const color of ["#49bca7", "#59abc7", "#9690d2", "#d99ba8"]) expect(css).toContain(`--sale-kpi-accent: ${color}`);
  });

  it("only exposes Search and Category, keeps period outside, and retains drafts across close/reopen", async () => {
    render(<MenuPage />);
    await loaded();
    openFilters();
    const panel = screen.getByRole("form", { name: "Фильтры продаж" });
    expect(within(panel).getAllByRole("textbox")).toHaveLength(1);
    expect(within(panel).getAllByRole("combobox")).toHaveLength(1);
    expect(within(panel).queryByRole("button", { name: "Период отчёта о продажах" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Поиск блюда"), { target: { value: "Лаваш" } });
    fireEvent.click(screen.getByLabelText("Категория продаж"));
    fireEvent.click(categoryChoices()[0]);
    fireEvent.click(filterToggle());
    expect(filterToggle()).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".sales-filter-area .orders-filter-collapse")).not.toHaveClass("is-open");
    expect(document.querySelector(".orders-filter-collapse__inner")).toHaveAttribute("inert");
    openFilters();
    expect(screen.getByLabelText("Поиск блюда")).toHaveValue("Лаваш");
    expect(screen.getByRole("combobox", { name: "Категория продаж" })).toHaveTextContent("Кухня");
    expect(calls()).toHaveLength(1);
  });

  it("Clear removes both canonical filters, retains the applied period and always refetches", async () => {
    render(<MenuPage />);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Период отчёта о продажах" }));
    openFilters();
    fireEvent.change(screen.getByLabelText("Поиск блюда"), { target: { value: "Лаваш" } });
    fireEvent.click(screen.getByLabelText("Категория продаж"));
    fireEvent.click(categoryChoices()[0]);
    applyFilters();
    await waitFor(() => expect(calls().at(-1)[1].params.category_id).toEqual(["c1"]));
    fireEvent.click(screen.getByRole("button", { name: "Очистить" }));
    await waitFor(() => expect(calls().at(-1)[1].params).toEqual({ date_from: "2026-09-01", date_to: "2026-09-02" }));
    expect(screen.getByLabelText("Поиск блюда")).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Категория продаж" })).toHaveTextContent("Выберите категорию");
    const count = calls().length;
    fireEvent.click(screen.getByRole("button", { name: "Очистить" }));
    await waitFor(() => expect(calls()).toHaveLength(count + 1));
  });

  it("shared category popup supports Escape/outside close and its Reports exit animation", async () => {
    render(<MenuPage />);
    await loaded();
    openFilters();
    const trigger = screen.getByRole("combobox", { name: "Категория продаж" });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    const exiting = document.querySelector(".orders-filter-select__panel");
    expect(exiting).toHaveClass("is-closing");
    fireEvent.animationEnd(exiting);
    await waitFor(() => expect(document.querySelector(".orders-filter-select__panel")).toBeNull());
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("heading", { name: "Продажа" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it.each([1, 3, 80])("renders exactly %i canonical fixture rows with no filler or right-side card", async (count) => {
    const rows = Array.from({ length: count }, (_, i) => ({ ...row, product_id: `p${i}`, name: `Fixture ${i + 1}` }));
    api.get.mockImplementation((path) => Promise.resolve(response(path, { rows, totals: { quantity: count * 2, amount: count * 50.5, orders_count: count } })));
    render(<MenuPage />);
    await screen.findByText(`Fixture ${count}`);
    const table = screen.getByRole("table", { name: "Продажи" });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(count);
    expect(document.querySelector(".sales-category-card")).toBeNull();
    expect(document.querySelector(".sales-layout").children).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Таблица продаж — прокрутка" })).toHaveAttribute("tabindex", "0");
    expect(table.querySelectorAll("th")).toHaveLength(7);
  });

  it("reuses the Reports collapse markup and a bounded, shrink-wrapping Dishes-like scroll chain", () => {
    const jsx = readFileSync("src/pages/MenuPage.jsx", "utf8");
    const css = readFileSync("src/styles/owner/sales.css", "utf8");
    const reports = readFileSync("src/styles/owner/reports.css", "utf8");
    expect(jsx).toContain('sales-filter-area owner-report-view orders-report-page');
    expect(jsx).toContain('orders-filter-collapse__inner');
    expect(jsx).toContain('report-filter-input');
    expect(jsx).toContain('report-filter-buttons');
    expect(reports).toContain('grid-template-rows 200ms ease, opacity 200ms ease, transform 200ms ease');
    expect(css).toContain('max-height: 100%');
    expect(css).toContain('flex: 0 1 auto');
    expect(css).toContain('height: auto; min-height: 0');
    expect(css).toContain('overflow: auto');
    expect(css).toContain('scrollbar-width: none');
    expect(css).toContain('::-webkit-scrollbar { display: none; width: 0; height: 0; }');
    expect(css).toContain('position: sticky; top: 0');
    expect(css).toContain('.sales-layout { display: flex');
    expect(css).toContain('.sales-layout { max-height: 50dvh; }');
    expect(css).toContain('(min-width: 601px) and (max-width: 1024px) and (max-height: 850px)');
    expect(css).toContain('.sales-empty .owner-report-empty-image { display: none; }');
    expect(css).not.toContain('100vw');
    expect(css).not.toMatch(/!\s*important/);
    expect(jsx).not.toMatch(/previewData|localStorage|sessionStorage|\/pos\/orders/);
  });
});
