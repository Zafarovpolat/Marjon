import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportsService } from "../api/reports";
import { ordersService } from "../api/orders";
import { exportToExcel } from "../utils/excel";
import { formatMoney } from "./reports/reportMoney";
import CancelledDishesReportPage from "./CancelledDishesReportPage";

vi.mock("../api/reports", () => ({
  reportsService: { listCancelledDishes: vi.fn(), getCancelledFilters: vi.fn() },
}));

vi.mock("../api/orders", () => ({
  ordersService: { get: vi.fn() },
}));

vi.mock("../components/ReportDateRangePicker", () => ({
  default: ({ value, onChange }) => (
    <div>
      <input aria-label="Начало периода" value={value?.start || ""} onChange={(event) => onChange({ ...value, start: event.target.value })} />
      <input aria-label="Конец периода" value={value?.end || ""} onChange={(event) => onChange({ ...value, end: event.target.value })} />
    </div>
  ),
}));

// Stub only the download side-effect; keep the real typed-cell helpers
// (excelLocalDateTime/excelAmountNumber) so the export assertions exercise the
// genuine shared coercion (real Date instances, real numbers, null blanks).
vi.mock("../utils/excel", async (importActual) => ({
  ...(await importActual()),
  exportToExcel: vi.fn(),
}));

function todayApiValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const FILTERS = {
  data: {
    authors: [
      { id: "author-1", name: "Официант Али", role: "waiter" },
      { id: "author-2", name: "Кассир Вали", role: "cashier" },
    ],
    dishes: ["Плов", "Лагман"],
  },
};

function cancelledRow(overrides = {}) {
  return {
    order_number: "ORD-42",
    name: "Плов",
    table_number: "5",
    unit: "шт",
    quantity: 2,
    waiter_name: "Официант Али",
    order_type: "dine_in",
    amount: 600,
    cancelled_by_name: "Кассир Вали",
    price: 300,
    order_id: "order-1",
    order_item_id: "item-1",
    cancellation_scope: "item",
    date_source: "cancelled_at",
    report_event_at: "2026-08-12T12:00:00Z",
    cancelled_at: "2026-08-12T12:00:00Z",
    ...overrides,
  };
}

function lastReportFilters() {
  const calls = reportsService.listCancelledDishes.mock.calls;
  return calls[calls.length - 1][2].filters;
}

function headerFilterToggle() {
  return screen.getAllByRole("button", { name: "Фильтровать" }).find((button) => (
    button.classList.contains("cancelled-filter-toggle")
  ));
}

function panelApplyButton() {
  return screen.getAllByRole("button", { name: "Фильтровать" }).find((button) => (
    button.classList.contains("report-filter-apply")
  ));
}

function finishDropdownExit() {
  const closingPanel = document.querySelector(".orders-filter-select__panel.is-closing");
  if (closingPanel) fireEvent(closingPanel, new Event("webkitAnimationEnd", { bubbles: true }));
}

function openCancelledFilter(label) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  finishDropdownExit();
  return screen.getByRole("listbox", { name: label });
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

// The author/dish directories load asynchronously on mount; wait until the
// pickers enable before interacting with them.
async function awaitFilterDirectory() {
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: "Автор" })).not.toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Блюда" })).not.toBeDisabled();
  });
}

