import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportsService } from "../api/reports";
import TablesReportPage from "./TablesReportPage";

vi.mock("../api/reports", () => ({
  reportsService: { listTables: vi.fn(), getTablesFilters: vi.fn() },
}));

vi.mock("../components/ReportDateRangePicker", () => ({
  default: () => <button type="button">Период</button>,
}));

vi.mock("../utils/excel", () => ({ exportToExcel: vi.fn() }));

const options = {
  waiters: [{ value: "waiter-1", label: "Официант 1" }],
  cashiers: [{ value: "cashier-1", label: "Кассир 1" }],
  payment_methods: [{ value: "cash", label: "Наличные" }],
  places: [],
  place_filter_supported: false,
};

describe("TablesReportPage filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportsService.listTables.mockResolvedValue({
      data: [{ table_number: "12A", orders_count: 2, revenue: 100000, avg_check: 50000 }],
    });
    reportsService.getTablesFilters.mockResolvedValue({ data: options });
  });

  it("uses the canonical expandable panel without the old standalone search or KPI cards", async () => {
    render(<TablesReportPage />);
    await screen.findByText("12A");

    const toggle = screen.getByRole("button", { name: "Фильтровать" });
    const panel = document.getElementById("tables-report-filters");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "tables-report-filters");
    expect(panel).toHaveAttribute("hidden");
    expect(document.querySelector(".report-filter-panel")).not.toBeInTheDocument();
    expect(document.querySelector(".report-summary-grid")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Период" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скачать Excel" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Отчёт по столам" })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("hidden");
    expect(Array.from(panel.children).map((element) => (
      element.matches(".report-filter-buttons")
        ? "Действия"
        : element.querySelector("input, select")?.getAttribute("aria-label")
    ))).toEqual(["Номер стола", "Официант", "Место", "Кассир", "Тип оплаты", "Действия"]);
    expect(screen.queryByLabelText("Автор")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Место")).toBeDisabled();
    expect(screen.getByLabelText("Место")).toHaveDisplayValue("Нет связи заказа с местом");

    fireEvent.change(screen.getByLabelText("Номер стола"), { target: { value: "12A" } });
    fireEvent.change(screen.getByLabelText("Официант"), { target: { value: "waiter-1" } });
    fireEvent.change(screen.getByLabelText("Кассир"), { target: { value: "cashier-1" } });
    fireEvent.change(screen.getByLabelText("Тип оплаты"), { target: { value: "cash" } });
    expect(reportsService.listTables).toHaveBeenCalledTimes(1);

    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Номер стола")).toHaveValue("12A");
    expect(screen.getByLabelText("Кассир")).toHaveValue("cashier-1");

    fireEvent.click(within(panel).getByRole("button", { name: "Фильтровать" }));
    await waitFor(() => expect(reportsService.listTables).toHaveBeenCalledTimes(2));
    expect(reportsService.listTables).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        filters: {
          tableNumber: "12A",
          waiterId: "waiter-1",
          paymentMethod: "cash",
          cashierId: "cashier-1",
          hallId: "all",
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Очистить" }));
    await waitFor(() => expect(reportsService.listTables).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText("Номер стола")).toHaveValue("");
    ["Официант", "Кассир", "Тип оплаты"].forEach((label) => {
      expect(screen.getByLabelText(label)).toHaveValue("all");
    });
  });
});

const placesMeta = {
  waiters: [{ value: "waiter-1", label: "Официант 1" }],
  cashiers: [{ value: "cashier-1", label: "Кассир 1" }],
  payment_methods: [{ value: "cash", label: "Наличные" }],
  places: [
    { value: "hall-zal", label: "Зал" },
    { value: "hall-bar", label: "Бар" },
    { value: "hall-balcony", label: "Балкон" },
  ],
  place_filter_supported: true,
};

describe("TablesReportPage — Место (Place) filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportsService.listTables.mockResolvedValue({ data: [] }); // zero rows on purpose
    reportsService.getTablesFilters.mockResolvedValue({ data: placesMeta });
  });

  async function openPlace() {
    render(<TablesReportPage />);
    const toggle = await screen.findByRole("button", { name: "Фильтровать" }); // waits for load
    fireEvent.click(toggle); // open panel
    const place = screen.getByLabelText("Место");
    await waitFor(() => expect(place).not.toBeDisabled());
    return place;
  }

  it("exposes canonical Hall options from metadata (not hardcoded, not history-derived)", async () => {
    const place = await openPlace();
    const opts = Array.from(place.querySelectorAll("option"));
    expect(opts.map((o) => o.value)).toEqual(expect.arrayContaining(["hall-zal", "hall-bar", "hall-balcony"]));
    expect(opts.map((o) => o.textContent)).toEqual(expect.arrayContaining(["Зал", "Бар", "Балкон"]));
    // "Балкон" is present even though listTables returned [] → options come from
    // the filters metadata (Hall directory), not from report rows.
    expect(opts.map((o) => o.textContent)).toContain("Балкон");
  });

  it("sends hall_id only after Apply (draft-only before)", async () => {
    const place = await openPlace();
    expect(reportsService.listTables).toHaveBeenCalledTimes(1); // initial load only
    fireEvent.change(place, { target: { value: "hall-zal" } });
    expect(reportsService.listTables).toHaveBeenCalledTimes(1); // still draft — no refetch

    const panel = document.getElementById("tables-report-filters");
    fireEvent.click(within(panel).getByRole("button", { name: "Фильтровать" }));
    await waitFor(() => expect(reportsService.listTables).toHaveBeenCalledTimes(2));
    expect(reportsService.listTables.mock.calls[1][2].filters.hallId).toBe("hall-zal");
  });

  it("Clear resets the Hall selection back to all", async () => {
    const place = await openPlace();
    const panel = document.getElementById("tables-report-filters");
    fireEvent.change(place, { target: { value: "hall-bar" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Фильтровать" }));
    await waitFor(() => expect(reportsService.listTables).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Очистить" }));
    await waitFor(() => expect(reportsService.listTables).toHaveBeenCalledTimes(3));
    expect(reportsService.listTables.mock.calls[2][2].filters.hallId).toBe("all");
    expect(screen.getByLabelText("Место")).toHaveValue("all");
  });
});

describe("TablesReportPage — Место backward compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportsService.listTables.mockResolvedValue({ data: [] });
    reportsService.getTablesFilters.mockResolvedValue({
      data: { waiters: [], cashiers: [], payment_methods: [], places: [], place_filter_supported: false },
    });
  });

  it("keeps Место disabled and applies no specific hall when unsupported", async () => {
    render(<TablesReportPage />);
    const toggle = await screen.findByRole("button", { name: "Фильтровать" });
    fireEvent.click(toggle);
    const place = screen.getByLabelText("Место");
    expect(place).toBeDisabled();
    // Applied hallId stays "all" → reports.js compactParams omits hall_id.
    expect(reportsService.listTables.mock.calls.at(-1)[2].filters.hallId).toBe("all");
  });
});