describe("CancelledDishesReportPage Phase 1B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportsService.listCancelledDishes.mockResolvedValue({ data: [] });
    reportsService.getCancelledFilters.mockResolvedValue(FILTERS);
    ordersService.get.mockResolvedValue({ data: { items: [], subtotal: 0 } });
  });

  it("renders the exact 10 visible columns with no totals row", async () => {
    render(<CancelledDishesReportPage />);
    for (const label of ["Номер заказа", "Дата", "Название", "Номер стола", "Кол-во", "Официант", "Тип", "Сумма", "Автор", "Действие"]) {
      expect(await screen.findByRole("columnheader", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText("Итого")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Ед. изм." })).toBeNull();
  });

  it("opens on today and loads the filters directory independently", async () => {
    render(<CancelledDishesReportPage />);
    await waitFor(() => expect(reportsService.listCancelledDishes).toHaveBeenCalled());
    const [dateFrom, dateTo] = reportsService.listCancelledDishes.mock.calls[0].slice(0, 2);
    expect(dateFrom).toBe(todayApiValue());
    expect(dateTo).toBe(todayApiValue());
    expect(reportsService.getCancelledFilters).toHaveBeenCalledTimes(1);
  });

  it("maps rows from truthful backend fields, keeping waiter and author separate", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({ data: [cancelledRow()] });
    render(<CancelledDishesReportPage />);
    const row = await screen.findByText("Плов").then((node) => node.closest("tr"));
    const cells = within(row).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("ORD-42");
    expect(cells[1]).toHaveTextContent(/12\.08\.2026/);
    expect(cells[3]).toHaveTextContent("5");
    expect(cells[4]).toHaveTextContent("2");
    expect(cells[5]).toHaveTextContent("Официант Али");
    expect(cells[6]).toHaveTextContent("На месте");
    expect(cells[7]).toHaveTextContent(formatMoney(600));
    expect(cells[8]).toHaveTextContent("Кассир Вали");
  });

  it("renders — for missing author, waiter, and table without substitution", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({
      data: [cancelledRow({ waiter_name: null, cancelled_by_name: null, table_number: null, amount: null })],
    });
    render(<CancelledDishesReportPage />);
    const row = await screen.findByText("Плов").then((node) => node.closest("tr"));
    const cells = within(row).getAllByRole("cell");
    expect(cells[3]).toHaveTextContent("—");
    expect(cells[5]).toHaveTextContent("—");
    expect(cells[7]).toHaveTextContent("—");
    expect(cells[8]).toHaveTextContent("—");
  });

  it("falls back to unknown type labels truthfully and maps known types", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({
      data: [
        cancelledRow({ order_item_id: "a", order_type: "qr" }),
        cancelledRow({ order_item_id: "b", order_type: "mystery_type" }),
      ],
    });
    render(<CancelledDishesReportPage />);
    expect(await screen.findByText("QR")).toBeInTheDocument();
    expect(screen.getByText("mystery_type")).toBeInTheDocument();
  });

  it("renders the waiter+cashier author directory even when rows are empty", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({ data: [] });
    render(<CancelledDishesReportPage />);
    await awaitFilterDirectory();
    fireEvent.click(headerFilterToggle());
    const box = openCancelledFilter("Автор");
    expect(within(box).getByText("Официант Али")).toBeInTheDocument();
    expect(within(box).getByText("Кассир Вали")).toBeInTheDocument();
  });

  it("multi-selects authors and sends repeated author_id params", async () => {
    render(<CancelledDishesReportPage />);
    await awaitFilterDirectory();
    fireEvent.click(headerFilterToggle());
    const box = openCancelledFilter("Автор");
    fireEvent.click(within(box).getByText("Официант Али"));
    fireEvent.click(within(box).getByText("Кассир Вали"));
    // All selected labels shown, never a count.
    expect(screen.getByRole("combobox", { name: "Автор" })).toHaveTextContent("Официант Али, Кассир Вали");
    fireEvent.click(panelApplyButton());
    await waitFor(() => expect(lastReportFilters().authorId).toEqual(["author-1", "author-2"]));
    // Draft toggles never issue requests before Apply.
    expect(reportsService.listCancelledDishes).toHaveBeenCalledTimes(2);
  });

  it("multi-selects dishes and combines OR-within with AND-across", async () => {
    render(<CancelledDishesReportPage />);
    await awaitFilterDirectory();
    fireEvent.click(headerFilterToggle());
    const box = openCancelledFilter("Блюда");
    fireEvent.click(within(box).getByText("Плов"));
    fireEvent.click(within(box).getByText("Лагман"));
    fireEvent.change(screen.getByLabelText("Номер заказа"), { target: { value: "ORD-7" } });
    fireEvent.click(panelApplyButton());
    await waitFor(() => {
      const filters = lastReportFilters();
      expect(filters.dishName).toEqual(["Плов", "Лагман"]);
      expect(filters.orderNumber).toBe("ORD-7");
    });
    // One request carries every dimension (AND across, OR within server-side).
    expect(reportsService.listCancelledDishes).toHaveBeenCalledTimes(2);
  });

  it("omits emptied params on Clear instead of sending blanks", async () => {
    render(<CancelledDishesReportPage />);
    await awaitFilterDirectory();
    fireEvent.click(headerFilterToggle());
    const box = openCancelledFilter("Автор");
    fireEvent.click(within(box).getByText("Официант Али"));
    fireEvent.change(screen.getByLabelText("Номер заказа"), { target: { value: "ORD-7" } });
    fireEvent.click(panelApplyButton());
    await waitFor(() => expect(lastReportFilters().authorId).toEqual(["author-1"]));
    fireEvent.click(screen.getByRole("button", { name: "Очистить" }));
    await waitFor(() => {
      const filters = lastReportFilters();
      expect(filters.authorId).toEqual([]);
      expect(filters.dishName).toEqual([]);
      expect(filters.orderNumber).toBe("");
    });
  });

  it("shows the truthful empty state with headers and no fake totals", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({ data: [] });
    render(<CancelledDishesReportPage />);
    expect(await screen.findByText("Отменённых блюд нет")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Автор" })).toBeInTheDocument();
    expect(screen.queryByText("Итого")).toBeNull();
  });

  it("renders the shared universal illustration instead of the legacy icon", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({ data: [] });
    const { container } = render(<CancelledDishesReportPage />);
    await screen.findByText("Отменённых блюд нет");
    const image = container.querySelector(".owner-report-empty-image");
    expect(image?.tagName).toBe("IMG");
    expect(image).toHaveAttribute("alt", "");
    expect(container.querySelector(".owner-report-empty__icon")).toBeNull();
  });

  it("keeps the shell on error with an inline alert", async () => {
    reportsService.listCancelledDishes.mockRejectedValue({ response: { data: { detail: "Backend down" } } });
    render(<CancelledDishesReportPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend down");
    expect(screen.getByRole("heading", { name: "Отчёт по отменённым блюдам" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("exports the finalized 9-column contract with typed cells, Итого, and no Период", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({ data: [cancelledRow()] });
    render(<CancelledDishesReportPage />);
    await screen.findAllByText("Плов");
    fireEvent.click(screen.getByRole("button", { name: "Скачать Excel" }));
    expect(exportToExcel).toHaveBeenCalledTimes(1);
    const [lines, columns, filename, options] = exportToExcel.mock.calls[0];
    expect(filename).toBe("cancelled-dishes-report");
    // Exact 9 headers, exact order — the user-approved contract.
    expect(columns.map((col) => col.label)).toEqual([
      "Дата", "Номер заказа", "Номер стола", "Название",
      "Ед. изм", "Кол-во", "Цена", "Сумма", "Автор",
    ]);
    // Removed columns must never appear.
    for (const gone of ["Официант", "Повар", "Тип", "Действие", "Причина", "Комментарий"]) {
      expect(columns.map((col) => col.label)).not.toContain(gone);
    }
    // Typed cells: real date + numeric money/quantity.
    expect(columns.find((c) => c.key === "date")).toMatchObject({ type: "date", format: "dd.mm.yyyy hh:mm" });
    expect(columns.find((c) => c.key === "quantity")).toMatchObject({ type: "number", format: "#,##0.###" });
    expect(columns.find((c) => c.key === "price")).toMatchObject({ type: "number", format: "#,##0" });
    expect(columns.find((c) => c.key === "amount")).toMatchObject({ type: "number", format: "#,##0" });
    // Values: real date instance + truthful numbers/text.
    expect(lines).toHaveLength(1);
    expect(lines[0].date).toBeInstanceOf(Date);
    expect(lines[0].orderNumber).toBe("ORD-42");
    expect(lines[0].tableNumber).toBe("5");
    expect(lines[0].unit).toBe("шт");
    expect(lines[0].quantity).toBe(2);
    expect(lines[0].price).toBe(300);
    expect(lines[0].amount).toBe(600);
    expect(lines[0].authorName).toBe("Кассир Вали");
    // No «Период»/metadata block; Итого via the shared totals option.
    expect(options.metadata).toBeUndefined();
    expect(options.sheetName).toBe("Отчёт по отменённым блюдам");
    expect(options.totals.label).toBe("Итого");
    expect(options.totals.values.quantity).toBe(2);
    expect(options.totals.values.amount).toBe(600);
    // Цена is never totalled.
    expect(options.totals.values.price).toBeUndefined();
  });

  it("exports the 9 headers with blank totals and no metadata when empty", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({ data: [] });
    render(<CancelledDishesReportPage />);
    await screen.findByText("Отменённых блюд нет");
    fireEvent.click(screen.getByRole("button", { name: "Скачать Excel" }));
    const [lines, columns, , options] = exportToExcel.mock.calls[0];
    expect(lines).toEqual([]);
    expect(columns).toHaveLength(9);
    expect(options.metadata).toBeUndefined();
    // Empty dataset → blank totals (no fabricated numbers).
    expect(options.totals.values.quantity).toBeNull();
    expect(options.totals.values.amount).toBeNull();
  });

  it("exports one workbook row per cancelled item, N rows for a whole-order cancel", async () => {
    // Whole-order cancellation fans out to one row per constituent item; the
    // same order number / table / dish may repeat. No grouping/aggregation.
    reportsService.listCancelledDishes.mockResolvedValue({
      data: [
        cancelledRow({ order_item_id: "i1", name: "Плов", cancellation_scope: "order" }),
        cancelledRow({ order_item_id: "i2", name: "Плов", cancellation_scope: "order" }),
        cancelledRow({ order_item_id: "i3", name: "Лагман", cancellation_scope: "order" }),
      ],
    });
    render(<CancelledDishesReportPage />);
    await screen.findByText("Лагман");
    fireEvent.click(screen.getByRole("button", { name: "Скачать Excel" }));
    const [lines] = exportToExcel.mock.calls[0];
    expect(lines).toHaveLength(3);
    expect(lines.filter((l) => l.orderNumber === "ORD-42")).toHaveLength(3);
    expect(lines.filter((l) => l.name === "Плов")).toHaveLength(2);
  });

  it("dates the export from report_event_at, not the legacy date/time fields", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({
      data: [cancelledRow({
        report_event_at: "2026-08-12T09:30:00",
        date: "01.01.2000", time: "00:00",
        order_created_at: "2000-01-01T00:00:00",
      })],
    });
    render(<CancelledDishesReportPage />);
    await screen.findAllByText("Плов");
    fireEvent.click(screen.getByRole("button", { name: "Скачать Excel" }));
    const [lines] = exportToExcel.mock.calls[0];
    expect(lines[0].date).toBeInstanceOf(Date);
    // Built from report_event_at's wall-clock (2026-08-12 09:30), never 2000.
    expect(lines[0].date.getFullYear()).toBe(2026);
    expect(lines[0].date.getMonth()).toBe(7);
    expect(lines[0].date.getDate()).toBe(12);
    expect(lines[0].date.getHours()).toBe(9);
    expect(lines[0].date.getMinutes()).toBe(30);
  });

  it("exports quantity as a real number preserving decimals and zero", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({
      data: [
        cancelledRow({ order_item_id: "a", quantity: 1 }),
        cancelledRow({ order_item_id: "b", quantity: 0 }),
        cancelledRow({ order_item_id: "c", quantity: 1.5 }),
      ],
    });
    render(<CancelledDishesReportPage />);
    await screen.findAllByText("Плов");
    fireEvent.click(screen.getByRole("button", { name: "Скачать Excel" }));
    const [lines] = exportToExcel.mock.calls[0];
    expect(lines.map((l) => l.quantity)).toEqual([1, 0, 1.5]);
  });

  it("keeps price and amount numeric, blank when missing, zero when real", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({
      data: [
        cancelledRow({ order_item_id: "a", price: 0, amount: 0 }),
        cancelledRow({ order_item_id: "b", price: null, amount: null }),
      ],
    });
    render(<CancelledDishesReportPage />);
    await screen.findAllByText("Плов");
    fireEvent.click(screen.getByRole("button", { name: "Скачать Excel" }));
    const [lines] = exportToExcel.mock.calls[0];
    // Real zero stays numeric 0; missing stays blank (null), never 0 or "—".
    expect(lines[0].price).toBe(0);
    expect(lines[0].amount).toBe(0);
    expect(lines[1].price).toBeNull();
    expect(lines[1].amount).toBeNull();
  });

  it("takes amount straight from the backend, never recomputing price×quantity", async () => {
    // amount deliberately != price*quantity to prove no frontend derivation
    // and that OrderItem.total is never used.
    reportsService.listCancelledDishes.mockResolvedValue({
      data: [cancelledRow({ price: 300, quantity: 2, amount: 555 })],
    });
    render(<CancelledDishesReportPage />);
    await screen.findAllByText("Плов");
    fireEvent.click(screen.getByRole("button", { name: "Скачать Excel" }));
    const [lines] = exportToExcel.mock.calls[0];
    expect(lines[0].amount).toBe(555);
  });

  it("forwards the backend unit verbatim without hardcoding шт", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({
      data: [cancelledRow({ unit: "кг" })],
    });
    render(<CancelledDishesReportPage />);
    await screen.findAllByText("Плов");
    fireEvent.click(screen.getByRole("button", { name: "Скачать Excel" }));
    const [lines] = exportToExcel.mock.calls[0];
    expect(lines[0].unit).toBe("кг");
  });

  it("exports the cancellation author, blank for system, never leaking the waiter", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({
      data: [cancelledRow({ waiter_name: "Официант Али", cancelled_by_name: null })],
    });
    render(<CancelledDishesReportPage />);
    await screen.findAllByText("Плов");
    fireEvent.click(screen.getByRole("button", { name: "Скачать Excel" }));
    const [lines, columns] = exportToExcel.mock.calls[0];
    expect(lines[0].authorName).toBe("");
    expect(lines[0].authorName).not.toBe("Официант Али");
    // Waiter has no column at all, so it cannot leak anywhere.
    expect(columns.some((c) => c.key === "waiterName")).toBe(false);
    expect(JSON.stringify(lines)).not.toContain("waiterName");
  });

  it("blanks a total when any row's value is unknown (completeness rule)", async () => {
    reportsService.listCancelledDishes.mockResolvedValue({
      data: [
        cancelledRow({ order_item_id: "a", quantity: 2, amount: 600 }),
        cancelledRow({ order_item_id: "b", quantity: 3, amount: null }),
      ],
    });
    render(<CancelledDishesReportPage />);
    await screen.findAllByText("Плов");
    fireEvent.click(screen.getByRole("button", { name: "Скачать Excel" }));
    const [, , , options] = exportToExcel.mock.calls[0];
    // Quantity fully known → numeric sum; amount has an unknown → blank total.
    expect(options.totals.values.quantity).toBe(5);
    expect(options.totals.values.amount).toBeNull();
  });

  it("keeps stale rows during refresh and lets the latest request win", async () => {
    const first = deferred();
    const second = deferred();
    reportsService.listCancelledDishes
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<CancelledDishesReportPage />);
    fireEvent.click(headerFilterToggle());
    fireEvent.change(screen.getByLabelText("Номер заказа"), { target: { value: "STALE" } });
    fireEvent.click(panelApplyButton());
    first.resolve({ data: [cancelledRow({ order_item_id: "stale", name: "Stale Plov" })] });
    second.resolve({ data: [cancelledRow({ order_item_id: "fresh", name: "Fresh Lagman" })] });
    expect(await screen.findByText("Fresh Lagman")).toBeInTheDocument();
    expect(screen.queryByText("Stale Plov")).toBeNull();
  });

  it("ignores a late response after unmount without crashing", async () => {
    const gate = deferred();
    reportsService.listCancelledDishes.mockReturnValue(gate.promise);
    const { unmount } = render(<CancelledDishesReportPage />);
    unmount();
    gate.resolve({ data: [cancelledRow()] });
    await Promise.resolve();
  });

  it("lazy-loads canonical order details only when the action opens", async () => {
    ordersService.get.mockResolvedValue({
      data: {
        items: [{ product_id: "p-1", name: "Плов", quantity: 2, price: 300, total: 600 }],
        subtotal: 600, discount_amount: 0, tax_amount: 72, service_fee: 0, total_amount: 672,
      },
    });
    reportsService.listCancelledDishes.mockResolvedValue({ data: [cancelledRow()] });
    render(<CancelledDishesReportPage />);
    const row = await screen.findByText("Плов").then((node) => node.closest("tr"));
    expect(ordersService.get).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: /Детали отмены/ }));
    await waitFor(() => expect(ordersService.get).toHaveBeenCalledWith("order-1", expect.anything()));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Отмена позиции")).toBeInTheDocument();
    expect(screen.getByText("672 UZS")).toBeInTheDocument();
    // Cached: reopening the same row issues no second request.
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    fireEvent.click(within(row).getByRole("button", { name: /Детали отмены/ }));
    await screen.findByRole("dialog");
    expect(ordersService.get).toHaveBeenCalledTimes(1);
  });

  it("shows an inline detail error without fake data", async () => {
    ordersService.get.mockRejectedValue(new Error("order unavailable"));
    reportsService.listCancelledDishes.mockResolvedValue({ data: [cancelledRow()] });
    render(<CancelledDishesReportPage />);
    const row = await screen.findByText("Плов").then((node) => node.closest("tr"));
    fireEvent.click(within(row).getByRole("button", { name: /Детали отмены/ }));
    expect(await screen.findByText("Не удалось загрузить детали заказа.")).toBeInTheDocument();
  });
});
